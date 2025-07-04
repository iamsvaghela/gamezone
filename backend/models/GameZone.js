// models/GameZone.js - Safe GameZone Model with Null Checks
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
            return coords && coords.length === 2 && 
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
        return amenities && amenities.length > 0;
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
        return images && images.length > 0 && images.length <= 10;
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
          return !rules || rules.length <= 20;
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

// SAFE Pre-save validation for operating hours with null checks
gameZoneSchema.pre('save', function(next) {
  try {
    // Check if operatingHours exists and has required fields
    if (!this.operatingHours || !this.operatingHours.start || !this.operatingHours.end) {
      return next(new Error('Operating hours are required'));
    }
    
    // Safely split and validate time format
    const startParts = this.operatingHours.start.split(':');
    const endParts = this.operatingHours.end.split(':');
    
    if (startParts.length !== 2 || endParts.length !== 2) {
      return next(new Error('Invalid time format. Use HH:MM format'));
    }
    
    const startHour = parseInt(startParts[0], 10);
    const endHour = parseInt(endParts[0], 10);
    
    if (isNaN(startHour) || isNaN(endHour)) {
      return next(new Error('Invalid hour values in operating hours'));
    }
    
    if (startHour >= endHour) {
      return next(new Error('Closing time must be after opening time'));
    }
    
    if (endHour - startHour < 2) {
      return next(new Error('Zone must be open for at least 2 hours'));
    }
    
    next();
  } catch (error) {
    next(new Error(`Operating hours validation error: ${error.message}`));
  }
});

// SAFE Pre-save validation for booking duration with null checks
gameZoneSchema.pre('save', function(next) {
  try {
    // Check if booking duration fields exist
    if (this.maxBookingDuration && this.minBookingDuration) {
      if (this.maxBookingDuration < this.minBookingDuration) {
        return next(new Error('Maximum booking duration must be greater than minimum booking duration'));
      }
    }
    next();
  } catch (error) {
    next(new Error(`Booking duration validation error: ${error.message}`));
  }
});

// SAFE Method to check if zone is currently open
gameZoneSchema.methods.isCurrentlyOpen = function() {
  try {
    // Check if operating hours exist
    if (!this.operatingHours || !this.operatingHours.start || !this.operatingHours.end) {
      return false;
    }
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    
    // Safely parse start and end times
    const startParts = this.operatingHours.start.split(':');
    const endParts = this.operatingHours.end.split(':');
    
    if (startParts.length !== 2 || endParts.length !== 2) {
      return false;
    }
    
    const startHour = parseInt(startParts[0], 10);
    const startMinute = parseInt(startParts[1], 10);
    const endHour = parseInt(endParts[0], 10);
    const endMinute = parseInt(endParts[1], 10);
    
    if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
      return false;
    }
    
    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;
    
    return currentTime >= startTime && currentTime <= endTime;
  } catch (error) {
    console.error('Error checking if zone is open:', error);
    return false;
  }
};

// SAFE Method to get available time slots for a date
gameZoneSchema.methods.getAvailableTimeSlots = async function(date) {
  try {
    // Check if operating hours exist
    if (!this.operatingHours || !this.operatingHours.start || !this.operatingHours.end) {
      return [];
    }
    
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
    
    // Safely parse operating hours
    const startParts = this.operatingHours.start.split(':');
    const endParts = this.operatingHours.end.split(':');
    
    if (startParts.length !== 2 || endParts.length !== 2) {
      return [];
    }
    
    const startHour = parseInt(startParts[0], 10);
    const endHour = parseInt(endParts[0], 10);
    
    if (isNaN(startHour) || isNaN(endHour)) {
      return [];
    }
    
    const availableSlots = [];
    
    for (let hour = startHour; hour < endHour; hour++) {
      const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
      
      // Check if this slot is available
      const isBooked = existingBookings.some(booking => {
        try {
          if (!booking.timeSlot) return false;
          
          const bookingTimeParts = booking.timeSlot.split(':');
          if (bookingTimeParts.length !== 2) return false;
          
          const bookingHour = parseInt(bookingTimeParts[0], 10);
          if (isNaN(bookingHour)) return false;
          
          const bookingEndHour = bookingHour + (booking.duration || 1);
          return hour >= bookingHour && hour < bookingEndHour;
        } catch (error) {
          console.error('Error checking booking slot:', error);
          return false;
        }
      });
      
      if (!isBooked) {
        availableSlots.push(timeSlot);
      }
    }
    
    return availableSlots;
  } catch (error) {
    console.error('Error getting available time slots:', error);
    return [];
  }
};

