const express = require('express');
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const { auth, userOnly } = require('../middleware/auth');
const router = express.Router();

// GET /api/bookings/availability/:zoneId/:date - Get zone availability for a specific date
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
        status: booking.status
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

// POST /api/bookings - Create new booking (Enhanced with better conflict detection)
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

    // Check if time slot is within operating hours
    const [bookingHour] = timeSlot.split(':').map(Number);
    const [startHour] = zone.operatingHours.start.split(':').map(Number);
    const [endHour] = zone.operatingHours.end.split(':').map(Number);
    
    if (bookingHour < startHour || bookingHour + duration > endHour) {
      return res.status(400).json({ 
        success: false,
        error: `Booking time must be within operating hours: ${zone.operatingHours.start} - ${zone.operatingHours.end}`,
        operatingHours: zone.operatingHours,
        requestedTime: `${timeSlot} - ${(bookingHour + duration).toString().padStart(2, '0')}:00`
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
    const requestedStart = bookingHour;
    const requestedEnd = bookingHour + duration;
    
    const conflictingBooking = conflictingBookings.find(booking => {
      const existingStart = parseInt(booking.timeSlot.split(':')[0]);
      const existingEnd = existingStart + booking.duration;
      
      // Check for overlap
      return (requestedStart < existingEnd && requestedEnd > existingStart);
    });

    if (conflictingBooking) {
      const existingStart = parseInt(conflictingBooking.timeSlot.split(':')[0]);
      const existingEnd = existingStart + conflictingBooking.duration;
      
      console.log('❌ Time slot conflict detected:', {
        requested: `${requestedStart}:00 - ${requestedEnd}:00`,
        existing: `${existingStart}:00 - ${existingEnd}:00`,
        conflictingBookingId: conflictingBooking._id
      });
      
      return res.status(409).json({ 
        success: false,
        error: 'Time slot conflicts with existing booking',
        conflictDetails: {
          requestedSlot: `${timeSlot} - ${requestedEnd.toString().padStart(2, '0')}:00`,
          existingSlot: `${conflictingBooking.timeSlot} - ${existingEnd.toString().padStart(2, '0')}:00`,
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
      status: 'confirmed', // Set to confirmed for now (in real app, this would be 'pending' until payment)
      paymentStatus: 'paid', // Mock payment success
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

    console.log('✅ Booking created successfully:', booking._id);

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

// GET /api/bookings - Get user's bookings (Enhanced with better formatting)
router.get('/', auth, userOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    console.log('📅 Fetching bookings for user:', req.user.userId);

    // Build query
    let query = { userId: req.user.userId };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const bookings = await Booking.find(query)
      .populate('zoneId', 'name location images pricePerHour rating totalReviews')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await Booking.countDocuments(query);

    console.log(`✅ Found ${bookings.length} bookings for user ${req.user.userId}`);

    // Format bookings with enhanced error handling
    const formattedBookings = bookings.map(booking => {
      // Handle case where zone might be deleted
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

      // Safely parse QR code
      let qrCodeData = null;
      try {
        qrCodeData = booking.qrCode ? JSON.parse(booking.qrCode) : null;
      } catch (error) {
        console.warn('Failed to parse QR code for booking:', booking._id);
        qrCodeData = booking.qrCode;
      }

      return {
        ...booking,
        qrCode: qrCodeData
      };
    });

    res.json({
      success: true,
      bookings: formattedBookings,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalItems: total,
        hasNext: skip + bookings.length < total,
        hasPrev: Number(page) > 1,
        limit: Number(limit)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching bookings:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching bookings',
      message: error.message
    });
  }
});

// GET /api/bookings/stats - Get user booking statistics
router.get('/stats', auth, userOnly, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get booking statistics
    const stats = await Booking.aggregate([
      { $match: { userId: userId } },
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

// GET /api/bookings/:id - Get specific booking
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('zoneId', 'name location images pricePerHour rating operatingHours')
      .populate('userId', 'name email phone');

    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: 'Booking not found' 
      });
    }

    // Check if user owns this booking or is the vendor
    const zone = await GameZone.findById(booking.zoneId);
    const isOwner = booking.userId._id.toString() === req.user.userId.toString();
    const isVendor = zone && zone.vendorId && zone.vendorId.toString() === req.user.userId.toString();

    if (!isOwner && !isVendor) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    // Parse QR code safely
    let qrCodeData = null;
    try {
      qrCodeData = booking.qrCode ? JSON.parse(booking.qrCode) : null;
    } catch (error) {
      console.warn('Failed to parse QR code for booking:', booking._id);
      qrCodeData = booking.qrCode;
    }

    res.json({
      success: true,
      booking: {
        id: booking._id,
        reference: booking.reference,
        zone: booking.zoneId,
        user: isVendor ? booking.userId : undefined, // Only show user details to vendor
        date: booking.date,
        timeSlot: booking.timeSlot,
        duration: booking.duration,
        totalAmount: booking.totalAmount,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        qrCode: qrCodeData,
        notes: booking.notes,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        canBeCancelled: booking.canBeCancelled ? booking.canBeCancelled() : false
      }
    });

  } catch (error) {
    console.error('❌ Error fetching booking:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid booking ID' 
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Server error fetching booking',
      message: error.message
    });
  }
});

// PUT /api/bookings/:id/cancel - Cancel booking (Enhanced with better validation)
router.put('/:id/cancel', auth, userOnly, async (req, res) => {
  try {
    const { cancellationReason } = req.body;

    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user.userId
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

    // Check if booking can be cancelled (enhanced validation)
    const canCancel = booking.canBeCancelled ? booking.canBeCancelled() : true;
    
    if (!canCancel) {
      const bookingDate = new Date(booking.date);
      const now = new Date();
      const hoursUntilBooking = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      return res.status(400).json({ 
        success: false,
        error: 'Cannot cancel booking less than 24 hours before start time',
        hoursRemaining: Math.round(hoursUntilBooking * 100) / 100
      });
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.paymentStatus = 'refunded'; // Mock refund
    booking.cancellationReason = cancellationReason;
    booking.cancelledAt = new Date();

    await booking.save();

    // Update zone stats
    await GameZone.findByIdAndUpdate(booking.zoneId, {
      $inc: { 
        'stats.cancelledBookings': 1,
        cancelledBookings: 1 // For backward compatibility
      }
    });

    console.log('✅ Booking cancelled successfully:', booking._id);

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking: {
        id: booking._id,
        reference: booking.reference,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        cancelledAt: booking.cancelledAt,
        cancellationReason: booking.cancellationReason
      }
    });

  } catch (error) {
    console.error('❌ Error cancelling booking:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid booking ID' 
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Server error cancelling booking',
      message: error.message
    });
  }
});

module.exports = router;