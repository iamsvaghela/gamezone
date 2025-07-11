// routes/notifications.js - Create this file in your backend
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Try to import auth middleware
let auth;
try {
  auth = require('../middleware/auth').auth;
} catch (error) {
  console.warn('⚠️  Auth middleware not found, using fallback');
  auth = (req, res, next) => {
    // Fallback auth - extract user from token if available
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.user = { userId: decoded.userId };
      } catch (error) {
        console.log('Invalid token');
      }
    }
    next();
  };
}

// Try to import models
let Notification, User, Booking;
try {
  // Create simple Notification model if it doesn't exist
  const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Object, default: {} },
    isRead: { type: Boolean, default: false },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    createdAt: { type: Date, default: Date.now },
    actions: [{ type: Object }]
  });
  
  Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
  
  // Try to get other models
  User = require('../models/User');
  Booking = require('../models/Booking');
} catch (error) {
  console.warn('⚠️  Some models not available:', error.message);
}

// GET /api/notifications - Get user notifications
router.get('/', auth, async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    const query = { userId: req.user.userId };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      userId: req.user.userId, 
      isRead: false 
    });

    console.log(`📋 Retrieved ${notifications.length} notifications for user ${req.user.userId}`);

    res.json({
      success: true,
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    });

  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      message: error.message
    });
  }
});

// GET /api/notifications/unread-count - Get unread count
router.get('/unread-count', auth, async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const unreadCount = await Notification.countDocuments({
      userId: req.user.userId,
      isRead: false
    });

    res.json({
      success: true,
      unreadCount
    });

  } catch (error) {
    console.error('❌ Error fetching unread count:', error);
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
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { notificationIds } = req.body;
    
    if (!notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({
        success: false,
        error: 'notificationIds array is required'
      });
    }

    const result = await Notification.updateMany(
      { 
        userId: req.user.userId, 
        _id: { $in: notificationIds },
        isRead: false 
      },
      { isRead: true }
    );

    console.log(`✅ Marked ${result.modifiedCount} notifications as read`);

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error marking notifications as read:', error);
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
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const result = await Notification.updateMany(
      { userId: req.user.userId, isRead: false },
      { isRead: true }
    );

    console.log(`✅ Marked ${result.modifiedCount} notifications as read`);

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
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
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { title, message, type = 'system_announcement' } = req.body;

    const notification = new Notification({
      userId: req.user.userId,
      type,
      title: title || 'Test Notification',
      message: message || 'This is a test notification from GameZone API',
      data: {
        testNotification: true,
        timestamp: new Date().toISOString()
      },
      priority: 'medium',
      actions: [
        {
          type: 'view',
          label: 'View Details',
          endpoint: '/api/notifications/test',
          method: 'GET'
        }
      ]
    });

    await notification.save();

    console.log('✅ Test notification created:', notification._id);

    res.json({
      success: true,
      message: 'Test notification created successfully',
      notification: {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        createdAt: notification.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Error creating test notification:', error);
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
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { id } = req.params;
    const { actionType } = req.body;

    const notification = await Notification.findOne({ 
      _id: id, 
      userId: req.user.userId 
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    // Mark as read
    notification.isRead = true;
    await notification.save();

    console.log(`✅ Notification action executed: ${actionType}`);

    res.json({
      success: true,
      message: `Action ${actionType} executed successfully`,
      notification: {
        id: notification._id,
        type: notification.type,
        data: notification.data
      }
    });

  } catch (error) {
    console.error('❌ Error executing notification action:', error);
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
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { id } = req.params;

    const result = await Notification.deleteOne({
      _id: id,
      userId: req.user.userId
    });

    if (result.deletedCount === 0) {
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
    console.error('❌ Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification',
      message: error.message
    });
  }
});

module.exports = router;