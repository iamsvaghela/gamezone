import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGameZone } from '../context/GameZoneContext';
import { useAuth } from '../context/AuthContext';
import { FaSpinner, FaExclamationTriangle } from 'react-icons/fa';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import PaymentForm from '../components/PaymentForm';
import ApiService from '../services/api';

const Booking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { gameZones } = useGameZone();
  const { user } = useAuth();
  const [zone, setZone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [duration, setDuration] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [bookingError, setBookingError] = useState(null);

  // Check authentication
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    if (user.role === 'vendor') {
      alert('Vendors cannot make bookings. Please login as a user.');
      navigate('/');
      return;
    }
  }, [user, navigate]);

  // Load zone data
  useEffect(() => {
    const loadZone = async () => {
      if (!id) {
        setError('No zone ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // First try to find in existing gameZones
        const existingZone = gameZones.find(z => z._id === id);
        
        if (existingZone) {
          console.log('Found zone in gameZones:', existingZone);
          setZone(existingZone);
          setLoading(false);
          return;
        }

        // If not found, fetch from API
        console.log('Fetching zone from API, ID:', id);
        const response = await ApiService.getGameZone(id);
        console.log('Zone API response:', response);
        
        setZone(response);
      } catch (err) {
        console.error('Failed to load zone:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadZone();
  }, [id, gameZones]);

  const handleSlotSelect = (slot) => {
    console.log('Slot selected:', slot);
    setSelectedSlot(slot);
    setBookingError(null);
    setShowPayment(false);
  };

  const handleProceedToPayment = () => {
    if (!selectedSlot) {
      setBookingError('Please select a time slot');
      return;
    }
    
    console.log('Proceeding to payment with slot:', selectedSlot);
    setShowPayment(true);
  };

  const handlePaymentSuccess = () => {
    console.log('Payment successful, redirecting...');
    // Redirect to booking confirmation or home
    setTimeout(() => {
      navigate('/', { state: { bookingSuccess: true } });
    }, 2000);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <FaSpinner className="animate-spin text-4xl text-primary mr-4" />
        <div className="text-center">
          <div className="text-lg">Loading booking details...</div>
          <div className="text-sm text-gray-500 mt-1">Zone ID: {id}</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-8">
        <FaExclamationTriangle className="text-red-500 text-4xl mx-auto mb-4" />
        <div className="text-red-600 mb-4 text-lg">Failed to load zone</div>
        <div className="text-gray-600 mb-4">{error}</div>
        <div className="text-sm text-gray-500 mb-4">Zone ID: {id}</div>
        <div className="space-x-4">
          <button 
            onClick={() => navigate('/')}
            className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
          >
            Back to Home
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Zone not found
  if (!zone) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-600 mb-4 text-lg">Zone not found</div>
        <div className="text-sm text-gray-500 mb-4">
          Zone ID: {id}
          <br />
          Available zones: {gameZones.length}
        </div>
        <button 
          onClick={() => navigate('/')}
          className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90"
        >
          Back to Home
        </button>
        
        {/* Debug info */}
        <div className="mt-6 p-4 bg-gray-100 rounded text-left text-sm">
          <strong>Debug Info:</strong>
          <div>Requested ID: {id}</div>
          <div>Available zones: {gameZones.map(z => z._id).join(', ')}</div>
          <div>Total zones: {gameZones.length}</div>
        </div>
      </div>
    );
  }

  const totalAmount = zone.pricePerHour * duration;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark mb-2">Book {zone.name}</h1>
        <p className="text-gray-600">{zone.location?.address}</p>
        <div className="text-sm text-gray-500 mt-1">
          Booking as: {user?.name} ({user?.email})
        </div>
      </div>

      {!showPayment ? (
        <div className="space-y-8">
          <AvailabilityCalendar 
            zoneId={zone._id}
            onSlotSelect={handleSlotSelect}
          />

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700">Duration</h3>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full p-3 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {[1, 2, 3, 4, 5, 6].map((hrs) => (
                <option key={hrs} value={hrs}>
                  {hrs} hour{hrs > 1 ? 's' : ''} - ${zone.pricePerHour * hrs}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t pt-6">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Zone:</span>
                <span>{zone.name}</span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Hourly Rate:</span>
                <span>${zone.pricePerHour}/hour</span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Duration:</span>
                <span>{duration} hour{duration > 1 ? 's' : ''}</span>
              </div>
              {selectedSlot && (
                <div className="flex justify-between text-lg">
                  <span className="font-semibold">Selected Slot:</span>
                  <span>{selectedSlot.date} at {selectedSlot.time}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold text-primary pt-2 border-t">
                <span>Total Amount:</span>
                <span>${totalAmount}</span>
              </div>
            </div>

            {bookingError && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200">
                {bookingError}
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleProceedToPayment}
              disabled={!selectedSlot}
              className="w-full mt-6 bg-primary text-white py-3 rounded-md hover:bg-primary/90 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              {selectedSlot ? 'Proceed to Payment' : 'Select a Time Slot First'}
            </motion.button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-3">Booking Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Zone:</span>
                <span className="font-medium">{zone.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="font-medium">{selectedSlot.date}</span>
              </div>
              <div className="flex justify-between">
                <span>Time:</span>
                <span className="font-medium">{selectedSlot.time}</span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="font-medium">{duration} hour{duration > 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total:</span>
                <span className="text-primary">${totalAmount}</span>
              </div>
            </div>
          </div>
          
          <PaymentForm 
            amount={totalAmount}
            onSuccess={handlePaymentSuccess}
          />
        </div>
      )}
    </motion.div>
  );
};

export default Booking;