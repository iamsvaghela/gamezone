// services/BookingCleanupService.js - Auto-cleanup expired pending payments
const Booking = require('../models/Booking');
const mongoose = require('mongoose');

class BookingCleanupService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.cleanupStats = {
      totalCleanups: 0,
      lastCleanup: null,
      totalCancelled: 0,
      errors: []
    };
  }

  /**
   * Start periodic cleanup of expired pending payments
   * @param {number} intervalMinutes - How often to run cleanup (default: 15 minutes)
   */
  startPeriodicCleanup(intervalMinutes = 15) {
    if (this.isRunning) {
      console.log('⚠️ Cleanup service is already running');
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    
    console.log(`🧹 Starting booking cleanup service - running every ${intervalMinutes} minutes`);
    
    // Run immediately
    this.runCleanup();
    
    // Set up periodic execution
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, intervalMs);
    
    this.isRunning = true;
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.stopCleanup());
    process.on('SIGTERM', () => this.stopCleanup());
  }

  /**
   * Stop the periodic cleanup
   */
  stopCleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('🛑 Booking cleanup service stopped');
    }
  }

  /**
   * Run a single cleanup cycle
   */
  async runCleanup() {
    try {
      console.log('🧹 Running booking cleanup...');
      
      const startTime = new Date();
      
      // Find expired bookings
      const expiredBookings = await this.findExpiredBookings();
      
      if (expiredBookings.length === 0) {
        console.log('✅ No expired bookings found');
        this.updateStats(startTime, 0, null);
        return;
      }
      
      console.log(`📋 Found ${expiredBookings.length} expired bookings to clean up`);
      
      // Process each expired booking
      const results = await this.processExpiredBookings(expiredBookings);
      
      // Send notifications
      await this.sendCleanupNotifications(results.successful);
      
      // Update stats
      this.updateStats(startTime, results.successful.length, results.errors);
      
      console.log(`✅ Cleanup completed: ${results.successful.length} cancelled, ${results.errors.length} errors`);
      
    } catch (error) {
      console.error('❌ Cleanup service error:', error);
      this.cleanupStats.errors.push({
        timestamp: new Date(),
        error: error.message,
        type: 'cleanup_service_error'
      });
    }
  }

  /**
   * Find bookings that have expired payment deadlines
   */
  async findExpiredBookings() {
    try {
      const now = new Date();
      
      const expiredBookings = await Booking.find({
        status: 'pending_payment',
        paymentDeadline: { $lt: now }
      })
      .populate('userId', 'name email')
      .populate('zoneId', 'name vendorId')
      .sort({ paymentDeadline: 1 }); // Oldest first
      
      return expiredBookings;
      
    } catch (error) {
      console.error('❌ Error finding expired bookings:', error);
      throw error;
    }
  }

  /**
   * Process expired bookings - cancel them and update status
   */
  async processExpiredBookings(expiredBookings) {
    const successful = [];
    const errors = [];
    
    for (const booking of expiredBookings) {
      try {
        console.log(`🔄 Processing expired booking: ${booking.reference}`);
        
        // Update booking status
        booking.status = 'payment_failed';
        booking.paymentStatus = 'failed';
        booking.paymentFailureReason = 'Payment deadline exceeded - auto-cancelled';
        booking.paymentFailedAt = new Date();
        booking.cancelledAt = new Date();
        
        // Add to payment attempts log
        booking.paymentAttempts.push({
          attemptedAt: new Date(),
          paymentId: 'auto-cancel',
          orderId: 'auto-cancel',
          status: 'expired',
          errorMessage: 'Payment deadline exceeded'
        });
        
        await booking.save();
        
        successful.push({
          bookingId: booking._id,
          reference: booking.reference,
          userId: booking.userId,
          zoneId: booking.zoneId,
          zoneName: booking.zoneId?.name || 'Unknown Zone',
          userName: booking.userId?.name || 'Unknown User',
          userEmail: booking.userId?.email,
          totalAmount: booking.totalAmount,
          expiredAt: booking.paymentDeadline,
          cancelledAt: booking.cancelledAt
        });
        
        console.log(`✅ Cancelled expired booking: ${booking.reference}`);
        
      } catch (error) {
        console.error(`❌ Error processing booking ${booking.reference}:`, error);
        
        errors.push({
          bookingId: booking._id,
          reference: booking.reference,
          error: error.message,
          timestamp: new Date()
        });
      }
    }
    
    return { successful, errors };
  }

  /**
   * Send notifications for cancelled bookings
   */
  async sendCleanupNotifications(cancelledBookings) {
    if (cancelledBookings.length === 0) return;
    
    try {
      const Notification = require('../models/Notification');
      
      for (const booking of cancelledBookings) {
        try {
          // Create customer notification
          if (booking.userId && booking.userId._id) {
            const customerNotification = new Notification({
              userId: booking.userId._id,
              type: 'booking_cancelled',
              title: '⏰ Booking Cancelled - Payment Deadline Exceeded',
              message: `Your booking "${booking.reference}" has been automatically cancelled because payment was not completed within the 30-minute deadline.`,
              priority: 'high',
              category: 'booking',
              data: {
                bookingId: booking.bookingId.toString(),
                reference: booking.reference,
                zoneName: booking.zoneName,
                cancelReason: 'payment_deadline_exceeded',
                expiredAt: booking.expiredAt.toISOString(),
                cancelledAt: booking.cancelledAt.toISOString(),
                autoCancel: true
              }
            });
            
            await customerNotification.save();
          }
          
          // Create vendor notification (if applicable)
          if (booking.zoneId && booking.zoneId.vendorId) {
            const vendorNotification = new Notification({
              userId: booking.zoneId.vendorId,
              type: 'booking_cancelled',
              title: '🕒 Booking Auto-Cancelled - Payment Timeout',
              message: `Booking "${booking.reference}" by ${booking.userName} was automatically cancelled due to payment timeout.`,
              priority: 'low',
              category: 'booking',
              data: {
                bookingId: booking.bookingId.toString(),
                reference: booking.reference,
                customerName: booking.userName,
                zoneName: booking.zoneName,
                cancelReason: 'payment_timeout',
                autoCancel: true
              }
            });
            
            await vendorNotification.save();
          }
          
        } catch (notificationError) {
          console.error(`❌ Error creating notification for booking ${booking.reference}:`, notificationError);
          // Don't fail the entire process for notification errors
        }
      }
      
      console.log(`📧 Created notifications for ${cancelledBookings.length} cancelled bookings`);
      
    } catch (error) {
      console.error('❌ Error sending cleanup notifications:', error);
    }
  }

  /**
   * Update cleanup statistics
   */
  updateStats(startTime, successCount, errors) {
    const endTime = new Date();
    const duration = endTime - startTime;
    
    this.cleanupStats.totalCleanups++;
    this.cleanupStats.lastCleanup = {
      timestamp: endTime,
      duration: `${duration}ms`,
      cancelled: successCount,
      errors: errors ? errors.length : 0
    };
    this.cleanupStats.totalCancelled += successCount;
    
    if (errors && errors.length > 0) {
      this.cleanupStats.errors.push(...errors.slice(0, 10)); // Keep only last 10 errors
      if (this.cleanupStats.errors.length > 50) {
        this.cleanupStats.errors = this.cleanupStats.errors.slice(-50); // Keep only last 50 errors
      }
    }
  }

  /**
   * Get cleanup statistics
   */
  getStats() {
    return {
      ...this.cleanupStats,
      isRunning: this.isRunning,
      nextCleanup: this.intervalId ? 'Scheduled' : 'Not scheduled'
    };
  }

  /**
   * Manually trigger cleanup (for testing or admin use)
   */
  async manualCleanup() {
    if (this.isRunning) {
      console.log('⚠️ Manual cleanup requested while service is running');
    }
    
    console.log('🔧 Manual cleanup triggered');
    await this.runCleanup();
  }

  /**
   * Get pending payments count (for monitoring)
   */
  async getPendingPaymentsCount() {
    try {
      const now = new Date();
      
      const counts = await Booking.aggregate([
        {
          $match: {
            status: 'pending_payment'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            expired: {
              $sum: {
                $cond: [
                  { $lt: ['$paymentDeadline', now] },
                  1,
                  0
                ]
              }
            },
            active: {
              $sum: {
                $cond: [
                  { $gte: ['$paymentDeadline', now] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);
      
      return counts[0] || { total: 0, expired: 0, active: 0 };
      
    } catch (error) {
      console.error('❌ Error getting pending payments count:', error);
      return { total: 0, expired: 0, active: 0, error: error.message };
    }
  }

  /**
   * Health check for the cleanup service
   */
  async healthCheck() {
    try {
      const pendingStats = await this.getPendingPaymentsCount();
      const stats = this.getStats();
      
      return {
        status: 'healthy',
        isRunning: this.isRunning,
        lastCleanup: stats.lastCleanup,
        pendingPayments: pendingStats,
        totalCleanups: stats.totalCleanups,
        totalCancelled: stats.totalCancelled,
        recentErrors: stats.errors.slice(-5) // Last 5 errors
      };
      
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        isRunning: this.isRunning
      };
    }
  }
}

// Create and export singleton instance
const bookingCleanupService = new BookingCleanupService();

module.exports = bookingCleanupService;