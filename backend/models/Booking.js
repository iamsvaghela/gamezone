// models/Booking.js - Updated with new payment flow statuses
const mongoose = require('mongoose');

// Helper function to generate unique booking reference
const generateBookingReference = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let reference = 'GZ-';
  
  // Add 8 random characters
  for (let i = 0; i < 8; i++) {
    reference += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Add 4 more characters with dash
  reference += '-';
  for (let i = 0; i < 4; i++) {
    reference += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return reference;
};

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameZone',
    required: [true, 'Zone ID is required'],
    index: true
  },
  date: {
    type: Date,
    required: [true, 'Booking date is required'],
    index: true
  },
  timeSlot: {
    type: String,
    required: [true, 'Time slot is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time slot must be in HH:MM format'],
    index: true
  },
  duration: {
    type: Number,
    required: [true, 'Duration is required'],
    min: [1, 'Duration must be at least 1 hour'],
    max: [12, 'Duration cannot exceed 12 hours']
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount must be positive']
  },
  reference: {
    type: String,
    unique: true,
    default: generateBookingReference,
    index: true
  },
  // 🆕 Updated status with new payment flow states
  status: {
    type: String,
    enum: {
      values: [
        'pending_payment',  // 🆕 Booking created, waiting for payment
        'confirmed',        // Payment successful, booking confirmed
        'payment_failed',   // 🆕 Payment failed, booking cancelled
        'completed',        // Booking session completed
        'cancelled',        // Booking cancelled by user
        'no_show'          // User didn't show up
      ],
      message: 'Status must be one of: pending_payment, confirmed, payment_failed, completed, cancelled, no_show'
    },
    default: 'pending_payment', // 🆕 Default to pending payment
    index: true
  },
  // 🆕 Enhanced payment status tracking
  paymentStatus: {
    type: String,
    enum: {
      values: [
        'pending',    // 🆕 Payment not yet attempted
        'processing', // 🆕 Payment in progress
        'completed',  // Payment successful
        'failed',     // Payment failed
        'refunded'    // Payment refunded
      ],
      message: 'Payment status must be one of: pending, processing, completed, failed, refunded'
    },
    default: 'pending',
    index: true
  },
  paymentMethod: {
    type: String,
    enum: ['upi', 'card', 'netbanking', 'wallet', null],
    default: null // 🆕 Will be set after payment
  },
  // 🆕 Enhanced payment tracking fields
  paymentId: {
    type: String,
    default: null,
    index: true // For quick lookups
  },
  orderId: {
    type: String,
    default: null,
    index: true
  },
  paymentVerified: {
    type: Boolean,
    default: false
  },
  paymentVerifiedAt: {
    type: Date,
    default: null
  },
  // 🆕 Payment failure tracking
  paymentFailureReason: {
    type: String,
    default: null
  },
  paymentFailedAt: {
    type: Date,
    default: null
  },
  // 🆕 Payment attempt tracking
  paymentAttempts: [{
    attemptedAt: { type: Date, default: Date.now },
    paymentId: String,
    orderId: String,
    status: String,
    errorMessage: String
  }],
  qrCode: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
    trim: true
  },
  cancellationReason: {
    type: String,
    maxlength: [200, 'Cancellation reason cannot exceed 200 characters'],
    trim: true
  },
  // 🆕 Enhanced booking lifecycle timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  confirmedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  // 🆕 Auto-cancellation for pending payments
  paymentDeadline: {
    type: Date,
    default: function() {
      // Set deadline to 30 minutes from creation for pending payments
      return new Date(Date.now() + 30 * 60 * 1000);
    }
  },
  // Vendor notification status
  vendorNotified: {
    type: Boolean,
    default: false
  },
  // Customer notification status
  customerNotified: {
    type: Boolean,
    default: false
  },
  // Check-in status
  checkedIn: {
    type: Boolean,
    default: false
  },
  checkedInAt: {
    type: Date,
    default: null
  },
  // Review status
  reviewLeft: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  // 🆕 Add indexes for better query performance
  indexes: [
    { fields: { userId: 1, status: 1 } },
    { fields: { zoneId: 1, date: 1 } },
    { fields: { status: 1, paymentDeadline: 1 } }, // For auto-cancellation queries
    { fields: { paymentId: 1 } },
    { fields: { reference: 1 } },
    { fields: { userId: 1, date: -1 } },
    { fields: { zoneId: 1, date: 1, timeSlot: 1 } },
    { fields: { paymentStatus: 1, createdAt: -1 } }
  ]
});

