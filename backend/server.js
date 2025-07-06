const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Enhanced CORS Configuration - MUST BE FIRST
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:8081',  // Expo dev server
      'http://localhost:19006', // Expo web
      'http://localhost:19000', // Expo dev tools
      'http://localhost:3000',  // Local development
      'https://frontend-production-88da.up.railway.app', // Production frontend
      'exp://192.168.1.100:8081', // Local network (adjust IP as needed)
      'exp://localhost:8081',
      // Add more origins as needed
    ];
    
    // Allow all localhost and 192.168.x.x origins for development
    if (origin.includes('localhost') || origin.includes('192.168.') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // For production, be more restrictive
    if (process.env.NODE_ENV === 'production') {
      console.log('🚫 CORS blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
    
    // For development, allow all origins
    return callback(null, true);
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
    'X-HTTP-Method-Override'
  ],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Additional middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'None'}`);
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
  if (process.env.NODE_ENV === 'development') {
    console.error('🔧 Full error:', err);
  }
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

// API Routes (AFTER MIDDLEWARE)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/gamezones', require('./routes/gamezones'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/vendor', require('./routes/vendor'));
app.use('/api/stats', require('./routes/stats'));

// Root route - API info
app.get('/', (req, res) => {
  res.json({ 
    message: '🎮 GameZone API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    status: 'running',
    frontend: 'https://frontend-production-88da.up.railway.app',
    cors: {
      enabled: true,
      allowedOrigins: 'Dynamic based on environment',
      credentials: true
    },
    endpoints: {
      health: '/health',
      docs: '/api',
      stats: '/api/stats/app'
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
    cors: 'Enabled'
  });
});

// API documentation route
app.get('/api', (req, res) => {
  res.json({ 
    message: '🎮 GameZone API Documentation',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    frontend: 'https://frontend-production-88da.up.railway.app',
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
        cancel: 'PUT /api/bookings/:id/cancel'
      },
      vendor: {
        dashboard: 'GET /api/vendor/dashboard',
        bookings: 'GET /api/vendor/bookings',
        analytics: 'GET /api/vendor/analytics'
      },
      stats: {
        app: 'GET /api/stats/app'
      }
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API route not found',
    message: `Cannot ${req.method} ${req.originalUrl}` 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Database status: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
  console.log(`🔧 API docs: http://localhost:${PORT}/api`);
  console.log(`📊 Stats endpoint: http://localhost:${PORT}/api/stats/app`);
  console.log(`🎮 Frontend: https://frontend-production-88da.up.railway.app`);
  console.log(`🔐 CORS: Enabled for development origins`);
});