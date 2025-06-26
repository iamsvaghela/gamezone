const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gamezone', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

mongoose.connection.on('connected', () => {
  console.log('✅ Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/gamezones', require('./routes/gamezones'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/vendor', require('./routes/vendor'));

// Health check (for Railway deployment)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'GameZone API is running!',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Serve static files from React app (only in production)
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the React app build directory
  app.use(express.static(path.join(__dirname, '../frontend/dist')));

  // API documentation route (only show in development or if specifically requested)
  app.get('/api', (req, res) => {
    res.json({ 
      message: '🎮 GameZone API Documentation',
      version: '1.0.0',
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
      note: 'This is the backend API. Frontend should be running on port 5173',
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
  if (process.env.NODE_ENV === 'production') {
    console.log(`🎮 GameZone app: http://localhost:${PORT}`);
  } else {
    console.log(`🔧 API docs: http://localhost:${PORT}/`);
    console.log(`🎮 Frontend should be running on: http://localhost:5173`);
  }
});