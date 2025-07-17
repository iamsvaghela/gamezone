// routes/vendor.js - Fixed action types in notifications
const express = require('express');
const { auth, vendorOnly } = require('../middleware/auth');
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const User = require('../models/User');
const NotificationService = require('../services/NotificationService');
const router = express.Router();
const Notification = require('../models/Notification');

// Apply authentication and vendor-only middleware to all routes
router.use(auth);
router.use(vendorOnly);

// @desc    Get vendor dashboard data
// @route   GET /api/vendor/dashboard
// @access  Private (Vendor only)
router.get('/dashboard', async (req, res) => {
  try {
    const vendorId = req.user.userId;
    
    // Get vendor's zones
    const zones = await GameZone.find({ vendorId }).select('_id name isActive');
    const zoneIds = zones.map(zone => zone._id);
    
    // Get booking statistics
    const bookingStats = await Booking.aggregate([
      { $match: { zoneId: { $in: zoneIds } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);
    
    // Get today's bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayBookings = await Booking.countDocuments({
      zoneId: { $in: zoneIds },
      date: { $gte: today, $lt: tomorrow }
    });
    
    // Format stats
    const stats = {
      totalZones: zones.length,
      activeZones: zones.filter(zone => zone.isActive).length,
      totalBookings: 0,
      confirmedBookings: 0,
      pendingBookings: 0,
      cancelledBookings: 0,
      totalRevenue: 0,
      todayBookings
    };
    
    bookingStats.forEach(stat => {
      stats.totalBookings += stat.count;
      stats[`${stat._id}Bookings`] = stat.count;
      if (stat._id !== 'cancelled') {
        stats.totalRevenue += stat.totalAmount;
      }
    });
    
    res.json({
      success: true,
      stats,
      zones: zones.map(zone => ({
        id: zone._id,
        name: zone.name,
        isActive: zone.isActive
      }))
    });
    
  } catch (error) {
    console.error('❌ Error fetching vendor dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      message: error.message
    });
  }
});

