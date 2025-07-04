// models/GameZone.js - Complete GameZone Model
const mongoose = require('mongoose');

const gameZoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Zone name is required'],
    trim: true,
    maxlength: [100, 'Zone name cannot exceed 100 characters'],
    index: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Vendor ID is required'],
    index: true
  },
  location: {
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters']
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: [true, 'Coordinates are required'],
        validate: {
          validator: function(coords) {
            return coords.length === 2 && 
                   coords[0] >= -180 && coords[0] <= 180 && // longitude
                   coords[1] >= -90 && coords[1] <= 90;     // latitude
          },
          message: 'Coordinates must be [longitude, latitude] within valid ranges'
        }
      }
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: [50, 'City cannot exceed 50 characters'],
      index: true
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
      maxlength: [50, 'State cannot exceed 50 characters']
    },
    zipCode: {
      type: String,
      required: [true, 'ZIP code is required'],
      trim: true,
      match: [/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format']
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      maxlength: [50, 'Country cannot exceed 50 characters'],
      default: 'United States'
    }
  },
  amenities: {
    type: [String],
    required: [true, 'At least one amenity is required'],
    validate: {
      validator: function(amenities) {
        return amenities.length > 0;
      },
      message: 'At least one amenity must be specified'
    }
  },
  pricePerHour: {
    type: Number,
    required: [true, 'Price per hour is required'],
    min: [1, 'Price per hour must be at least $1'],
    max: [500, 'Price per hour cannot exceed $500']
  },
  images: {
    type: [String],
    validate: {
      validator: function(images) {
        return images.length > 0 && images.length <= 10;
      },
      message: 'Must have between 1 and 10 images'
    }
  },
  operatingHours: {
    start: {
      type: String,
      required: [true, 'Opening time is required'],
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Opening time must be in HH:MM format']
    },
    end: {
      type: String,
      required: [true, 'Closing time is required'],
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Closing time must be in HH:MM format']
    }
  },
  capacity: {
    type: Number,
    required: [true, 'Capacity is required'],
    min: [1, 'Capacity must be at least 1'],
    max: [100, 'Capacity cannot exceed 100 people']
  },
  rating: {
    type: Number,
    default: 0,
    min: [0, 'Rating must be between 0 and 5'],
    max: [5, 'Rating must be between 0 and 5']
  },
  totalReviews: {
    type: Number,
    default: 0,
    min: [0, 'Total reviews cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // Additional gaming-specific fields
  gameTypes: {
    type: [String],
    enum: {
      values: [
        'PC Gaming',
        'Console Gaming',
        'VR Gaming',
        'Mobile Gaming',
        'Arcade Games',
        'Board Games',
        'Card Games',
        'Racing Simulators',
        'Flight Simulators',
        'Retro Gaming'
      ],
      message: 'Invalid game type'
    },
    default: ['PC Gaming']
  },
  equipment: {
    pcs: {
      type: Number,
      default: 0,
      min: [0, 'PC count cannot be negative']
    },
    consoles: {
      type: Number,
      default: 0,
      min: [0, 'Console count cannot be negative']
    },
    vrHeadsets: {
      type: Number,
      default: 0,
      min: [0, 'VR headset count cannot be negative']
    },
    arcadeMachines: {
      type: Number,
      default: 0,
      min: [0, 'Arcade machine count cannot be negative']
    }
  },
  // Booking settings
  minBookingDuration: {
    type: Number,
    default: 1,
    min: [1, 'Minimum booking duration must be at least 1 hour'],
    max: [8, 'Minimum booking duration cannot exceed 8 hours']
  },
  maxBookingDuration: {
    type: Number,
    default: 8,
    min: [1, 'Maximum booking duration must be at least 1 hour'],
    max: [24, 'Maximum booking duration cannot exceed 24 hours']
  },
  advanceBookingDays: {
    type: Number,
    default: 30,
    min: [1, 'Advance booking days must be at least 1'],
    max: [365, 'Advance booking days cannot exceed 365']
  },
  // Pricing tiers (for peak hours, weekends, etc.)
  pricingTiers: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    multiplier: {
      type: Number,
      required: true,
      min: [0.5, 'Price multiplier must be at least 0.5'],
      max: [3.0, 'Price multiplier cannot exceed 3.0']
    },
    conditions: {
      days: [String], // ['monday', 'tuesday', etc.]
      startTime: String,
      endTime: String,
      holidays: Boolean
    }
  }],
  // Contact information
  contactInfo: {
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format']
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format']
    },
    website: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+/, 'Website must start with http:// or https://']
    }
  },
  // Social media
  socialMedia: {
    facebook: String,
    twitter: String,
    instagram: String,
    discord: String,
    youtube: String
  },
  // Policies
  policies: {
    cancellationPolicy: {
      type: String,
      maxlength: [500, 'Cancellation policy cannot exceed 500 characters']
    },
    houseRules: {
      type: [String],
      validate: {
        validator: function(rules) {
          return rules.length <= 20;
        },
        message: 'Cannot have more than 20 house rules'
      }
    },
    ageRestriction: {
      type: Number,
      min: [0, 'Age restriction cannot be negative'],
      max: [21, 'Age restriction cannot exceed 21']
    }
  },
  // Statistics
  stats: {
    totalBookings: {
      type: Number,
      default: 0
    },
    completedBookings: {
      type: Number,
      default: 0
    },
    cancelledBookings: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    averageSessionDuration: {
      type: Number,
      default: 0
    }
  },
  // Featured status
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },
  featuredUntil: {
    type: Date,
    default: null
  },
  // Verification status
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  verifiedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Create geospatial index for location-based queries
gameZoneSchema.index({ 'location.coordinates': '2dsphere' });

