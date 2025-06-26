const mongoose = require('mongoose');

const gameZoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Game zone name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  location: {
    address: {
      type: String,
      required: [true, 'Address is required']
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
          validator: function(v) {
            return v.length === 2 && 
                   v[1] >= -90 && v[1] <= 90 &&  // latitude
                   v[0] >= -180 && v[0] <= 180;  // longitude
          },
          message: 'Coordinates must be [longitude, latitude] with valid ranges'
        }
      }
    }
  },
  amenities: [{
    type: String,
    trim: true
  }],
  pricePerHour: {
    type: Number,
    required: [true, 'Price per hour is required'],
    min: [0, 'Price cannot be negative']
  },
  images: [{
    type: String,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/i.test(v);
      },
      message: 'Please provide a valid image URL'
    }
  }],
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Vendor ID is required']
  },
  operatingHours: {
    start: {
      type: String,
      required: [true, 'Opening time is required'],
      match: [/^([0-1]?[0-9]|2[0-4]):[0-5][0-9]$/, 'Please provide time in HH:MM format']
    },
    end: {
      type: String,
      required: [true, 'Closing time is required'],
      match: [/^([0-1]?[0-9]|2[0-4]):[0-5][0-9]$/, 'Please provide time in HH:MM format']
    }
  },
  rating: {
    type: Number,
    default: 4.0,
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5']
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  capacity: {
    type: Number,
    default: 20,
    min: [1, 'Capacity must be at least 1']
  }
}, {
  timestamps: true
});

// Index for geospatial queries (GeoJSON format)
gameZoneSchema.index({ "location.coordinates": "2dsphere" });

// Index for text search
gameZoneSchema.index({ 
  name: 'text', 
  description: 'text',
  'location.address': 'text' 
});

// Virtual for distance (set by geospatial queries)
gameZoneSchema.virtual('distance').get(function() {
  return this._distance;
});

// Ensure virtual fields are serialized
gameZoneSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('GameZone', gameZoneSchema);