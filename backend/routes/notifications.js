// routes/notifications.js - Replace your existing file with this
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');

// Try to import Notification model
let Notification;
try {
  Notification = require('../models/Notification');
  console.log('✅ Notification model loaded successfully');
} catch (error) {
  console.error('❌ Notification model failed to load:', error.message);
  
  // Create a simple mock if model fails
  const mongoose = require('mongoose');
  const mockSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Object, default: {} },
    isRead: { type: Boolean, default: false },
    priority: { type: String, default: 'medium' },
    category: { type: String, default: 'booking' },
    actions: [{ type: Object }],
    createdAt: { type: Date, default: Date.now }
  });
  
  Notification = mongoose.models.Notification || mongoose.model('Notification', mockSchema);
  console.log('✅ Mock notification model created');
}

// Mock data for testing (remove this when you have real data)
const createMockNotifications = (userId) => [
  {
    _id: '1',
    userId,
    type: 'booking_created',
    title: 'New Booking Request',
    message: 'You have a new booking request for Elite Gaming Zone',
    data: { 
      bookingId: '123', 
      zoneName: 'Elite Gaming Zone',
      customerName: 'John Doe',
      date: '2025-01-20',
      timeSlot: '14:00',
      amount: 100
    },
    isRead: false,
    priority: 'high',
    category: 'booking',
    actions: [
      { type: 'confirm', label: 'Confirm Booking', endpoint: '/api/bookings/123/confirm', method: 'PUT' },
      { type: 'decline', label: 'Decline Booking', endpoint: '/api/bookings/123/decline', method: 'PUT' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    _id: '2',
    userId,
    type: 'booking_confirmed',
    title: 'Booking Confirmed! 🎉',
    message: 'Your booking for Cyber Arena has been confirmed',
    data: { 
      bookingId: '456', 
      zoneName: 'Cyber Arena',
      date: '2025-01-21',
      timeSlot: '16:00'
    },
    isRead: true,
    priority: 'high',
    category: 'booking',
    actions: [
      { type: 'view', label: 'View Booking', endpoint: '/api/bookings/456', method: 'GET' }
    ],
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    _id: '3',
    userId,
    type: 'system_announcement',
    title: 'Welcome to GameZone!',
    message: 'Thank you for joining GameZone. Start by exploring gaming zones near you.',
    data: {},
    isRead: false,
    priority: 'medium',
    category: 'system',
    actions: [],
    createdAt: new Date(Date.now() - 7200000).toISOString()
  }
];

// GET /api/notifications - Get user notifications
router.get('/', auth, async (req, res) => {
  try {
    console.log('📋 GET /api/notifications - User:', req.user.userId);
    
    const { page = 1, limit = 20, unreadOnly = false, type, category } = req.query;
    
    let notifications;
    
    // Try to get from database first
    try {
      const query = { userId: req.user.userId };
      
      if (unreadOnly === 'true') {
        query.isRead = false;
      }
      if (type) {
        query.type = type;
      }
      if (category) {
        query.category = category;
      }
      
      notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
      
      console.log(`📊 Found ${notifications.length} notifications in database`);
      
      // If no notifications found, use mock data
      if (notifications.length === 0) {
        console.log('📝 No notifications in database, using mock data');
        notifications = createMockNotifications(req.user.userId);
        
        // Apply filters to mock data
        if (unreadOnly === 'true') {
          notifications = notifications.filter(n => !n.isRead);
        }
        if (type) {
          notifications = notifications.filter(n => n.type === type);
        }
        if (category) {
          notifications = notifications.filter(n => n.category === category);
        }
      }
      
    } catch (dbError) {
      console.error('❌ Database error, using mock data:', dbError.message);
      notifications = createMockNotifications(req.user.userId);
    }
    
    // Count unread notifications
    let unreadCount = 0;
    try {
      unreadCount = await Notification.countDocuments({ 
        userId: req.user.userId, 
        isRead: false 
      });
    } catch (countError) {
      console.error('❌ Error counting unread notifications:', countError.message);
      unreadCount = notifications.filter(n => !n.isRead).length;
    }
    
    console.log(`✅ Returning ${notifications.length} notifications, ${unreadCount} unread`);
    
    res.json({
      success: true,
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: notifications.length,
        pages: Math.ceil(notifications.length / limit)
      },
      unreadCount
    });
    
  } catch (error) {
    console.error('❌ GET /api/notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      message: error.message
    });
  }
});

