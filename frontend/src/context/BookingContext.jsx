import { createContext, useContext, useState } from 'react';
import ApiService from '../services/api';

const BookingContext = createContext();

export const useBooking = () => useContext(BookingContext);

export const BookingProvider = ({ children }) => {
  const [currentBooking, setCurrentBooking] = useState(null);
  const [userBookings, setUserBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createBooking = async (zoneDetails, slotDetails, paymentDetails) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Creating booking:', { zoneDetails, slotDetails, paymentDetails });
      
      const bookingData = {
        zoneId: zoneDetails.id || zoneDetails._id,
        date: slotDetails.date,
        timeSlot: slotDetails.time,
        duration: slotDetails.duration || 1,
        notes: slotDetails.notes || ''
      };
      
      const response = await ApiService.createBooking(bookingData);
      console.log('Booking created:', response);
      
      // Set current booking for confirmation display
      const booking = {
        reference: response.booking.reference,
        zoneName: response.booking.zone?.name || zoneDetails.name,
        zoneLocation: response.booking.zone?.location?.address || zoneDetails.location?.address,
        date: new Date(response.booking.date).toLocaleDateString(),
        time: response.booking.timeSlot,
        duration: response.booking.duration,
        amount: response.booking.totalAmount,
        status: response.booking.status,
        qrData: response.booking.qrCode,
        created: response.booking.createdAt
      };
      
      setCurrentBooking(booking);
      
      // Add to user bookings list
      setUserBookings(prev => [response.booking, ...prev]);
      
      return booking;
    } catch (error) {
      console.error('Failed to create booking:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const fetchUserBookings = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await ApiService.getUserBookings();
      console.log('User bookings fetched:', response);
      
      const bookings = response.bookings || response || [];
      setUserBookings(bookings);
      
      return bookings;
    } catch (error) {
      console.error('Failed to fetch user bookings:', error);
      setError(error.message);
      setUserBookings([]);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (bookingId, reason) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Cancelling booking:', bookingId, 'reason:', reason);
      
      await ApiService.cancelBooking(bookingId, reason);
      
      // Update local state
      setUserBookings(prev => 
        prev.map(booking => 
          booking._id === bookingId 
            ? { ...booking, status: 'cancelled', cancellationReason: reason }
            : booking
        )
      );
      
      // Clear current booking if it's the one being cancelled
      if (currentBooking && currentBooking.reference) {
        const cancelled = userBookings.find(b => b._id === bookingId);
        if (cancelled && cancelled.reference === currentBooking.reference) {
          setCurrentBooking(null);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to cancel booking:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getBookingById = async (bookingId) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await ApiService.getBooking(bookingId);
      console.log('Booking details fetched:', response);
      
      return response.booking;
    } catch (error) {
      console.error('Failed to fetch booking details:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Legacy method for backward compatibility
  const generateBookingReference = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `GZ-${timestamp}-${random}`.toUpperCase();
  };

  return (
    <BookingContext.Provider value={{
      currentBooking,
      setCurrentBooking,
      userBookings,
      loading,
      error,
      createBooking,
      fetchUserBookings,
      cancelBooking,
      getBookingById,
      generateBookingReference // For backward compatibility
    }}>
      {children}
    </BookingContext.Provider>
  );
};