// Create compound indexes for better query performance
gameZoneSchema.index({ isActive: 1, rating: -1 });
gameZoneSchema.index({ isActive: 1, pricePerHour: 1 });
gameZoneSchema.index({ isActive: 1, 'location.city': 1 });
gameZoneSchema.index({ vendorId: 1, isActive: 1 });
gameZoneSchema.index({ gameTypes: 1, isActive: 1 });

// Text search index
gameZoneSchema.index({
  name: 'text',
  description: 'text',
  'location.address': 'text',
  'location.city': 'text',
  amenities: 'text'
});

// Validation for operating hours
gameZoneSchema.pre('save', function(next) {
  const start = parseInt(this.operatingHours.start.split(':')[0]);
  const end = parseInt(this.operatingHours.end.split(':')[0]);
  
  if (start >= end) {
    next(new Error('Closing time must be after opening time'));
  } else if (end - start < 2) {
    next(new Error('Zone must be open for at least 2 hours'));
  } else {
    next();
  }
});

// Validation for max booking duration
gameZoneSchema.pre('save', function(next) {
  if (this.maxBookingDuration < this.minBookingDuration) {
    next(new Error('Maximum booking duration must be greater than minimum booking duration'));
  } else {
    next();
  }
});

// Method to check if zone is currently open
gameZoneSchema.methods.isCurrentlyOpen = function() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  const [startHour, startMinute] = this.operatingHours.start.split(':').map(Number);
  const [endHour, endMinute] = this.operatingHours.end.split(':').map(Number);
  
  const startTime = startHour * 60 + startMinute;
  const endTime = endHour * 60 + endMinute;
  
  return currentTime >= startTime && currentTime <= endTime;
};

// Method to get available time slots for a date
gameZoneSchema.methods.getAvailableTimeSlots = async function(date) {
  const Booking = mongoose.model('Booking');
  
  // Get existing bookings for this date
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const existingBookings = await Booking.find({
    zoneId: this._id,
    date: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    status: { $in: ['pending', 'confirmed'] }
  });
  
  // Generate available slots
  const [startHour] = this.operatingHours.start.split(':').map(Number);
  const [endHour] = this.operatingHours.end.split(':').map(Number);
  
  const availableSlots = [];
  
  for (let hour = startHour; hour < endHour; hour++) {
    const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
    
    // Check if this slot is available
    const isBooked = existingBookings.some(booking => {
      const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
      const bookingEndHour = bookingHour + booking.duration;
      return hour >= bookingHour && hour < bookingEndHour;
    });
    
    if (!isBooked) {
      availableSlots.push(timeSlot);
    }
  }
  
  return availableSlots;
};

// Method to calculate price for a booking
gameZoneSchema.methods.calculatePrice = function(duration, date, timeSlot) {
  let basePrice = this.pricePerHour * duration;
  
  // Apply pricing tiers if any
  if (this.pricingTiers && this.pricingTiers.length > 0) {
    const bookingDate = new Date(date);
    const dayOfWeek = bookingDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    for (const tier of this.pricingTiers) {
      let applies = false;
      
      // Check day conditions
      if (tier.conditions.days && tier.conditions.days.length > 0) {
        applies = tier.conditions.days.includes(dayOfWeek);
      }
      
      // Check time conditions
      if (tier.conditions.startTime && tier.conditions.endTime) {
        const bookingHour = parseInt(timeSlot.split(':')[0]);
        const tierStartHour = parseInt(tier.conditions.startTime.split(':')[0]);
        const tierEndHour = parseInt(tier.conditions.endTime.split(':')[0]);
        
        applies = applies && (bookingHour >= tierStartHour && bookingHour < tierEndHour);
      }
      
      if (applies) {
        basePrice *= tier.multiplier;
        break; // Apply only the first matching tier
      }
    }
  }
  
  return Math.round(basePrice * 100) / 100; // Round to 2 decimal places
};

// Method to update rating
gameZoneSchema.methods.updateRating = function(newRating) {
  const totalRating = this.rating * this.totalReviews;
  this.totalReviews += 1;
  this.rating = (totalRating + newRating) / this.totalReviews;
  return this.save();
};

// Method to increment booking stats
gameZoneSchema.methods.incrementBookingStats = function(status, amount) {
  this.stats.totalBookings += 1;
  
  if (status === 'completed') {
    this.stats.completedBookings += 1;
    this.stats.totalRevenue += amount;
  } else if (status === 'cancelled') {
    this.stats.cancelledBookings += 1;
  }
  
  return this.save();
};

// Static method to find zones near a location
gameZoneSchema.statics.findNearby = function(longitude, latitude, maxDistance = 50000) {
  return this.find({
    isActive: true,
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    }
  });
};

// Static method to search zones
gameZoneSchema.statics.searchZones = function(query, filters = {}) {
  const searchQuery = {
    isActive: true,
    ...filters
  };
  
  if (query) {
    searchQuery.$text = { $search: query };
  }
  
  return this.find(searchQuery);
};

// Virtual for average rating display
gameZoneSchema.virtual('averageRating').get(function() {
  return Math.round(this.rating * 10) / 10;
});

// Virtual for total operating hours
gameZoneSchema.virtual('totalOperatingHours').get(function() {
  const [startHour] = this.operatingHours.start.split(':').map(Number);
  const [endHour] = this.operatingHours.end.split(':').map(Number);
  return endHour - startHour;
});

// Virtual for formatted address
gameZoneSchema.virtual('formattedAddress').get(function() {
  return `${this.location.address}, ${this.location.city}, ${this.location.state} ${this.location.zipCode}`;
});

// Virtual for primary image
gameZoneSchema.virtual('primaryImage').get(function() {
  return this.images && this.images.length > 0 ? this.images[0] : null;
});

// Transform output
gameZoneSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

gameZoneSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('GameZone', gameZoneSchema);