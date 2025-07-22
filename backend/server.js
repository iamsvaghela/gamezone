// server.js - Fixed CORS and error handling with improved route loading
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const BookingCleanupService = require('./services/BookingCleanupService');
BookingCleanupService.startPeriodicCleanup(15); // Every 15 minutes
// 🔧 FIXED CORS Configuration - More permissive for development
const corsOptions = {
  origin: function (origin, callback) {
    console.log('🌐 CORS Origin:', origin);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('✅ CORS: No origin, allowing request');
      return callback(null, true);
    }
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:8081',
      'http://localhost:19006',
      'http://localhost:19000',
      'http://localhost:3000',
      'https://frontend-production-88da.up.railway.app',
      'https://gamezone-production.up.railway.app',
      'exp://localhost:8081',
      'exp://127.0.0.1:8081'
    ];
    
    // 🔧 FIXED: Allow all localhost, 127.0.0.1, and 192.168.x.x origins
    if (origin.includes('localhost') || 
        origin.includes('127.0.0.1') || 
        origin.includes('192.168.') || 
        origin.includes('10.0.') ||
        origin.startsWith('exp://')) {
      console.log('✅ CORS: Local/Expo origin allowed:', origin);
      return callback(null, true);
    }
    
    // Check allowed origins
    if (allowedOrigins.includes(origin)) {
      console.log('✅ CORS: Allowed origin:', origin);
      return callback(null, true);
    }
    
    // 🔧 FIXED: Allow all origins in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ CORS: Development mode, allowing all origins');
      return callback(null, true);
    }
    
    console.log('❌ CORS: Origin not allowed:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-HTTP-Method-Override',
    'Access-Control-Allow-Origin'
  ],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Create HTTP server (Socket.IO setup - optional)
const server = require('http').createServer(app);

// Try to initialize Socket.IO (optional)
let io;
try {
  const { initializeSocket } = require('./socket');
  io = initializeSocket(server);
  app.set('io', io);
  console.log('✅ Socket.IO initialized');
} catch (error) {
  console.warn('⚠️  Socket.IO not available:', error.message);
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// 🔧 ENHANCED Request logging
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'None'} - IP: ${req.ip}`);
  next();
});

// Database Connection
console.log('🔄 Connecting to MongoDB...');
console.log('🔗 MongoDB URI:', process.env.MONGODB_URI ? 'Set (hidden for security)' : 'NOT SET');
console.log('🌐 Environment:', process.env.NODE_ENV || 'development');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gamezone', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

mongoose.connection.on('connected', async () => {
  console.log('✅ Connected to MongoDB successfully!');
  console.log('🌐 Database:', mongoose.connection.name);
  
  // Check Notification model (optional)
  try {
    const Notification = require('./models/Notification');
    console.log('✅ Notification model loaded successfully');
    
    // Test if we can query the collection
    const count = await Notification.countDocuments();
    console.log(`📊 Current notification count: ${count}`);
    
    // Check if the collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    const notificationCollection = collections.find(col => col.name === 'notifications');
    
    if (notificationCollection) {
      console.log('✅ Notifications collection exists in MongoDB');
    } else {
      console.log('⚠️  Notifications collection does not exist yet (will be created on first insert)');
    }
    
    // Test creating a notification
    console.log('🧪 Testing notification creation...');
    const testNotification = new Notification({
      userId: new mongoose.Types.ObjectId(),
      type: 'system_announcement',
      title: 'System Test',
      message: 'Testing notification system on startup',
      priority: 'low',
      category: 'system'
    });
    
    await testNotification.save();
    console.log('✅ Test notification created successfully:', testNotification._id);
    
    // Clean up test notification
    await Notification.deleteOne({ _id: testNotification._id });
    console.log('🧹 Test notification cleaned up');
    
  } catch (error) {
    console.error('❌ Error with Notification model:', error.message);
  }
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

// 🔧 IMPROVED API Routes Loading with better error handling
const loadRoute = (routePath, routeName, apiPath) => {
  try {
    const route = require(routePath);
    app.use(apiPath, route);
    console.log(`✅ ${routeName} routes loaded at ${apiPath}`);
    return true;
  } catch (error) {
    console.error(`❌ ${routeName} routes failed:`, error.message);
    return false;
  }
};

// Load routes in proper order
const routesStatus = {
  auth: loadRoute('./routes/auth', 'Auth', '/api/auth'),
  gamezones: loadRoute('./routes/gamezones', 'GameZones', '/api/gamezones'),
  bookings: loadRoute('./routes/bookings', 'Bookings', '/api/bookings'),
  vendor: loadRoute('./routes/vendor', 'Vendor', '/api/vendor'),
  stats: loadRoute('./routes/stats', 'Stats', '/api/stats'),
  payments: loadRoute('./routes/payments', 'Payments', '/api/payment'), // 🔧 FIXED: Load payments route
  notifications: loadRoute('./routes/notifications', 'Notifications', '/api/notifications')
};

// 🆕 Check critical routes
if (!routesStatus.payments) {
  console.log('⚠️  Payment routes failed to load - creating fallback endpoints');
  
  // Fallback payment endpoints if file is missing or has errors
  app.get('/api/payment/health', (req, res) => {
    res.status(500).json({
      success: false,
      error: 'Payment routes not properly loaded',
      message: 'Please check ./routes/payments.js file for errors',
      razorpay: {
        key_id: process.env.RAZORPAY_KEY_ID ? "Configured" : "Not configured",
        key_secret: process.env.RAZORPAY_SECRET ? "Configured" : "Not configured"
      }
    });
  });
  
  app.post('/api/payment/create-order', (req, res) => {
    res.status(500).json({
      success: false,
      error: 'Payment system not available',
      message: 'Please check ./routes/payments.js file and Razorpay configuration'
    });
  });
}

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: '🎮 GameZone API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    status: 'running',
    timestamp: new Date().toISOString(),
    features: {
      cors: true,
      socketio: !!io,
      database: mongoose.connection.readyState === 1,
      routes: routesStatus
    },
    endpoints: {
      health: '/health',
      docs: '/api',
      gamezones: '/api/gamezones',
      bookings: '/api/bookings',
      stats: '/api/stats',
      auth: '/api/auth',
      payment: '/api/payment',
      notifications: '/api/notifications'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'GameZone API is running!',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    port: process.env.PORT || 3000,
    features: {
      cors: true,
      socketio: !!io,
      routes: routesStatus,
      razorpay: {
        configured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_SECRET)
      }
    }
  });
});

// API documentation
app.get('/api', (req, res) => {
  res.json({ 
    message: '🎮 GameZone API Documentation',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    routes_status: routesStatus,
    endpoints: {
      health: 'GET /health',
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        profile: 'GET /api/auth/profile'
      },
      gamezones: {
        list: 'GET /api/gamezones',
        details: 'GET /api/gamezones/:id',
        availability: 'GET /api/gamezones/:id/availability'
      },
      bookings: {
        create: 'POST /api/bookings',
        list: 'GET /api/bookings',
        details: 'GET /api/bookings/:id',
        cancel: 'PUT /api/bookings/:id/cancel',
        availability: 'GET /api/bookings/availability/:zoneId/:date'
      },
      payments: {
        health: 'GET /api/payment/health',
        createOrder: 'POST /api/payment/create-order',
        verifyPayment: 'POST /api/payment/verify-payment',
        refund: 'POST /api/payment/refund',
        testUPI: 'GET /api/payment/test-upi'
      },
      stats: {
        app: 'GET /api/stats/app',
        users: 'GET /api/stats/users'
      }
    }
  });
});

// 🔧 CATCH-ALL for undefined routes
app.use('/api/*', (req, res) => {
  console.log(`❌ 404 API route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false,
    error: 'API route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: '/api',
    timestamp: new Date().toISOString()
  });
});

