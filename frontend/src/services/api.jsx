// src/services/api.js

// API base URL configuration
// In production (Railway), API and frontend are served from same domain
// In development, frontend runs on :5173, backend on :3000
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api');

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
    console.log('🔧 API Base URL:', this.baseURL);
  }

  // Get auth token from localStorage
  getAuthToken() {
    return localStorage.getItem('token');
  }

  // Create headers with auth token
  getHeaders() {
    const token = this.getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  // Generic API call method
  async apiCall(endpoint, options = {}) {
    // Remove leading slash if present to avoid double slashes
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const url = `${this.baseURL}/${cleanEndpoint}`;
    
    const config = {
      headers: this.getHeaders(),
      ...options
    };

    try {
      console.log(`🌐 API Call: ${options.method || 'GET'} ${url}`);
      const response = await fetch(url, config);
      
      // Handle different content types
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const errorMessage = typeof data === 'object' ? data.error || data.message : data;
        throw new Error(errorMessage || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('❌ API call error:', error);
      
      // Handle network errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Please check your internet connection or try again later.');
      }
      
      throw error;
    }
  }

  // Authentication APIs
  async login(credentials) {
    const result = await this.apiCall('auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    
    // Store token if login successful
    if (result.token) {
      localStorage.setItem('token', result.token);
      console.log('✅ Login successful, token stored');
    }
    
    return result;
  }

  async register(userData) {
    const result = await this.apiCall('auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    
    // Store token if registration successful
    if (result.token) {
      localStorage.setItem('token', result.token);
      console.log('✅ Registration successful, token stored');
    }
    
    return result;
  }

  async getProfile() {
    return this.apiCall('auth/profile');
  }

  // Logout method
  logout() {
    localStorage.removeItem('token');
    console.log('✅ Logged out, token removed');
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.getAuthToken();
  }

  // Gaming Zones APIs
  async getGameZones(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.apiCall(`gamezones${queryString ? `?${queryString}` : ''}`);
  }

  async getGameZone(id) {
    return this.apiCall(`gamezones/${id}`);
  }

  async getAvailability(zoneId, date) {
    return this.apiCall(`gamezones/${zoneId}/availability?date=${date}`);
  }

  // Booking APIs
  async createBooking(bookingData) {
    return this.apiCall('bookings', {
      method: 'POST',
      body: JSON.stringify(bookingData)
    });
  }

  async getUserBookings(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.apiCall(`bookings${queryString ? `?${queryString}` : ''}`);
  }

  async getBooking(id) {
    return this.apiCall(`bookings/${id}`);
  }

  async cancelBooking(id, reason) {
    return this.apiCall(`bookings/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ cancellationReason: reason })
    });
  }

  // Vendor APIs
  async getVendorDashboard() {
    return this.apiCall('vendor/dashboard');
  }

  async getVendorBookings(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.apiCall(`vendor/bookings${queryString ? `?${queryString}` : ''}`);
  }

  async updateBookingStatus(bookingId, status) {
    return this.apiCall(`vendor/bookings/${bookingId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }

  async getVendorAnalytics(period = '30days') {
    return this.apiCall(`vendor/analytics?period=${period}`);
  }

  // Health check for debugging
  async healthCheck() {
    try {
      // Health check doesn't need /api prefix
      const healthUrl = import.meta.env.PROD ? '/health' : 'http://localhost:3000/health';
      const response = await fetch(healthUrl);
      return await response.json();
    } catch (error) {
      console.error('❌ Health check failed:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
const apiService = new ApiService();

// Export both the class and instance for flexibility
export { ApiService };
export default apiService;