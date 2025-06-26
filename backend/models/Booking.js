const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameZone',
    required: [true, 'Game zone ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Booking date is required']
  },
  timeSlot: {
    type: String,
    required: [true, 'Time slot is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide time in HH:MM format']
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
    min: [0, 'Amount cannot be negative']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentId: {
    type: String,
    trim: true
  },
  reference: {
    type: String,
    unique: true
  },
  qrCode: {
    type: String
  },
  notes: {
    type: String,
    maxlength: [200, 'Notes cannot exceed 200 characters']
  },
  cancellationReason: {
    type: String,
    maxlength: [200, 'Cancellation reason cannot exceed 200 characters']
  },
  cancelledAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound index for unique booking per slot
bookingSchema.index({ 
  zoneId: 1, 
  date: 1, 
  timeSlot: 1 
}, { 
  unique: true,
  partialFilterExpression: { 
    status: { $in: ['pending', 'confirmed'] } 
  }
});

// Index for user bookings
bookingSchema.index({ userId: 1, createdAt: -1 });

// Index for vendor bookings
bookingSchema.index({ zoneId: 1, createdAt: -1 });

// Pre-save middleware to generate reference
bookingSchema.pre('save', function(next) {
  if (!this.reference) {
    this.reference = 'GZ-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
  }
  next();
});

// Pre-validate middleware to ensure reference is set
bookingSchema.pre('validate', function(next) {
  if (!this.reference) {
    this.reference = 'GZ-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
  }
  next();
});

// Method to calculate end time
bookingSchema.methods.getEndTime = function() {
  const [hours, minutes] = this.timeSlot.split(':').map(Number);
  const endHours = hours + this.duration;
  return `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

// Method to check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function() {
  if (this.status === 'cancelled' || this.status === 'completed') {
    return false;
  }
  
  // Allow cancellation up to 2 hours before booking time
  const bookingDateTime = new Date(this.date);
  const [hours, minutes] = this.timeSlot.split(':').map(Number);
  bookingDateTime.setHours(hours, minutes, 0, 0);
  
  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return bookingDateTime > twoHoursFromNow;
};

module.exports = mongoose.model('Booking', bookingSchema);