// 🔧 ENHANCED Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error:', err.stack);
  
  // CORS error
  if (err.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      error: 'CORS Error',
      message: 'Origin not allowed. Please check your configuration.',
      origin: req.headers.origin
    });
  }
  
  // MongoDB connection error
  if (err.message.includes('MongoError')) {
    return res.status(503).json({
      success: false,
      error: 'Database Error',
      message: 'Database connection failed. Please try again later.'
    });
  }
  
  res.status(500).json({ 
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!'
  });
});

// Start notification processor (optional)
try {
  const NotificationService = require('./services/NotificationService');
  setInterval(async () => {
    try {
      await NotificationService.processScheduledNotifications();
    } catch (error) {
      console.error('❌ Notification processor error:', error);
    }
  }, 60000);
  console.log('✅ Notification processor started');
} catch (error) {
  console.warn('⚠️  Notification processor not available:', error.message);
}

// Start server
const PORT = process.env.PORT || 3000;

// Use server.listen if Socket.IO is available, otherwise use app.listen
const httpServer = io ? server : app;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 GameZone API Server Started!`);
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`📚 Docs: http://localhost:${PORT}/api`);
  console.log(`💳 Payment Health: http://localhost:${PORT}/api/payment/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
  console.log(`🔐 CORS: Enabled (permissive in development)`);
  console.log(`📡 Socket.IO: ${io ? 'Enabled' : 'Disabled'}`);
  console.log(`💳 Payments: ${routesStatus.payments ? 'Enabled' : 'Disabled'}`);
  console.log(`🔑 Razorpay: ${(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_SECRET) ? 'Configured' : 'Not Configured'}`);
  console.log(`\n📋 Route Status:`);
  Object.entries(routesStatus).forEach(([route, loaded]) => {
    console.log(`   ${loaded ? '✅' : '❌'} ${route}`);
  });
  console.log(`\n🎮 Ready to serve GameZone requests!\n`);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
  
  try {
    await mongoose.connection.close();
    console.log('📊 Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database:', error);
  }
  
  httpServer.close(() => {
    console.log('🚀 HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = { app, server: httpServer };