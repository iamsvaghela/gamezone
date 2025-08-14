// routes/bookings.js - Fixed update-payment route with better error handling
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

// GET /api/bookings - Get user bookings
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
      pending_payment: 0,
      payment_failed: 0,
      totalSpent: 0
    };
    
    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
      formattedStats.total += stat.count;
      if (!['cancelled', 'payment_failed'].includes(stat._id)) {
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
    const canBeCancelled = ['pending_payment', 'confirmed'].includes(booking.status);
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

// POST /api/bookings - Create new booking (NEW PAYMENT FLOW)
router.post('/', auth, userOnly, async (req, res) => {
  try {
    const { zoneId, date, timeSlot, duration, notes, bookingType, selectedGames } = req.body;
    
    console.log('🔄 Creating booking (new flow):', { zoneId, date, timeSlot, duration, userId: req.user.userId });
    
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
    const isSlotAvailable = await Booking.isTimeSlotAvailable(zoneId, bookingDate, timeSlot, duration);
    
    if (!isSlotAvailable) {
      return res.status(409).json({ 
        success: false,
        error: 'Time slot is not available',
        suggestedAction: 'Please choose a different time slot',
        availabilityEndpoint: `/api/bookings/availability/${zoneId}/${date}`
      });
    }

     // Calculate total amount based on booking type
     let totalAmount = 0;
     let gamesSummary = [];
 
     if (bookingType === 'games' && selectedGames) {
       // Calculate total from selected games
       selectedGames.forEach(game => {
         const gameTotal = game.hours * game.pricePerHour;
         totalAmount += gameTotal;
         gamesSummary.push({
           gameId: game.gameId,
           gameName: game.gameName,
           hours: game.hours,
           pricePerHour: game.pricePerHour,
           subtotal: gameTotal
         });
       });
 
       console.log('💰 Games booking total:', {
         totalGames: selectedGames.length,
         totalAmount,
         gamesSummary
       });
     } else {
       // Default zone-based pricing
       totalAmount = zone.pricePerHour * duration;
       console.log('💰 Zone booking total:', { zonePrice: zone.pricePerHour, duration, totalAmount });
     }

    // 🆕 NEW FLOW: Create booking with pending_payment status
    const booking = new Booking({
      userId: req.user.userId,
      zoneId,
      date: bookingDate,
      timeSlot,
      duration,
      totalAmount,
      status: 'pending_payment', // 🆕 Start with pending payment
      paymentStatus: 'pending',   // 🆕 Payment not yet completed
      notes,
      // Set payment deadline (30 minutes from now)
      paymentDeadline: new Date(Date.now() + 30 * 60 * 1000)
    });

    await booking.save();
    
    console.log('✅ Booking created with pending payment status:', booking._id, 'Reference:', booking.reference);
    
    // Create QR code data
    const qrCodeData = {
      bookingId: booking._id,
      reference: booking.reference,
      zoneId,
      zoneName: zone.name,
      date,
      timeSlot,
      duration,
      status: 'pending_payment'
    };
    
    booking.qrCode = JSON.stringify(qrCodeData);
    await booking.save();
    
    // Update zone stats
    await GameZone.findByIdAndUpdate(zoneId, {
      $inc: { 'stats.totalBookings': 1 }
    });
    
    // Populate zone details for response
    await booking.populate('zoneId', 'name location images pricePerHour');

    // 🆕 Create notifications for booking created (pending payment)
    try {
      const Notification = require('../models/Notification');
      const User = require('../models/User');
      
      // Get user data
      const user = await User.findById(req.user.userId);
      
      if (user) {
        // Customer notification - booking created, payment pending
        const customerNotification = new Notification({
          userId: req.user.userId,
          type: 'booking_created',
          title: '🎮 Booking Created - Payment Required',
          message: `Your booking for "${zone.name}" has been created. Please complete the payment within 30 minutes to confirm your booking.`,
          priority: 'high',
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
            status: 'pending_payment',
            paymentDeadline: booking.paymentDeadline.toISOString()
          }
        });
        
        await customerNotification.save();
        console.log('✅ Customer notification created:', customerNotification._id);
        
        // Get zone with vendor data for vendor notification
        const populatedZone = await GameZone.findById(zoneId).populate('vendorId');
        
        if (populatedZone && populatedZone.vendorId) {
          const vendorNotification = new Notification({
            userId: populatedZone.vendorId._id,
            type: 'booking_created',
            title: '📋 New Booking - Payment Pending',
            message: `${user.name} has created a booking for "${zone.name}". Waiting for payment confirmation.`,
            priority: 'medium',
            category: 'booking',
            data: {
              bookingId: booking._id.toString(),
              reference: booking.reference,
              zoneId: booking.zoneId.toString(),
              zoneName: zone.name,
              customerName: user.name,
              customerEmail: user.email,
              date: booking.date.toISOString(),
              timeSlot: booking.timeSlot,
              duration: booking.duration,
              totalAmount: booking.totalAmount,
              status: 'pending_payment'
            }
          });
          
          await vendorNotification.save();
          console.log('✅ Vendor notification created:', vendorNotification._id);
        }
      }
    } catch (notificationError) {
      console.error('❌ Notification creation failed:', notificationError);
      // Don't fail the booking creation for notification errors
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully - payment required',
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
        paymentDeadline: booking.paymentDeadline,
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

// 🔧 TEST ROUTES - Remove these after debugging
router.all('/test-routes', (req, res) => {
  console.log('🔧 Test route hit:', req.method, req.originalUrl);
  res.json({
    success: true,
    message: 'Booking routes are working',
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

router.all('/:id/test-update-payment', (req, res) => {
  console.log('🔧 Test update-payment route hit:', req.method, req.originalUrl);
  res.json({
    success: true,
    message: 'Update payment route is reachable',
    bookingId: req.params.id,
    timestamp: new Date().toISOString()
  });
});

// 🆕 PUT /api/bookings/:id/update-payment - Update booking after payment
// ⚠️ CRITICAL: This route MUST be defined BEFORE the GET /:id route
router.put('/:id/update-payment', auth, userOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      paymentId, 
      orderId, 
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      paymentStatus,
      failureReason 
    } = req.body;
    
    console.log('💳 UPDATE PAYMENT ROUTE HIT - Booking ID:', id, 'Status:', paymentStatus);
    console.log('💳 Request body:', req.body);
    
    // Validate booking ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('❌ Invalid booking ID format:', id);
      return res.status(400).json({
        success: false,
        error: 'Invalid booking ID format'
      });
    }
    
    const booking = await Booking.findOne({ 
      _id: new mongoose.Types.ObjectId(id), 
      userId: new mongoose.Types.ObjectId(req.user.userId) 
    });
    
    if (!booking) {
      console.log('❌ Booking not found:', id, 'for user:', req.user.userId);
      return res.status(404).json({
        success: false,
        error: 'Booking not found or you do not have permission to update it'
      });
    }
    
    console.log('📋 Found booking:', booking._id, 'Current status:', booking.status);
    
    if (booking.status !== 'pending_payment') {
      console.log('❌ Booking not in pending payment status:', booking.status);
      return res.status(400).json({
        success: false,
        error: `Cannot update payment for booking with status: ${booking.status}`
      });
    }
    
    // Record payment attempt
    const paymentAttempt = {
      attemptedAt: new Date(),
      paymentId: razorpay_payment_id || paymentId,
      orderId: razorpay_order_id || orderId,
      status: paymentStatus,
      errorMessage: failureReason
    };
    
    booking.paymentAttempts = booking.paymentAttempts || [];
    booking.paymentAttempts.push(paymentAttempt);
    
    if (paymentStatus === 'success') {
      // Payment successful - confirm booking
      booking.status = 'confirmed';
      booking.paymentStatus = 'completed';
      booking.paymentId = razorpay_payment_id || paymentId;
      booking.orderId = razorpay_order_id || orderId;
      booking.razorpaySignature = razorpay_signature;
      booking.paymentVerified = true;
      booking.paymentVerifiedAt = new Date();
      booking.confirmedAt = new Date();
      
      console.log('✅ Payment successful - booking confirmed:', booking._id);
      
      // Create success notifications
      try {
        const Notification = require('../models/Notification');
        const User = require('../models/User');
        
        const user = await User.findById(req.user.userId);
        const zone = await GameZone.findById(booking.zoneId).populate('vendorId');
        
        if (user) {
          // Customer success notification
          const customerNotification = new Notification({
            userId: req.user.userId,
            type: 'payment_received',  // ✅ Valid enum value
            title: '🎉 Payment Successful - Booking Confirmed!',
            message: `Your booking for "${zone.name}" is now confirmed. Payment ID: ${razorpay_payment_id}`,
            priority: 'high',
            category: 'booking',
            data: {
              bookingId: booking._id.toString(),
              reference: booking.reference,
              paymentId: razorpay_payment_id,
              confirmedAt: booking.confirmedAt.toISOString()
            }
          });
          
          await customerNotification.save();
          console.log('✅ Customer success notification created');
          
          // Vendor notification
          if (zone && zone.vendorId) {
            const vendorNotification = new Notification({
              userId: zone.vendorId._id,
              type: 'booking_confirmed',
              title: '💰 Booking Payment Received',
              message: `Payment confirmed for ${user.name}'s booking at "${zone.name}".`,
              priority: 'medium',
              category: 'booking',
              data: {
                bookingId: booking._id.toString(),
                reference: booking.reference,
                customerName: user.name,
                paymentId: razorpay_payment_id
              }
            });
            
            await vendorNotification.save();
            console.log('✅ Vendor success notification created');
          }

          if (zone && zone.vendorId) {
            const vendorNotification = new Notification({
              userId: zone.vendorId._id,
              type: 'review_required',
              title: '💰 Booking Confirmation Required',
              message: `Booking  confirmation for ${user.name}'s booking at "${zone.name}".`,
              priority: 'medium',
              category: 'booking',
              data: {
                bookingId: booking._id.toString(),
                reference: booking.reference,
                customerName: user.name,
                paymentId: razorpay_payment_id
              }
            });
            
            await vendorNotification.save();
            console.log('✅ Vendor confirmation notification created');
          }
        }
      } catch (notificationError) {
        console.error('❌ Success notification creation failed:', notificationError);
      }
      
    } else {
      // Payment failed - mark booking as failed
      booking.status = 'payment_failed';
      booking.paymentStatus = 'failed';
      booking.paymentFailureReason = failureReason || 'Payment was not completed';
      booking.paymentFailedAt = new Date();
      
      console.log('❌ Payment failed - booking marked as failed:', booking._id);
      
      // Create failure notifications
      try {
        const Notification = require('../models/Notification');
        const User = require('../models/User');
        
        const user = await User.findById(req.user.userId);
        
        if (user) {
          const customerNotification = new Notification({
            userId: req.user.userId,
            type: 'payment_failed',  // ✅ Use valid enum value
            title: '❌ Payment Failed - Booking Cancelled',
            message: `Payment for your booking "${booking.reference}" could not be processed. The booking has been cancelled.`,
            priority: 'high',
            category: 'payment',  // ✅ Use payment category
            data: {
              bookingId: booking._id.toString(),
              reference: booking.reference,
              failureReason: failureReason
            }
          });
          
          await customerNotification.save();
          console.log('✅ Customer failure notification created');
        }
      } catch (notificationError) {
        console.error('❌ Failure notification creation failed:', notificationError);
      }
    }
    
    await booking.save();
    console.log('✅ Booking saved successfully with new status:', booking.status);
    
    const responseData = {
      success: true,
      message: paymentStatus === 'success' 
        ? 'Payment successful - booking confirmed' 
        : 'Payment failed - booking cancelled',
      booking: {
        id: booking._id,
        reference: booking.reference,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentId: booking.paymentId,
        orderId: booking.orderId,
        confirmedAt: booking.confirmedAt,
        paymentFailedAt: booking.paymentFailedAt,
        totalAmount: booking.totalAmount,
        date: booking.date,
        timeSlot: booking.timeSlot,
        duration: booking.duration
      }
    };
    
    console.log('✅ Sending response:', responseData);
    res.json(responseData);
    
  } catch (error) {
    console.error('❌ Error updating booking payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update booking payment',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
    
    if (['cancelled', 'payment_failed', 'completed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel booking with status: ${booking.status}`
      });
    }
    
    // Check if cancellation is allowed based on booking status
    const canCancel = booking.canBeCancelled();
    if (!canCancel.canCancel) {
      return res.status(400).json({
        success: false,
        error: canCancel.reason,
        hoursRemaining: canCancel.hoursRemaining
      });
    }
    
    // Cancel the booking
    await booking.cancel(cancellationReason);
    
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

// GET /api/bookings/availability/:zoneId/:date - Check availability
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
    
    // Get existing bookings for the date (including pending payments)
    const conflictingBookings = await Booking.findConflictingBookings(zoneId, bookingDate);
    
    // Generate available time slots
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
    conflictingBookings.forEach(booking => {
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
      existingBookings: conflictingBookings.map(booking => ({
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

// 🆕 DEBUG ROUTE - Check if routes are working
router.get('/debug/routes', (req, res) => {
  console.log('🔧 DEBUG: Routes endpoint hit');
  res.json({
    success: true,
    message: 'Booking routes are working',
    availableRoutes: [
      'GET /api/bookings',
      'GET /api/bookings/stats',
      'GET /api/bookings/:id',
      'POST /api/bookings',
      'PUT /api/bookings/:id/update-payment',
      'PUT /api/bookings/:id/cancel',
      'GET /api/bookings/availability/:zoneId/:date'
    ],
    timestamp: new Date().toISOString()
  });
});

module.exports = router;