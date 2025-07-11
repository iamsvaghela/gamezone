// controllers/notificationController.js - Complete notification API controller
const NotificationService = require('../services/NotificationService');
const Notification = require('../models/Notification');
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const User = require('../models/User');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      page = 1, 
      limit = 20, 
      unreadOnly = false, 
      type = null, 
      category = null 
    } = req.query;
    
    console.log('📋 Fetching notifications for user:', userId);
    
    const result = await NotificationService.getUserNotifications(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true',
      type,
      category
    });
    
    res.json({
      success: true,
      notifications: result.notifications,
      pagination: result.pagination,
      unreadCount: result.unreadCount
    });
    
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      message: error.message
    });
  }
};

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const unreadCount = await Notification.countDocuments({
      userId,
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
};

// @desc    Mark notifications as read
// @route   PUT /api/notifications/mark-read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationIds } = req.body;
    
    console.log('✅ Marking notifications as read for user:', userId);
    
    if (!notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({
        success: false,
        error: 'notificationIds must be an array'
      });
    }
    
    const modifiedCount = await NotificationService.markAsRead(userId, notificationIds);
    
    res.json({
      success: true,
      message: `${modifiedCount} notifications marked as read`,
      modifiedCount
    });
    
  } catch (error) {
    console.error('❌ Error marking notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read',
      message: error.message
    });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/mark-all-read
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    console.log('✅ Marking all notifications as read for user:', userId);
    
    const modifiedCount = await NotificationService.markAllAsRead(userId);
    
    res.json({
      success: true,
      message: `${modifiedCount} notifications marked as read`,
      modifiedCount
    });
    
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
      message: error.message
    });
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    
    console.log('🗑️ Deleting notification:', id, 'for user:', userId);
    
    const deleted = await NotificationService.deleteNotification(userId, id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found or already deleted'
      });
    }
    
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
};

