const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

let io;

const initializeSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user._id.toString();
      socket.userRole = user.role;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log('👤 User connected:', socket.userId);
    
    // Join user-specific room
    socket.join(`user_${socket.userId}`);
    
    // Join role-specific room
    socket.join(`role_${socket.userRole}`);
    
    // Handle notification acknowledgment
    socket.on('notification_received', (data) => {
      console.log('📨 Notification received by client:', data.notificationId);
    });
    
    // Handle notification read
    socket.on('notification_read', async (data) => {
      try {
        const NotificationService = require('./services/NotificationService');
        await NotificationService.markAsRead(socket.userId, [data.notificationId]);
        console.log('✅ Notification marked as read:', data.notificationId);
      } catch (error) {
        console.error('❌ Error marking notification as read:', error);
      }
    });
    
    socket.on('disconnect', () => {
      console.log('👤 User disconnected:', socket.userId);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = {
  initializeSocket,
  getIO,
};