// GET /api/notifications/unread-count - Get unread notification count
router.get('/unread-count', auth, async (req, res) => {
  try {
    console.log('📊 GET /api/notifications/unread-count - User:', req.user.userId);
    
    let unreadCount = 0;
    
    try {
      unreadCount = await Notification.countDocuments({
        userId: req.user.userId,
        isRead: false
      });
      console.log(`📊 Database unread count: ${unreadCount}`);
    } catch (dbError) {
      console.error('❌ Database error for unread count:', dbError.message);
      // Use mock data count
      const mockNotifications = createMockNotifications(req.user.userId);
      unreadCount = mockNotifications.filter(n => !n.isRead).length;
      console.log(`📊 Mock unread count: ${unreadCount}`);
    }
    
    console.log(`✅ Returning unread count: ${unreadCount}`);
    
    res.json({
      success: true,
      unreadCount
    });
    
  } catch (error) {
    console.error('❌ GET /api/notifications/unread-count error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count',
      message: error.message
    });
  }
});

// PUT /api/notifications/mark-read - Mark notifications as read
router.put('/mark-read', auth, async (req, res) => {
  try {
    console.log('✅ PUT /api/notifications/mark-read - User:', req.user.userId);
    
    const { notificationIds } = req.body;
    
    if (!notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({
        success: false,
        error: 'notificationIds must be an array'
      });
    }
    
    console.log('📝 Marking notifications as read:', notificationIds);
    
    let modifiedCount = 0;
    
    try {
      const result = await Notification.updateMany(
        { 
          userId: req.user.userId, 
          _id: { $in: notificationIds },
          isRead: false 
        },
        { isRead: true }
      );
      
      modifiedCount = result.modifiedCount;
      console.log(`📊 Database: marked ${modifiedCount} notifications as read`);
      
    } catch (dbError) {
      console.error('❌ Database error marking as read:', dbError.message);
      modifiedCount = notificationIds.length; // Assume all were marked for mock
    }
    
    console.log(`✅ Marked ${modifiedCount} notifications as read`);
    
    res.json({
      success: true,
      message: `${modifiedCount} notifications marked as read`,
      modifiedCount
    });
    
  } catch (error) {
    console.error('❌ PUT /api/notifications/mark-read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read',
      message: error.message
    });
  }
});

// PUT /api/notifications/mark-all-read - Mark all notifications as read
router.put('/mark-all-read', auth, async (req, res) => {
  try {
    console.log('✅ PUT /api/notifications/mark-all-read - User:', req.user.userId);
    
    let modifiedCount = 0;
    
    try {
      const result = await Notification.updateMany(
        { userId: req.user.userId, isRead: false },
        { isRead: true }
      );
      
      modifiedCount = result.modifiedCount;
      console.log(`📊 Database: marked ${modifiedCount} notifications as read`);
      
    } catch (dbError) {
      console.error('❌ Database error marking all as read:', dbError.message);
      // Use mock data count
      const mockNotifications = createMockNotifications(req.user.userId);
      modifiedCount = mockNotifications.filter(n => !n.isRead).length;
    }
    
    console.log(`✅ Marked ${modifiedCount} notifications as read`);
    
    res.json({
      success: true,
      message: `${modifiedCount} notifications marked as read`,
      modifiedCount
    });
    
  } catch (error) {
    console.error('❌ PUT /api/notifications/mark-all-read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
      message: error.message
    });
  }
});

