// routes/notifications.js - Complete notification routes
const express = require('express');
const { auth } = require('../middleware/auth');
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  executeNotificationAction,
  getNotificationById,
  createTestNotification,
  getNotificationStats
} = require('../controllers/notificationController');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(auth);

// @desc    Get user notifications with pagination and filtering
// @route   GET /api/notifications
// @access  Private
// Query params: page, limit, unreadOnly, type, category
router.get('/', getNotifications);

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
router.get('/unread-count', getUnreadCount);

// @desc    Get notification statistics
// @route   GET /api/notifications/stats
// @access  Private
router.get('/stats', getNotificationStats);

// @desc    Create test notification (development only)
// @route   POST /api/notifications/test
// @access  Private
router.post('/test', createTestNotification);

// @desc    Mark multiple notifications as read
// @route   PUT /api/notifications/mark-read
// @access  Private
// Body: { notificationIds: ['id1', 'id2', ...] }
router.put('/mark-read', markAsRead);

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/mark-all-read
// @access  Private
router.put('/mark-all-read', markAllAsRead);

// @desc    Get single notification by ID
// @route   GET /api/notifications/:id
// @access  Private
router.get('/:id', getNotificationById);

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
router.delete('/:id', deleteNotification);

// @desc    Execute notification action (confirm, decline, view, etc.)
// @route   POST /api/notifications/:id/action
// @access  Private
// Body: { actionType: 'confirm' | 'decline' | 'view' | 'cancel' }
router.post('/:id/action', executeNotificationAction);

module.exports = router;