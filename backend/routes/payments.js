// routes/payment.js - Razorpay payment integration
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { auth, userOnly } = require('../middleware/auth');
const Booking = require('../models/Booking');
const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_2hfLaJ5xnMdUTJ',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_key_secret'
});



router.get('/debug-razorpay', (req, res) => {
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET
  });

  res.json({
    success: true,
    config: {
      key_id_present: !!process.env.RAZORPAY_KEY_ID,
      key_id_length: process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.length : 0,
      key_id_starts_with: process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.substring(0, 8) + '...' : 'Not set',
      key_secret_present: !!process.env.RAZORPAY_SECRET,
      key_secret_length: process.env.RAZORPAY_SECRET ? process.env.RAZORPAY_SECRET.length : 0,
      environment: process.env.NODE_ENV,
      razorpay_instance: !!razorpay
    }
  });
});
// POST /api/payment/create-order - Create Razorpay order
router.post('/create-order', async (req, res) => {
  try {
    console.log('🔄 Creating Razorpay order...');
    
    // Check if credentials are present
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET) {
      console.error('❌ Razorpay credentials missing');
      return res.status(500).json({
        success: false,
        error: 'Payment system configuration error',
        message: 'Razorpay credentials not configured'
      });
    }

    console.log('🔑 Razorpay Key ID:', process.env.RAZORPAY_KEY_ID?.substring(0, 8) + '...');
    console.log('🔑 Secret length:', process.env.RAZORPAY_SECRET?.length);

    const { amount, bookingId } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount'
      });
    }

    // Convert amount to paise (multiply by 100)
    const amountInPaise = Math.round(amount * 100);
    
    console.log('💰 Order amount: ₹' + amount + ' (' + amountInPaise + ' paise)');

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        bookingId: bookingId || '',
        userId: req.user?.userId || '',
        orderType: 'gaming_zone_booking',
        createdAt: new Date().toISOString()
      }
    };

    console.log('📦 Creating order with options:', JSON.stringify(options, null, 2));

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET
    });

    const order = await razorpay.orders.create(options);
    console.log('✅ Razorpay order created:', order.id);

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        created_at: order.created_at,
        notes: order.notes
      }
    });

  } catch (error) {
    console.error('❌ Razorpay order creation failed:', error);
    
    let errorMessage = 'Failed to create payment order';
    let errorCode = 'RAZORPAY_ERROR';
    
    if (error.error && error.error.code) {
      errorCode = error.error.code;
      errorMessage = error.error.description || error.message;
    }
    
    // Specific handling for authentication errors
    if (errorCode === 'BAD_REQUEST_ERROR' && errorMessage.includes('authentication')) {
      errorMessage = 'Invalid Razorpay credentials. Please check your API keys.';
    }

    res.status(500).json({
      success: false,
      error: 'Payment gateway error',
      message: errorMessage,
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? {
        originalError: error.message,
        stack: error.stack
      } : undefined
    });
  }
});

// POST /api/payment/verify - Verify payment signature
router.post('/verify', auth, userOnly, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId
    } = req.body;
    
    console.log('🔐 Verifying payment signature:', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      bookingId
    });
    
    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment verification fields'
      });
    }
    
    // Create signature for verification
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_key_secret')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    
    const isSignatureValid = expectedSignature === razorpay_signature;
    
    console.log('🔒 Signature verification:', {
      expected: expectedSignature,
      received: razorpay_signature,
      isValid: isSignatureValid
    });
    
    if (!isSignatureValid) {
      console.log('❌ Invalid payment signature');
      
      // Log failed verification attempt
      if (bookingId) {
        await Booking.findByIdAndUpdate(bookingId, {
          $push: {
            paymentAttempts: {
              attemptedAt: new Date(),
              orderId: razorpay_order_id,
              paymentId: razorpay_payment_id,
              status: 'signature_verification_failed',
              errorMessage: 'Invalid payment signature'
            }
          }
        });
      }
      
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature',
        verified: false
      });
    }
    
    console.log('✅ Payment signature verified successfully');
    
    // Fetch payment details from Razorpay
    let paymentDetails = null;
    try {
      paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
      console.log('📋 Payment details fetched:', {
        id: paymentDetails.id,
        status: paymentDetails.status,
        method: paymentDetails.method,
        amount: paymentDetails.amount
      });
    } catch (fetchError) {
      console.error('⚠️ Could not fetch payment details:', fetchError);
      // Continue without payment details - verification is still valid
    }
    
    // Update booking if bookingId is provided
    if (bookingId) {
      try {
        const booking = await Booking.findOne({
          _id: bookingId,
          userId: req.user.userId
        });
        
        if (booking) {
          // Record successful verification
          booking.paymentAttempts.push({
            attemptedAt: new Date(),
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            status: 'signature_verified',
            errorMessage: null
          });
          
          await booking.save();
          console.log('✅ Payment verification recorded for booking:', bookingId);
        }
      } catch (bookingUpdateError) {
        console.error('⚠️ Could not update booking with verification:', bookingUpdateError);
        // Don't fail the verification for booking update errors
      }
    }
    
    res.json({
      success: true,
      verified: true,
      message: 'Payment verified successfully',
      paymentDetails: paymentDetails ? {
        id: paymentDetails.id,
        status: paymentDetails.status,
        method: paymentDetails.method,
        amount: paymentDetails.amount,
        currency: paymentDetails.currency,
        captured: paymentDetails.captured,
        created_at: paymentDetails.created_at
      } : null
    });
    
  } catch (error) {
    console.error('❌ Error verifying payment:', error);
    
    res.status(500).json({
      success: false,
      error: 'Payment verification failed',
      message: error.message,
      verified: false
    });
  }
});

