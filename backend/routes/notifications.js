const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Simple auth middleware
const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. No token provided.' 
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = { userId: decoded.userId };
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ 
      success: false, 
      error: 'Invalid token.' 
    });
  }
};

// Mock notification data for testing
const mockNotifications = [
  {
    id: '1',
    type: 'booking_created',
    title: 'New Booking Request',
    message: 'You have a new booking request for Elite Gaming Zone',
    data: { bookingId: '123', zoneName: 'Elite Gaming Zone' },
    isRead: false,
    priority: 'high',
    category: 'booking',
    actions: [
      { type: 'confirm', label: 'Confirm', endpoint: '/api/bookings/123/confirm', method: 'PUT' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: '2',
    type: 'system_announcement',
    title: 'System Update',
    message: 'The system has been updated with new features',
    data: {},
    isRead: true,
    priority: 'medium',
    category: 'system',
    actions: [],
    createdAt: new Date(Date.now() - 3600000).toISOString()
  }
];

// GET /api/notifications
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    let notifications = mockNotifications;
    
    if (unreadOnly === 'true') {
      notifications = notifications.filter(n => !n.isRead);
    }
    
    const unreadCount = mockNotifications.filter(n => !n.isRead).length;
    
    console.log(`📋 Retrieved ${notifications.length} notifications for user ${req.user.userId}`);
    
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
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const unreadCount = mockNotifications.filter(n => !n.isRead).length;
    
    res.json({
      success: true,
      unreadCount
    });
  } catch (error) {
    console.error('❌ Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count'
    });
  }
});

// PUT /api/notifications/mark-read
router.put('/mark-read', auth, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    
    // Mark notifications as read (in real app, update database)
    mockNotifications.forEach(n => {
      if (notificationIds.includes(n.id)) {
        n.isRead = true;
      }
    });
    
    res.json({
      success: true,
      message: `${notificationIds.length} notifications marked as read`,
      modifiedCount: notificationIds.length
    });
  } catch (error) {
    console.error('❌ Error marking notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read'
    });
  }
});

// PUT /api/notifications/mark-all-read
router.put('/mark-all-read', auth, async (req, res) => {
  try {
    const unreadCount = mockNotifications.filter(n => !n.isRead).length;
    
    // Mark all as read
    mockNotifications.forEach(n => {
      n.isRead = true;
    });
    
    res.json({
      success: true,
      message: `${unreadCount} notifications marked as read`,
      modifiedCount: unreadCount
    });
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read'
    });
  }
});

// POST /api/notifications/test
router.post('/test', auth, async (req, res) => {
  try {
    const { title, message } = req.body;
    
    const testNotification = {
      id: Date.now().toString(),
      type: 'system_announcement',
      title: title || 'Test Notification',
      message: message || 'This is a test notification',
      data: { testNotification: true },
      isRead: false,
      priority: 'medium',
      category: 'system',
      actions: [],
      createdAt: new Date().toISOString()
    };
    
    mockNotifications.unshift(testNotification);
    
    res.json({
      success: true,
      message: 'Test notification created successfully',
      notification: testNotification
    });
  } catch (error) {
    console.error('❌ Error creating test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test notification'
    });
  }
});

// POST /api/notifications/:id/action
router.post('/:id/action', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { actionType } = req.body;
    
    const notification = mockNotifications.find(n => n.id === id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    // Mark as read
    notification.isRead = true;
    
    res.json({
      success: true,
      message: `Action ${actionType} executed successfully`,
      notification: {
        id: notification.id,
        type: notification.type,
        data: notification.data
      }
    });
  } catch (error) {
    console.error('❌ Error executing notification action:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute notification action'
    });
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const index = mockNotifications.findIndex(n => n.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    mockNotifications.splice(index, 1);
    
    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification'
    });
  }
});