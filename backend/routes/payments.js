// backend/routes/payments.js - Complete Razorpay integration with verification
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const router = express.Router();

// Initialize Razorpay with your credentials
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

// 🆕 Create Order endpoint
router.post("/create-order", async (req, res) => {
  console.log("🔄 Creating Razorpay order...");
  
  try {
    const { amount, currency = "INR" } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Amount is required and must be greater than 0",
      });
    }

    console.log(`💰 Order amount: ₹${amount} (${amount * 100} paise)`);

    const options = {
      amount: Math.round(amount * 100), // Convert to paise and ensure integer
      currency: currency,
      payment_capture: 1, // Auto capture payment
      notes: {
        description: "GameZone Booking Payment",
        created_at: new Date().toISOString(),
      },
    };

    const order = await razorpay.orders.create(options);
    console.log("✅ Razorpay order created:", order.id);

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        created_at: order.created_at,
      },
      key_id: process.env.RAZORPAY_KEY_ID, // Safe to expose key_id
    });

  } catch (error) {
    console.error("❌ Create order error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create payment order",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 🆕 Verify Payment endpoint
router.post("/verify-payment", async (req, res) => {
  console.log("🔄 Verifying Razorpay payment...");
  
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Missing required payment verification data"
      });
    }

    console.log("🔐 Verifying signature...");
    console.log("Order ID:", razorpay_order_id);
    console.log("Payment ID:", razorpay_payment_id);

    // Create signature verification string
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    // Generate expected signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest("hex");

    console.log("Expected signature:", expectedSignature.substring(0, 10) + "...");
    console.log("Received signature:", razorpay_signature.substring(0, 10) + "...");

    // Verify signature
    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      console.log("✅ Payment signature verified successfully");

      // Optional: Fetch payment details from Razorpay to get more info
      try {
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        console.log("💳 Payment details:", {
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          method: payment.method,
          captured: payment.captured
        });

        res.json({
          success: true,
          verified: true,
          payment: {
            id: payment.id,
            amount: payment.amount / 100, // Convert back to rupees
            status: payment.status,
            method: payment.method,
            captured: payment.captured,
            created_at: payment.created_at
          }
        });

      } catch (fetchError) {
        console.warn("⚠️  Could not fetch payment details:", fetchError.message);
        // Still return success since signature is verified
        res.json({
          success: true,
          verified: true,
          payment: {
            id: razorpay_payment_id,
            order_id: razorpay_order_id
          }
        });
      }

    } else {
      console.log("❌ Payment signature verification failed");
      res.status(400).json({
        success: false,
        error: "Invalid payment signature",
        verified: false
      });
    }

  } catch (error) {
    console.error("❌ Payment verification error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Payment verification failed",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 🆕 Fetch Payment Details endpoint (optional)
router.get("/payment/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    console.log("🔍 Fetching payment details:", paymentId);
    
    const payment = await razorpay.payments.fetch(paymentId);
    
    res.json({
      success: true,
      payment: {
        id: payment.id,
        amount: payment.amount / 100, // Convert to rupees
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        captured: payment.captured,
        description: payment.description,
        created_at: payment.created_at,
        fee: payment.fee ? payment.fee / 100 : 0,
        tax: payment.tax ? payment.tax / 100 : 0
      }
    });

  } catch (error) {
    console.error("❌ Fetch payment error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch payment details"
    });
  }
});

// 🆕 Refund Payment endpoint (for cancellations)
router.post("/refund", async (req, res) => {
  try {
    const { paymentId, amount, notes } = req.body;
    
    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: "Payment ID is required for refund"
      });
    }

    console.log(`🔄 Processing refund for payment: ${paymentId}`);
    
    const refundOptions = {
      notes: {
        reason: notes || "GameZone booking cancellation",
        processed_at: new Date().toISOString()
      }
    };

    // If partial refund amount is specified
    if (amount) {
      refundOptions.amount = Math.round(amount * 100); // Convert to paise
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions);
    
    console.log("✅ Refund processed:", refund.id);
    
    res.json({
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount / 100, // Convert back to rupees
        status: refund.status,
        created_at: refund.created_at
      }
    });

  } catch (error) {
    console.error("❌ Refund error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Refund processing failed"
    });
  }
});

// 🆕 Health check for payment service
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Payment service is running",
    razorpay: {
      key_id: process.env.RAZORPAY_KEY_ID ? "Configured" : "Not configured",
      key_secret: process.env.RAZORPAY_SECRET ? "Configured" : "Not configured"
    },
    timestamp: new Date().toISOString()
  });
});

// 🆕 Test UPI IDs for development
router.get("/test-upi", (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: "Test endpoints not available in production"
    });
  }

  res.json({
    success: true,
    message: "Test UPI IDs for Razorpay sandbox",
    test_upi_ids: {
      success: "success@razorpay",
      failure: "fail@razorpay",
      pending: "pending@razorpay"
    },
    note: "Use these UPI IDs in test mode for different payment scenarios"
  });
});

module.exports = router;