router.put('/bookings/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const vendorId = req.user.userId;
    
    console.log('✅ Vendor confirming booking:', id);
    
    // Find the booking
    const booking = await Booking.findById(id)
      .populate('zoneId')
      .populate('userId');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Check if booking is in pending status
    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot confirm booking with status: ${booking.status}`
      });
    }
    
    // Update booking status
    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    booking.confirmedAt = new Date();
    booking.confirmedBy = vendorId;
    
    if (message) {
      booking.notes = `${booking.notes || ''}\nVendor confirmation: ${message}`;
    }
    
    await booking.save();
    console.log('✅ Booking status updated successfully');
    
    // Create confirmation notification for customer (WITHOUT ACTIONS)
    console.log('📢 Creating customer confirmation notification...');
    
    const customerNotification = new Notification({
      userId: booking.userId._id,
      type: 'booking_confirmed',
      title: '🎉 Booking Confirmed!',
      message: `Great news! Your booking for "${booking.zoneId.name}" on ${booking.date.toLocaleDateString()} at ${booking.timeSlot} has been confirmed by the vendor.${message ? ` Message: "${message}"` : ''}`,
      priority: 'high',
      category: 'booking',
      data: {
        bookingId: booking._id.toString(),
        reference: booking.reference,
        zoneId: booking.zoneId._id.toString(),
        zoneName: booking.zoneId.name,
        date: booking.date.toISOString(),
        timeSlot: booking.timeSlot,
        duration: booking.duration,
        totalAmount: booking.totalAmount,
        status: 'confirmed',
        confirmedAt: booking.confirmedAt.toISOString(),
        vendorMessage: message || null,
        createdFrom: 'booking_confirmation',
        userType: 'customer'
      }
      // REMOVED ACTIONS TO AVOID ENUM VALIDATION ERROR
    });
    
    await customerNotification.save();
    console.log('✅ Customer confirmation notification created:', customerNotification._id);
    
    // Create confirmation notification for vendor (WITHOUT ACTIONS)
    console.log('📢 Creating vendor confirmation record...');
    
    const vendorNotification = new Notification({
      userId: vendorId,
      type: 'booking_confirmed',
      title: '✅ Booking Confirmed',
      message: `You have confirmed the booking for "${booking.zoneId.name}" requested by ${booking.userId.name}.`,
      priority: 'medium',
      category: 'booking',
      data: {
        bookingId: booking._id.toString(),
        reference: booking.reference,
        zoneId: booking.zoneId._id.toString(),
        zoneName: booking.zoneId.name,
        customerName: booking.userId.name,
        customerEmail: booking.userId.email,
        date: booking.date.toISOString(),
        timeSlot: booking.timeSlot,
        duration: booking.duration,
        totalAmount: booking.totalAmount,
        status: 'confirmed',
        confirmedAt: booking.confirmedAt.toISOString(),
        action: 'confirmed',
        createdFrom: 'booking_confirmation',
        userType: 'vendor'
      }
      // REMOVED ACTIONS TO AVOID ENUM VALIDATION ERROR
    });
    
    await vendorNotification.save();
    console.log('✅ Vendor confirmation record created:', vendorNotification._id);
    
    // Mark original vendor request notification as read
    const updateResult = await Notification.updateMany(
      {
        userId: vendorId,
        'data.bookingId': booking._id.toString(),
        type: 'booking_created'
      },
      {
        $set: { 
          isRead: true,
          readAt: new Date()
        }
      }
    );
    
    console.log('✅ Original vendor request notification marked as read:', updateResult.modifiedCount);
    
    res.json({
      success: true,
      message: 'Booking confirmed successfully',
      booking: {
        id: booking._id,
        reference: booking.reference,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        confirmedAt: booking.confirmedAt,
        customer: {
          name: booking.userId.name,
          email: booking.userId.email
        },
        zone: {
          name: booking.zoneId.name,
          location: booking.zoneId.location
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error confirming booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to confirm booking',
      message: error.message
    });
  }
});

// PUT /api/vendor/bookings/:id/decline - Decline booking (MINIMAL VERSION)
router.put('/bookings/:id/decline', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const vendorId = req.user.userId;
    
    console.log('❌ Vendor declining booking:', id);
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Decline reason is required'
      });
    }
    
    const booking = await Booking.findById(id)
      .populate('zoneId')
      .populate('userId');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot decline booking with status: ${booking.status}`
      });
    }
    
    // Update booking status
    booking.status = 'declined';
    booking.paymentStatus = 'refunded';
    booking.declinedAt = new Date();
    booking.declinedBy = vendorId;
    booking.notes = `${booking.notes || ''}\nDeclined by vendor: ${reason}`;
    
    await booking.save();
    console.log('✅ Booking status updated successfully');
    
    // Create decline notification for customer (WITHOUT ACTIONS)
    console.log('📢 Creating customer decline notification...');
    
    const customerNotification = new Notification({
      userId: booking.userId._id,
      type: 'booking_declined',
      title: '❌ Booking Declined',
      message: `Unfortunately, your booking request for "${booking.zoneId.name}" on ${booking.date.toLocaleDateString()} at ${booking.timeSlot} has been declined. Reason: ${reason}`,
      priority: 'high',
      category: 'booking',
      data: {
        bookingId: booking._id.toString(),
        reference: booking.reference,
        zoneId: booking.zoneId._id.toString(),
        zoneName: booking.zoneId.name,
        date: booking.date.toISOString(),
        timeSlot: booking.timeSlot,
        duration: booking.duration,
        totalAmount: booking.totalAmount,
        status: 'declined',
        declinedAt: booking.declinedAt.toISOString(),
        declineReason: reason,
        createdFrom: 'booking_decline',
        userType: 'customer'
      }
      // REMOVED ACTIONS TO AVOID ENUM VALIDATION ERROR
    });
    
    await customerNotification.save();
    console.log('✅ Customer decline notification created:', customerNotification._id);
    
    // Create decline notification for vendor (WITHOUT ACTIONS)
    const vendorNotification = new Notification({
      userId: vendorId,
      type: 'booking_declined',
      title: '❌ Booking Declined',
      message: `You have declined the booking for "${booking.zoneId.name}" requested by ${booking.userId.name}.`,
      priority: 'medium',
      category: 'booking',
      data: {
        bookingId: booking._id.toString(),
        reference: booking.reference,
        zoneId: booking.zoneId._id.toString(),
        zoneName: booking.zoneId.name,
        customerName: booking.userId.name,
        customerEmail: booking.userId.email,
        date: booking.date.toISOString(),
        timeSlot: booking.timeSlot,
        duration: booking.duration,
        totalAmount: booking.totalAmount,
        status: 'declined',
        declinedAt: booking.declinedAt.toISOString(),
        declineReason: reason,
        action: 'declined',
        createdFrom: 'booking_decline',
        userType: 'vendor'
      }
      // REMOVED ACTIONS TO AVOID ENUM VALIDATION ERROR
    });
    
    await vendorNotification.save();
    console.log('✅ Vendor decline record created:', vendorNotification._id);
    
    // Mark original vendor request notification as read
    const updateResult = await Notification.updateMany(
      {
        userId: vendorId,
        'data.bookingId': booking._id.toString(),
        type: 'booking_created'
      },
      {
        $set: { 
          isRead: true,
          readAt: new Date()
        }
      }
    );
    
    console.log('✅ Original vendor request notification marked as read:', updateResult.modifiedCount);
    
    res.json({
      success: true,
      message: 'Booking declined successfully',
      booking: {
        id: booking._id,
        reference: booking.reference,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        declinedAt: booking.declinedAt,
        declineReason: reason,
        customer: {
          name: booking.userId.name,
          email: booking.userId.email
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error declining booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to decline booking',
      message: error.message
    });
  }
});

