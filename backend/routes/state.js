// routes/stats.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const GameZone = require('../models/GameZone');
const Booking = require('../models/Booking');

router.get('/app', async (req, res) => {
  try {
    const [gameZonesCount, usersCount, bookingsCount] = await Promise.all([
      GameZone.countDocuments({ isActive: true }),
      User.countDocuments(),
      Booking.countDocuments()
    ]);
    
    res.json({
      success: true,
      totalGameZones: gameZonesCount,
      totalUsers: usersCount,
      totalBookings: bookingsCount,
      activeZones: gameZonesCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;