// SAFE Method to calculate price for a booking
gameZoneSchema.methods.calculatePrice = function(duration, date, timeSlot) {
  try {
    if (!duration || !this.pricePerHour) {
      return 0;
    }
    
    let basePrice = this.pricePerHour * duration;
    
    // Apply pricing tiers if any
    if (this.pricingTiers && Array.isArray(this.pricingTiers) && this.pricingTiers.length > 0) {
      const bookingDate = new Date(date);
      const dayOfWeek = bookingDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      
      for (const tier of this.pricingTiers) {
        if (!tier || !tier.conditions) continue;
        
        let applies = false;
        
        // Check day conditions
        if (tier.conditions.days && Array.isArray(tier.conditions.days) && tier.conditions.days.length > 0) {
          applies = tier.conditions.days.includes(dayOfWeek);
        }
        
        // Check time conditions
        if (tier.conditions.startTime && tier.conditions.endTime && timeSlot) {
          try {
            const timeSlotParts = timeSlot.split(':');
            const tierStartParts = tier.conditions.startTime.split(':');
            const tierEndParts = tier.conditions.endTime.split(':');
            
            if (timeSlotParts.length === 2 && tierStartParts.length === 2 && tierEndParts.length === 2) {
              const bookingHour = parseInt(timeSlotParts[0], 10);
              const tierStartHour = parseInt(tierStartParts[0], 10);
              const tierEndHour = parseInt(tierEndParts[0], 10);
              
              if (!isNaN(bookingHour) && !isNaN(tierStartHour) && !isNaN(tierEndHour)) {
                applies = applies && (bookingHour >= tierStartHour && bookingHour < tierEndHour);
              }
            }
          } catch (error) {
            console.error('Error parsing time conditions:', error);
          }
        }
        
        if (applies && tier.multiplier) {
          basePrice *= tier.multiplier;
          break; // Apply only the first matching tier
        }
      }
    }
    
    return Math.round(basePrice * 100) / 100; // Round to 2 decimal places
  } catch (error) {
    console.error('Error calculating price:', error);
    return this.pricePerHour * (duration || 1);
  }
};

// SAFE Method to update rating
gameZoneSchema.methods.updateRating = function(newRating) {
  try {
    if (!newRating || isNaN(newRating)) {
      return Promise.reject(new Error('Invalid rating value'));
    }
    
    const currentRating = this.rating || 0;
    const currentReviews = this.totalReviews || 0;
    
    const totalRating = currentRating * currentReviews;
    this.totalReviews = currentReviews + 1;
    this.rating = (totalRating + newRating) / this.totalReviews;
    
    return this.save();
  } catch (error) {
    console.error('Error updating rating:', error);
    return Promise.reject(error);
  }
};

// SAFE Method to increment booking stats
gameZoneSchema.methods.incrementBookingStats = function(status, amount) {
  try {
    if (!this.stats) {
      this.stats = {
        totalBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        totalRevenue: 0,
        averageSessionDuration: 0
      };
    }
    
    this.stats.totalBookings = (this.stats.totalBookings || 0) + 1;
    
    if (status === 'completed') {
      this.stats.completedBookings = (this.stats.completedBookings || 0) + 1;
      if (amount && !isNaN(amount)) {
        this.stats.totalRevenue = (this.stats.totalRevenue || 0) + amount;
      }
    } else if (status === 'cancelled') {
      this.stats.cancelledBookings = (this.stats.cancelledBookings || 0) + 1;
    }
    
    return this.save();
  } catch (error) {
    console.error('Error incrementing booking stats:', error);
    return Promise.reject(error);
  }
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

// SAFE Virtual for average rating display
gameZoneSchema.virtual('averageRating').get(function() {
  try {
    const rating = this.rating || 0;
    return Math.round(rating * 10) / 10;
  } catch (error) {
    return 0;
  }
});

// SAFE Virtual for total operating hours
gameZoneSchema.virtual('totalOperatingHours').get(function() {
  try {
    if (!this.operatingHours || !this.operatingHours.start || !this.operatingHours.end) {
      return 0;
    }
    
    const startParts = this.operatingHours.start.split(':');
    const endParts = this.operatingHours.end.split(':');
    
    if (startParts.length !== 2 || endParts.length !== 2) {
      return 0;
    }
    
    const startHour = parseInt(startParts[0], 10);
    const endHour = parseInt(endParts[0], 10);
    
    if (isNaN(startHour) || isNaN(endHour)) {
      return 0;
    }
    
    return Math.max(0, endHour - startHour);
  } catch (error) {
    console.error('Error calculating total operating hours:', error);
    return 0;
  }
});

// SAFE Virtual for formatted address
gameZoneSchema.virtual('formattedAddress').get(function() {
  try {
    if (!this.location) {
      return 'Address not available';
    }
    
    const { address, city, state, zipCode } = this.location;
    const parts = [address, city, state, zipCode].filter(part => part && part.trim());
    
    return parts.length > 0 ? parts.join(', ') : 'Address not available';
  } catch (error) {
    console.error('Error formatting address:', error);
    return 'Address not available';
  }
});

// SAFE Virtual for primary image
gameZoneSchema.virtual('primaryImage').get(function() {
  try {
    return (this.images && Array.isArray(this.images) && this.images.length > 0) 
      ? this.images[0] 
      : null;
  } catch (error) {
    console.error('Error getting primary image:', error);
    return null;
  }
});

// Transform output
gameZoneSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    try {
      delete ret.__v;
      return ret;
    } catch (error) {
      console.error('Error transforming JSON:', error);
      return ret;
    }
  }
});

gameZoneSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('GameZone', gameZoneSchema);