// controllers/bookingController.js - Enhanced with debugging
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const User = require('../models/User');
const Notification = require('../models/Notification');
const NotificationService = require('../services/NotificationService');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Verify models are loaded at startup
console.log('🔍 BookingController loading...');
console.log('✅ Booking model:', typeof Booking);
console.log('✅ GameZone model:', typeof GameZone);
console.log('✅ User model:', typeof User);
console.log('✅ Notification model:', typeof Notification);
console.log('✅ Notification model name:', Notification ? Notification.modelName : 'NOT LOADED');

// @desc    Create new booking with notifications
// @route   POST /api/bookings
// @access  Private
const createBooking = async (req, res) => {
  console.log('🚀 createBooking function started');
  
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
    const userId = req.user.userId;
    
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
      bookingId: null,
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
      status: 'pending',
      paymentStatus: 'paid',
      paymentMethod: 'card'
    });
    
    await booking.save();
    console.log('✅ Booking saved to database:', booking._id);
    
    // Update QR code with booking ID
    qrData.bookingId = booking._id.toString();
    booking.qrCode = JSON.stringify(qrData);
    await booking.save();
    
    // Update zone stats
    await GameZone.findByIdAndUpdate(zoneId, {
      $inc: { 'stats.totalBookings': 1 },
      $set: { lastBookingAt: new Date() }
    });
    console.log('✅ Zone stats updated');
    
    // 📢 CREATE NOTIFICATIONS - WITH EXTRA DEBUGGING
    console.log('📢 === NOTIFICATION CREATION STARTING ===');
    console.log('📢 Notification model available?', !!Notification);
    console.log('📢 Notification model type:', typeof Notification);
    
    let notificationCreated = false;
    let notificationError = null;
    
    try {
      console.log('📢 Step 1: Checking if Notification model is properly loaded...');
      if (!Notification || typeof Notification !== 'function') {
        throw new Error('Notification model is not properly loaded');
      }
      
      console.log('📢 Step 2: Creating customer notification data...');
      const customerNotificationData = {
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
      };
      
      console.log('📢 Step 3: Customer notification data prepared:', JSON.stringify(customerNotificationData, null, 2));
      
      console.log('📢 Step 4: Creating Notification instance...');
      const customerNotification = new Notification(customerNotificationData);
      
      console.log('📢 Step 5: Saving customer notification to database...');
      await customerNotification.save();
      
      console.log('✅ Customer notification created successfully!');
      console.log('✅ Notification ID:', customerNotification._id);
      console.log('✅ Notification saved to collection:', customerNotification.collection.name);
      notificationCreated = true;
      
      // Verify it was saved
      console.log('📢 Step 6: Verifying notification in database...');
      const savedCheck = await Notification.findById(customerNotification._id);
      console.log('✅ Verification result:', savedCheck ? 'FOUND IN DB' : 'NOT FOUND IN DB');
      
      // Create vendor notification if vendor exists
      if (zone.vendorId && zone.vendorId._id) {
        console.log('📢 Step 7: Creating vendor notification for vendorId:', zone.vendorId._id);
        
        const vendorNotificationData = {
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
        };
        
        const vendorNotification = new Notification(vendorNotificationData);
        await vendorNotification.save();
        console.log('✅ Vendor notification created:', vendorNotification._id);
      } else {
        console.log('⚠️  No vendor found for zone, skipping vendor notification');
      }
      
      // Final check - count notifications
      console.log('📢 Step 8: Final verification...');
      const totalNotifications = await Notification.countDocuments();
      console.log('📊 Total notifications in database:', totalNotifications);
      
      console.log('🎉 === NOTIFICATION CREATION COMPLETED SUCCESSFULLY ===');
      
    } catch (error) {
      notificationError = error;
      console.error('❌ === NOTIFICATION CREATION FAILED ===');
      console.error('❌ Error type:', error.constructor.name);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Full error:', error);
      
      // Check specific MongoDB errors
      if (error.name === 'ValidationError') {
        console.error('❌ Validation errors:', error.errors);
      }
      if (error.code) {
        console.error('❌ Error code:', error.code);
      }
    }
    
    console.log('✅ Preparing response...');
    
    // Return formatted response
    const response = {
      success: true,
      message: 'Booking created successfully! Vendor will confirm shortly.',
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
      },
      _debug: {
        notificationCreated,
        notificationError: notificationError ? notificationError.message : null
      }
    };
    
    console.log('✅ Sending response...');
    res.status(201).json(response);
    console.log('✅ Response sent successfully');
    
  } catch (error) {
    console.error('❌ Error creating booking:', error);
    console.error('❌ Error stack:', error.stack);
    
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

// ... rest of your controller functions remain the same

module.exports = {
  getUserBookings,
  getBooking,
  createBooking,
  cancelBooking,
  getBookingStats,
  getZoneAvailability
};