// routes/bookings.js - Complete booking routes with user bookings endpoint
const express = require('express');
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const { auth, userOnly } = require('../middleware/auth');
const mongoose = require('mongoose');
const router = express.Router();


// Helper function to convert time string to minutes
const timeToMinutes = (timeString) => {
  if (!timeString || typeof timeString !== 'string') {
    throw new Error('Invalid time format');
  }
  
  const [hours, minutes] = timeString.split(':').map(Number);
  
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Invalid time format');
  }
  
  return hours * 60 + minutes;
};

// Helper function to convert minutes to time string
const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Helper function to safely parse QR code
const parseQRCode = (qrCodeString) => {
  if (!qrCodeString || typeof qrCodeString !== 'string') {
    return null;
  }
  
  try {
    return JSON.parse(qrCodeString);
  } catch (error) {
    console.warn('Failed to parse QR code:', error);
    return null;
  }
};

// Enhanced operating hours validation
const validateOperatingHours = (zone, timeSlot, duration) => {
  try {
    console.log('🔍 Validating operating hours:', {
      zoneHours: zone.operatingHours,
      timeSlot,
      duration
    });
    
    // Parse operating hours
    const startMinutes = timeToMinutes(zone.operatingHours.start);
    const endMinutes = timeToMinutes(zone.operatingHours.end);
    
    // Parse booking time
    const bookingStartMinutes = timeToMinutes(timeSlot);
    const bookingEndMinutes = bookingStartMinutes + (duration * 60);
    
    console.log('🕐 Time validation:', {
      zoneStart: `${zone.operatingHours.start} (${startMinutes} min)`,
      zoneEnd: `${zone.operatingHours.end} (${endMinutes} min)`,
      bookingStart: `${timeSlot} (${bookingStartMinutes} min)`,
      bookingEnd: `${minutesToTime(bookingEndMinutes)} (${bookingEndMinutes} min)`
    });
    
    // Handle midnight crossing (e.g., 22:00 - 02:00)
    if (endMinutes < startMinutes) {
      // Zone operates across midnight
      const isValid = (bookingStartMinutes >= startMinutes || bookingStartMinutes < endMinutes) &&
                     (bookingEndMinutes <= (endMinutes + 24 * 60) || bookingEndMinutes <= endMinutes);
      
      if (!isValid) {
        throw new Error(`Booking time must be within operating hours: ${zone.operatingHours.start} - ${zone.operatingHours.end} (crosses midnight)`);
      }
    } else {
      // Normal operating hours (same day)
      if (bookingStartMinutes < startMinutes || bookingEndMinutes > endMinutes) {
        throw new Error(`Booking time must be within operating hours: ${zone.operatingHours.start} - ${zone.operatingHours.end}`);
      }
    }
    
    console.log('✅ Operating hours validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ Operating hours validation failed:', error.message);
    throw error;
  }
};


router.get('/test/notification-model', auth, async (req, res) => {
  console.log('🧪 Testing Notification model...');
  
  try {
    // Test 1: Check if model is loaded
    const Notification = require('../models/Notification');
    console.log('✅ Notification model imported');
    
    // Test 2: Check model properties
    const modelInfo = {
      modelName: Notification.modelName,
      collectionName: Notification.collection ? Notification.collection.name : 'N/A',
      isMongooseModel: Notification.prototype instanceof mongoose.Model,
      schemaFields: Object.keys(Notification.schema ? Notification.schema.paths : {})
    };
    console.log('📋 Model info:', modelInfo);
    
    // Test 3: Try to create a test notification
    console.log('🧪 Creating test notification...');
    const testNotification = new Notification({
      userId: req.user.userId,
      type: 'system_announcement',
      title: 'Model Test',
      message: 'Testing if Notification model works',
      priority: 'low',
      category: 'system'
    });
    
    console.log('💾 Saving test notification...');
    await testNotification.save();
    console.log('✅ Test notification saved:', testNotification._id);
    
    // Test 4: Query it back
    const found = await Notification.findById(testNotification._id);
    console.log('🔍 Query result:', found ? 'Found' : 'Not found');
    
    // Test 5: Count documents
    const count = await Notification.countDocuments();
    console.log('📊 Total notifications:', count);
    
    // Clean up
    await Notification.deleteOne({ _id: testNotification._id });
    console.log('🧹 Test notification cleaned up');
    
    res.json({
      success: true,
      message: 'Notification model is working correctly',
      modelInfo,
      testResults: {
        created: true,
        saved: true,
        queried: !!found,
        totalCount: count
      }
    });
    
  } catch (error) {
    console.error('❌ Notification model test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Notification model test failed',
      message: error.message,
      stack: error.stack,
      type: error.constructor.name
    });
  }
});