// @desc    Execute notification action
// @route   POST /api/notifications/:id/action
// @access  Private
const executeNotificationAction = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { actionType } = req.body;
    
    console.log('🔄 Executing notification action:', actionType, 'for notification:', id);
    
    // Get the notification
    const notification = await Notification.findOne({ _id: id, userId });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    // Check if action is valid for this notification
    const validActions = notification.actions?.map(a => a.type) || [];
    if (!validActions.includes(actionType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action type. Valid actions: ${validActions.join(', ')}`
      });
    }
    
    let result = { success: true };
    
    // Execute the action based on type and notification data
    switch (actionType) {
      case 'confirm':
        if (notification.type === 'booking_created' && notification.data.bookingId) {
          result = await handleBookingConfirmation(notification.data.bookingId, userId);
        }
        break;
        
      case 'cancel':
      case 'decline':
        if (notification.type === 'booking_created' && notification.data.bookingId) {
          result = await handleBookingDecline(notification.data.bookingId, userId);
        }
        break;
        
      case 'view':
        // For view actions, just mark as read
        await notification.markAsRead();
        result = { success: true, message: 'Notification marked as read' };
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: `Action type '${actionType}' not implemented`
        });
    }
    
    // Mark notification as read after successful action
    if (result.success) {
      await notification.markAsRead();
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Error executing notification action:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute notification action',
      message: error.message
    });
  }
};

// Helper function to handle booking confirmation
const handleBookingConfirmation = async (bookingId, userId) => {
  try {
    const booking = await Booking.findById(bookingId).populate('zoneId');
    
    if (!booking) {
      return {
        success: false,
        error: 'Booking not found'
      };
    }
    
    // Check if user is authorized to confirm this booking
    if (booking.zoneId.vendorId.toString() !== userId) {
      return {
        success: false,
        error: 'You are not authorized to confirm this booking'
      };
    }
    
    if (booking.status !== 'pending') {
      return {
        success: false,
        error: `Cannot confirm booking with status: ${booking.status}`
      };
    }
    
    // Update booking status
    booking.status = 'confirmed';
    await booking.save();
    
    // Send confirmation notification to customer
    await NotificationService.handleBookingConfirmed(booking);
    
    return {
      success: true,
      message: 'Booking confirmed successfully',
      booking: {
        id: booking._id,
        reference: booking.reference,
        status: booking.status
      }
    };
    
  } catch (error) {
    console.error('❌ Error confirming booking:', error);
    return {
      success: false,
      error: 'Failed to confirm booking',
      message: error.message
    };
  }
};

// Helper function to handle booking decline
const handleBookingDecline = async (bookingId, userId) => {
  try {
    const booking = await Booking.findById(bookingId).populate('zoneId');
    
    if (!booking) {
      return {
        success: false,
        error: 'Booking not found'
      };
    }
    
    // Check if user is authorized to decline this booking
    if (booking.zoneId.vendorId.toString() !== userId) {
      return {
        success: false,
        error: 'You are not authorized to decline this booking'
      };
    }
    
    if (booking.status !== 'pending') {
      return {
        success: false,
        error: `Cannot decline booking with status: ${booking.status}`
      };
    }
    
    // Update booking status
    booking.status = 'cancelled';
    booking.paymentStatus = 'refunded';
    booking.cancelledAt = new Date();
    booking.cancellationReason = 'Declined by vendor';
    await booking.save();
    
    // Send cancellation notification to customer
    await NotificationService.handleBookingCancelled(booking, 'vendor');
    
    return {
      success: true,
      message: 'Booking declined successfully. Customer will be notified and refunded.',
      booking: {
        id: booking._id,
        reference: booking.reference,
        status: booking.status
      }
    };
    
  } catch (error) {
    console.error('❌ Error declining booking:', error);
    return {
      success: false,
      error: 'Failed to decline booking',
      message: error.message
    };
  }
};

// @desc    Get notification by ID
// @route   GET /api/notifications/:id
// @access  Private
const getNotificationById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    
    const notification = await Notification.findOne({ _id: id, userId });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      notification
    });
    
  } catch (error) {
    console.error('❌ Error fetching notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification',
      message: error.message
    });
  }
};

// @desc    Create test notification (for development)
// @route   POST /api/notifications/test
// @access  Private
const createTestNotification = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Test notifications are not allowed in production'
      });
    }
    
    const userId = req.user.userId;
    const { type = 'system_announcement', title, message } = req.body;
    
    const notification = await NotificationService.createNotification(userId, {
      type,
      category: 'system',
      title: title || 'Test Notification',
      message: message || 'This is a test notification from the GameZone API',
      priority: 'medium',
      data: {
        testNotification: true,
        timestamp: new Date().toISOString()
      },
      actions: [
        {
          type: 'view',
          label: 'View Details',
          endpoint: '/api/notifications/test',
          method: 'GET'
        }
      ]
    });
    
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
};

// @desc    Get notification statistics
// @route   GET /api/notifications/stats
// @access  Private
const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const stats = await Notification.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: {
            type: '$type',
            isRead: '$isRead'
          },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Format stats
    const formattedStats = {
      total: 0,
      unread: 0,
      read: 0,
      byType: {}
    };
    
    stats.forEach(stat => {
      const type = stat._id.type;
      const isRead = stat._id.isRead;
      
      formattedStats.total += stat.count;
      
      if (isRead) {
        formattedStats.read += stat.count;
      } else {
        formattedStats.unread += stat.count;
      }
      
      if (!formattedStats.byType[type]) {
        formattedStats.byType[type] = { total: 0, read: 0, unread: 0 };
      }
      
      formattedStats.byType[type].total += stat.count;
      formattedStats.byType[type][isRead ? 'read' : 'unread'] += stat.count;
    });
    
    res.json({
      success: true,
      stats: formattedStats
    });
    
  } catch (error) {
    console.error('❌ Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification statistics',
      message: error.message
    });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  executeNotificationAction,
  getNotificationById,
  createTestNotification,
  getNotificationStats
};