// 🆕 Compound index to prevent double bookings
bookingSchema.index({ 
  zoneId: 1, 
  date: 1, 
  timeSlot: 1, 
  status: 1 
}, { 
  unique: true, 
  partialFilterExpression: { 
    status: { $in: ['pending_payment', 'confirmed'] } 
  }
});

// 🆕 Auto-update timestamp on save
bookingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Set confirmed timestamp when status changes to confirmed
  if (this.isModified('status') && this.status === 'confirmed' && !this.confirmedAt) {
    this.confirmedAt = new Date();
  }
  
  // Set completed timestamp when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  // Set cancelled timestamp when status changes to cancelled or payment_failed
  if (this.isModified('status') && 
      (this.status === 'cancelled' || this.status === 'payment_failed') && 
      !this.cancelledAt) {
    this.cancelledAt = new Date();
  }
  
  next();
});

// Pre-save middleware to ensure unique booking reference
bookingSchema.pre('save', async function(next) {
  if (this.isNew && !this.reference) {
    let reference;
    let referenceExists = true;
    
    // Keep generating until we find a unique reference
    while (referenceExists) {
      reference = generateBookingReference();
      const existingBooking = await this.constructor.findOne({ reference });
      referenceExists = !!existingBooking;
    }
    
    this.reference = = reference;
  }
  next();
});

// 🆕 Method to check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function() {
  if (!['pending_payment', 'confirmed'].includes(this.status)) {
    return { canCancel: false, reason: 'Booking is not in a cancellable state' };
  }
  
  const now = new Date();
  const bookingDateTime = new Date(this.date);
  const [hours, minutes] = this.timeSlot.split(':');
  bookingDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60);
  
  if (hoursUntilBooking < 24) {
    return { 
      canCancel: false, 
      reason: 'Cannot cancel booking less than 24 hours before start time',
      hoursRemaining: Math.round(hoursUntilBooking * 100) / 100
    };
  }
  
  return { canCancel: true };
};

// Method to mark booking as checked in
bookingSchema.methods.checkIn = function() {
  this.checkedIn = true;
  this.checkedInAt = new Date();
  return this.save();
};

// Method to complete booking
bookingSchema.methods.complete = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

// 🆕 Updated cancel method
bookingSchema.methods.cancel = function(reason) {
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledAt = new Date();
  
  // Update payment status to refunded if it was paid
  if (this.paymentStatus === 'completed') {
    this.paymentStatus = 'refunded';
  }
  
  return this.save();
};

// 🆕 Instance method to record payment attempt
bookingSchema.methods.recordPaymentAttempt = function(paymentData) {
  this.paymentAttempts.push({
    attemptedAt: new Date(),
    paymentId: paymentData.paymentId,
    orderId: paymentData.orderId,
    status: paymentData.status,
    errorMessage: paymentData.errorMessage
  });
  
  return this.save();
};

// Static method to find conflicting bookings
bookingSchema.statics.findConflictingBookings = function(zoneId, date, timeSlot, duration, excludeId = null) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const query = {
    zoneId: zoneId,
    date: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    status: { $in: ['pending_payment', 'confirmed'] } // 🆕 Updated to include pending_payment
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return this.find(query);
};

// Static method to check time slot availability
bookingSchema.statics.isTimeSlotAvailable = async function(zoneId, date, timeSlot, duration, excludeId = null) {
  const conflictingBookings = await this.findConflictingBookings(zoneId, date, timeSlot, duration, excludeId);
  
  const requestedStart = parseInt(timeSlot.split(':')[0]);
  const requestedEnd = requestedStart + duration;
  
  const hasConflict = conflictingBookings.some(booking => {
    const existingStart = parseInt(booking.timeSlot.split(':')[0]);
    const existingEnd = existingStart + booking.duration;
    
    return (requestedStart < existingEnd && requestedEnd > existingStart);
  });
  
  return !hasConflict;
};

