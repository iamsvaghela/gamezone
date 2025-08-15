const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  pushToken: {
    type: String,
    default: null
  },
  pushNotificationSettings: {
    enabled: {
      type: Boolean,
      default: true
    },
    email: {
      type: Boolean,
      default: true
    }
  },
  password: {
    type: String,
    required: function() {
      // Password is not required if user has Google account linked
      return !this.socialMedia?.google?.id;
    },
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    enum: ['user', 'vendor'],
    default: 'user'
  },
  phone: {
    type: String,
    trim: true
  },
  profileImage: {
    type: String,
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Social media integration
  socialMedia: {
    google: {
      id: String,
      email: String
    },
    facebook: {
      id: String,
      email: String
    },
    apple: {
      id: String,
      email: String
    }
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});



const userSchemaAdditions = {
  // FCM tokens for push notifications
  fcmTokens: [{
    token: { type: String, required: true, index: true },
    device: { type: String, required: true },
    platform: { type: String, enum: ['web', 'android', 'ios'], required: true },
    userAgent: String,
    isActive: { type: Boolean, default: true },
    lastUsed: { type: Date, default: Date.now }
  }],
  
  // Push notification preferences
  pushNotificationSettings: {
    enabled: { type: Boolean, default: true },
    bookings: { type: Boolean, default: true },
    payments: { type: Boolean, default: true },
    system: { type: Boolean, default: true },
    promotions: { type: Boolean, default: false }
  }
};



userSchema.methods.addFCMToken = async function(tokenData) {
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== tokenData.token);
  this.fcmTokens.push({
    token: tokenData.token,
    device: tokenData.device || 'Unknown',
    platform: tokenData.platform || 'web',
    userAgent: tokenData.userAgent,
    lastUsed: new Date()
  });
  if (this.fcmTokens.length > 5) this.fcmTokens = this.fcmTokens.slice(-5);
  return this.save();
};


userSchema.methods.removeFCMToken = async function(token) {
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
  return this.save();
};

userSchema.methods.getActiveFCMTokens = function() {
  return this.fcmTokens.filter(t => t.isActive).map(t => t.token);
};

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash if password is modified and exists
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    if (!this.password) {
      throw new Error('No password set for this user');
    }
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

// Convert to JSON and remove sensitive data
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

// Create indexes for better performance
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ 'socialMedia.google.id': 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

module.exports = mongoose.model('User', userSchema);