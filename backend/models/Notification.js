// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'booking_created',
      'booking_confirmed', 
      'booking_cancelled',
      'booking_reminder',
      'payment_success',
      'payment_failed',
      'zone_update',
      'system_announcement'
    ],
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['booking', 'payment', 'zone', 'system'],
    default: 'booking'
  },
  actions: [{
    type: {
      type: String,
      enum: ['confirm', 'cancel', 'view', 'update', 'decline'],
      required: true
    },
    label: {
      type: String,
      required: true
    },
    endpoint: {
      type: String,
      required: true
    },
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'DELETE'],
      default: 'GET'
    }
  }],
  scheduledFor: {
    type: Date,
    default: null
  },
  sentAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ scheduledFor: 1 });

// Static methods
notificationSchema.statics.createBookingNotification = async function(bookingData, type) {
  const notification = {
    userId: bookingData.userId,
    type,
    category: 'booking',
    data: {
      bookingId: bookingData._id,
      reference: bookingData.reference,
      zoneId: bookingData.zoneId,
      date: bookingData.date,
      timeSlot: bookingData.timeSlot
    }
  };

  switch (type) {
    case 'booking_created':
      notification.title = 'Booking Created';
      notification.message = `Your booking for ${bookingData.zoneName} on ${bookingData.date} is pending confirmation.`;
      notification.priority = 'medium';
      break;
    
    case 'booking_confirmed':
      notification.title = 'Booking Confirmed! 🎉';
      notification.message = `Your booking for ${bookingData.zoneName} on ${bookingData.date} has been confirmed.`;
      notification.priority = 'high';
      notification.actions = [
        {
          type: 'view',
          label: 'View Booking',
          endpoint: `/api/bookings/${bookingData._id}`,
          method: 'GET'
        }
      ];
      break;
    
    case 'booking_cancelled':
      notification.title = 'Booking Cancelled';
      notification.message = `Your booking for ${bookingData.zoneName} on ${bookingData.date} has been cancelled.`;
      notification.priority = 'high';
      break;
  }

  return await this.create(notification);
};

notificationSchema.statics.createVendorNotification = async function(bookingData, vendorId) {
  const notification = {
    userId: vendorId,
    type: 'booking_created',
    category: 'booking',
    title: 'New Booking Request',
    message: `New booking request for ${bookingData.zoneName} on ${bookingData.date} at ${bookingData.timeSlot}.`,
    priority: 'high',
    data: {
      bookingId: bookingData._id,
      reference: bookingData.reference,
      zoneId: bookingData.zoneId,
      customerName: bookingData.customerName,
      date: bookingData.date,
      timeSlot: bookingData.timeSlot,
      duration: bookingData.duration,
      totalAmount: bookingData.totalAmount
    },
    actions: [
      {
        type: 'confirm',
        label: 'Confirm Booking',
        endpoint: `/api/vendor/bookings/${bookingData._id}/confirm`,
        method: 'PUT'
      },
      {
        type: 'decline',
        label: 'Decline Booking',
        endpoint: `/api/vendor/bookings/${bookingData._id}/decline`,
        method: 'PUT'
      }
    ]
  };

  return await this.create(notification);
};

// Instance methods
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  return this.save();
};

notificationSchema.methods.markAsSent = function() {
  this.sentAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);