const express = require('express');
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const { auth, userOnly } = require('../middleware/auth');
const router = express.Router();

// POST /api/bookings - Create new booking
router.post('/', auth, userOnly, async (req, res) => {
  try {
    const { zoneId, date, timeSlot, duration, notes } = req.body;
    
    // Validate required fields
    if (!zoneId || !date || !timeSlot || !duration) {
      return res.status(400).json({ 
        error: 'Zone ID, date, time slot, and duration are required' 
      });
    }

    // Get zone details
    const zone = await GameZone.findById(zoneId);
    if (!zone) {
      return res.status(404).json({ 
        error: 'Gaming zone not found' 
      });
    }

    if (!zone.isActive) {
      return res.status(400).json({ 
        error: 'Gaming zone is not available for booking' 
      });
    }

    // Validate booking date (must be today or future)
    const bookingDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (bookingDate < today) {
      return res.status(400).json({ 
        error: 'Cannot book for past dates' 
      });
    }

    // Validate time slot format
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeSlot)) {
      return res.status(400).json({ 
        error: 'Invalid time slot format. Use HH:MM' 
      });
    }

    // Validate duration
    if (duration < 1 || duration > 8) {
      return res.status(400).json({ 
        error: 'Duration must be between 1 and 8 hours' 
      });
    }

    // Check if time slot is within operating hours
    const [bookingHour] = timeSlot.split(':').map(Number);
    const [startHour] = zone.operatingHours.start.split(':').map(Number);
    const [endHour] = zone.operatingHours.end.split(':').map(Number);
    
    if (bookingHour < startHour || bookingHour + duration > endHour) {
      return res.status(400).json({ 
        error: `Booking time must be within operating hours: ${zone.operatingHours.start} - ${zone.operatingHours.end}` 
      });
    }

    // Check for conflicts with existing bookings
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

    // Check for time conflicts
    const hasConflict = conflictingBookings.some(booking => {
      const existingStart = parseInt(booking.timeSlot.split(':')[0]);
      const existingEnd = existingStart + booking.duration;
      const requestedStart = bookingHour;
      const requestedEnd = bookingHour + duration;
      
      return (requestedStart < existingEnd && requestedEnd > existingStart);
    });

    if (hasConflict) {
      return res.status(409).json({ 
        error: 'Time slot conflicts with existing booking' 
      });
    }

    // Calculate total amount
    const totalAmount = zone.pricePerHour * duration;

    // Create booking
    const booking = new Booking({
      userId: req.user.userId,
      zoneId,
      date: bookingDate,
      timeSlot,
      duration,
      totalAmount,
      status: 'confirmed', // Set to confirmed for now (in real app, this would be 'pending' until payment)
      paymentStatus: 'paid', // Mock payment success
      notes,
      qrCode: JSON.stringify({
        bookingId: null, // Will be set after save
        zoneId,
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
    
    // Populate zone details for response
    await booking.populate('zoneId', 'name location images pricePerHour');

    res.status(201).json({
      message: 'Booking created successfully',
      booking: {
        id: booking._id,
        reference: booking.reference,
        zone: {
          id: booking.zoneId._id,
          name: booking.zoneId.name,
          location: booking.zoneId.location,
          image: booking.zoneId.images[0]
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
    console.error('Error creating booking:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors 
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({ 
        error: 'This time slot is already booked' 
      });
    }

    res.status(500).json({ 
      error: 'Server error creating booking' 
    });
  }
});

// GET /api/bookings - Get user's bookings
router.get('/', auth, userOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    // Build query
    let query = { userId: req.user.userId };
    
    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const bookings = await Booking.find(query)
      .populate('zoneId', 'name location images pricePerHour rating')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Booking.countDocuments(query);

    res.json({
      bookings,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalItems: total,
        hasNext: skip + bookings.length < total,
        hasPrev: Number(page) > 1
      }
    });

  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ 
      error: 'Server error fetching bookings' 
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
        error: 'Booking not found' 
      });
    }

    // Check if user owns this booking or is the vendor
    const zone = await GameZone.findById(booking.zoneId);
    const isOwner = booking.userId._id.toString() === req.user.userId.toString();
    const isVendor = zone && zone.vendorId.toString() === req.user.userId.toString();

    if (!isOwner && !isVendor) {
      return res.status(403).json({ 
        error: 'Access denied' 
      });
    }

    res.json({
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
        qrCode: booking.qrCode,
        notes: booking.notes,
        createdAt: booking.createdAt,
        canBeCancelled: booking.canBeCancelled()
      }
    });

  } catch (error) {
    console.error('Error fetching booking:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid booking ID' 
      });
    }

    res.status(500).json({ 
      error: 'Server error fetching booking' 
    });
  }
});

// PUT /api/bookings/:id/cancel - Cancel booking
router.put('/:id/cancel', auth, userOnly, async (req, res) => {
  try {
    const { cancellationReason } = req.body;

    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!booking) {
      return res.status(404).json({ 
        error: 'Booking not found' 
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ 
        error: 'Booking is already cancelled' 
      });
    }

    if (booking.status === 'completed') {
      return res.status(400).json({ 
        error: 'Cannot cancel completed booking' 
      });
    }

    if (!booking.canBeCancelled()) {
      return res.status(400).json({ 
        error: 'Cannot cancel booking less than 2 hours before start time' 
      });
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.cancellationReason = cancellationReason;
    booking.cancelledAt = new Date();

    await booking.save();

    res.json({
      message: 'Booking cancelled successfully',
      booking: {
        id: booking._id,
        reference: booking.reference,
        status: booking.status,
        cancelledAt: booking.cancelledAt,
        cancellationReason: booking.cancellationReason
      }
    });

  } catch (error) {
    console.error('Error cancelling booking:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid booking ID' 
      });
    }

    res.status(500).json({ 
      error: 'Server error cancelling booking' 
    });
  }
});

module.exports = router;