const express = require('express');
const GameZone = require('../models/GameZone');
const Booking = require('../models/Booking');
const { auth, vendorOnly, optionalAuth } = require('../middleware/auth');
const router = express.Router();

// Helper function to calculate distance between two coordinates
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// GET /api/gamezones - Get all gaming zones
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      lat, 
      lng, 
      radius = 50, 
      search, 
      minPrice, 
      maxPrice, 
      amenities,
      sort = 'rating',
      page = 1,
      limit = 10
    } = req.query;

    // Build query
    let query = { isActive: true };

    // Price filter
    if (minPrice || maxPrice) {
      query.pricePerHour = {};
      if (minPrice) query.pricePerHour.$gte = Number(minPrice);
      if (maxPrice) query.pricePerHour.$lte = Number(maxPrice);
    }

    // Amenities filter
    if (amenities) {
      const amenityList = amenities.split(',').map(a => a.trim());
      query.amenities = { $in: amenityList };
    }

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    // Pagination
    const skip = (Number(page) - 1) * Number(limit);

    let gameZones;
    
    if (lat && lng) {
      // Geospatial query with location
      const aggregationPipeline = [
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [Number(lng), Number(lat)]
            },
            distanceField: "distance",
            maxDistance: Number(radius) * 1000, // Convert km to meters
            spherical: true,
            query: query
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'vendorId',
            foreignField: '_id',
            as: 'vendor',
            pipeline: [{ $project: { name: 1, email: 1 } }]
          }
        },
        {
          $unwind: '$vendor'
        },
        {
          $sort: sort === 'distance' ? { distance: 1 } : 
                 sort === 'price' ? { pricePerHour: 1 } :
                 sort === 'rating' ? { rating: -1 } : { createdAt: -1 }
        },
        { $skip: skip },
        { $limit: Number(limit) }
      ];

      gameZones = await GameZone.aggregate(aggregationPipeline);
      
      // Convert distance from meters to kilometers
      gameZones = gameZones.map(zone => ({
        ...zone,
        distance: zone.distance / 1000
      }));
    } else {
      // Regular query without location
      const sortOption = sort === 'price' ? { pricePerHour: 1 } :
                        sort === 'rating' ? { rating: -1 } : 
                        { createdAt: -1 };

      gameZones = await GameZone.find(query)
        .populate('vendorId', 'name email')
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit));
    }

    // Get total count for pagination
    const total = await GameZone.countDocuments(query);

    res.json({
      gameZones,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalItems: total,
        hasNext: skip + gameZones.length < total,
        hasPrev: Number(page) > 1
      }
    });

  } catch (error) {
    console.error('Error fetching game zones:', error);
    res.status(500).json({ 
      error: 'Server error fetching game zones' 
    });
  }
});

// GET /api/gamezones/:id - Get specific gaming zone
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const gameZone = await GameZone.findById(req.params.id)
      .populate('vendorId', 'name email phone');
    
    if (!gameZone) {
      return res.status(404).json({ 
        error: 'Gaming zone not found' 
      });
    }

    if (!gameZone.isActive) {
      return res.status(404).json({ 
        error: 'Gaming zone is not available' 
      });
    }

    res.json(gameZone);

  } catch (error) {
    console.error('Error fetching game zone:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid game zone ID' 
      });
    }

    res.status(500).json({ 
      error: 'Server error fetching game zone' 
    });
  }
});

// GET /api/gamezones/:id/availability - Get availability for a zone
router.get('/:id/availability', async (req, res) => {
  try {
    const { date } = req.query;
    const zoneId = req.params.id;

    if (!date) {
      return res.status(400).json({ 
        error: 'Date parameter is required (YYYY-MM-DD format)' 
      });
    }

    // Validate date format
    const requestedDate = new Date(date);
    if (isNaN(requestedDate.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid date format. Use YYYY-MM-DD' 
      });
    }

    // Check if zone exists
    const gameZone = await GameZone.findById(zoneId);
    if (!gameZone) {
      return res.status(404).json({ 
        error: 'Gaming zone not found' 
      });
    }

    // Get existing bookings for this date
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await Booking.find({
      zoneId: zoneId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: { $in: ['pending', 'confirmed'] }
    });

    // Generate time slots based on operating hours
    const [startHour] = gameZone.operatingHours.start.split(':').map(Number);
    const [endHour] = gameZone.operatingHours.end.split(':').map(Number);
    
    const availability = {};
    
    for (let hour = startHour; hour < endHour; hour++) {
      const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
      
      // Check if this slot is booked
      const isBooked = existingBookings.some(booking => {
        const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
        const bookingEndHour = bookingHour + booking.duration;
        return hour >= bookingHour && hour < bookingEndHour;
      });

      availability[timeSlot] = !isBooked;
    }

    res.json({
      date,
      zoneId,
      zoneName: gameZone.name,
      operatingHours: gameZone.operatingHours,
      availability
    });

  } catch (error) {
    console.error('Error fetching availability:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid game zone ID' 
      });
    }

    res.status(500).json({ 
      error: 'Server error fetching availability' 
    });
  }
});

// POST /api/gamezones - Create new gaming zone (vendor only)
router.post('/', auth, vendorOnly, async (req, res) => {
  try {
    const gameZoneData = {
      ...req.body,
      vendorId: req.user.userId
    };

    const gameZone = new GameZone(gameZoneData);
    await gameZone.save();
    
    await gameZone.populate('vendorId', 'name email');

    res.status(201).json({
      message: 'Gaming zone created successfully',
      gameZone
    });

  } catch (error) {
    console.error('Error creating game zone:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors 
      });
    }

    res.status(500).json({ 
      error: 'Server error creating game zone' 
    });
  }
});

// PUT /api/gamezones/:id - Update gaming zone (vendor only)
router.put('/:id', auth, vendorOnly, async (req, res) => {
  try {
    const gameZone = await GameZone.findOne({
      _id: req.params.id,
      vendorId: req.user.userId
    });

    if (!gameZone) {
      return res.status(404).json({ 
        error: 'Gaming zone not found or you do not have permission to edit it' 
      });
    }

    Object.assign(gameZone, req.body);
    await gameZone.save();
    
    await gameZone.populate('vendorId', 'name email');

    res.json({
      message: 'Gaming zone updated successfully',
      gameZone
    });

  } catch (error) {
    console.error('Error updating game zone:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors 
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid game zone ID' 
      });
    }

    res.status(500).json({ 
      error: 'Server error updating game zone' 
    });
  }
});

// DELETE /api/gamezones/:id - Delete gaming zone (vendor only)
router.delete('/:id', auth, vendorOnly, async (req, res) => {
  try {
    const gameZone = await GameZone.findOne({
      _id: req.params.id,
      vendorId: req.user.userId
    });

    if (!gameZone) {
      return res.status(404).json({ 
        error: 'Gaming zone not found or you do not have permission to delete it' 
      });
    }

    // Soft delete by setting isActive to false
    gameZone.isActive = false;
    await gameZone.save();

    res.json({
      message: 'Gaming zone deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting game zone:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid game zone ID' 
      });
    }

    res.status(500).json({ 
      error: 'Server error deleting game zone' 
    });
  }
});

module.exports = router;
