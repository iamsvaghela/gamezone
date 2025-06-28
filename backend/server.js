const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware - FIXED CORS Configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://frontend-production-88da.up.railway.app',
        'https://gamezone-production.up.railway.app'
      ] 
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

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

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/gamezones', require('./routes/gamezones'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/vendor', require('./routes/vendor'));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'GameZone API is running!',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    port: process.env.PORT || 3000
  });
});

// Serve static files from React app (only in production)
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the React app build directory
  app.use(express.static(path.join(__dirname, '../frontend/dist')));

  // API documentation route
  app.get('/api', (req, res) => {
    res.json({ 
      message: '🎮 GameZone API Documentation',
      version: '1.0.0',
      environment: 'production',
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
        }
      }
    });
  });

  // Handle React routing - return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
} else {
  // Development mode - show API documentation on root
  app.get('/', (req, res) => {
    res.json({ 
      message: '🎮 Welcome to GameZone API!',
      version: '1.0.0',
      mode: 'development',
      note: 'This is the backend API running locally',
      frontend: 'Frontend should be running on http://localhost:5173',
      health: 'GET /health for health check',
      docs: 'GET /api for API documentation'
    });
  });

  // Development API documentation
  app.get('/api', (req, res) => {
    res.json({ 
      message: '🎮 GameZone API Documentation',
      version: '1.0.0',
      environment: 'development',
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
        }
      }
    });
  });
}

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
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`🎮 GameZone app: http://localhost:${PORT}`);
  } else {
    console.log(`🔧 API docs: http://localhost:${PORT}/api`);
    console.log(`🎮 Frontend should be running on: http://localhost:5173`);
  }
});