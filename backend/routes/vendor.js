const express = require('express');
const Booking = require('../models/Booking');
const GameZone = require('../models/GameZone');
const { auth, vendorOnly } = require('../middleware/auth');
const router = express.Router();

// GET /api/vendor/dashboard - Vendor dashboard data
router.get('/dashboard', auth, vendorOnly, async (req, res) => {
  try {
    // Get vendor's zones
    const zones = await GameZone.find({ vendorId: req.user.userId });
    const zoneIds = zones.map(z => z._id);

    if (zoneIds.length === 0) {
      return res.json({
        stats: {
          totalZones: 0,
          totalBookings: 0,
          totalRevenue: 0,
          todayBookings: 0,
          monthlyRevenue: 0,
          averageRating: 0
        },
        recentBookings: [],
        zones: [],
        monthlyStats: []
      });
    }

    // Get all bookings for vendor's zones
    const allBookings = await Booking.find({ zoneId: { $in: zoneIds } })
      .populate('zoneId', 'name location')
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 });

    // Calculate today's bookings
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const todayBookings = allBookings.filter(booking => {
      const bookingDate = new Date(booking.date);
      return bookingDate >= startOfToday && bookingDate < endOfToday;
    });

    // Calculate monthly revenue (current month)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyBookings = allBookings.filter(booking => {
      return booking.createdAt >= startOfMonth && 
             (booking.status === 'confirmed' || booking.status === 'completed') &&
             booking.paymentStatus === 'paid';
    });

    const monthlyRevenue = monthlyBookings.reduce((sum, booking) => sum + booking.totalAmount, 0);

    // Calculate total revenue
    const paidBookings = allBookings.filter(booking => 
      (booking.status === 'confirmed' || booking.status === 'completed') &&
      booking.paymentStatus === 'paid'
    );
    const totalRevenue = paidBookings.reduce((sum, booking) => sum + booking.totalAmount, 0);

    // Calculate average rating
    const averageRating = zones.length > 0 
      ? zones.reduce((sum, zone) => sum + zone.rating, 0) / zones.length 
      : 0;

    // Get monthly stats for the last 6 months
    const monthlyStats = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const nextMonth = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
      
      const monthBookings = allBookings.filter(booking => {
        return booking.createdAt >= monthDate && 
               booking.createdAt < nextMonth &&
               (booking.status === 'confirmed' || booking.status === 'completed') &&
               booking.paymentStatus === 'paid';
      });

      monthlyStats.push({
        month: monthDate.toLocaleString('default', { month: 'short', year: 'numeric' }),
        revenue: monthBookings.reduce((sum, booking) => sum + booking.totalAmount, 0),
        bookings: monthBookings.length
      });
    }

    // Calculate stats
    const stats = {
      totalZones: zones.length,
      totalBookings: allBookings.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      todayBookings: todayBookings.length,
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
      averageRating: Math.round(averageRating * 10) / 10,
      pendingBookings: allBookings.filter(b => b.status === 'pending').length,
      completedBookings: allBookings.filter(b => b.status === 'completed').length
    };

    res.json({
      stats,
      recentBookings: allBookings.slice(0, 10),
      zones: zones.map(zone => ({
        id: zone._id,
        name: zone.name,
        location: zone.location,
        rating: zone.rating,
        pricePerHour: zone.pricePerHour,
        isActive: zone.isActive
      })),
      monthlyStats
    });

  } catch (error) {
    console.error('Error fetching vendor dashboard:', error);
    res.status(500).json({ 
      error: 'Server error fetching dashboard data' 
    });
  }
});

// GET /api/vendor/bookings - Get all bookings for vendor
router.get('/bookings', auth, vendorOnly, async (req, res) => {
  try {
    const { status, zoneId, date, page = 1, limit = 20 } = req.query;

    // Get vendor's zones
    const zones = await GameZone.find({ vendorId: req.user.userId });
    const zoneIds = zones.map(z => z._id);

    if (zoneIds.length === 0) {
      return res.json({
        bookings: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false
        }
      });
    }

    // Build query
    let query = { zoneId: { $in: zoneIds } };
    
    if (status) {
      query.status = status;
    }
    
    if (zoneId && zoneIds.some(id => id.toString() === zoneId)) {
      query.zoneId = zoneId;
    }
    
    if (date) {
      const requestedDate = new Date(date);
      const startOfDay = new Date(requestedDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(requestedDate.setHours(23, 59, 59, 999));
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const bookings = await Booking.find(query)
      .populate('zoneId', 'name location images')
      .populate('userId', 'name email phone')
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
    console.error('Error fetching vendor bookings:', error);
    res.status(500).json({ 
      error: 'Server error fetching bookings' 
    });
  }
});

// PUT /api/vendor/bookings/:id/status - Update booking status
router.put('/bookings/:id/status', auth, vendorOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const bookingId = req.params.id;

    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status. Must be: pending, confirmed, completed, or cancelled' 
      });
    }

    // Find booking and verify vendor ownership
    const booking = await Booking.findById(bookingId)
      .populate('zoneId', 'vendorId name');

    if (!booking) {
      return res.status(404).json({ 
        error: 'Booking not found' 
      });
    }

    if (booking.zoneId.vendorId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ 
        error: 'Access denied. This booking does not belong to your gaming zone.' 
      });
    }

    // Update status
    const oldStatus = booking.status;
    booking.status = status;

    if (status === 'completed') {
      booking.paymentStatus = 'paid'; // Ensure payment is marked as paid when completed
    }

    await booking.save();

    res.json({
      message: `Booking status updated from ${oldStatus} to ${status}`,
      booking: {
        id: booking._id,
        reference: booking.reference,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        updatedAt: booking.updatedAt
      }
    });

  } catch (error) {
    console.error('Error updating booking status:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid booking ID' 
      });
    }

    res.status(500).json({ 
      error: 'Server error updating booking status' 
    });
  }
});