// 🆕 Static method to find expired pending payments
bookingSchema.statics.findExpiredPendingPayments = function() {
  return this.find({
    status: 'pending_payment',
    paymentDeadline: { $lt: new Date() }
  });
};

// 🆕 Static method to auto-cancel expired bookings
bookingSchema.statics.cancelExpiredBookings = async function() {
  const expiredBookings = await this.findExpiredPendingPayments();
  
  const results = [];
  for (const booking of expiredBookings) {
    booking.status = 'payment_failed';
    booking.paymentStatus = 'failed';
    booking.paymentFailureReason = 'Payment deadline exceeded';
    booking.paymentFailedAt = new Date();
    
    await booking.save();
    results.push({
      bookingId: booking._id,
      reference: booking.reference,
      reason: 'Payment deadline exceeded'
    });
  }
  
  return results;
};

// Static method to get user's booking statistics
bookingSchema.statics.getUserStats = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);
};

// Static method to get zone's booking statistics
bookingSchema.statics.getZoneStats = function(zoneId) {
  return this.aggregate([
    { $match: { zoneId: mongoose.Types.ObjectId(zoneId) } },
    {
      $group: {
        _id: {
          status: '$status',
          month: { $month: '$date' },
          year: { $year: '$date' }
        },
        count: { $sum: 1 },
        totalRevenue: { $sum: '$totalAmount' }
      }
    }
  ]);
};

// 🆕 Virtual for formatted time display
bookingSchema.virtual('formattedTimeSlot').get(function() {
  if (!this.timeSlot) return '';
  
  const [hours, minutes] = this.timeSlot.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
});

// 🆕 Virtual for booking end time
bookingSchema.virtual('endTime').get(function() {
  if (!this.timeSlot || !this.duration) return '';
  
  const [hours, minutes] = this.timeSlot.split(':');
  const startMinutes = parseInt(hours) * 60 + parseInt(minutes);
  const endMinutes = startMinutes + (this.duration * 60);
  
  const endHours = Math.floor(endMinutes / 60) % 24;
  const mins = endMinutes % 60;
  
  return `${endHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
});

// Virtual for formatted date
bookingSchema.virtual('formattedDate').get(function() {
  return this.date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for formatted time
bookingSchema.virtual('formattedTime').get(function() {
  const [hours, minutes] = this.timeSlot.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
});

// Virtual for booking duration in minutes
bookingSchema.virtual('durationInMinutes').get(function() {
  return this.duration * 60;
});

// 🆕 Virtual for payment status display
bookingSchema.virtual('paymentStatusDisplay').get(function() {
  const statusMap = {
    'pending': 'Payment Required',
    'processing': 'Processing Payment...',
    'completed': 'Payment Completed',
    'failed': 'Payment Failed',
    'refunded': 'Payment Refunded'
  };
  
  return statusMap[this.paymentStatus] || this.paymentStatus;
});

// 🆕 Virtual for overall booking status display
bookingSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    'pending_payment': 'Awaiting Payment',
    'confirmed': 'Confirmed',
    'payment_failed': 'Payment Failed',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'no_show': 'No Show'
  };
  
  return statusMap[this.status] || this.status;
});

// 🆕 Virtual to check if booking is active (can be used)
bookingSchema.virtual('isActive').get(function() {
  return ['confirmed'].includes(this.status);
});

// 🆕 Virtual to check if payment is required
bookingSchema.virtual('requiresPayment').get(function() {
  return this.status === 'pending_payment' && this.paymentStatus === 'pending';
});

// 🆕 Virtual to check if booking is expired (past payment deadline)
bookingSchema.virtual('isExpired').get(function() {
  return this.status === 'pending_payment' && 
         this.paymentDeadline && 
         new Date() > this.paymentDeadline;
});

// Ensure virtuals are included when converting to JSON
bookingSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

bookingSchema.set('toObject', { virtuals: true });

// Add text search index for reference and notes
bookingSchema.index({ 
  reference: 'text', 
  notes: 'text' 
});

module.exports = mongoose.model('Booking', bookingSchema);