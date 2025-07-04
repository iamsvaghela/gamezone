// controllers/bookingController.js - Fixed booking controller with proper error handling
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const User = require('../models/User');
const { validationResult } = require('express-validator');

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

// Helper function to format booking response
const formatBookingResponse = (booking) => {
  if (!booking) return null;
  
  const bookingObj = booking.toObject ? booking.toObject() : booking;
  
  // Parse QR code safely
  const qrData = parseQRCode(bookingObj.qrCode);
  
  return {
    _id: bookingObj._id,
    reference: bookingObj.reference,
    zoneId: bookingObj.zoneId,
    userId: bookingObj.userId,
    date: bookingObj.date,
    timeSlot: bookingObj.timeSlot,
    duration: bookingObj.duration,
    totalAmount: bookingObj.totalAmount,
    status: bookingObj.status,
    paymentStatus: bookingObj.paymentStatus,
    qrCode: qrData ? JSON.stringify(qrData) : bookingObj.qrCode,
    notes: bookingObj.notes,
    paymentMethod: bookingObj.paymentMethod,
    createdAt: bookingObj.createdAt,
    updatedAt: bookingObj.updatedAt,
  };
};

// @desc    Get user bookings
// @route   GET /api/bookings
// @access  Private
const getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    
    console.log('📅 Fetching bookings for user:', userId);
    
    // Build query
    const query = { userId };
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
        // Handle case where zone might be deleted
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
};

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
const getBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    console.log('📋 Fetching booking:', id, 'for user:', userId);
    
    const booking = await Booking.findOne({ _id: id, userId })
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
      ...formatBookingResponse(booking),
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
};

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private
const createBooking = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }
    
    const { zoneId, date, timeSlot, duration, notes } = req.body;
    const userId = req.user.id;
    
    console.log('🔄 Creating booking:', { zoneId, date, timeSlot, duration, userId });
    
    // Verify zone exists and is active
    const zone = await GameZone.findById(zoneId);
    if (!zone || !zone.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Gaming zone not found or inactive'
      });
    }
    
    // Check if slot is available (simplified check)
    const existingBooking = await Booking.findOne({
      zoneId,
      date,
      timeSlot,
      status: { $in: ['confirmed', 'pending'] }
    });
    
    if (existingBooking) {
      return res.status(409).json({
        success: false,
        error: 'Time slot already booked'
      });
    }
    
    // Calculate total amount
    const totalAmount = zone.pricePerHour * duration;
    
    // Generate reference number
    const reference = `GZ-${Math.random().toString(36).substr(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    
    // Create QR code data
    const qrData = {
      bookingId: null, // Will be set after creation
      reference,
      zoneId,
      zoneName: zone.name,
      date,
      timeSlot,
      duration
    };
    
    // Create booking
    const booking = new Booking({
      userId,
      zoneId,
      date,
      timeSlot,
      duration,
      totalAmount,
      reference,
      notes,
      qrCode: JSON.stringify(qrData),
      status: 'confirmed', // Simplified - in real app might be 'pending'
      paymentStatus: 'paid', // Simplified - in real app would handle payment
      paymentMethod: 'card'
    });
    
    await booking.save();
    
    // Update QR code with booking ID
    qrData.bookingId = booking._id.toString();
    booking.qrCode = JSON.stringify(qrData);
    await booking.save();
    
    // Update zone stats
    await GameZone.findByIdAndUpdate(zoneId, {
      $inc: { totalBookings: 1 },
      $set: { lastBookingAt: new Date() }
    });
    
    console.log('✅ Booking created successfully:', booking._id);
    
    // Return formatted response
    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking: {
        id: booking._id,
        reference: booking.reference,
        zone: {
          id: zone._id,
          name: zone.name,
          location: {
            address: zone.location.address
          },
          image: zone.images?.[0] || null
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
    res.status(500).json({
      success: false,
      error: 'Failed to create booking',
      message: error.message
    });
  }
};

// @desc    Cancel booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;
    const userId = req.user.id;
    
    console.log('❌ Cancelling booking:', id, 'for user:', userId);
    
    const booking = await Booking.findOne({ _id: id, userId });
    
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
        error: 'Cannot cancel booking less than 24 hours before start time'
      });
    }
    
    // Update booking status
    booking.status = 'cancelled';
    booking.paymentStatus = 'refunded'; // Simplified
    booking.cancelledAt = new Date();
    if (cancellationReason) {
      booking.notes = `${booking.notes || ''}\nCancellation reason: ${cancellationReason}`;
    }
    
    await booking.save();
    
    console.log('✅ Booking cancelled successfully:', booking._id);
    
    res.json({
      success: true,
      message: 'Booking cancelled successfully'
    });
    
  } catch (error) {
    console.error('❌ Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel booking',
      message: error.message
    });
  }
};

// @desc    Get booking statistics
// @route   GET /api/bookings/stats
// @access  Private
const getBookingStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const stats = await Booking.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
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
};

module.exports = {
  getUserBookings,
  getBooking,
  createBooking,
  cancelBooking,
  getBookingStats
};