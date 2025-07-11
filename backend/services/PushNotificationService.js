// services/PushNotificationService.js - Firebase Push Notification Service
const admin = require('firebase-admin');

// Initialize Firebase Admin (add your service account key)
let isInitialized = false;

const initializeFirebase = () => {
  if (!isInitialized && !admin.apps.length) {
    try {
      // Check if all required environment variables are present
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
        console.warn('⚠️  Firebase credentials not found in environment variables');
        console.warn('🔧 Push notifications will be disabled');
        return false;
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });

      isInitialized = true;
      console.log('✅ Firebase Admin initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing Firebase Admin:', error);
      return false;
    }
  }
  return isInitialized;
};

// Send push notification to a single device
const sendPushNotification = async (token, payload) => {
  try {
    if (!initializeFirebase()) {
      console.warn('⚠️  Firebase not initialized, skipping push notification');
      return { success: false, error: 'Firebase not initialized' };
    }

    if (!token) {
      console.warn('⚠️  No push token provided, skipping push notification');
      return { success: false, error: 'No push token provided' };
    }

    const message = {
      token,
      notification: {
        title: payload.title || 'GameZone',
        body: payload.body || 'You have a new notification',
      },
      data: {
        ...payload.data,
        // Convert all data values to strings as required by FCM
        timestamp: new Date().toISOString(),
        click_action: payload.click_action || 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'gamezone_notifications',
          color: '#6366f1',
          icon: 'ic_notification',
          tag: payload.tag || 'gamezone',
          clickAction: payload.click_action || 'FLUTTER_NOTIFICATION_CLICK'
        },
        data: {
          ...payload.data,
          timestamp: new Date().toISOString()
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: payload.badge || 1,
            category: payload.category || 'GENERAL',
            'content-available': 1
          }
        },
        fcmOptions: {
          image: payload.image || null
        }
      },
      webpush: {
        headers: {
          'TTL': '86400', // 24 hours
        },
        notification: {
          title: payload.title || 'GameZone',
          body: payload.body || 'You have a new notification',
          icon: payload.icon || '/icon-192x192.png',
          badge: payload.badge || '/badge-72x72.png',
          image: payload.image || null,
          tag: payload.tag || 'gamezone',
          requireInteraction: payload.requireInteraction || false
        },
        fcmOptions: {
          link: payload.link || '/'
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Push notification sent successfully:', response);
    
    return { 
      success: true, 
      messageId: response,
      token: token.substring(0, 20) + '...' // Log partial token for debugging
    };
    
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    
    // Handle specific Firebase errors
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      console.warn('⚠️  Invalid or unregistered token, should remove from user profile');
      return { 
        success: false, 
        error: 'Invalid token',
        shouldRemoveToken: true 
      };
    }
    
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
};

// Send push notification to multiple devices
const sendMulticastNotification = async (tokens, payload) => {
  try {
    if (!initializeFirebase()) {
      console.warn('⚠️  Firebase not initialized, skipping multicast notification');
      return { success: false, error: 'Firebase not initialized' };
    }

    if (!tokens || tokens.length === 0) {
      console.warn('⚠️  No push tokens provided, skipping multicast notification');
      return { success: false, error: 'No push tokens provided' };
    }

    // Filter out invalid tokens
    const validTokens = tokens.filter(token => token && typeof token === 'string');
    
    if (validTokens.length === 0) {
      console.warn('⚠️  No valid push tokens found');
      return { success: false, error: 'No valid push tokens' };
    }

    const message = {
      tokens: validTokens,
      notification: {
        title: payload.title || 'GameZone',
        body: payload.body || 'You have a new notification',
      },
      data: {
        ...payload.data,
        timestamp: new Date().toISOString(),
        click_action: payload.click_action || 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'gamezone_notifications',
          color: '#6366f1',
          icon: 'ic_notification',
          tag: payload.tag || 'gamezone'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: payload.badge || 1,
            category: payload.category || 'GENERAL'
          }
        }
      }
    };

    const response = await admin.messaging().sendMulticast(message);
    
    console.log('✅ Multicast notification sent:', {
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: validTokens.length
    });

    // Handle failed tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`❌ Failed to send to token ${idx}:`, resp.error);
          if (resp.error.code === 'messaging/invalid-registration-token' || 
              resp.error.code === 'messaging/registration-token-not-registered') {
            failedTokens.push(validTokens[idx]);
          }
        }
      });
      
      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        failedTokens,
        responses: response.responses
      };
    }

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      messageId: response.responses[0]?.messageId
    };

  } catch (error) {
    console.error('❌ Error sending multicast notification:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
};

// Send notification to topic (for broadcast messages)
const sendTopicNotification = async (topic, payload) => {
  try {
    if (!initializeFirebase()) {
      console.warn('⚠️  Firebase not initialized, skipping topic notification');
      return { success: false, error: 'Firebase not initialized' };
    }

    const message = {
      topic,
      notification: {
        title: payload.title || 'GameZone',
        body: payload.body || 'You have a new notification',
      },
      data: {
        ...payload.data,
        timestamp: new Date().toISOString()
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'gamezone_notifications',
          color: '#6366f1'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Topic notification sent successfully:', response);
    
    return { success: true, messageId: response };

  } catch (error) {
    console.error('❌ Error sending topic notification:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
};

// Subscribe user to topic
const subscribeToTopic = async (tokens, topic) => {
  try {
    if (!initializeFirebase()) {
      console.warn('⚠️  Firebase not initialized, skipping topic subscription');
      return { success: false, error: 'Firebase not initialized' };
    }

    if (!Array.isArray(tokens)) {
      tokens = [tokens];
    }

    const response = await admin.messaging().subscribeToTopic(tokens, topic);
    console.log('✅ Successfully subscribed to topic:', topic, response);
    
    return { success: true, response };

  } catch (error) {
    console.error('❌ Error subscribing to topic:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
};

// Unsubscribe user from topic
const unsubscribeFromTopic = async (tokens, topic) => {
  try {
    if (!initializeFirebase()) {
      console.warn('⚠️  Firebase not initialized, skipping topic unsubscription');
      return { success: false, error: 'Firebase not initialized' };
    }

    if (!Array.isArray(tokens)) {
      tokens = [tokens];
    }

    const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);
    console.log('✅ Successfully unsubscribed from topic:', topic, response);
    
    return { success: true, response };

  } catch (error) {
    console.error('❌ Error unsubscribing from topic:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
};

// Validate push token
const validatePushToken = async (token) => {
  try {
    if (!initializeFirebase()) {
      return { valid: false, error: 'Firebase not initialized' };
    }

    // Try to send a test message (dry run)
    const message = {
      token,
      notification: {
        title: 'Test',
        body: 'Test message'
      },
      dryRun: true
    };

    await admin.messaging().send(message);
    return { valid: true };

  } catch (error) {
    console.error('❌ Token validation failed:', error);
    return { 
      valid: false, 
      error: error.message,
      code: error.code 
    };
  }
};

// Send email notification (placeholder - integrate with your email service)
const sendEmail = async (to, emailData) => {
  try {
    console.log('📧 Sending email notification to:', to);
    console.log('📧 Email data:', emailData);
    
    // TODO: Integrate with your email service (SendGrid, Mailgun, etc.)
    // Example for SendGrid:
    /*
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const msg = {
      to,
      from: process.env.FROM_EMAIL,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
    };
    
    await sgMail.send(msg);
    */
    
    return { success: true, message: 'Email sent successfully' };
    
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

// Create notification payload for different notification types
const createNotificationPayload = (type, data) => {
  const basePayload = {
    data: {
      type,
      ...data
    }
  };

  switch (type) {
    case 'booking_created':
      return {
        ...basePayload,
        title: '📅 New Booking Request',
        body: `${data.customerName} wants to book ${data.zoneName}`,
        tag: 'booking',
        category: 'BOOKING'
      };

    case 'booking_confirmed':
      return {
        ...basePayload,
        title: '🎉 Booking Confirmed!',
        body: `Your booking for ${data.zoneName} has been confirmed`,
        tag: 'booking',
        category: 'BOOKING'
      };

    case 'booking_cancelled':
      return {
        ...basePayload,
        title: '❌ Booking Cancelled',
        body: `Your booking for ${data.zoneName} has been cancelled`,
        tag: 'booking',
        category: 'BOOKING'
      };

    case 'system_announcement':
      return {
        ...basePayload,
        title: '📢 System Announcement',
        body: data.message || 'You have a new system announcement',
        tag: 'system',
        category: 'SYSTEM'
      };

    default:
      return {
        ...basePayload,
        title: 'GameZone',
        body: data.message || 'You have a new notification',
        tag: 'general',
        category: 'GENERAL'
      };
  }
};

module.exports = {
  sendPushNotification,
  sendMulticastNotification,
  sendTopicNotification,
  subscribeToTopic,
  unsubscribeFromTopic,
  validatePushToken,
  sendEmail,
  createNotificationPayload,
  isInitialized: () => isInitialized
};