import { motion } from 'framer-motion';
import { useGameZone } from '../context/GameZoneContext';
import { FaLocationArrow, FaSearch } from 'react-icons/fa';

const LocationFilter = () => {
  const { 
    userLocation, 
    locationError, 
    searchRadius, 
    setSearchRadius,
    getUserLocation 
  } = useGameZone();

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-4 rounded-lg shadow-md mb-6"
    >
      <div className="flex flex-col md:flex-row items-center gap-4">
        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search Radius (km)
          </label>
          <input
            type="range"
            min="1"
            max="50"
            value={searchRadius}
            onChange={(e) => setSearchRadius(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="text-sm text-gray-600 mt-1">
            {searchRadius} km
          </div>
        </div>

        <button
          onClick={getUserLocation}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
        >
          <FaLocationArrow />
          {userLocation ? 'Update Location' : 'Get Location'}
        </button>
      </div>

      {locationError && (
        <div className="mt-2 text-red-500 text-sm">
          {locationError}
        </div>
      )}

      {userLocation && (
        <div className="mt-2 text-sm text-gray-600">
          Current location: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
        </div>
      )}
    </motion.div>
  );
};

export default LocationFilter;