// services/FirebaseService.js - Firebase integration
const admin = require('firebase-admin');

class FirebaseService {
  constructor() {
    this.isInitialized = false;
    this.initializeFirebase();
  }

  initializeFirebase() {
    if (this.isInitialized) return;

    try {
      // Check if Firebase is already initialized
      if (admin.apps.length > 0) {
        console.log('✅ Firebase already initialized');
        this.isInitialized = true;
        return;
      }

      // Check for Firebase credentials
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL) {
        console.warn('⚠️  Firebase credentials not found. Push notifications will be disabled.');
        console.log('Add these environment variables:');
        console.log('- FIREBASE_PROJECT_ID');
        console.log('- FIREBASE_PRIVATE_KEY');
        console.log('- FIREBASE_CLIENT_EMAIL');
        return;
      }

      // Initialize Firebase Admin SDK
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });

      this.isInitialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');

    } catch (error) {
      console.error('❌ Firebase initialization failed:', error);
      console.log('Push notifications will be disabled');
    }
  }

  async sendPushNotification(token, payload) {
    try {
      if (!this.isInitialized) {
        console.warn('⚠️  Firebase not initialized, skipping push notification');
        return { success: false, error: 'Firebase not initialized' };
      }

      if (!token) {
        console.warn('⚠️  No push token provided');
        return { success: false, error: 'No push token' };
      }

      const message = {
        token,
        notification: {
          title: payload.title || 'GameZone',
          body: payload.body || 'You have a new notification',
        },
        data: {
          type: payload.type || 'general',
          ...payload.data,
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log('✅ Push notification sent successfully:', response);
      
      return { success: true, messageId: response };

    } catch (error) {
      console.error('❌ Push notification failed:', error);
      
      if (error.code === 'messaging/invalid-registration-token') {
        return { success: false, error: 'Invalid token', shouldRemoveToken: true };
      }
      
      return { success: false, error: error.message };
    }
  }

  async sendToMultipleDevices(tokens, payload) {
    try {
      if (!this.isInitialized) {
        console.warn('⚠️  Firebase not initialized, skipping multicast notification');
        return { success: false, error: 'Firebase not initialized' };
      }

      const validTokens = tokens.filter(token => token && typeof token === 'string');
      
      if (validTokens.length === 0) {
        return { success: false, error: 'No valid tokens' };
      }

      const message = {
        tokens: validTokens,
        notification: {
          title: payload.title || 'GameZone',
          body: payload.body || 'You have a new notification',
        },
        data: {
          type: payload.type || 'general',
          ...payload.data,
          timestamp: new Date().toISOString(),
        },
      };

      const response = await admin.messaging().sendMulticast(message);
      
      console.log('✅ Multicast notification sent:', {
        successCount: response.successCount,
        failureCount: response.failureCount,
      });

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };

    } catch (error) {
      console.error('❌ Multicast notification failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const firebaseService = new FirebaseService();
module.exports = firebaseService;