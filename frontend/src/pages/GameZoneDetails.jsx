import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGameZone } from '../context/GameZoneContext';
import { useAuth } from '../context/AuthContext';
import { FaStar, FaMapMarkerAlt, FaRoute, FaClock, FaUsers, FaSpinner } from 'react-icons/fa';
import ApiService from '../services/api';

const GameZoneDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { gameZones, userLocation } = useGameZone();
  const { user } = useAuth();
  const [zone, setZone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Try to find zone in existing gameZones first, then fetch if not found
  useEffect(() => {
    const existingZone = gameZones.find(z => z._id === id);
    
    if (existingZone) {
      setZone(existingZone);
      setLoading(false);
    } else {
      // Fetch zone details from API
      fetchZoneDetails();
    }
  }, [id, gameZones]);

  const fetchZoneDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching zone details for ID:', id);
      const response = await ApiService.getGameZone(id);
      console.log('Zone details response:', response);
      
      setZone(response);
    } catch (err) {
      console.error('Failed to fetch zone details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openInMaps = () => {
    if (!zone?.location?.coordinates) return;
    
    const coords = zone.location.coordinates;
    // Handle both old format {lat, lng} and new GeoJSON format
    const lat = coords.coordinates ? coords.coordinates[1] : coords.lat;
    const lng = coords.coordinates ? coords.coordinates[0] : coords.lng;
    
    let mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    
    if (userLocation) {
      mapsUrl = `${mapsUrl}&origin=${userLocation.lat},${userLocation.lng}`;
    }
    
    window.open(mapsUrl, '_blank');
  };

  const handleBookNow = () => {
    if (!user) {
      // Redirect to login if not authenticated
      navigate('/login');
      return;
    }
    
    if (user.role === 'vendor') {
      alert('Vendors cannot make bookings. Please login as a user.');
      return;
    }
    
    navigate(`/booking/${zone._id}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <FaSpinner className="animate-spin text-4xl text-primary mr-4" />
        <span className="text-lg">Loading zone details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-4 text-lg">Error loading zone details</div>
        <div className="text-gray-600 mb-4">{error}</div>
        <div className="space-x-4">
          <button 
            onClick={() => navigate('/')}
            className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
          >
            Back to Home
          </button>
          <button 
            onClick={fetchZoneDetails}
            className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!zone) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-600 mb-4">Zone not found</div>
        <button 
          onClick={() => navigate('/')}
          className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Image Gallery */}
      <div className="relative">
        <img 
          src={zone.images && zone.images[0] ? zone.images[0] : 'https://via.placeholder.com/800x400?text=Gaming+Zone'} 
          alt={zone.name}
          className="w-full h-64 md:h-96 object-cover rounded-lg"
          onError={(e) => {
            e.target.src = 'https://via.placeholder.com/800x400?text=Gaming+Zone';
          }}
        />
        
        {/* Additional Images */}
        {zone.images && zone.images.length > 1 && (
          <div className="absolute bottom-4 right-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded">
            +{zone.images.length - 1} more photos
          </div>
        )}
      </div>
      
      {/* Zone Details */}
      <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-dark mb-2">{zone.name}</h1>
            <p className="text-gray-600 mb-4">{zone.description}</p>
          </div>
          
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">
              ${zone.pricePerHour}
              <span className="text-lg text-gray-500">/hr</span>
            </div>
          </div>
        </div>
        
        {/* Location and Rating */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 text-gray-600">
          <div className="flex items-start gap-2">
            <FaMapMarkerAlt className="mt-1 flex-shrink-0" />
            <span>{zone.location?.address || 'Address not available'}</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <FaStar className="text-yellow-400 mr-1" />
              <span className="font-medium">{zone.rating || 4.0}</span>
              {zone.totalReviews > 0 && (
                <span className="text-gray-500 ml-1">({zone.totalReviews} reviews)</span>
              )}
            </div>
            
            {zone.distance && (
              <div className="flex items-center">
                <FaRoute className="mr-1" />
                <span>{zone.distance.toFixed(1)} km away</span>
              </div>
            )}
          </div>
        </div>

        {/* Operating Hours and Capacity */}
        <div className="flex flex-col md:flex-row gap-4 text-gray-600">
          {zone.operatingHours && (
            <div className="flex items-center gap-2">
              <FaClock />
              <span>
                Open: {zone.operatingHours.start} - {zone.operatingHours.end}
              </span>
            </div>
          )}
          
          {zone.capacity && (
            <div className="flex items-center gap-2">
              <FaUsers />
              <span>Capacity: {zone.capacity} people</span>
            </div>
          )}
        </div>

        {/* Amenities */}
        {zone.amenities && zone.amenities.length > 0 && (
          <div>
            <h3 className="font-semibold text-lg mb-3">Amenities & Features</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {zone.amenities.map((amenity, index) => (
                <span 
                  key={index}
                  className="bg-gray-100 px-3 py-2 rounded-full text-sm text-center hover:bg-gray-200 transition-colors"
                >
                  {amenity}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Vendor Info */}
        {zone.vendorId && (
          <div className="border-t pt-4">
            <h3 className="font-semibold text-lg mb-2">Managed by</h3>
            <div className="text-gray-600">
              <div className="font-medium">{zone.vendorId.name || 'GameZone Vendor'}</div>
              {zone.vendorId.email && (
                <div className="text-sm">{zone.vendorId.email}</div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col md:flex-row gap-3 pt-4 border-t">
          <button
            onClick={openInMaps}
            className="flex-1 bg-secondary text-white px-6 py-3 rounded-md hover:bg-secondary/90 transition-colors font-medium"
            disabled={!zone.location?.coordinates}
          >
            Get Directions
          </button>
          
          <button
            onClick={handleBookNow}
            className="flex-1 bg-primary text-white px-6 py-3 rounded-md hover:bg-primary/90 transition-colors font-medium"
          >
            {!user ? 'Login to Book' : 'Book Now'}
          </button>
        </div>

        {/* Login Prompt for non-authenticated users */}
        {!user && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-blue-800 text-center">
              <strong>Ready to book?</strong> Please login to make a reservation.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default GameZoneDetails;