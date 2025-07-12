const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign(
    { userId }, 
    process.env.JWT_SECRET || 'your-secret-key', 
    { expiresIn: '7d' }
  );
};


router.post('/update-push-token', auth, async (req, res) => {
  try {
    console.log('📱 Updating push token for user:', req.user.userId);
    
    const { pushToken } = req.body;
    
    if (!pushToken) {
      return res.status(400).json({
        success: false,
        error: 'Push token is required'
      });
    }
    
    const User = require('../models/User');
    
    // Update user's push token
    await User.findByIdAndUpdate(req.user.userId, {
      pushToken,
      pushNotificationSettings: {
        enabled: true,
        email: true
      }
    });
    
    console.log('✅ Push token updated successfully');
    
    res.json({
      success: true,
      message: 'Push token updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error updating push token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update push token',
      message: error.message
    });
  }
});


// POST /api/auth/update-push-token
router.post('/update-push-token', auth, async (req, res) => {
  try {
    const { pushToken } = req.body;
    const userId = req.user.userId;

    await User.findByIdAndUpdate(userId, { pushToken });

    res.json({
      success: true,
      message: 'Push token updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update push token'
    });
  }
});

// Helper function to generate random password for Google users
function generateRandomPassword() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'user', phone } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Name, email, and password are required' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'User with this email already exists' 
      });
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
      role,
      phone
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profileImage: user.profileImage,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        error: 'Email already exists' 
      });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false,
        error: 'Validation failed', 
        details: errors 
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Server error during registration' 
    });
  }
});

// POST /api/auth/login - Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required' 
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({ 
        success: false,
        error: 'Account is deactivated. Please contact support.' 
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profileImage: user.profileImage,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error during login' 
    });
  }
});

// POST /api/auth/google - Google OAuth login/registration
router.post('/google', async (req, res) => {
  try {
    console.log('📱 Google auth attempt:', { ...req.body, googleId: '[HIDDEN]' });

    const { googleId, email, name, profileImage, role = 'user', isVerified = true } = req.body;

    // Validate required fields
    if (!googleId || !email || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required Google user information'
      });
    }

    // Check if user exists by email first
    let existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    let isNewUser = false;

    if (existingUser) {
      // User exists - check if Google account is already linked
      if (existingUser.socialMedia?.google?.id && existingUser.socialMedia.google.id !== googleId) {
        return res.status(409).json({
          success: false,
          error: 'This email is already registered with a different Google account'
        });
      }

      // Link Google account if not already linked
      if (!existingUser.socialMedia?.google?.id) {
        existingUser.socialMedia = {
          ...existingUser.socialMedia,
          google: {
            id: googleId,
            email: email
          }
        };
      }

      // Update user info from Google (in case it changed)
      existingUser.name = name;
      existingUser.isVerified = isVerified;
      
      if (profileImage && !existingUser.profileImage) {
        existingUser.profileImage = profileImage;
      }

      await existingUser.updateLastLogin();
      await existingUser.save();
      console.log('✅ Existing user logged in with Google:', existingUser.email);

    } else {
      // Create new user with Google account
      isNewUser = true;
      
      existingUser = new User({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: generateRandomPassword(), // Generate a random password for Google users
        role: role,
        isVerified: isVerified,
        profileImage: profileImage,
        socialMedia: {
          google: {
            id: googleId,
            email: email
          }
        },
        lastLogin: new Date()
      });

      await existingUser.save();
      console.log('✅ New user created with Google:', existingUser.email);
    }

    // Generate JWT token
    const token = generateToken(existingUser._id);

    res.status(200).json({
      success: true,
      message: isNewUser ? 'Account created successfully with Google' : 'Google login successful',
      token,
      user: {
        id: existingUser._id,
        name: existingUser.name,
        email: existingUser.email,
        role: existingUser.role,
        phone: existingUser.phone,
        profileImage: existingUser.profileImage,
        isVerified: existingUser.isVerified
      },
      isNewUser
    });

  } catch (error) {
    console.error('❌ Google auth error:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid user data',
        details: Object.values(error.errors).map(e => e.message)
      });
    }

    res.status(500).json({
      success: false,
      error: 'Google authentication failed. Please try again.'
    });
  }
});

// GET /api/auth/profile - Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profileImage: user.profileImage,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching profile' 
    });
  }
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (phone) updates.phone = phone;

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updates,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profileImage: user.profileImage,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false,
        error: 'Validation failed', 
        details: errors 
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Server error updating profile' 
    });
  }
});

// POST /api/auth/change-password - Change password
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        error: 'Current password and new password are required' 
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Check if user has a password (Google users might not have one initially)
    if (!user.password) {
      return res.status(400).json({
        success: false,
        error: 'No password is set for this account. Please contact support.'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        success: false,
        error: 'Current password is incorrect' 
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false,
        error: 'Validation failed', 
        details: errors 
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Server error changing password' 
    });
  }
});

// POST /api/auth/logout - Logout user
router.post('/logout', auth, async (req, res) => {
  try {
    // In a simple JWT implementation, logout is handled client-side
    // You could implement token blacklisting here if needed
    
    console.log('👋 User logged out:', req.user.userId);
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

module.exports = router;