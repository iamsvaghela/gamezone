// Fixed operating hours validation for booking routes
const express = require('express');
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const { auth, userOnly } = require('../middleware/auth');
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

module.exports = router;