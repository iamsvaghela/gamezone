// server.js - Fixed CORS and error handling
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

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

mongoose.connection.on('connected', () => {
  console.log('✅ Connected to MongoDB successfully!');
  console.log('🌐 Database:', mongoose.connection.name);
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

// API Routes
try {
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.error('❌ Auth routes failed:', error.message);
}

try {
  app.use('/api/gamezones', require('./routes/gamezones'));
  console.log('✅ GameZones routes loaded');
} catch (error) {
  console.error('❌ GameZones routes failed:', error.message);
}

try {
  app.use('/api/bookings', require('./routes/bookings'));
  console.log('✅ Bookings routes loaded');
} catch (error) {
  console.error('❌ Bookings routes failed:', error.message);
}

try {
  app.use('/api/vendor', require('./routes/vendor'));
  console.log('✅ Vendor routes loaded');
} catch (error) {
  console.error('❌ Vendor routes failed:', error.message);
}

try {
  app.use('/api/stats', require('./routes/stats'));
  console.log('✅ Stats routes loaded');
} catch (error) {
  console.error('❌ Stats routes failed:', error.message);
}

// 🔧 Try to load notification routes (optional)
try {
  app.use('/api/notifications', require('./routes/notifications'));
  console.log('✅ Notification routes loaded');
} catch (error) {
  console.warn('⚠️  Notification routes not available:', error.message);
}

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: '🎮 GameZone API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    status: 'running',
    timestamp: new Date().toISOString(),
    cors: {
      enabled: true,
      origin: req.headers.origin || 'none'
    },
    endpoints: {
      health: '/health',
      docs: '/api',
      gamezones: '/api/gamezones',
      bookings: '/api/bookings',
      stats: '/api/stats',
      auth: '/api/auth'
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
    cors: {
      enabled: true,
      origin: req.headers.origin || 'none'
    }
  });
});

// API documentation
app.get('/api', (req, res) => {
  res.json({ 
    message: '🎮 GameZone API Documentation',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
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
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
  console.log(`🔐 CORS: Enabled (permissive in development)`);
  console.log(`📡 Socket.IO: ${io ? 'Enabled' : 'Disabled'}`);
  console.log(`\n🎮 Ready to serve GameZone requests!\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
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
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down...');
  
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
});

module.exports = { app, server: httpServer };