// controllers/bookingController.js - Updated with full notification integration
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const User = require('../models/User');
const NotificationService = require('../services/NotificationService');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const FirebaseService = require('../services/FirebaseService');
const Notification = require('../models/Notification');


// @desc    Create new booking with notifications
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
    const userId = req.user.userId; // Updated to use userId from token
    
    console.log('🔄 Creating booking with notifications:', { zoneId, date, timeSlot, duration, userId });
    
    // Verify zone exists and is active
    const zone = await GameZone.findById(zoneId).populate('vendorId');
    if (!zone || !zone.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Gaming zone not found or inactive'
      });
    }
    
    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
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
      date: new Date(date),
      timeSlot,
      duration,
      totalAmount,
      reference,
      notes,
      qrCode: JSON.stringify(qrData),
      status: 'pending', // Set as pending, vendor will confirm
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
    
    console.log('📢 Starting safe notification creation...');
    // 📢 SEND NOTIFICATIONS - FIXED VERSION
    console.log('📢 Creating booking notifications...');
    
    try {
      // Create customer notification
      const customerNotification = new Notification({
        userId: userId,
        type: 'booking_created',
        title: 'Booking Created Successfully',
        message: `Your booking for ${zone.name} on ${new Date(date).toLocaleDateString()} at ${timeSlot} has been created and is pending confirmation.`,
        priority: 'medium',
        category: 'booking',
        data: {
          bookingId: booking._id.toString(),
          reference: booking.reference,
          zoneId: booking.zoneId.toString(),
          zoneName: zone.name,
          date: booking.date,
          timeSlot: booking.timeSlot,
          duration: booking.duration,
          totalAmount: booking.totalAmount,
          testNotification: false,
          timestamp: new Date().toISOString()
        },
        actions: [
          {
            type: 'view',
            label: 'View Booking',
            endpoint: `/api/bookings/${booking._id}`,
            method: 'GET'
          }
        ]
      });
      
      await customerNotification.save();
      console.log('✅ Customer notification created:', customerNotification._id);
      
      // Create vendor notification if vendor exists
      if (zone.vendorId && zone.vendorId._id) {
        const vendorNotification = new Notification({
          userId: zone.vendorId._id,
          type: 'booking_created',
          title: 'New Booking Request',
          message: `${user.name} wants to book ${zone.name} on ${new Date(date).toLocaleDateString()} at ${timeSlot}.`,
          priority: 'high',
          category: 'booking',
          data: {
            bookingId: booking._id.toString(),
            reference: booking.reference,
            zoneId: booking.zoneId.toString(),
            zoneName: zone.name,
            customerName: user.name,
            customerEmail: user.email,
            date: booking.date,
            timeSlot: booking.timeSlot,
            duration: booking.duration,
            totalAmount: booking.totalAmount,
            amount: booking.totalAmount,
            time: booking.timeSlot,
            testNotification: false,
            timestamp: new Date().toISOString()
          },
          actions: [
            {
              type: 'confirm',
              label: 'Confirm Booking',
              endpoint: `/api/vendor/bookings/${booking._id}/confirm`,
              method: 'PUT'
            },
            {
              type: 'decline',
              label: 'Decline Booking',
              endpoint: `/api/vendor/bookings/${booking._id}/decline`,
              method: 'PUT'
            }
          ]
        });
        
        await vendorNotification.save();
        console.log('✅ Vendor notification created:', vendorNotification._id);
      }
      
      console.log('🎉 All booking notifications created successfully');
      
    } catch (notificationError) {
      console.error('❌ Error creating booking notifications:', notificationError);
      console.error('Error details:', {
        name: notificationError.name,
        message: notificationError.message,
        stack: notificationError.stack
      });
      // Don't fail the booking creation if notifications fail
    }

// @desc    Cancel booking with notifications
// @route   PUT /api/bookings/:id/cancel
// @access  Private
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;
    const userId = req.user.userId;
    
    console.log('❌ Cancelling booking with notifications:', id, 'for user:', userId);
    
    const booking = await Booking.findOne({ _id: id, userId }).populate('zoneId');
    
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
    
    // Check if cancellation is allowed (2 hours before)
    const bookingDate = new Date(booking.date);
    const [hours, minutes] = booking.timeSlot.split(':').map(Number);
    bookingDate.setHours(hours, minutes, 0, 0);
    
    const now = new Date();
    const timeDiff = bookingDate.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    if (hoursDiff < 2) {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel booking less than 2 hours before start time',
        hoursRemaining: Math.round(hoursDiff * 100) / 100
      });
    }
    
    // Update booking status
    booking.status = 'cancelled';
    booking.paymentStatus = 'refunded';
    booking.cancelledAt = new Date();
    if (cancellationReason) {
      booking.cancellationReason = cancellationReason;
    }
    
    await booking.save();
    
    // Update zone stats
    await GameZone.findByIdAndUpdate(booking.zoneId, {
      $inc: { 'stats.cancelledBookings': 1 }
    });
    
    // 📢 SEND CANCELLATION NOTIFICATIONS
    console.log('📢 Sending cancellation notifications...');
    
    try {
      // Use the enhanced notification service method
      await NotificationService.handleBookingCancelled(booking, 'customer');
      
      console.log('✅ Cancellation notifications sent');
      
    } catch (notificationError) {
      console.error('❌ Error sending cancellation notifications:', notificationError);
    }
    
    console.log('✅ Booking cancelled successfully:', booking._id);
    
    res.json({
      success: true,
      message: 'Booking cancelled successfully. Refund will be processed within 3-5 business days.',
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
    cancellationReason: bookingObj.cancellationReason,
    paymentMethod: bookingObj.paymentMethod,
    createdAt: bookingObj.createdAt,
    updatedAt: bookingObj.updatedAt,
    cancelledAt: bookingObj.cancelledAt
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
    const userId = req.user.userId;
    const { status, page = 1, limit = 10 } = req.query;
    
    console.log('📅 Fetching bookings for user:', userId);
    
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
};

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
const getBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    console.log('📋 Fetching booking:', id, 'for user:', userId);
    
    const booking = await Booking.findOne({ _id: id, userId: new mongoose.Types.ObjectId(userId) })
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
    const [hours, minutes] = booking.timeSlot.split(':').map(Number);
    bookingDate.setHours(hours, minutes, 0, 0);
    
    const now = new Date();
    const timeDiff = bookingDate.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    const formattedBooking = {
      ...formatBookingResponse(booking),
      canBeCancelled: canBeCancelled && hoursDiff > 2 // Can cancel if more than 2 hours away
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

// @desc    Get booking statistics
// @route   GET /api/bookings/stats
// @access  Private
const getBookingStats = async (req, res) => {
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
};

module.exports = {
  getUserBookings,
  getBooking,
  createBooking,
  cancelBooking,
  getBookingStats,
  getZoneAvailability
};