// POST /api/payment/capture - Manually capture payment (if needed)
router.post('/capture', auth, userOnly, async (req, res) => {
  try {
    const { razorpay_payment_id, amount } = req.body;
    
    console.log('💰 Capturing payment:', { paymentId: razorpay_payment_id, amount });
    
    if (!razorpay_payment_id || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID and amount are required'
      });
    }
    
    const amountInPaise = Math.round(amount * 100);
    
    const capturedPayment = await razorpay.payments.capture(
      razorpay_payment_id,
      amountInPaise
    );
    
    console.log('✅ Payment captured:', capturedPayment.id);
    
    res.json({
      success: true,
      message: 'Payment captured successfully',
      payment: {
        id: capturedPayment.id,
        status: capturedPayment.status,
        amount: capturedPayment.amount,
        captured: capturedPayment.captured
      }
    });
    
  } catch (error) {
    console.error('❌ Error capturing payment:', error);
    
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: 'Payment capture failed',
        message: error.error?.description || error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Payment capture failed',
      message: error.message
    });
  }
});

// POST /api/payment/refund - Process refund
router.post('/refund', auth, userOnly, async (req, res) => {
  try {
    const { razorpay_payment_id, amount, reason, bookingId } = req.body;
    
    console.log('💸 Processing refund:', {
      paymentId: razorpay_payment_id,
      amount,
      reason,
      bookingId
    });
    
    if (!razorpay_payment_id) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID is required'
      });
    }
    
    // Verify booking ownership if bookingId is provided
    if (bookingId) {
      const booking = await Booking.findOne({
        _id: bookingId,
        userId: req.user.userId
      });
      
      if (!booking || booking.paymentId !== razorpay_payment_id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized refund request'
        });
      }
    }
    
    const refundData = {
      notes: {
        reason: reason || 'Booking cancellation',
        bookingId: bookingId || '',
        userId: req.user.userId,
        refundedAt: new Date().toISOString()
      }
    };
    
    if (amount) {
      refundData.amount = Math.round(amount * 100); // Convert to paise
    }
    
    const refund = await razorpay.payments.refund(razorpay_payment_id, refundData);
    
    console.log('✅ Refund processed:', refund.id);
    
    // Update booking status if bookingId is provided
    if (bookingId) {
      await Booking.findByIdAndUpdate(bookingId, {
        paymentStatus: 'refunded',
        $push: {
          paymentAttempts: {
            attemptedAt: new Date(),
            paymentId: razorpay_payment_id,
            status: 'refunded',
            errorMessage: null
          }
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Refund processed successfully',
      refund: {
        id: refund.id,
        status: refund.status,
        amount: refund.amount,
        currency: refund.currency,
        created_at: refund.created_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error processing refund:', error);
    
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: 'Refund failed',
        message: error.error?.description || error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Refund processing failed',
      message: error.message
    });
  }
});

// GET /api/payment/status/:paymentId - Get payment status
router.get('/status/:paymentId', auth, userOnly, async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    console.log('📊 Getting payment status:', paymentId);
    
    const payment = await razorpay.payments.fetch(paymentId);
    
    res.json({
      success: true,
      payment: {
        id: payment.id,
        status: payment.status,
        method: payment.method,
        amount: payment.amount,
        currency: payment.currency,
        captured: payment.captured,
        refund_status: payment.refund_status,
        created_at: payment.created_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting payment status:', error);
    
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to get payment status',
      message: error.message
    });
  }
});

// GET /api/payment/orders/:orderId - Get order details
router.get('/orders/:orderId', auth, userOnly, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('📦 Getting order details:', orderId);
    
    const order = await razorpay.orders.fetch(orderId);
    
    res.json({
      success: true,
      order: {
        id: order.id,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        created_at: order.created_at,
        notes: order.notes
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting order details:', error);
    
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to get order details',
      message: error.message
    });
  }
});

module.exports = router;