// @desc    Get vendor bookings
// @route   GET /api/vendor/bookings
// @access  Private (Vendor only)
router.get('/bookings', async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { status, page = 1, limit = 20, date } = req.query;
    
    // Get vendor's zones
    const zones = await GameZone.find({ vendorId }).select('_id');
    const zoneIds = zones.map(zone => zone._id);
    
    // Build query
    const query = { zoneId: { $in: zoneIds } };
    if (status && status !== 'all') {
      query.status = status;
    }
    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(queryDate);
      nextDay.setDate(nextDay.getDate() + 1);
      query.date = { $gte: queryDate, $lt: nextDay };
    }
    
    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Fetch bookings
    const bookings = await Booking.find(query)
      .populate({
        path: 'zoneId',
        select: 'name location images'
      })
      .populate({
        path: 'userId',
        select: 'name email phone'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count
    const totalCount = await Booking.countDocuments(query);
    
    // Format bookings
    const formattedBookings = bookings.map(booking => ({
      id: booking._id,
      reference: booking.reference,
      zone: {
        id: booking.zoneId._id,
        name: booking.zoneId.name,
        location: booking.zoneId.location
      },
      customer: {
        id: booking.userId._id,
        name: booking.userId.name,
        email: booking.userId.email,
        phone: booking.userId.phone
      },
      date: booking.date,
      timeSlot: booking.timeSlot,
      duration: booking.duration,
      totalAmount: booking.totalAmount,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      notes: booking.notes,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt
    }));
    
    res.json({
      success: true,
      bookings: formattedBookings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1,
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching vendor bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bookings',
      message: error.message
    });
  }
});