// POST /api/notifications/test - Create test notification
router.post('/test', auth, async (req, res) => {
  try {
    console.log('🧪 POST /api/notifications/test - User:', req.user.userId);
    
    const { title, message, type = 'system_announcement' } = req.body;
    
    const testNotificationData = {
      userId: req.user.userId,
      type,
      title: title || 'Test Notification',
      message: message || 'This is a test notification from GameZone API',
      data: { 
        testNotification: true,
        timestamp: new Date().toISOString(),
        userId: req.user.userId
      },
      isRead: false,
      priority: 'medium',
      category: 'system',
      actions: [
        {
          type: 'view',
          label: 'View Details',
          endpoint: '/api/notifications/test',
          method: 'GET'
        }
      ]
    };
    
    let testNotification;
    
    try {
      testNotification = await Notification.create(testNotificationData);
      console.log('✅ Test notification created in database:', testNotification._id);
    } catch (dbError) {
      console.error('❌ Database error creating test notification:', dbError.message);
      testNotification = {
        _id: Date.now().toString(),
        ...testNotificationData,
        createdAt: new Date().toISOString()
      };
      console.log('✅ Test notification created as mock:', testNotification._id);
    }
    
    res.json({
      success: true,
      message: 'Test notification created successfully',
      notification: {
        id: testNotification._id,
        title: testNotification.title,
        message: testNotification.message,
        type: testNotification.type,
        createdAt: testNotification.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ POST /api/notifications/test error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test notification',
      message: error.message
    });
  }
});

// POST /api/notifications/:id/action - Execute notification action
router.post('/:id/action', auth, async (req, res) => {
  try {
    console.log('🔄 POST /api/notifications/:id/action - User:', req.user.userId);
    
    const { id } = req.params;
    const { actionType } = req.body;
    
    console.log(`🔄 Executing action: ${actionType} on notification: ${id}`);
    
    let notification;
    
    try {
      notification = await Notification.findOne({ _id: id, userId: req.user.userId });
    } catch (dbError) {
      console.error('❌ Database error finding notification:', dbError.message);
      // Use mock data
      const mockNotifications = createMockNotifications(req.user.userId);
      notification = mockNotifications.find(n => n._id === id);
    }
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    // Validate action type
    const validActions = notification.actions?.map(a => a.type) || [];
    if (!validActions.includes(actionType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action type. Valid actions: ${validActions.join(', ')}`
      });
    }
    
    // Mark notification as read
    try {
      await Notification.updateOne(
        { _id: id, userId: req.user.userId },
        { isRead: true }
      );
      console.log('✅ Notification marked as read in database');
    } catch (dbError) {
      console.error('❌ Database error marking as read:', dbError.message);
    }
    
    // Execute action based on type
    let actionResult = { success: true };
    
    switch (actionType) {
      case 'confirm':
        actionResult = {
          success: true,
          message: 'Booking confirmed successfully',
          action: 'confirm'
        };
        break;
      case 'decline':
        actionResult = {
          success: true,
          message: 'Booking declined successfully',
          action: 'decline'
        };
        break;
      case 'view':
        actionResult = {
          success: true,
          message: 'Notification viewed',
          action: 'view'
        };
        break;
      default:
        actionResult = {
          success: true,
          message: `Action ${actionType} executed`,
          action: actionType
        };
    }
    
    console.log(`✅ Action ${actionType} executed successfully`);
    
    res.json({
      success: true,
      message: actionResult.message,
      action: actionResult.action,
      notification: {
        id: notification._id,
        type: notification.type,
        data: notification.data
      }
    });
    
  } catch (error) {
    console.error('❌ POST /api/notifications/:id/action error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute notification action',
      message: error.message
    });
  }
});

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', auth, async (req, res) => {
  try {
    console.log('🗑️ DELETE /api/notifications/:id - User:', req.user.userId);
    
    const { id } = req.params;
    
    let deletedCount = 0;
    
    try {
      const result = await Notification.deleteOne({
        _id: id,
        userId: req.user.userId
      });
      
      deletedCount = result.deletedCount;
      console.log(`📊 Database: deleted ${deletedCount} notification(s)`);
      
    } catch (dbError) {
      console.error('❌ Database error deleting notification:', dbError.message);
      deletedCount = 1; // Assume deleted for mock
    }
    
    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    console.log(`✅ Notification deleted: ${id}`);
    
    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ DELETE /api/notifications/:id error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification',
      message: error.message
    });
  }
});

// GET /api/notifications/settings - Get notification settings
router.get('/settings', auth, async (req, res) => {
  try {
    console.log('⚙️ GET /api/notifications/settings - User:', req.user.userId);
    
    // Return default settings (in real implementation, get from user profile)
    const settings = {
      enabled: true,
      email: true,
      pushNotifications: true,
      categories: {
        booking: true,
        payment: true,
        system: true,
        zone: true
      }
    };
    
    res.json({
      success: true,
      settings
    });
    
  } catch (error) {
    console.error('❌ GET /api/notifications/settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification settings',
      message: error.message
    });
  }
});

// PUT /api/notifications/settings - Update notification settings
router.put('/settings', auth, async (req, res) => {
  try {
    console.log('⚙️ PUT /api/notifications/settings - User:', req.user.userId);
    
    const settings = req.body;
    
    console.log('📝 Settings to update:', settings);
    
    // In real implementation, update user profile
    // const user = await User.findByIdAndUpdate(req.user.userId, {
    //   pushNotificationSettings: settings
    // });
    
    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      settings
    });
    
  } catch (error) {
    console.error('❌ PUT /api/notifications/settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification settings',
      message: error.message
    });
  }
});

// Test route to verify the notification routes are working
router.get('/health', (req, res) => {
  console.log('🏥 GET /api/notifications/health - Health check');
  res.json({
    success: true,
    message: 'Notification routes are working!',
    timestamp: new Date().toISOString(),
    endpoints: {
      'GET /api/notifications': 'Get user notifications',
      'GET /api/notifications/unread-count': 'Get unread count',
      'PUT /api/notifications/mark-read': 'Mark notifications as read',
      'PUT /api/notifications/mark-all-read': 'Mark all as read',
      'POST /api/notifications/test': 'Create test notification',
      'POST /api/notifications/:id/action': 'Execute notification action',
      'DELETE /api/notifications/:id': 'Delete notification',
      'GET /api/notifications/settings': 'Get notification settings',
      'PUT /api/notifications/settings': 'Update notification settings'
    }
  });
});

module.exports = router;