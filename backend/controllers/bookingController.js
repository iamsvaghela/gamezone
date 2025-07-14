// controllers/bookingController.js - FIXED VERSION
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const User = require('../models/User');
const NotificationService = require('../services/NotificationService');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Import Notification model at the top with error handling
let Notification;
try {
  Notification = require('../models/Notification');
  console.log('✅ BookingController: Notification model loaded successfully');
} catch (error) {
  console.error('❌ BookingController: Failed to load Notification model:', error);
}

// Enhanced createBooking with FIXED notification creation
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
    
    console.log('🔄 Creating booking:', { zoneId, date, timeSlot, duration, userId });
    
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
    
    // [Previous validation logic remains the same...]
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
    
    // 🔧 FIXED NOTIFICATION CREATION - Use direct model creation instead of service
    console.log('📢 === STARTING NOTIFICATION CREATION (FIXED VERSION) ===');
    
    let notificationResults = {
      customerNotification: null,
      vendorNotification: null,
      errors: []
    };
    
    try {
      // Verify Notification model is available
      if (!Notification) {
        throw new Error('Notification model not loaded');
      }
      
      console.log('📢 Step 1: Creating customer notification...');
      
      // Create customer notification DIRECTLY with the model
      const customerNotificationData = {
        userId: new mongoose.Types.ObjectId(userId),
        type: 'booking_created',
        title: '🎮 Booking Created Successfully!',
        message: `Your booking for ${zone.name} on ${new Date(date).toLocaleDateString()} at ${timeSlot} has been created and is pending confirmation.`,
        priority: 'medium',
        category: 'booking',
        data: {
          bookingId: booking._id.toString(),
          reference: booking.reference,
          zoneId: booking.zoneId.toString(),
          zoneName: zone.name,
          date: new Date(date).toISOString(),
          timeSlot: booking.timeSlot,
          duration: booking.duration,
          totalAmount: booking.totalAmount,
          status: booking.status,
          customerName: user.name,
          createdFrom: 'booking_creation'
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
      
      console.log('📢 Customer notification data:', JSON.stringify(customerNotificationData, null, 2));
      
      // Use direct model creation
      const customerNotification = new Notification(customerNotificationData);
      await customerNotification.save();
      
      console.log('✅ Customer notification created:', customerNotification._id);
      notificationResults.customerNotification = customerNotification;
      
      // Verify it was saved
      const customerCheck = await Notification.findById(customerNotification._id);
      console.log('🔍 Customer notification verification:', customerCheck ? 'FOUND' : 'NOT FOUND');
      
      // Create vendor notification if vendor exists
      if (zone.vendorId && zone.vendorId._id) {
        console.log('📢 Step 2: Creating vendor notification for:', zone.vendorId._id);
        
        const vendorNotificationData = {
          userId: new mongoose.Types.ObjectId(zone.vendorId._id),
          type: 'booking_created',
          title: '📋 New Booking Request',
          message: `${user.name} has requested to book ${zone.name} on ${new Date(date).toLocaleDateString()} at ${timeSlot}.`,
          priority: 'high',
          category: 'booking',
          data: {
            bookingId: booking._id.toString(),
            reference: booking.reference,
            zoneId: booking.zoneId.toString(),
            zoneName: zone.name,
            customerName: user.name,
            customerEmail: user.email,
            date: new Date(date).toISOString(),
            timeSlot: booking.timeSlot,
            duration: booking.duration,
            totalAmount: booking.totalAmount,
            status: booking.status,
            createdFrom: 'booking_creation'
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
        
        console.log('📢 Vendor notification data:', JSON.stringify(vendorNotificationData, null, 2));
        
        const vendorNotification = new Notification(vendorNotificationData);
        await vendorNotification.save();
        
        console.log('✅ Vendor notification created:', vendorNotification._id);
        notificationResults.vendorNotification = vendorNotification;
        
        // Verify it was saved
        const vendorCheck = await Notification.findById(vendorNotification._id);
        console.log('🔍 Vendor notification verification:', vendorCheck ? 'FOUND' : 'NOT FOUND');
      }
      
      // Final verification - count all notifications
      const totalNotifications = await Notification.countDocuments();
      console.log('📊 Total notifications in database after creation:', totalNotifications);
      
      // Try to use NotificationService for real-time and push notifications (non-blocking)
      try {
        if (notificationResults.customerNotification) {
          console.log('📡 Attempting real-time notification for customer...');
          await NotificationService.sendRealTimeNotification(notificationResults.customerNotification);
          await NotificationService.sendPushNotificationToUser(userId, notificationResults.customerNotification);
        }
        
        if (notificationResults.vendorNotification && zone.vendorId) {
          console.log('📡 Attempting real-time notification for vendor...');
          await NotificationService.sendRealTimeNotification(notificationResults.vendorNotification);
          await NotificationService.sendPushNotificationToUser(zone.vendorId._id, notificationResults.vendorNotification);
        }
      } catch (realtimeError) {
        console.warn('⚠️ Real-time/Push notification failed (non-critical):', realtimeError.message);
        // Don't fail the booking creation for real-time notification failures
      }
      
      console.log('🎉 === NOTIFICATION CREATION COMPLETED SUCCESSFULLY ===');
      
    } catch (notificationError) {
      console.error('❌ === NOTIFICATION CREATION FAILED ===');
      console.error('❌ Error type:', notificationError.constructor.name);
      console.error('❌ Error message:', notificationError.message);
      console.error('❌ Error stack:', notificationError.stack);
      
      notificationResults.errors.push(notificationError.message);
      
      // Don't fail the booking creation, just log the notification error
      console.warn('⚠️ Booking created successfully but notifications failed');
    }
    
    // Return response
    console.log('✅ Preparing response...');
    
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
      notifications: {
        created: {
          customer: !!notificationResults.customerNotification,
          vendor: !!notificationResults.vendorNotification
        },
        customerNotificationId: notificationResults.customerNotification?._id,
        vendorNotificationId: notificationResults.vendorNotification?._id,
        errors: notificationResults.errors
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

// 🔧 ALTERNATIVE: Enhanced NotificationService method for booking creation
class EnhancedNotificationService extends NotificationService {
  
  static async createBookingNotifications(booking, zone, user) {
    console.log('📢 Enhanced: Creating booking notifications...');
    
    const results = {
      customer: null,
      vendor: null,
      errors: []
    };
    
    try {
      // Import Notification model
      const Notification = require('../models/Notification');
      
      // Create customer notification
      try {
        const customerData = {
          userId: new mongoose.Types.ObjectId(booking.userId),
          type: 'booking_created',
          title: '🎮 Booking Created!',
          message: `Your booking for ${zone.name} on ${booking.date.toLocaleDateString()} at ${booking.timeSlot} is pending confirmation.`,
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
            totalAmount: booking.totalAmount
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
        
        const customerNotification = new Notification(customerData);
        await customerNotification.save();
        results.customer = customerNotification;
        
        console.log('✅ Enhanced: Customer notification created');
        
      } catch (customerError) {
        console.error('❌ Enhanced: Customer notification failed:', customerError);
        results.errors.push(`Customer notification: ${customerError.message}`);
      }
      
      // Create vendor notification
      if (zone.vendorId) {
        try {
          const vendorData = {
            userId: new mongoose.Types.ObjectId(zone.vendorId._id),
            type: 'booking_created',
            title: '📋 New Booking Request',
            message: `${user.name} wants to book ${zone.name} on ${booking.date.toLocaleDateString()} at ${booking.timeSlot}.`,
            priority: 'high',
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
              totalAmount: booking.totalAmount
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
          
          const vendorNotification = new Notification(vendorData);
          await vendorNotification.save();
          results.vendor = vendorNotification;
          
          console.log('✅ Enhanced: Vendor notification created');
          
        } catch (vendorError) {
          console.error('❌ Enhanced: Vendor notification failed:', vendorError);
          results.errors.push(`Vendor notification: ${vendorError.message}`);
        }
      }
      
      return results;
      
    } catch (error) {
      console.error('❌ Enhanced: Booking notifications failed:', error);
      results.errors.push(`General error: ${error.message}`);
      return results;
    }
  }
}

// 🔧 DEBUGGING: Add a test endpoint to verify notification creation
const testNotificationCreation = async (req, res) => {
  try {
    console.log('🧪 Testing notification creation...');
    
    const userId = req.user.userId;
    const Notification = require('../models/Notification');
    
    console.log('📢 Creating test notification with model...');
    
    const testData = {
      userId: new mongoose.Types.ObjectId(userId),
      type: 'booking_created',
      title: 'Test Booking Notification',
      message: 'This is a test booking notification created from booking controller',
      priority: 'medium',
      category: 'booking',
      data: {
        testNotification: true,
        createdFrom: 'booking_controller_test',
        timestamp: new Date().toISOString()
      }
    };
    
    console.log('📢 Test notification data:', JSON.stringify(testData, null, 2));
    
    const notification = new Notification(testData);
    await notification.save();
    
    console.log('✅ Test notification created:', notification._id);
    
    // Verify it exists
    const verification = await Notification.findById(notification._id);
    console.log('🔍 Verification result:', verification ? 'EXISTS' : 'NOT FOUND');
    
    res.json({
      success: true,
      message: 'Test notification created successfully',
      notification: {
        id: notification._id,
        title: notification.title,
        createdAt: notification.createdAt
      },
      verified: !!verification
    });
    
  } catch (error) {
    console.error('❌ Test notification creation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Test notification creation failed',
      message: error.message,
      stack: error.stack
    });
  }
};

module.exports = {
  createBooking,
  testNotificationCreation,
  EnhancedNotificationService
};