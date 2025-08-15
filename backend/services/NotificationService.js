const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPushNotification, sendEmail } = require('./PushNotificationService');

class NotificationService {
  // Create notification for user
  static async createNotification(userId, notificationData) {
    try {
      console.log('📢 Creating notification for user:', userId);
      
      const notification = await Notification.create({
        userId,
        ...notificationData
      });

      // Send real-time notification
      await this.sendRealTimeNotification(notification);
      
      // Send push notification if user has enabled it
      await this.sendPushNotificationToUser(userId, notification);
      
      return notification;
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      throw error;
    }
  }

  // Send real-time notification via WebSocket/SSE
  static async sendRealTimeNotification(notification) {
    try {
      const io = require('../socket').getIO();
      
      if (io) {
        // Send to specific user
        io.to(`user_${notification.userId}`).emit('notification', {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          priority: notification.priority,
          actions: notification.actions,
          createdAt: notification.createdAt
        });
        
        console.log('✅ Real-time notification sent to user:', notification.userId);
      }
    } catch (error) {
      console.error('❌ Error sending real-time notification:', error);
    }
  }

  // Send push notification to user
  static async sendPushNotificationToUser(userId, notification) {
    try {
      const user = await User.findById(userId);
      
      if (user && user.pushNotificationSettings?.enabled && user.pushToken) {
        await sendPushNotification(user.pushToken, {
          title: notification.title,
          body: notification.message,
          data: {
            notificationId: notification._id.toString(),
            type: notification.type,
            ...notification.data
          }
        });
        
        console.log('📱 Push notification sent to user:', userId);
      }
    } catch (error) {
      console.error('❌ Error sending push notification:', error);
    }
  }

  // Handle booking created - notify vendor
  static async handleBookingCreated(booking) {
    try {
      console.log('📅 Handling booking created notification');
      
      // Get vendor from zone
      const zone = await require('../models/GameZone').findById(booking.zoneId).populate('vendorId');
      
      if (zone && zone.vendorId) {
        // Create notification for vendor
        await this.createNotification(zone.vendorId._id, {
          type: 'booking_created',
          category: 'booking',
          title: 'New Booking Request',
          message: `New booking request for ${zone.name} on ${booking.date.toLocaleDateString()} at ${booking.timeSlot}.`,
          priority: 'high',
          data: {
            bookingId: booking._id,
            reference: booking.reference,
            zoneId: booking.zoneId,
            zoneName: zone.name,
            customerName: booking.customerName,
            date: booking.date,
            timeSlot: booking.timeSlot,
            duration: booking.duration,
            totalAmount: booking.totalAmount
          },
          actions: [
            {
              type: 'confirm',
              label: 'Confirm Booking',
              endpoint: `/api/vendor/bookings/${booking._id}/confirm`,
              method: 'PUT'
            },
            {
              type: 'cancel',
              label: 'Decline Booking',
              endpoint: `/api/vendor/bookings/${booking._id}/decline`,
              method: 'PUT'
            }
          ]
        });
        
        // Also send email notification to vendor
        await this.sendEmailNotification(zone.vendorId.email, {
          subject: 'New Booking Request',
          template: 'booking_request',
          data: {
            vendorName: zone.vendorId.name,
            zoneName: zone.name,
            customerName: booking.customerName,
            date: booking.date.toLocaleDateString(),
            timeSlot: booking.timeSlot,
            duration: booking.duration,
            totalAmount: booking.totalAmount,
            reference: booking.reference
          }
        });
      }
      
      // Create notification for customer
      await this.createNotification(booking.userId, {
        type: 'booking_created',
        category: 'booking',
        title: 'Booking Created',
        message: `Your booking for ${zone.name} is pending confirmation.`,
        priority: 'medium',
        data: {
          bookingId: booking._id,
          reference: booking.reference,
          zoneId: booking.zoneId,
          zoneName: zone.name,
          date: booking.date,
          timeSlot: booking.timeSlot
        }
      });
      
    } catch (error) {
      console.error('❌ Error handling booking created notification:', error);
    }
  }

  // Handle booking confirmed - notify customer
  static async handleBookingConfirmed(booking) {
    try {
      console.log('✅ Handling booking confirmed notification');
      
      const zone = await require('../models/GameZone').findById(booking.zoneId);
      
      // Create notification for customer
      await this.createNotification(booking.userId, {
        type: 'booking_confirmed',
        category: 'booking',
        title: 'Booking Confirmed! 🎉',
        message: `Your booking for ${zone.name} on ${booking.date.toLocaleDateString()} has been confirmed.`,
        priority: 'high',
        data: {
          bookingId: booking._id,
          reference: booking.reference,
          zoneId: booking.zoneId,
          zoneName: zone.name,
          date: booking.date,
          timeSlot: booking.timeSlot
        },
        actions: [
          {
            type: 'view',
            label: 'View Booking',
            endpoint: `/api/bookings/${booking._id}`,
            method: 'GET'
          }
        ]
      });
      
      // Send confirmation email
      const user = await User.findById(booking.userId);
      if (user) {
        await this.sendEmailNotification(user.email, {
          subject: 'Booking Confirmed',
          template: 'booking_confirmed',
          data: {
            customerName: user.name,
            zoneName: zone.name,
            date: booking.date.toLocaleDateString(),
            timeSlot: booking.timeSlot,
            duration: booking.duration,
            reference: booking.reference
          }
        });
      }
      
    } catch (error) {
      console.error('❌ Error handling booking confirmed notification:', error);
    }
  }

