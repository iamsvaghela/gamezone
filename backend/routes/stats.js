// routes/stats.js - Complete stats endpoints
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Try to import models (with fallback)
let User, GameZone, Booking;
try {
  User = require('../models/User');
  GameZone = require('../models/GameZone');
  Booking = require('../models/Booking');
} catch (error) {
  console.warn('⚠️  Some models not available for stats:', error.message);
}

// 🔧 GET /api/stats/app - Application statistics
router.get('/app', async (req, res) => {
  try {
    console.log('📊 Getting app statistics...');
    
    // Use Promise.allSettled to handle missing models gracefully
    const results = await Promise.allSettled([
      GameZone ? GameZone.countDocuments({ isActive: true }) : Promise.resolve(0),
      User ? User.countDocuments() : Promise.resolve(0),
      Booking ? Booking.countDocuments() : Promise.resolve(0),
      GameZone ? GameZone.countDocuments({ isActive: true }) : Promise.resolve(0)
    ]);
    
    // Extract results (use 0 if failed)
    const gameZonesCount = results[0].status === 'fulfilled' ? results[0].value : 0;
    const usersCount = results[1].status === 'fulfilled' ? results[1].value : 0;
    const bookingsCount = results[2].status === 'fulfilled' ? results[2].value : 0;
    const activeZonesCount = results[3].status === 'fulfilled' ? results[3].value : 0;
    
    console.log('✅ App stats retrieved:', {
      gameZonesCount,
      usersCount,
      bookingsCount,
      activeZonesCount
    });
    
    res.json({
      success: true,
      totalGameZones: gameZonesCount,
      totalUsers: usersCount,
      totalBookings: bookingsCount,
      activeZones: activeZonesCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting app stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get app statistics',
      message: error.message 
    });
  }
});

// 🔧 ADDED: GET /api/stats/users - User statistics (this was missing!)
router.get('/users', async (req, res) => {
  try {
    console.log('👥 Getting user statistics...');
    
    if (!User) {
      return res.status(503).json({
        success: false,
        error: 'User model not available',
        totalUsers: 0
      });
    }
    
    const results = await Promise.allSettled([
      User.countDocuments(),
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'vendor' }),
      User.countDocuments({ isActive: true })
    ]);
    
    const totalUsers = results[0].status === 'fulfilled' ? results[0].value : 0;
    const regularUsers = results[1].status === 'fulfilled' ? results[1].value : 0;
    const vendors = results[2].status === 'fulfilled' ? results[2].value : 0;
    const activeUsers = results[3].status === 'fulfilled' ? results[3].value : 0;
    
    console.log('✅ User stats retrieved:', {
      totalUsers,
      regularUsers,
      vendors,
      activeUsers
    });
    
    res.json({
      success: true,
      totalUsers,
      regularUsers,
      vendors,
      activeUsers,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting user stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user statistics',
      message: error.message,
      totalUsers: 0
    });
  }
});

// 🔧 ADDED: GET /api/stats/bookings - Booking statistics
router.get('/bookings', async (req, res) => {
  try {
    console.log('📅 Getting booking statistics...');
    
    if (!Booking) {
      return res.status(503).json({
        success: false,
        error: 'Booking model not available',
        totalBookings: 0
      });
    }
    
    const results = await Promise.allSettled([
      Booking.countDocuments(),
      Booking.countDocuments({ status: 'confirmed' }),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.countDocuments({ status: 'completed' })
    ]);
    
    const totalBookings = results[0].status === 'fulfilled' ? results[0].value : 0;
    const confirmedBookings = results[1].status === 'fulfilled' ? results[1].value : 0;
    const pendingBookings = results[2].status === 'fulfilled' ? results[2].value : 0;
    const cancelledBookings = results[3].status === 'fulfilled' ? results[3].value : 0;
    const completedBookings = results[4].status === 'fulfilled' ? results[4].value : 0;
    
    console.log('✅ Booking stats retrieved:', {
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      completedBookings
    });
    
    res.json({
      success: true,
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      completedBookings,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting booking stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get booking statistics',
      message: error.message,
      totalBookings: 0
    });
  }
});

