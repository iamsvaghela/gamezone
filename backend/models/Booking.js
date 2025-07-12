// models/Booking.js - Complete Booking Model with all required functionality
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
    max: [8, 'Duration cannot exceed 8 hours']
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount must be positive']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'completed', 'cancelled'],
      message: 'Status must be one of: pending, confirmed, completed, cancelled'
    },
    default: 'pending',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: {
      values: ['pending', 'paid', 'refunded', 'failed'],
      message: 'Payment status must be one of: pending, paid, refunded, failed'
    },
    default: 'pending',
    index: true
  },
  reference: {
    type: String,
    unique: true,
    default: generateBookingReference,
    index: true
  },
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
  cancelledAt: {
    type: Date,
    default: null
  },
  // Payment tracking
  paymentMethod: {
    type: String,
    enum: ['card', 'cash', 'mobile_payment'],
    default: 'card'
  },
  paymentReference: {
    type: String,
    default: null
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
  // Add compound indexes for better query performance
  indexes: [
    { userId: 1, date: -1 },
    { zoneId: 1, date: 1, timeSlot: 1 },
    { status: 1, date: 1 },
    { paymentStatus: 1, createdAt: -1 }
  ]
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
    
    this.reference = reference;
  }
  next();
});

// Method to check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function() {
  // Cannot cancel if already cancelled or completed
  if (this.status === 'cancelled' || this.status === 'completed') {
    return false;
  }
  
  // Create booking date/time
  const bookingDateTime = new Date(this.date);
  const [hours, minutes] = this.timeSlot.split(':').map(Number);
  bookingDateTime.setHours(hours, minutes, 0, 0);
  
  // Check if booking is more than 2 hours away
  const now = new Date();
  const timeDiff = bookingDateTime.getTime() - now.getTime();
  const hoursDiff = timeDiff / (1000 * 60 * 60);
  
  return hoursDiff > 2;
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
  return this.save();
};

// Method to cancel booking
bookingSchema.methods.cancel = function(reason) {
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledAt = new Date();
  
  // Update payment status to refunded if it was paid
  if (this.paymentStatus === 'paid') {
    this.paymentStatus = 'refunded';
  }
  
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
    status: { $in: ['pending', 'confirmed'] }
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

// Virtual for end time
bookingSchema.virtual('endTime').get(function() {
  const [hours, minutes] = this.timeSlot.split(':').map(Number);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + (this.duration * 60);
  const endHours = Math.floor(endMinutes / 60) % 24;
  const endMins = endMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
});

// Virtual for booking duration in minutes
bookingSchema.virtual('durationInMinutes').get(function() {
  return this.duration * 60;
});

// Transform output to include virtuals
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