  // Handle booking cancelled
  static async handleBookingCancelled(booking, cancelledBy = 'customer') {
    try {
      console.log('❌ Handling booking cancelled notification');
      
      const zone = await require('../models/GameZone').findById(booking.zoneId).populate('vendorId');
      
      if (cancelledBy === 'customer') {
        // Notify vendor
        await this.createNotification(zone.vendorId._id, {
          type: 'booking_cancelled',
          category: 'booking',
          title: 'Booking Cancelled',
          message: `Customer cancelled booking for ${zone.name} on ${booking.date.toLocaleDateString()}.`,
          priority: 'medium',
          data: {
            bookingId: booking._id,
            reference: booking.reference,
            zoneId: booking.zoneId,
            zoneName: zone.name,
            date: booking.date,
            timeSlot: booking.timeSlot
          }
        });
      } else {
        // Notify customer
        await this.createNotification(booking.userId, {
          type: 'booking_cancelled',
          category: 'booking',
          title: 'Booking Cancelled',
          message: `Your booking for ${zone.name} on ${booking.date.toLocaleDateString()} has been cancelled.`,
          priority: 'high',
          data: {
            bookingId: booking._id,
            reference: booking.reference,
            zoneId: booking.zoneId,
            zoneName: zone.name,
            date: booking.date,
            timeSlot: booking.timeSlot
          }
        });
      }
      
    } catch (error) {
      console.error('❌ Error handling booking cancelled notification:', error);
    }
  }

  // Get user notifications
  static async getUserNotifications(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        unreadOnly = false,
        type = null,
        category = null
      } = options;
      
      const query = { userId };
      
      if (unreadOnly) query.isRead = false;
      if (type) query.type = type;
      if (category) query.category = category;
      
      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      
      const total = await Notification.countDocuments(query);
      const unreadCount = await Notification.countDocuments({ userId, isRead: false });
      
      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        unreadCount
      };
    } catch (error) {
      console.error('❌ Error getting user notifications:', error);
      throw error;
    }
  }

  // Mark notifications as read
  static async markAsRead(userId, notificationIds) {
    try {
      const result = await Notification.updateMany(
        { 
          userId, 
          _id: { $in: notificationIds },
          isRead: false 
        },
        { isRead: true }
      );
      
      return result.modifiedCount;
    } catch (error) {
      console.error('❌ Error marking notifications as read:', error);
      throw error;
    }
  }

  // Mark all notifications as read
  static async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { userId, isRead: false },
        { isRead: true }
      );
      
      return result.modifiedCount;
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
      throw error;
    }
  }

  // Delete notification
  static async deleteNotification(userId, notificationId) {
    try {
      const result = await Notification.deleteOne({
        _id: notificationId,
        userId
      });
      
      return result.deletedCount > 0;
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
      throw error;
    }
  }

  // Send email notification
  static async sendEmailNotification(email, emailData) {
    try {
      // Implement email sending logic here
      console.log('📧 Sending email notification to:', email);
      console.log('📧 Email data:', emailData);
      
      // You can integrate with services like SendGrid, Mailgun, etc.
      // await sendEmail(email, emailData);
      
    } catch (error) {
      console.error('❌ Error sending email notification:', error);
    }
  }


  // Send push notification to specific user
static async sendPushNotificationToUser(userId, notification) {
  try {
    console.log('📱 Sending push notification to user:', userId);
    
    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user) {
      console.warn('⚠️ User not found for push notification:', userId);
      return { success: false, error: 'User not found' };
    }
    
    // Check if user has push notifications enabled
    if (!user.pushNotificationSettings?.enabled) {
      console.log('⚠️ Push notifications disabled for user:', userId);
      return { success: false, error: 'Push notifications disabled' };
    }
    
    // Get active FCM tokens
    const tokens = user.getActiveFCMTokens();
    if (tokens.length === 0) {
      console.log('⚠️ No active FCM tokens for user:', userId);
      return { success: false, error: 'No active FCM tokens' };
    }
    
    // Prepare push payload
    const pushPayload = {
      title: notification.title,
      body: notification.message,
      type: notification.type,
      data: {
        notificationId: notification._id.toString(),
        category: notification.category,
        priority: notification.priority,
        actions: JSON.stringify(notification.actions || []),
        ...notification.data
      }
    };
    
    // Send to multiple devices using your existing FirebaseService
    const firebaseService = require('./FirebaseService');
    const results = await firebaseService.sendToMultipleDevices(tokens, pushPayload);
    
    if (results.success) {
      console.log(`✅ Push notification sent successfully: ${results.successCount}/${tokens.length}`);
      
      // Mark notification as sent
      notification.sentAt = new Date();
      await notification.save();
      
      return {
        success: true,
        sentCount: results.successCount,
        failureCount: results.failureCount
      };
    } else {
      console.error('❌ Push notification failed:', results.error);
      return { success: false, error: results.error };
    }
    
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}