// 🔧 ADDED: GET /api/stats/gamezones - GameZone statistics
router.get('/gamezones', async (req, res) => {
  try {
    console.log('🎮 Getting game zone statistics...');
    
    if (!GameZone) {
      return res.status(503).json({
        success: false,
        error: 'GameZone model not available',
        totalGameZones: 0
      });
    }
    
    const results = await Promise.allSettled([
      GameZone.countDocuments(),
      GameZone.countDocuments({ isActive: true }),
      GameZone.countDocuments({ isActive: false })
    ]);
    
    const totalGameZones = results[0].status === 'fulfilled' ? results[0].value : 0;
    const activeGameZones = results[1].status === 'fulfilled' ? results[1].value : 0;
    const inactiveGameZones = results[2].status === 'fulfilled' ? results[2].value : 0;
    
    console.log('✅ GameZone stats retrieved:', {
      totalGameZones,
      activeGameZones,
      inactiveGameZones
    });
    
    res.json({
      success: true,
      totalGameZones,
      activeGameZones,
      inactiveGameZones,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting game zone stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get game zone statistics',
      message: error.message,
      totalGameZones: 0
    });
  }
});

// 🔧 ADDED: GET /api/stats/dashboard - Combined dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    console.log('📊 Getting dashboard statistics...');
    
    // Get all stats in parallel
    const [appStats, userStats, bookingStats, gameZoneStats] = await Promise.allSettled([
      // App stats
      Promise.allSettled([
        GameZone ? GameZone.countDocuments({ isActive: true }) : Promise.resolve(0),
        User ? User.countDocuments() : Promise.resolve(0),
        Booking ? Booking.countDocuments() : Promise.resolve(0)
      ]),
      // User stats
      User ? Promise.allSettled([
        User.countDocuments(),
        User.countDocuments({ role: 'user' }),
        User.countDocuments({ role: 'vendor' })
      ]) : Promise.resolve([{value: 0}, {value: 0}, {value: 0}]),
      // Booking stats
      Booking ? Promise.allSettled([
        Booking.countDocuments(),
        Booking.countDocuments({ status: 'confirmed' }),
        Booking.countDocuments({ status: 'pending' })
      ]) : Promise.resolve([{value: 0}, {value: 0}, {value: 0}]),
      // GameZone stats
      GameZone ? Promise.allSettled([
        GameZone.countDocuments(),
        GameZone.countDocuments({ isActive: true })
      ]) : Promise.resolve([{value: 0}, {value: 0}])
    ]);
    
    // Parse results safely
    const appResults = appStats.status === 'fulfilled' ? appStats.value : [{value: 0}, {value: 0}, {value: 0}];
    const userResults = userStats.status === 'fulfilled' ? userStats.value : [{value: 0}, {value: 0}, {value: 0}];
    const bookingResults = bookingStats.status === 'fulfilled' ? bookingStats.value : [{value: 0}, {value: 0}, {value: 0}];
    const gameZoneResults = gameZoneStats.status === 'fulfilled' ? gameZoneStats.value : [{value: 0}, {value: 0}];
    
    const dashboard = {
      overview: {
        totalUsers: userResults[0].status === 'fulfilled' ? userResults[0].value : 0,
        totalGameZones: gameZoneResults[0].status === 'fulfilled' ? gameZoneResults[0].value : 0,
        totalBookings: bookingResults[0].status === 'fulfilled' ? bookingResults[0].value : 0,
        activeZones: gameZoneResults[1].status === 'fulfilled' ? gameZoneResults[1].value : 0
      },
      users: {
        total: userResults[0].status === 'fulfilled' ? userResults[0].value : 0,
        regularUsers: userResults[1].status === 'fulfilled' ? userResults[1].value : 0,
        vendors: userResults[2].status === 'fulfilled' ? userResults[2].value : 0
      },
      bookings: {
        total: bookingResults[0].status === 'fulfilled' ? bookingResults[0].value : 0,
        confirmed: bookingResults[1].status === 'fulfilled' ? bookingResults[1].value : 0,
        pending: bookingResults[2].status === 'fulfilled' ? bookingResults[2].value : 0
      },
      gameZones: {
        total: gameZoneResults[0].status === 'fulfilled' ? gameZoneResults[0].value : 0,
        active: gameZoneResults[1].status === 'fulfilled' ? gameZoneResults[1].value : 0
      }
    };
    
    console.log('✅ Dashboard stats retrieved successfully');
    
    res.json({
      success: true,
      dashboard,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get dashboard statistics',
      message: error.message
    });
  }
});

// 🔧 ADDED: GET /api/stats/health - Health check with stats
router.get('/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState;
    const dbStatusText = dbStatus === 1 ? 'Connected' : 
                        dbStatus === 2 ? 'Connecting' : 
                        dbStatus === 3 ? 'Disconnecting' : 'Disconnected';
    
    res.json({
      success: true,
      status: 'OK',
      database: {
        status: dbStatusText,
        readyState: dbStatus,
        name: mongoose.connection.name
      },
      models: {
        User: !!User,
        GameZone: !!GameZone,
        Booking: !!Booking
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting health stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Health check failed',
      message: error.message
    });
  }
});

module.exports = router;