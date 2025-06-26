import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import ApiService from '../services/api';

const GameZoneContext = createContext();

export const useGameZone = () => useContext(GameZoneContext);

export const GameZoneProvider = ({ children }) => {
  const [gameZones, setGameZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [searchRadius, setSearchRadius] = useState(10);
  const [availabilityData, setAvailabilityData] = useState({});

  // Fetch gaming zones from API
  const fetchGameZones = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Fetching gaming zones with params:', params);
      const response = await ApiService.getGameZones(params);
      console.log('Gaming zones response:', response);
      
      // Handle different response formats
      const zones = response.gameZones || response || [];
      setGameZones(zones);
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch gaming zones:', err);
      // Set empty array on error
      setGameZones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Get user location
  const getUserLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          setLocationError(null);
          
          console.log('Got user location:', location);
          
          // Fetch nearby gaming zones
          fetchGameZones({
            lat: location.lat,
            lng: location.lng,
            radius: searchRadius
          });
        },
        (error) => {
          setLocationError('Unable to retrieve your location');
          console.error('Error getting location:', error);
          // Fetch all gaming zones if location fails
          fetchGameZones();
        }
      );
    } else {
      setLocationError('Geolocation is not supported by your browser');
      fetchGameZones();
    }
  }, [searchRadius, fetchGameZones]);

  // Get availability for a specific zone and date
  const generateMockAvailability = useCallback(async (zoneId, date) => {
    try {
      console.log('Fetching availability for zone:', zoneId, 'date:', date);
      const response = await ApiService.getAvailability(zoneId, date);
      console.log('Availability response:', response);
      
      setAvailabilityData(prev => ({
        ...prev,
        [zoneId]: {
          ...prev[zoneId],
          [date]: response.availability
        }
      }));
      
      return response.availability;
    } catch (error) {
      console.error('Failed to fetch availability:', error);
      
      // Fallback to mock data if API fails
      const mockAvailability = {};
      for (let hour = 9; hour <= 20; hour++) {
        const time = `${hour.toString().padStart(2, '0')}:00`;
        mockAvailability[time] = Math.random() > 0.3;
      }
      
      setAvailabilityData(prev => ({
        ...prev,
        [zoneId]: {
          ...prev[zoneId],
          [date]: mockAvailability
        }
      }));
      
      return mockAvailability;
    }
  }, []);

  // Get nearby gaming zones (computed property)
  const getNearbyGameZones = useCallback(() => {
    return gameZones; // Already filtered by the API
  }, [gameZones]);

  // Initial load
  useEffect(() => {
    console.log('GameZoneContext: Initial load');
    getUserLocation();
  }, [getUserLocation]);

  // Update search when radius changes
  useEffect(() => {
    if (userLocation) {
      console.log('Updating search radius to:', searchRadius);
      fetchGameZones({
        lat: userLocation.lat,
        lng: userLocation.lng,
        radius: searchRadius
      });
    }
  }, [searchRadius, userLocation, fetchGameZones]);

  const value = useMemo(() => ({
    gameZones: getNearbyGameZones(),
    loading,
    error,
    userLocation,
    locationError,
    searchRadius,
    setSearchRadius,
    getUserLocation,
    fetchGameZones,
    availabilityData,
    generateMockAvailability
  }), [
    getNearbyGameZones,
    loading,
    error,
    userLocation,
    locationError,
    searchRadius,
    getUserLocation,
    fetchGameZones,
    availabilityData,
    generateMockAvailability
  ]);

  return (
    <GameZoneContext.Provider value={value}>
      {children}
    </GameZoneContext.Provider>
  );
};