// Enhanced booking notification methods
static async handleBookingCreated(booking, zone, user) {
  try {
    console.log('📢 Handling booking created notifications');
    
    const results = {
      customer: null,
      vendor: null,
      errors: []
    };
    
    // Customer notification
    try {
      const customerNotification = await this.createNotification(
        booking.userId,
        {
          type: 'booking_created',
          title: '🎮 Booking Created - Payment Required',
          message: `Your booking for "${zone.name}" has been created. Please complete the payment within 30 minutes.`,
          priority: 'high',
          category: 'booking',
          data: {
            bookingId: booking._id.toString(),
            reference: booking.reference,
            zoneId: booking.zoneId.toString(),
            zoneName: zone.name,
            date: booking.date.toISOString(),
            timeSlot: booking.timeSlot,
            duration: booking.duration,
            totalAmount: booking.totalAmount,
            status: booking.status,
            userType: 'customer',
            isCustomerNotification: true
          },
          actions: [
            {
              type: 'view',
              label: 'Complete Payment',
              endpoint: `/api/bookings/${booking._id}`,
              method: 'GET'
            }
          ]
        },
        true // Send push notification
      );
      
      results.customer = customerNotification;
      console.log('✅ Customer notification created for booking');
      
    } catch (customerError) {
      console.error('❌ Customer notification failed:', customerError);
      results.errors.push(`Customer notification: ${customerError.message}`);
    }
    
    // Vendor notification (if zone has vendor)
    if (zone.vendorId) {
      try {
        const vendorNotification = await this.createNotification(
          zone.vendorId._id || zone.vendorId,
          {
            type: 'booking_created',
            title: '📋 New Booking - Payment Pending',
            message: `${user.name} has created a booking for "${zone.name}". Waiting for payment confirmation.`,
            priority: 'medium',
            category: 'booking',
            data: {
              bookingId: booking._id.toString(),
              reference: booking.reference,
              zoneId: booking.zoneId.toString(),
              zoneName: zone.name,
              customerName: user.name,
              customerEmail: user.email,
              date: booking.date.toISOString(),
              timeSlot: booking.timeSlot,
              duration: booking.duration,
              totalAmount: booking.totalAmount,
              status: booking.status,
              userType: 'vendor',
              isVendorNotification: true
            },
            actions: [
              {
                type: 'view',
                label: 'View Booking Details',
                endpoint: `/api/vendor/bookings/${booking._id}`,
                method: 'GET'
              }
            ]
          },
          true // Send push notification
        );
        
        results.vendor = vendorNotification;
        console.log('✅ Vendor notification created for booking');
        
      } catch (vendorError) {
        console.error('❌ Vendor notification failed:', vendorError);
        results.errors.push(`Vendor notification: ${vendorError.message}`);
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Error handling booking created notifications:', error);
    throw error;
  }
}

// Create notification and send push (enhanced method)
static async createNotification(userId, notificationData, sendPush = true) {
  try {
    console.log('📢 Creating notification for user:', userId);
    
    const Notification = require('../models/Notification');
    
    // Create notification in database
    const notification = new Notification({
      userId: new mongoose.Types.ObjectId(userId),
      ...notificationData
    });
    
    await notification.save();
    console.log('✅ Notification created in database:', notification._id);
    
    // Send push notification if enabled
    if (sendPush) {
      await this.sendPushNotificationToUser(userId, notification);
    }
    
    return notification;
    
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
}


  // Schedule notification for later
  static async scheduleNotification(userId, notificationData, scheduledFor) {
    try {
      const notification = await Notification.create({
        userId,
        ...notificationData,
        scheduledFor
      });
      
      console.log('⏰ Notification scheduled for:', scheduledFor);
      return notification;
    } catch (error) {
      console.error('❌ Error scheduling notification:', error);
      throw error;
    }
  }

  // Process scheduled notifications
  static async processScheduledNotifications() {
    try {
      const now = new Date();
      const scheduledNotifications = await Notification.find({
        scheduledFor: { $lte: now },
        sentAt: null
      });
      
      for (const notification of scheduledNotifications) {
        await this.sendRealTimeNotification(notification);
        await this.sendPushNotificationToUser(notification.userId, notification);
        await notification.markAsSent();
      }
      
      console.log(`📤 Processed ${scheduledNotifications.length} scheduled notifications`);
    } catch (error) {
      console.error('❌ Error processing scheduled notifications:', error);
    }
  }
}

module.exports = NotificationService;