// GET /api/vendor/analytics - Get detailed analytics
router.get('/analytics', auth, vendorOnly, async (req, res) => {
  try {
    const { period = '30days' } = req.query;

    // Get vendor's zones
    const zones = await GameZone.find({ vendorId: req.user.userId });
    const zoneIds = zones.map(z => z._id);

    if (zoneIds.length === 0) {
      return res.json({
        revenue: { total: 0, growth: 0 },
        bookings: { total: 0, growth: 0 },
        zones: { total: 0, active: 0 },
        topZones: [],
        revenueByZone: [],
        bookingTrends: []
      });
    }

    // Calculate date range
    const endDate = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '7days':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get bookings for the period
    const bookings = await Booking.find({
      zoneId: { $in: zoneIds },
      createdAt: { $gte: startDate, $lte: endDate }
    }).populate('zoneId', 'name');

    const paidBookings = bookings.filter(b => 
      (b.status === 'confirmed' || b.status === 'completed') && 
      b.paymentStatus === 'paid'
    );

    // Calculate revenue and growth
    const totalRevenue = paidBookings.reduce((sum, b) => sum + b.totalAmount, 0);
    
    // Get previous period data for growth calculation
    const previousStartDate = new Date(startDate);
    previousStartDate.setTime(previousStartDate.getTime() - (endDate.getTime() - startDate.getTime()));
    
    const previousBookings = await Booking.find({
      zoneId: { $in: zoneIds },
      createdAt: { $gte: previousStartDate, $lt: startDate },
      status: { $in: ['confirmed', 'completed'] },
      paymentStatus: 'paid'
    });

    const previousRevenue = previousBookings.reduce((sum, b) => sum + b.totalAmount, 0);
    const revenueGrowth = previousRevenue > 0 
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 
      : 0;

    const bookingGrowth = previousBookings.length > 0 
      ? ((paidBookings.length - previousBookings.length) / previousBookings.length) * 100 
      : 0;

    // Top performing zones
    const zonePerformance = zones.map(zone => {
      const zoneBookings = paidBookings.filter(b => b.zoneId._id.toString() === zone._id.toString());
      const zoneRevenue = zoneBookings.reduce((sum, b) => sum + b.totalAmount, 0);
      
      return {
        id: zone._id,
        name: zone.name,
        bookings: zoneBookings.length,
        revenue: zoneRevenue,
        averageBookingValue: zoneBookings.length > 0 ? zoneRevenue / zoneBookings.length : 0
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // Booking trends (daily data for the period)
    const bookingTrends = [];
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    for (let i = 0; i < days; i++) {
      const dayStart = new Date(startDate);
      dayStart.setDate(startDate.getDate() + i);
      dayStart.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      
      const dayBookings = paidBookings.filter(b => 
        b.createdAt >= dayStart && b.createdAt <= dayEnd
      );
      
      bookingTrends.push({
        date: dayStart.toISOString().split('T')[0],
        bookings: dayBookings.length,
        revenue: dayBookings.reduce((sum, b) => sum + b.totalAmount, 0)
      });
    }

    res.json({
      revenue: {
        total: Math.round(totalRevenue * 100) / 100,
        growth: Math.round(revenueGrowth * 10) / 10
      },
      bookings: {
        total: paidBookings.length,
        growth: Math.round(bookingGrowth * 10) / 10
      },
      zones: {
        total: zones.length,
        active: zones.filter(z => z.isActive).length
      },
      topZones: zonePerformance.slice(0, 5),
      revenueByZone: zonePerformance,
      bookingTrends
    });

  } catch (error) {
    console.error('Error fetching vendor analytics:', error);
    res.status(500).json({ 
      error: 'Server error fetching analytics' 
    });
  }
});

// GET /api/vendor/zones - Get vendor's gaming zones
router.get('/zones', auth, vendorOnly, async (req, res) => {
  try {
    const zones = await GameZone.find({ vendorId: req.user.userId })
      .sort({ createdAt: -1 });

    res.json({
      zones: zones.map(zone => ({
        id: zone._id,
        name: zone.name,
        description: zone.description,
        location: zone.location,
        amenities: zone.amenities,
        pricePerHour: zone.pricePerHour,
        images: zone.images,
        operatingHours: zone.operatingHours,
        rating: zone.rating,
        totalReviews: zone.totalReviews,
        isActive: zone.isActive,
        capacity: zone.capacity,
        createdAt: zone.createdAt
      }))
    });

  } catch (error) {
    console.error('Error fetching vendor zones:', error);
    res.status(500).json({ 
      error: 'Server error fetching gaming zones' 
    });
  }
});

module.exports = router;