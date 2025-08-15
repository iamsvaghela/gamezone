// controllers/bookingController.js - Complete updated version with FCM integration
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

// Enhanced createBooking with FCM notification integration
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
    
    // 🔧 ENHANCED NOTIFICATION CREATION with FCM Push Notifications
    console.log('📢 === STARTING ENHANCED NOTIFICATION CREATION WITH FCM ===');
    
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
      
      console.log('📢 Step 1: Creating customer notification with FCM data...');
      
      // Create customer notification with enhanced FCM-ready data
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
          // FCM-specific data for role filtering
          userType: 'customer',
          notificationFor: 'customer',
          isCustomerNotification: true,
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
      
      // Use direct model creation for customer notification
      const customerNotification = new Notification(customerNotificationData);
      await customerNotification.save();
      
      console.log('✅ Customer notification created:', customerNotification._id);
      notificationResults.customerNotification = customerNotification;
      
      // Create vendor notification if vendor exists
      if (zone.vendorId && zone.vendorId._id) {
        console.log('📢 Step 2: Creating vendor notification with FCM data for:', zone.vendorId._id);
        
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
            // FCM-specific data for role filtering
            userType: 'vendor',
            notificationFor: 'business',
            isVendorNotification: true,
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
        
        const vendorNotification = new Notification(vendorNotificationData);
        await vendorNotification.save();
        
        console.log('✅ Vendor notification created:', vendorNotification._id);
        notificationResults.vendorNotification = vendorNotification;
      }
      
      // 🔧 NEW: Send FCM Push Notifications using Enhanced NotificationService
      try {
        // Send push notification to customer
        if (notificationResults.customerNotification) {
          console.log('📡 Sending FCM push notification to customer...');
          await NotificationService.sendPushNotificationToUser(userId, notificationResults.customerNotification);
        }
        
        // Send push notification to vendor
        if (notificationResults.vendorNotification && zone.vendorId) {
          console.log('📡 Sending FCM push notification to vendor...');
          await NotificationService.sendPushNotificationToUser(zone.vendorId._id, notificationResults.vendorNotification);
        }
      } catch (fcmError) {
        console.warn('⚠️ FCM Push notification failed (non-critical):', fcmError.message);
        notificationResults.errors.push(`FCM Error: ${fcmError.message}`);
        // Don't fail the booking creation for FCM notification failures
      }
      
      console.log('🎉 === ENHANCED NOTIFICATION CREATION WITH FCM COMPLETED ===');
      
    } catch (notificationError) {
      console.error('❌ === NOTIFICATION CREATION FAILED ===');
      console.error('❌ Error type:', notificationError.constructor.name);
      console.error('❌ Error message:', notificationError.message);
      console.error('❌ Error stack:', notificationError.stack);
      
      notificationResults.errors.push(notificationError.message);
      
      // Don't fail the booking creation, just log the notification error
      console.warn('⚠️ Booking created successfully but notifications failed');
    }
    
    // Return response (unchanged from original)
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

// 🔧 NEW: Enhanced NotificationService static method for FCM integration
const sendBookingNotifications = async (booking, zone, user) => {
  console.log('📢 Enhanced: Creating booking notifications with FCM...');
  
  const results = {
    customer: null,
    vendor: null,
    errors: []
  };
  
  try {
    // Import required services
    const Notification = require('../models/Notification');
    const firebaseService = require('../services/FirebaseService');
    
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
          totalAmount: booking.totalAmount,
          userType: 'customer',
          isCustomerNotification: true
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
      
      // Send FCM to customer
      const customerUser = await User.findById(booking.userId);
      if (customerUser && customerUser.fcmTokens && customerUser.fcmTokens.length > 0) {
        const customerTokens = customerUser.getActiveFCMTokens();
        if (customerTokens.length > 0) {
          const customerPayload = {
            title: customerNotification.title,
            body: customerNotification.message,
            type: customerNotification.type,
            data: customerNotification.data
          };
          await firebaseService.sendToMultipleDevices(customerTokens, customerPayload);
        }
      }
      
      console.log('✅ Enhanced: Customer notification with FCM created');
      
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
            totalAmount: booking.totalAmount,
            userType: 'vendor',
            isVendorNotification: true
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
        
        // Send FCM to vendor
        const vendorUser = await User.findById(zone.vendorId._id);
        if (vendorUser && vendorUser.fcmTokens && vendorUser.fcmTokens.length > 0) {
          const vendorTokens = vendorUser.getActiveFCMTokens();
          if (vendorTokens.length > 0) {
            const vendorPayload = {
              title: vendorNotification.title,
              body: vendorNotification.message,
              type: vendorNotification.type,
              data: vendorNotification.data
            };
            await firebaseService.sendToMultipleDevices(vendorTokens, vendorPayload);
          }
        }
        
        console.log('✅ Enhanced: Vendor notification with FCM created');
        
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
};

// 🔧 DEBUGGING: Test endpoint to verify notification creation (unchanged)
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
        timestamp: new Date().toISOString(),
        // Add FCM test data
        userType: 'customer',
        isCustomerNotification: true
      }
    };
    
    console.log('📢 Test notification data:', JSON.stringify(testData, null, 2));
    
    const notification = new Notification(testData);
    await notification.save();
    
    console.log('✅ Test notification created:', notification._id);
    
    // Verify it exists
    const verification = await Notification.findById(notification._id);
    console.log('🔍 Verification result:', verification ? 'EXISTS' : 'NOT FOUND');
    
    // Try to send FCM test notification
    try {
      await NotificationService.sendPushNotificationToUser(userId, notification);
      console.log('✅ FCM test notification sent');
    } catch (fcmError) {
      console.warn('⚠️ FCM test notification failed:', fcmError.message);
    }
    
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
  sendBookingNotifications
};