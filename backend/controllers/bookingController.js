// controllers/bookingController.js - Enhanced with conflict resolution
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

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

// Helper function to check time slot conflicts
const checkTimeSlotConflict = async (zoneId, date, timeSlot, duration, excludeBookingId = null) => {
  try {
    const startTime = parseInt(timeSlot.split(':')[0]);
    const endTime = startTime + duration;
    
    // Find overlapping bookings
    const conflictingBookings = await Booking.find({
      zoneId,
      date: new Date(date),
      status: { $in: ['confirmed', 'pending'] },
      ...(excludeBookingId && { _id: { $ne: excludeBookingId } })
    });
    
    for (const booking of conflictingBookings) {
      const existingStart = parseInt(booking.timeSlot.split(':')[0]);
      const existingEnd = existingStart + booking.duration;
      
      // Check for overlap
      if (
        (startTime >= existingStart && startTime < existingEnd) ||
        (endTime > existingStart && endTime <= existingEnd) ||
        (startTime <= existingStart && endTime >= existingEnd)
      ) {
        return {
          hasConflict: true,
          conflictingBooking: booking,
          conflictDetails: {
            existingSlot: `${booking.timeSlot} - ${existingEnd}:00`,
            requestedSlot: `${timeSlot} - ${endTime}:00`,
            conflictType: 'Time slot overlap'
          }
        };
      }
    }
    
    return { hasConflict: false };
  } catch (error) {
    console.error('Error checking time slot conflict:', error);
    return { hasConflict: true, error: error.message };
  }
};

// @desc    Get zone availability for a date
// @route   GET /api/bookings/availability/:zoneId/:date
// @access  Public
const getZoneAvailability = async (req, res) => {
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
    
    // Get existing bookings for the date
    const existingBookings = await Booking.find({
      zoneId,
      date: new Date(date),
      status: { $in: ['confirmed', 'pending'] }
    }).sort({ timeSlot: 1 });
    
    // Generate available time slots
    const startHour = parseInt(zone.operatingHours.start.split(':')[0]);
    const endHour = parseInt(zone.operatingHours.end.split(':')[0]);
    
    const availability = {};
    const availableSlots = [];
    const bookedSlots = [];
    
    // Mark all hours as available initially
    for (let hour = startHour; hour < endHour; hour++) {
      const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
      availability[timeSlot] = true;
    }
    
    // Mark booked slots as unavailable
    existingBookings.forEach(booking => {
      const bookingStart = parseInt(booking.timeSlot.split(':')[0]);
      const bookingEnd = bookingStart + booking.duration;
      
      for (let hour = bookingStart; hour < bookingEnd; hour++) {
        const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
        availability[timeSlot] = false;
        if (!bookedSlots.includes(timeSlot)) {
          bookedSlots.push(timeSlot);
        }
      }
    });
    
    // Create available slots array
    Object.keys(availability).forEach(slot => {
      if (availability[slot]) {
        availableSlots.push(slot);
      }
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
      totalBooked: bookedSlots.length
    });
    
  } catch (error) {
    console.error('❌ Error getting zone availability:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get zone availability',
      message: error.message
    });
  }
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

// @desc    Create new booking with conflict detection
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
    
    // Check for time slot conflicts
    const conflictCheck = await checkTimeSlotConflict(zoneId, date, timeSlot, duration);
    
    if (conflictCheck.hasConflict) {
      console.log('❌ Time slot conflict detected:', conflictCheck);
      
      return res.status(409).json({
        success: false,
        error: 'Time slot conflicts with existing booking',
        conflictDetails: conflictCheck.conflictDetails,
        suggestedAction: 'Please choose a different time slot',
        availabilityEndpoint: `/api/bookings/availability/${zoneId}/${date}`
      });
    }
    
    // Validate booking time is within operating hours
    const bookingHour = parseInt(timeSlot.split(':')[0]);
    const zoneStartHour = parseInt(zone.operatingHours.start.split(':')[0]);
    const zoneEndHour = parseInt(zone.operatingHours.end.split(':')[0]);
    const bookingEndHour = bookingHour + duration;
    
    if (bookingHour < zoneStartHour || bookingEndHour > zoneEndHour) {
      return res.status(400).json({
        success: false,
        error: 'Booking time is outside operating hours',
        operatingHours: zone.operatingHours,
        requestedTime: `${timeSlot} - ${bookingEndHour}:00`
      });
    }
    
    // Calculate total amount
    const totalAmount = zone.calculatePrice ? zone.calculatePrice(duration, date, timeSlot) : zone.pricePerHour * duration;
    
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
      date: new Date(date),
      timeSlot,
      duration,
      totalAmount,
      reference,
      notes,
      qrCode: JSON.stringify(qrData),
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'card'
    });
    
    await booking.save();
    
    // Update QR code with booking ID
    qrData.bookingId = booking._id.toString();
    booking.qrCode = JSON.stringify(qrData);
    await booking.save();
    
    // Update zone stats
    await GameZone.findByIdAndUpdate(zoneId, {
      $inc: { 'stats.totalBookings': 1 },
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
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Duplicate booking detected',
        message: 'A booking with these details already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create booking',
      message: error.message
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
      booking: formatBookingResponse(booking)
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
};

module.exports = {
  getUserBookings,
  getBooking,
  createBooking,
  cancelBooking,
  getBookingStats,
  getZoneAvailability
};