// POST /api/bookings/test/create-notification - Create a test notification
router.post('/test/create-notification', auth, async (req, res) => {
  console.log('🧪 POST /test/create-notification');
  
  try {
    const Notification = require('../models/Notification');
    
    // Create notification with minimal required fields
    const notificationData = {
      userId: req.user.userId,
      type: 'booking_created',
      title: req.body.title || 'Test Booking Notification',
      message: req.body.message || 'This is a test notification',
      priority: 'medium',
      category: 'booking'
    };
    
    console.log('📝 Creating notification with data:', notificationData);
    
    const notification = new Notification(notificationData);
    console.log('✅ Notification instance created');
    
    await notification.save();
    console.log('✅ Notification saved to DB:', notification._id);
    
    // Verify it exists
    const exists = await Notification.exists({ _id: notification._id });
    console.log('🔍 Verification:', exists ? 'EXISTS' : 'NOT FOUND');
    
    res.json({
      success: true,
      message: 'Test notification created successfully',
      notification: {
        id: notification._id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt
      },
      verified: exists
    });
    
  } catch (error) {
    console.error('❌ Failed to create test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test notification',
      message: error.message,
      details: error
    });
  }
});
// GET /api/bookings - Get user bookings (MISSING ROUTE - ADDED)
router.get('/', auth, userOnly, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status, page = 1, limit = 10 } = req.query;
    
    console.log('📅 Fetching bookings for user:', userId);
    console.log('📋 Query params:', { status, page, limit });
    
    // Build query
    const query = { userId: new mongoose.Types.ObjectId(userId) };
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Fetch bookings with populated zone data
    const bookings = await Booking.find(query)
      .populate({
        path: 'zoneId',
        select: 'name location images pricePerHour rating totalReviews',
        options: { 
          strictPopulate: false,
          lean: false 
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Get total count for pagination
    const totalCount = await Booking.countDocuments(query);
    
    console.log(`✅ Found ${bookings.length} bookings for user ${userId}`);
    
    // Format bookings and handle cases where zone might be null
    const formattedBookings = bookings.map(booking => {
      // Handle case where zone was deleted
      if (!booking.zoneId || typeof booking.zoneId !== 'object') {
        return {
          ...booking,
          zoneId: {
            _id: booking.zoneId || 'unknown',
            name: 'Gaming Zone (Unavailable)',
            location: {
              address: 'Address not available',
              city: 'Unknown',
              state: 'Unknown'
            },
            images: [],
            pricePerHour: 0,
            rating: 0,
            totalReviews: 0
          }
        };
      }
      
      // Ensure all required fields exist
      const zone = booking.zoneId;
      return {
        ...booking,
        zoneId: {
          _id: zone._id,
          name: zone.name || 'Unknown Zone',
          location: {
            address: zone.location?.address || 'Address not available',
            city: zone.location?.city || 'Unknown',
            state: zone.location?.state || 'Unknown'
          },
          images: zone.images || [],
          pricePerHour: zone.pricePerHour || 0,
          rating: zone.rating || 0,
          totalReviews: zone.totalReviews || 0
        },
        // Parse QR code safely
        qrCode: parseQRCode(booking.qrCode)
      };
    });
    
    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;
    
    res.json({
      success: true,
      bookings: formattedBookings,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: totalCount,
        hasNext,
        hasPrev,
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bookings',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /api/bookings/stats - Get booking statistics
router.get('/stats', auth, userOnly, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const stats = await Booking.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);
    
    const formattedStats = {
      total: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      pending: 0,
      totalSpent: 0
    };
    
    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
      formattedStats.total += stat.count;
      if (stat._id !== 'cancelled') {
        formattedStats.totalSpent += stat.totalAmount;
      }
    });
    
    res.json({
      success: true,
      stats: formattedStats
    });
    
  } catch (error) {
    console.error('❌ Error fetching booking stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch booking statistics',
      message: error.message
    });
  }
});

// GET /api/bookings/:id - Get single booking
router.get('/:id', auth, userOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    console.log('📋 Fetching booking:', id, 'for user:', userId);
    
    const booking = await Booking.findOne({ 
      _id: id, 
      userId: new mongoose.Types.ObjectId(userId) 
    })
      .populate({
        path: 'zoneId',
        select: 'name description location images pricePerHour rating totalReviews amenities operatingHours',
        populate: {
          path: 'vendorId',
          select: 'name email phone'
        }
      })
      .populate({
        path: 'userId',
        select: 'name email phone'
      });
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Check if booking can be cancelled
    const canBeCancelled = booking.status === 'confirmed' || booking.status === 'pending';
    const bookingDate = new Date(booking.date);
    const now = new Date();
    const hoursDiff = (bookingDate - now) / (1000 * 60 * 60);
    
    const formattedBooking = {
      ...booking.toObject(),
      qrCode: parseQRCode(booking.qrCode),
      canBeCancelled: canBeCancelled && hoursDiff > 24 // Can cancel if more than 24 hours away
    };
    
    res.json({
      success: true,
      booking: formattedBooking
    });
    
  } catch (error) {
    console.error('❌ Error fetching booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch booking',
      message: error.message
    });
  }
});