// @desc    Get vendor zones
// @route   GET /api/vendor/zones
// @access  Private (Vendor only)
router.get('/zones', async (req, res) => {
  try {
    const vendorId = req.user.userId;
    
    const zones = await GameZone.find({ vendorId })
      .select('name description location pricePerHour images isActive operatingHours capacity amenities createdAt')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      zones: zones.map(zone => ({
        id: zone._id,
        name: zone.name,
        description: zone.description,
        location: zone.location,
        pricePerHour: zone.pricePerHour,
        images: zone.images,
        isActive: zone.isActive,
        operatingHours: zone.operatingHours,
        capacity: zone.capacity,
        amenities: zone.amenities,
        createdAt: zone.createdAt
      }))
    });
    
  } catch (error) {
    console.error('❌ Error fetching vendor zones:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch zones',
      message: error.message
    });
  }
});

// @desc    Update zone status
// @route   PUT /api/vendor/zones/:id/status
// @access  Private (Vendor only)
router.put('/zones/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user.userId;
    const { isActive } = req.body;
    
    const zone = await GameZone.findOne({ _id: id, vendorId });
    
    if (!zone) {
      return res.status(404).json({
        success: false,
        error: 'Zone not found'
      });
    }
    
    zone.isActive = isActive;
    await zone.save();
    
    // 📢 SEND ZONE UPDATE NOTIFICATIONS
    if (!isActive) {
      // If zone is being deactivated, notify customers with upcoming bookings
      const upcomingBookings = await Booking.find({
        zoneId: id,
        status: { $in: ['pending', 'confirmed'] },
        date: { $gte: new Date() }
      }).populate('userId');
      
      for (const booking of upcomingBookings) {
        await NotificationService.createNotification(booking.userId._id, {
          type: 'zone_update',
          category: 'zone',
          title: '⚠️ Zone Temporarily Unavailable',
          message: `${zone.name} has been temporarily deactivated. Your upcoming booking may be affected.`,
          priority: 'high',
          data: {
            zoneId: zone._id,
            zoneName: zone.name,
            bookingId: booking._id,
            reference: booking.reference,
            date: booking.date,
            timeSlot: booking.timeSlot
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
      }
    }
    
    res.json({
      success: true,
      message: `Zone ${isActive ? 'activated' : 'deactivated'} successfully`,
      zone: {
        id: zone._id,
        name: zone.name,
        isActive: zone.isActive
      }
    });
    
  } catch (error) {
    console.error('❌ Error updating zone status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update zone status',
      message: error.message
    });
  }
});

// @desc    Get vendor analytics
// @route   GET /api/vendor/analytics
// @access  Private (Vendor only)
router.get('/analytics', async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const { period = '30d' } = req.query;
    
    // Get vendor's zones
    const zones = await GameZone.find({ vendorId }).select('_id name');
    const zoneIds = zones.map(zone => zone._id);
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }
    
    // Get booking analytics
    const bookingAnalytics = await Booking.aggregate([
      {
        $match: {
          zoneId: { $in: zoneIds },
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            status: '$status'
          },
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);
    
    // Get zone performance
    const zonePerformance = await Booking.aggregate([
      {
        $match: {
          zoneId: { $in: zoneIds },
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$zoneId',
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          avgBookingValue: { $avg: '$totalAmount' }
        }
      },
      {
        $lookup: {
          from: 'gamezones',
          localField: '_id',
          foreignField: '_id',
          as: 'zone'
        }
      },
      {
        $unwind: '$zone'
      },
      {
        $project: {
          zoneName: '$zone.name',
          totalBookings: 1,
          totalRevenue: 1,
          avgBookingValue: 1
        }
      },
      {
        $sort: { totalRevenue: -1 }
      }
    ]);
    
    res.json({
      success: true,
      analytics: {
        period,
        dateRange: {
          start: startDate,
          end: endDate
        },
        bookingTrends: bookingAnalytics,
        zonePerformance,
        totalZones: zones.length,
        summary: {
          totalBookings: bookingAnalytics.reduce((sum, item) => sum + item.count, 0),
          totalRevenue: bookingAnalytics.reduce((sum, item) => sum + item.revenue, 0),
          avgBookingValue: zonePerformance.reduce((sum, item) => sum + item.avgBookingValue, 0) / zonePerformance.length || 0
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching vendor analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      message: error.message
    });
  }
});

module.exports = router;