// POST /api/bookings - Create new booking (Enhanced with better time validation)
router.post('/', auth, userOnly, async (req, res) => {
  try {
    const { zoneId, date, timeSlot, duration, notes } = req.body;
    
    console.log('🔄 Creating booking:', { zoneId, date, timeSlot, duration, userId: req.user.userId });
    
    // Validate required fields
    if (!zoneId || !date || !timeSlot || !duration) {
      return res.status(400).json({ 
        success: false,
        error: 'Zone ID, date, time slot, and duration are required' 
      });
    }

    // Get zone details
    const zone = await GameZone.findById(zoneId);
    if (!zone) {
      return res.status(404).json({ 
        success: false,
        error: 'Gaming zone not found' 
      });
    }

    if (!zone.isActive) {
      return res.status(400).json({ 
        success: false,
        error: 'Gaming zone is not available for booking' 
      });
    }

    // Validate booking date (must be today or future)
    const bookingDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (bookingDate < today) {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot book for past dates' 
      });
    }

    // Validate time slot format
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeSlot)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid time slot format. Use HH:MM' 
      });
    }

    // Validate duration
    if (duration < 1 || duration > 12) {
      return res.status(400).json({ 
        success: false,
        error: 'Duration must be between 1 and 12 hours' 
      });
    }

    // Enhanced operating hours validation
    try {
      validateOperatingHours(zone, timeSlot, duration);
    } catch (validationError) {
      return res.status(400).json({ 
        success: false,
        error: validationError.message,
        operatingHours: zone.operatingHours,
        requestedTime: {
          start: timeSlot,
          end: minutesToTime(timeToMinutes(timeSlot) + (duration * 60)),
          duration: `${duration} hour${duration > 1 ? 's' : ''}`
        }
      });
    }

    // Enhanced conflict detection
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);

    const conflictingBookings = await Booking.find({
      zoneId: zoneId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: { $in: ['pending', 'confirmed'] }
    });

    // Check for time conflicts with detailed information
    const requestedStartMinutes = timeToMinutes(timeSlot);
    const requestedEndMinutes = requestedStartMinutes + (duration * 60);
    
    const conflictingBooking = conflictingBookings.find(booking => {
      const existingStartMinutes = timeToMinutes(booking.timeSlot);
      const existingEndMinutes = existingStartMinutes + (booking.duration * 60);
      
      // Check for overlap
      return (requestedStartMinutes < existingEndMinutes && requestedEndMinutes > existingStartMinutes);
    });

    if (conflictingBooking) {
      const existingStartMinutes = timeToMinutes(conflictingBooking.timeSlot);
      const existingEndMinutes = existingStartMinutes + (conflictingBooking.duration * 60);
      
      console.log('❌ Time slot conflict detected:', {
        requested: `${timeSlot} - ${minutesToTime(requestedEndMinutes)}`,
        existing: `${conflictingBooking.timeSlot} - ${minutesToTime(existingEndMinutes)}`,
        conflictingBookingId: conflictingBooking._id
      });
      
      return res.status(409).json({ 
        success: false,
        error: 'Time slot conflicts with existing booking',
        conflictDetails: {
          requestedSlot: `${timeSlot} - ${minutesToTime(requestedEndMinutes)}`,
          existingSlot: `${conflictingBooking.timeSlot} - ${minutesToTime(existingEndMinutes)}`,
          conflictingBookingId: conflictingBooking._id,
          conflictType: 'Time slot overlap'
        },
        suggestedAction: 'Please choose a different time slot',
        availabilityEndpoint: `/api/bookings/availability/${zoneId}/${date}`
      });
    }

    // Calculate total amount (use zone's calculation method if available)
    const totalAmount = zone.calculatePrice ? 
      zone.calculatePrice(duration, date, timeSlot) : 
      zone.pricePerHour * duration;

    // Generate reference number
    const reference = `GZ-${Math.random().toString(36).substr(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // Create booking
    const booking = new Booking({
      userId: req.user.userId,
      zoneId,
      date: bookingDate,
      timeSlot,
      duration,
      totalAmount,
      reference,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'card',
      notes,
      qrCode: JSON.stringify({
        bookingId: null, // Will be set after save
        reference,
        zoneId,
        zoneName: zone.name,
        date,
        timeSlot,
        duration
      })
    });

    await booking.save();
    
    // Update QR code with booking ID
    booking.qrCode = JSON.stringify({
      bookingId: booking._id,
      reference: booking.reference,
      zoneId,
      zoneName: zone.name,
      date,
      timeSlot,
      duration
    });
    
    await booking.save();
    
    // Update zone stats
    await GameZone.findByIdAndUpdate(zoneId, {
      $inc: { 
        'stats.totalBookings': 1,
        totalBookings: 1 // For backward compatibility
      },
      $set: { lastBookingAt: new Date() }
    });
    
    // Populate zone details for response
    await booking.populate('zoneId', 'name location images pricePerHour');

    console.log('📢 === STARTING FIXED NOTIFICATION CREATION ===');

    try {
      const Notification = require('../models/Notification');
      const User = require('../models/User');
      
      // Get user data
      const user = await User.findById(req.user.userId);
      if (!user) {
        console.error('❌ User not found for notifications');
        throw new Error('User not found');
      }
      
      console.log('✅ User data loaded:', user.name, user.email);
      
      // Get zone with vendor data
      const populatedZone = await GameZone.findById(zoneId).populate('vendorId');
      
      // 1. CREATE USER NOTIFICATION - Booking Created (Pending Confirmation)
      console.log('📢 Creating USER notification - Booking Created');
      
      const userNotificationData = {
        userId: req.user.userId,
        type: 'booking_created',
        title: '🎮 Booking Created - Awaiting Confirmation',
        message: `Your booking request for ${zone.name} on ${new Date(date).toLocaleDateString()} at ${timeSlot} has been submitted and is awaiting vendor confirmation.`,
        priority: 'medium',
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
          status: 'pending_confirmation',
          createdFrom: 'booking_creation',
          userType: 'customer'
        },
        actions: [
          {
            type: 'view', // FIXED: Changed from 'view_booking' to 'view'
            label: 'View Booking',
            endpoint: `/api/bookings/${booking._id}`,
            method: 'GET'
          },
          {
            type: 'cancel', // FIXED: Changed from 'cancel_booking' to 'cancel'
            label: 'Cancel Request',
            endpoint: `/api/bookings/${booking._id}/cancel`,
            method: 'PUT'
          }
        ]
      };
      
      const userNotification = new Notification(userNotificationData);
      await userNotification.save();
      console.log('✅ USER notification saved:', userNotification._id);
      
      // 2. CREATE VENDOR NOTIFICATION - Booking Request (Needs Action)
      if (populatedZone && populatedZone.vendorId && populatedZone.vendorId._id) {
        console.log('📢 Creating VENDOR notification - Booking Request');
        
        const vendorNotificationData = {
          userId: populatedZone.vendorId._id,
          type: 'booking_request',
          title: '📋 New Booking Request - Action Required',
          message: `${user.name} has requested to book "${zone.name}" on ${new Date(date).toLocaleDateString()} at ${timeSlot} for ${duration} hour${duration > 1 ? 's' : ''}. Please confirm or decline this booking.`,
          priority: 'high',
          category: 'booking',
          data: {
            bookingId: booking._id.toString(),
            reference: booking.reference,
            zoneId: booking.zoneId.toString(),
            zoneName: zone.name,
            customerName: user.name,
            customerEmail: user.email,
            customerPhone: user.phone || 'Not provided',
            date: booking.date.toISOString(),
            timeSlot: booking.timeSlot,
            duration: booking.duration,
            totalAmount: booking.totalAmount,
            status: 'pending_vendor_action',
            createdFrom: 'booking_creation',
            userType: 'vendor'
          },
          actions: [
            {
              type: 'confirm', // FIXED: Changed from 'confirm_booking' to 'confirm'
              label: 'Confirm Booking',
              endpoint: `/api/vendor/bookings/${booking._id}/confirm`,
              method: 'PUT'
            },
            {
              type: 'decline', // FIXED: Changed from 'decline_booking' to 'decline'
              label: 'Decline Booking',
              endpoint: `/api/vendor/bookings/${booking._id}/decline`,
              method: 'PUT'
            },
            {
              type: 'view', // FIXED: Changed from 'view_booking' to 'view'
              label: 'View Details',
              endpoint: `/api/vendor/bookings/${booking._id}`,
              method: 'GET'
            }
          ]
        };
        
        const vendorNotification = new Notification(vendorNotificationData);
        await vendorNotification.save();
        console.log('✅ VENDOR notification saved:', vendorNotification._id);
        
        // Verify both notifications
        const userCheck = await Notification.findById(userNotification._id);
        const vendorCheck = await Notification.findById(vendorNotification._id);
        
        console.log('🔍 Notification verification:');
        console.log('  - User notification:', userCheck ? 'FOUND' : 'NOT FOUND');
        console.log('  - Vendor notification:', vendorCheck ? 'FOUND' : 'NOT FOUND');
        
      } else {
        console.log('⚠️ No vendor found for this zone, skipping vendor notification');
      }
      
      // 3. UPDATE BOOKING STATUS TO PENDING (waiting for vendor confirmation)
      booking.status = 'pending';
      booking.paymentStatus = 'pending';
      await booking.save();
      console.log('✅ Booking status updated to pending');
      
      console.log('🎉 === FIXED NOTIFICATION CREATION COMPLETED ===');
      
    } catch (notificationError) {
      console.error('❌ === NOTIFICATION CREATION FAILED ===');
      console.error('❌ Error:', notificationError.message);
      console.error('❌ Stack:', notificationError.stack);
      
      // Don't fail the booking - just log the error
      console.log('⚠️ Booking completed but notifications failed');
    }


    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking: {
        id: booking._id,
        reference: booking.reference,
        zone: {
          id: booking.zoneId._id,
          name: booking.zoneId.name,
          location: booking.zoneId.location,
          image: booking.zoneId.images?.[0] || null
        },
        date: booking.date,
        timeSlot: booking.timeSlot,
        duration: booking.duration,
        totalAmount: booking.totalAmount,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        qrCode: booking.qrCode,
        createdAt: booking.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Error creating booking:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false,
        error: 'Validation failed', 
        details: errors 
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({ 
        success: false,
        error: 'This time slot is already booked' 
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Server error creating booking',
      message: error.message
    });
  }
});




router.post('/test/valid-action-types', auth, async (req, res) => {
  console.log('🧪 Testing valid action types...');
  
  try {
    const userId = req.user.userId;
    const Notification = require('../models/Notification');
    
    // Test the common action types that should work
    const validActionTypes = [
      'view',
      'confirm', 
      'decline',
      'cancel',
      'contact',
      'search',
      'browse',
      'share',
      'delete',
      'edit',
      'refresh'
    ];
    
    const testResults = [];
    
    for (const actionType of validActionTypes) {
      try {
        console.log(`🔍 Testing action type: ${actionType}`);
        
        const testNotification = new Notification({
          userId: userId,
          type: 'booking_created',
          title: `Test Action: ${actionType}`,
          message: `Testing if action type "${actionType}" is valid`,
          priority: 'low',
          category: 'system',
          data: {
            test: true,
            actionType: actionType
          },
          actions: [
            {
              type: actionType,
              label: `Test ${actionType}`,
              endpoint: `/api/test/${actionType}`,
              method: 'GET'
            }
          ]
        });
        
        // Validate without saving
        const validationError = testNotification.validateSync();
        
        if (validationError) {
          console.log(`❌ ${actionType}: ${validationError.message}`);
          testResults.push({
            actionType,
            valid: false,
            error: validationError.message
          });
        } else {
          console.log(`✅ ${actionType}: Valid`);
          testResults.push({
            actionType,
            valid: true,
            error: null
          });
        }
        
      } catch (error) {
        console.log(`❌ ${actionType}: ${error.message}`);
        testResults.push({
          actionType,
          valid: false,
          error: error.message
        });
      }
    }
    
    const validActions = testResults.filter(r => r.valid).map(r => r.actionType);
    const invalidActions = testResults.filter(r => !r.valid);
    
    console.log('✅ Valid action types:', validActions);
    console.log('❌ Invalid action types:', invalidActions.map(a => a.actionType));
    
    res.json({
      success: true,
      message: 'Action type validation test completed',
      results: {
        validActions,
        invalidActions,
        totalTested: validActionTypes.length,
        validCount: validActions.length,
        invalidCount: invalidActions.length
      },
      recommendations: {
        forBookingCreated: ['view', 'cancel'],
        forBookingRequest: ['confirm', 'decline', 'view'],
        forBookingConfirmed: ['view', 'contact'],
        forBookingDeclined: ['search', 'browse']
      }
    });
    
  } catch (error) {
    console.error('❌ Action type test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Action type test failed',
      message: error.message
    });
  }
});

// GET /api/bookings/test/notification-model-schema - Check the actual schema
router.get('/test/notification-model-schema', auth, async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    
    // Get schema information
    const schema = Notification.schema;
    const actionSchema = schema.paths['actions.type'];
    
    const schemaInfo = {
      actionTypeField: {
        path: 'actions.type',
        type: actionSchema ? actionSchema.constructor.name : 'Unknown',
        isEnum: actionSchema ? actionSchema.hasOwnProperty('enumValues') : false,
        enumValues: actionSchema ? actionSchema.enumValues : null,
        isRequired: actionSchema ? actionSchema.isRequired : false
      },
      fullSchema: Object.keys(schema.paths).reduce((acc, path) => {
        const schemaPath = schema.paths[path];
        acc[path] = {
          type: schemaPath.constructor.name,
          required: schemaPath.isRequired,
          enum: schemaPath.enumValues || null
        };
        return acc;
      }, {})
    };
    
    res.json({
      success: true,
      message: 'Notification schema information',
      schema: schemaInfo,
      recommendedActions: {
        // Based on common action patterns
        customer: ['view', 'cancel', 'contact', 'share'],
        vendor: ['confirm', 'decline', 'view', 'contact'],
        system: ['refresh', 'view', 'delete']
      }
    });
    
  } catch (error) {
    console.error('❌ Schema inspection failed:', error);
    res.status(500).json({
      success: false,
      error: 'Schema inspection failed',
      message: error.message
    });
  }
});

router.post('/test/complete-notification-flow', auth, async (req, res) => {
  console.log('🧪 Testing complete notification flow...');
  
  try {
    const userId = req.user.userId;
    const Notification = require('../models/Notification');
    const User = require('../models/User');
    
    // Create mock data
    const mockCustomer = await User.findById(userId);
    const mockVendor = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test Vendor',
      email: 'vendor@test.com'
    };
    
    const mockBooking = {
      _id: new mongoose.Types.ObjectId(),
      reference: 'FLOW-TEST-' + Date.now(),
      zoneId: new mongoose.Types.ObjectId(),
      userId: userId,
      date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      timeSlot: '15:00',
      duration: 2,
      totalAmount: 80
    };
    
    const mockZone = {
      _id: mockBooking.zoneId,
      name: 'Test Gaming Zone',
      vendorId: mockVendor._id
    };
    
    const results = {
      steps: [],
      notifications: [],
      errors: []
    };
    
    // STEP 1: Create initial booking request notifications
    console.log('📢 Step 1: Creating initial booking notifications...');
    
    // Customer notification - Booking created (pending)
    const customerNotification1 = new Notification({
      userId: mockCustomer._id,
      type: 'booking_created',
      title: '🎮 Booking Created - Awaiting Confirmation',
      message: `Your booking request for ${mockZone.name} on ${mockBooking.date.toLocaleDateString()} at ${mockBooking.timeSlot} has been submitted.`,
      priority: 'medium',
      category: 'booking',
      data: {
        bookingId: mockBooking._id.toString(),
        reference: mockBooking.reference,
        status: 'pending_confirmation',
        step: 1,
        flowTest: true
      }
    });
    
    await customerNotification1.save();
    results.notifications.push({
      step: 1,
      type: 'customer_booking_created',
      id: customerNotification1._id,
      title: customerNotification1.title
    });
    
    // Vendor notification - Booking request (needs action)
    const vendorNotification1 = new Notification({
      userId: mockVendor._id,
      type: 'booking_request',
      title: '📋 New Booking Request - Action Required',
      message: `${mockCustomer.name} has requested to book "${mockZone.name}". Please confirm or decline.`,
      priority: 'high',
      category: 'booking',
      data: {
        bookingId: mockBooking._id.toString(),
        reference: mockBooking.reference,
        customerName: mockCustomer.name,
        status: 'pending_vendor_action',
        step: 1,
        flowTest: true
      },
      actions: [
        {
          type: 'confirm_booking',
          label: 'Confirm Booking'
        },
        {
          type: 'decline_booking',
          label: 'Decline Booking'
        }
      ]
    });
    
    await vendorNotification1.save();
    results.notifications.push({
      step: 1,
      type: 'vendor_booking_request',
      id: vendorNotification1._id,
      title: vendorNotification1.title
    });
    
    results.steps.push('Step 1: Initial booking notifications created');
    
    // Wait a bit to simulate time passage
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // STEP 2: Simulate vendor confirmation
    console.log('📢 Step 2: Simulating vendor confirmation...');
    
    // Customer notification - Booking confirmed
    const customerNotification2 = new Notification({
      userId: mockCustomer._id,
      type: 'booking_confirmed',
      title: '🎉 Booking Confirmed!',
      message: `Great news! Your booking for "${mockZone.name}" has been confirmed by the vendor.`,
      priority: 'high',
      category: 'booking',
      data: {
        bookingId: mockBooking._id.toString(),
        reference: mockBooking.reference,
        status: 'confirmed',
        confirmedAt: new Date().toISOString(),
        step: 2,
        flowTest: true
      }
    });
    
    await customerNotification2.save();
    results.notifications.push({
      step: 2,
      type: 'customer_booking_confirmed',
      id: customerNotification2._id,
      title: customerNotification2.title
    });
    
    // Vendor notification - Confirmation record
    const vendorNotification2 = new Notification({
      userId: mockVendor._id,
      type: 'booking_confirmed',
      title: '✅ Booking Confirmed',
      message: `You have confirmed the booking for "${mockZone.name}" requested by ${mockCustomer.name}.`,
      priority: 'medium',
      category: 'booking',
      data: {
        bookingId: mockBooking._id.toString(),
        reference: mockBooking.reference,
        customerName: mockCustomer.name,
        status: 'confirmed',
        action: 'confirmed',
        step: 2,
        flowTest: true
      }
    });
    
    await vendorNotification2.save();
    results.notifications.push({
      step: 2,
      type: 'vendor_booking_confirmed',
      id: vendorNotification2._id,
      title: vendorNotification2.title
    });
    
    // Mark original vendor request as read
    await Notification.findByIdAndUpdate(vendorNotification1._id, {
      isRead: true,
      readAt: new Date()
    });
    
    results.steps.push('Step 2: Vendor confirmation notifications created');
    
    // STEP 3: Verify all notifications exist and are accessible
    console.log('📢 Step 3: Verifying notifications...');
    
    const customerNotifications = await Notification.find({
      userId: mockCustomer._id,
      'data.flowTest': true
    }).sort({ createdAt: 1 });
    
    const vendorNotifications = await Notification.find({
      userId: mockVendor._id,
      'data.flowTest': true
    }).sort({ createdAt: 1 });
    
    results.steps.push('Step 3: Verification completed');
    
    // Summary
    const summary = {
      totalNotifications: results.notifications.length,
      customerNotifications: customerNotifications.length,
      vendorNotifications: vendorNotifications.length,
      expectedFlow: [
        'Customer: Booking Created (Pending)',
        'Vendor: Booking Request (Action Required)', 
        'Customer: Booking Confirmed',
        'Vendor: Booking Confirmed (Record)'
      ],
      actualFlow: results.notifications.map(n => `${n.type}: ${n.title}`)
    };
    
    console.log('✅ Flow test completed successfully');
    
    res.json({
      success: true,
      message: 'Complete notification flow test successful',
      results,
      summary,
      mockData: {
        customer: {
          id: mockCustomer._id,
          name: mockCustomer.name,
          email: mockCustomer.email
        },
        vendor: {
          id: mockVendor._id,
          name: mockVendor.name,
          email: mockVendor.email
        },
        booking: {
          id: mockBooking._id,
          reference: mockBooking.reference,
          zone: mockZone.name
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Flow test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Flow test failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /api/bookings/test/notification-types - Show different notification types
router.get('/test/notification-types', auth, async (req, res) => {
  try {
    const notificationTypes = {
      customer_notifications: {
        booking_created: {
          title: 'Booking Created - Awaiting Confirmation',
          message: 'Your booking request has been submitted and is awaiting vendor confirmation.',
          priority: 'medium',
          actions: ['view_booking', 'cancel_booking']
        },
        booking_confirmed: {
          title: 'Booking Confirmed!',
          message: 'Your booking has been confirmed by the vendor.',
          priority: 'high',
          actions: ['view_booking', 'contact_vendor']
        },
        booking_declined: {
          title: 'Booking Declined',
          message: 'Your booking request has been declined by the vendor.',
          priority: 'high',
          actions: ['find_alternatives', 'browse_zones']
        }
      },
      vendor_notifications: {
        booking_request: {
          title: 'New Booking Request - Action Required',
          message: 'A customer has requested to book your gaming zone.',
          priority: 'high',
          actions: ['confirm_booking', 'decline_booking', 'view_booking']
        },
        booking_confirmed: {
          title: 'Booking Confirmed',
          message: 'You have confirmed a booking request.',
          priority: 'medium',
          actions: ['view_booking']
        },
        booking_declined: {
          title: 'Booking Declined',
          message: 'You have declined a booking request.',
          priority: 'medium',
          actions: ['view_booking']
        }
      }
    };
    
    res.json({
      success: true,
      message: 'Notification types reference',
      types: notificationTypes,
      flow: [
        '1. Customer books → booking_created (customer) + booking_request (vendor)',
        '2. Vendor confirms → booking_confirmed (customer) + booking_confirmed (vendor)',
        '3. Vendor declines → booking_declined (customer) + booking_declined (vendor)'
      ]
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get notification types',
      message: error.message
    });
  }
});

router.post('/test/booking-notification-exact', auth, async (req, res) => {
  console.log('🧪 Testing exact booking notification pattern...');
  
  try {
    const userId = req.user.userId;
    const Notification = require('../models/Notification');
    
    // Create notification with EXACT same data structure as booking would
    const mockBookingData = {
      _id: new mongoose.Types.ObjectId(),
      reference: 'TEST-BOOKING-' + Date.now(),
      zoneId: new mongoose.Types.ObjectId(),
      userId: userId,
      date: new Date(),
      timeSlot: '17:30',
      duration: 1,
      totalAmount: 50
    };
    
    const mockZone = {
      name: 'Test Gaming Zone',
      vendorId: {
        _id: new mongoose.Types.ObjectId()
      }
    };
    
    const mockUser = {
      name: 'Test User',
      email: 'test@example.com'
    };
    
    console.log('📢 Creating notification with booking pattern...');
    
    const notification = new Notification({
      userId: userId, // Same as test notification
      type: 'booking_created',
      title: 'Booking Created Successfully',
      message: `Your booking for ${mockZone.name} on ${mockBookingData.date.toLocaleDateString()} at ${mockBookingData.timeSlot} has been created.`,
      priority: 'medium',
      category: 'booking',
      data: {
        bookingId: mockBookingData._id.toString(),
        reference: mockBookingData.reference,
        zoneId: mockBookingData.zoneId.toString(),
        zoneName: mockZone.name,
        date: mockBookingData.date.toISOString(),
        timeSlot: mockBookingData.timeSlot,
        duration: mockBookingData.duration,
        totalAmount: mockBookingData.totalAmount,
        customerName: mockUser.name,
        createdFrom: 'booking_test',
        testNotification: true
      },
      actions: [
        {
          type: 'view',
          label: 'View Booking',
          endpoint: `/api/bookings/${mockBookingData._id}`,
          method: 'GET'
        }
      ]
    });
    
    await notification.save();
    console.log('✅ Booking-style notification created:', notification._id);
    
    // Verify
    const verification = await Notification.findById(notification._id);
    
    res.json({
      success: true,
      message: 'Booking-style notification created successfully',
      notification: {
        id: notification._id,
        title: notification.title,
        createdAt: notification.createdAt
      },
      verified: !!verification
    });
    
  } catch (error) {
    console.error('❌ Booking notification test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Booking notification test failed',
      message: error.message
    });
  }
});
// PUT /api/bookings/:id/cancel - Cancel booking
router.put('/:id/cancel', auth, userOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;
    const userId = req.user.userId;
    
    console.log('❌ Cancelling booking:', id, 'for user:', userId);
    
    const booking = await Booking.findOne({ 
      _id: id, 
      userId: new mongoose.Types.ObjectId(userId) 
    });
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Booking is already cancelled'
      });
    }
    
    if (booking.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel completed booking'
      });
    }
    
    // Check if cancellation is allowed (24 hours before)
    const bookingDate = new Date(booking.date);
    const now = new Date();
    const hoursDiff = (bookingDate - now) / (1000 * 60 * 60);
    
    if (hoursDiff < 24) {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel booking less than 24 hours before start time',
        hoursRemaining: Math.round(hoursDiff * 100) / 100
      });
    }
    
    // Update booking status
    booking.status = 'cancelled';
    booking.paymentStatus = 'refunded';
    booking.cancelledAt = new Date();
    if (cancellationReason) {
      booking.notes = `${booking.notes || ''}\nCancellation reason: ${cancellationReason}`;
    }
    
    await booking.save();
    
    // Update zone stats
    await GameZone.findByIdAndUpdate(booking.zoneId, {
      $inc: { 'stats.cancelledBookings': 1 }
    });
    
    console.log('✅ Booking cancelled successfully:', booking._id);
    
    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking: {
        ...booking.toObject(),
        qrCode: parseQRCode(booking.qrCode)
      }
    });
    
  } catch (error) {
    console.error('❌ Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel booking',
      message: error.message
    });
  }
});

// GET /api/bookings/availability/:zoneId/:date - Enhanced availability check
router.get('/availability/:zoneId/:date', async (req, res) => {
  try {
    const { zoneId, date } = req.params;
    
    console.log('🔍 Checking availability for zone:', zoneId, 'on date:', date);
    
    // Validate zone exists
    const zone = await GameZone.findById(zoneId);
    if (!zone || !zone.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Gaming zone not found or inactive'
      });
    }
    
    // Validate date format
    const bookingDate = new Date(date);
    if (isNaN(bookingDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    
    // Get existing bookings for the date
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const existingBookings = await Booking.find({
      zoneId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: { $in: ['confirmed', 'pending'] }
    }).sort({ timeSlot: 1 });
    
    // Generate available time slots using enhanced time handling
    const startMinutes = timeToMinutes(zone.operatingHours.start);
    const endMinutes = timeToMinutes(zone.operatingHours.end);
    
    const availability = {};
    const availableSlots = [];
    const bookedSlots = [];
    
    // Handle midnight crossing
    let currentMinutes = startMinutes;
    const maxMinutes = endMinutes < startMinutes ? endMinutes + 24 * 60 : endMinutes;
    
    // Generate hourly slots
    while (currentMinutes < maxMinutes) {
      const timeSlot = minutesToTime(currentMinutes % (24 * 60));
      availability[timeSlot] = true;
      currentMinutes += 60; // 1 hour increments
    }
    
    // Mark booked slots as unavailable
    existingBookings.forEach(booking => {
      const bookingStartMinutes = timeToMinutes(booking.timeSlot);
      const bookingEndMinutes = bookingStartMinutes + (booking.duration * 60);
      
      // Mark all affected slots as unavailable
      for (let minutes = bookingStartMinutes; minutes < bookingEndMinutes; minutes += 60) {
        const timeSlot = minutesToTime(minutes % (24 * 60));
        if (availability.hasOwnProperty(timeSlot)) {
          availability[timeSlot] = false;
          if (!bookedSlots.includes(timeSlot)) {
            bookedSlots.push(timeSlot);
          }
        }
      }
    });
    
    // Create available slots array
    Object.keys(availability).forEach(slot => {
      if (availability[slot]) {
        availableSlots.push(slot);
      }
    });
    
    console.log('✅ Availability check completed:', {
      available: availableSlots.length,
      booked: bookedSlots.length
    });
    
    res.json({
      success: true,
      date,
      zoneId,
      zoneName: zone.name,
      operatingHours: zone.operatingHours,
      availability,
      availableSlots: availableSlots.sort(),
      bookedSlots: bookedSlots.sort(),
      totalAvailable: availableSlots.length,
      totalBooked: bookedSlots.length,
      existingBookings: existingBookings.map(booking => ({
        id: booking._id,
        timeSlot: booking.timeSlot,
        duration: booking.duration,
        status: booking.status,
        endTime: minutesToTime(timeToMinutes(booking.timeSlot) + (booking.duration * 60))
      }))
    });
    
  } catch (error) {
    console.error('❌ Error getting zone availability:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get zone availability',
      message: error.message
    });
  }
});


router.post('/test/notification-from-booking', auth, async (req, res) => {
  console.log('🧪 Testing notification creation from booking context...');
  
  try {
    const userId = req.user.userId;
    const Notification = require('../models/Notification');
    
    console.log('📢 Step 1: Checking Notification model...');
    console.log('📢 Model type:', typeof Notification);
    console.log('📢 Model name:', Notification.modelName);
    
    console.log('📢 Step 2: Creating notification data...');
    const notificationData = {
      userId: new mongoose.Types.ObjectId(userId),
      type: 'booking_created',
      title: 'Test from Booking Route',
      message: 'This notification was created from the booking route context',
      priority: 'medium',
      category: 'booking',
      data: {
        testFrom: 'booking_route',
        timestamp: new Date().toISOString(),
        userId: userId
      }
    };
    
    console.log('📢 Step 3: Creating notification instance...');
    const notification = new Notification(notificationData);
    
    console.log('📢 Step 4: Validating notification...');
    const validationError = notification.validateSync();
    if (validationError) {
      console.error('❌ Validation error:', validationError);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationError.errors
      });
    }
    
    console.log('📢 Step 5: Saving to database...');
    await notification.save();
    
    console.log('✅ Step 6: Notification saved:', notification._id);
    
    console.log('📢 Step 7: Verifying in database...');
    const verification = await Notification.findById(notification._id);
    
    console.log('✅ Step 8: Verification result:', verification ? 'FOUND' : 'NOT FOUND');
    
    res.json({
      success: true,
      message: 'Notification created successfully from booking context',
      notification: {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt
      },
      verified: !!verification,
      debug: {
        modelType: typeof Notification,
        modelName: Notification.modelName,
        validationPassed: !validationError
      }
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('❌ Error type:', error.constructor.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      error: 'Test notification creation failed',
      message: error.message,
      type: error.constructor.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Compare with direct service call
router.post('/test/notification-service', auth, async (req, res) => {
  console.log('🧪 Testing NotificationService...');
  
  try {
    const NotificationService = require('../services/NotificationService');
    const userId = req.user.userId;
    
    const notificationData = {
      type: 'booking_created',
      title: 'Test from Service',
      message: 'This notification was created using NotificationService',
      priority: 'medium',
      category: 'booking',
      data: {
        testFrom: 'notification_service',
        timestamp: new Date().toISOString()
      }
    };
    
    console.log('📢 Calling NotificationService.createNotification...');
    const notification = await NotificationService.createNotification(userId, notificationData);
    
    console.log('✅ Service call successful:', notification._id);
    
    res.json({
      success: true,
      message: 'Notification created via service',
      notification: {
        id: notification._id,
        title: notification.title,
        createdAt: notification.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Service test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Service notification creation failed',
      message: error.message
    });
  }
});

// Simulate booking notification creation
router.post('/test/simulate-booking-notification', auth, async (req, res) => {
  console.log('🧪 Simulating booking notification creation...');
  
  try {
    const userId = req.user.userId;
    const Notification = require('../models/Notification');
    
    // Simulate a booking object
    const mockBooking = {
      _id: new mongoose.Types.ObjectId(),
      reference: 'TEST-' + Date.now(),
      zoneId: new mongoose.Types.ObjectId(),
      userId: userId,
      date: new Date(),
      timeSlot: '14:00',
      duration: 2,
      totalAmount: 100
    };
    
    // Simulate a zone object
    const mockZone = {
      _id: mockBooking.zoneId,
      name: 'Test Gaming Zone',
      vendorId: {
        _id: new mongoose.Types.ObjectId(),
        name: 'Test Vendor',
        email: 'vendor@test.com'
      }
    };
    
    // Simulate a user object
    const mockUser = {
      _id: userId,
      name: 'Test User',
      email: 'user@test.com'
    };
    
    console.log('📢 Creating customer notification...');
    const customerNotification = new Notification({
      userId: new mongoose.Types.ObjectId(mockBooking.userId),
      type: 'booking_created',
      title: '🎮 Booking Created (Simulated)',
      message: `Your booking for ${mockZone.name} on ${mockBooking.date.toLocaleDateString()} at ${mockBooking.timeSlot} has been created.`,
      priority: 'medium',
      category: 'booking',
      data: {
        bookingId: mockBooking._id.toString(),
        reference: mockBooking.reference,
        zoneId: mockBooking.zoneId.toString(),
        zoneName: mockZone.name,
        date: mockBooking.date.toISOString(),
        timeSlot: mockBooking.timeSlot,
        duration: mockBooking.duration,
        totalAmount: mockBooking.totalAmount,
        simulated: true
      },
      actions: [
        {
          type: 'view',
          label: 'View Booking',
          endpoint: `/api/bookings/${mockBooking._id}`,
          method: 'GET'
        }
      ]
    });
    
    await customerNotification.save();
    console.log('✅ Customer notification created:', customerNotification._id);
    
    console.log('📢 Creating vendor notification...');
    const vendorNotification = new Notification({
      userId: new mongoose.Types.ObjectId(mockZone.vendorId._id),
      type: 'booking_created',
      title: '📋 New Booking Request (Simulated)',
      message: `${mockUser.name} has requested to book ${mockZone.name}.`,
      priority: 'high',
      category: 'booking',
      data: {
        bookingId: mockBooking._id.toString(),
        reference: mockBooking.reference,
        zoneId: mockBooking.zoneId.toString(),
        zoneName: mockZone.name,
        customerName: mockUser.name,
        customerEmail: mockUser.email,
        date: mockBooking.date.toISOString(),
        timeSlot: mockBooking.timeSlot,
        duration: mockBooking.duration,
        totalAmount: mockBooking.totalAmount,
        simulated: true
      },
      actions: [
        {
          type: 'confirm',
          label: 'Confirm Booking',
          endpoint: `/api/vendor/bookings/${mockBooking._id}/confirm`,
          method: 'PUT'
        },
        {
          type: 'decline',
          label: 'Decline Booking',
          endpoint: `/api/vendor/bookings/${mockBooking._id}/decline`,
          method: 'PUT'
        }
      ]
    });
    
    await vendorNotification.save();
    console.log('✅ Vendor notification created:', vendorNotification._id);
    
    // Verify both notifications
    const customerCheck = await Notification.findById(customerNotification._id);
    const vendorCheck = await Notification.findById(vendorNotification._id);
    
    res.json({
      success: true,
      message: 'Simulated booking notifications created successfully',
      notifications: {
        customer: {
          id: customerNotification._id,
          title: customerNotification.title,
          verified: !!customerCheck
        },
        vendor: {
          id: vendorNotification._id,
          title: vendorNotification.title,
          verified: !!vendorCheck
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Simulation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Simulation failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;