import { motion } from 'framer-motion';
import { useGameZone } from '../context/GameZoneContext';
import { Link } from 'react-router-dom';
import { FaStar, FaMapMarkerAlt, FaSearch, FaSpinner, FaExclamationTriangle } from 'react-icons/fa';
import LocationFilter from '../components/LocationFilter';
import { useState } from 'react';

const Home = () => {
  const { gameZones, loading, error, fetchGameZones } = useGameZone();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredZones = gameZones.filter(zone => 
    zone.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (zone.location?.address && zone.location.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <FaSpinner className="animate-spin text-4xl text-primary mb-4" />
        <span className="text-lg text-gray-600">Loading gaming zones...</span>
        <span className="text-sm text-gray-500 mt-2">Fetching zones from database</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <FaExclamationTriangle className="text-red-500 text-4xl mx-auto mb-4" />
        <div className="text-red-600 mb-4 text-lg font-semibold">
          Error loading gaming zones
        </div>
        <div className="text-gray-600 mb-4">{error}</div>
        <div className="space-x-4">
          <button 
            onClick={() => window.location.reload()}
            className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Reload Page
          </button>
          <button 
            onClick={() => fetchGameZones()}
            className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 transition-colors"
          >
            Retry Fetch
          </button>
        </div>
        <div className="mt-4 text-sm text-gray-500">
          Make sure your backend server is running on port 3000
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-dark mb-2">Game Zones Near You</h1>
        <p className="text-gray-600">Discover and book amazing gaming experiences</p>
      </div>
      
      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FaSearch className="text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search by name or location..."
          className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <LocationFilter />
      
      {/* Results Info */}
      <div className="flex justify-between items-center">
        <div className="text-gray-600">
          {filteredZones.length > 0 ? (
            <>Showing {filteredZones.length} gaming zone{filteredZones.length !== 1 ? 's' : ''}</>
          ) : (
            <>No gaming zones found</>
          )}
        </div>
        {gameZones.length > 0 && (
          <div className="text-sm text-gray-500">
            Total available: {gameZones.length}
          </div>
        )}
      </div>
      
      {filteredZones.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16 bg-gray-50 rounded-lg"
        >
          <div className="text-gray-600 mb-4">
            {searchTerm ? (
              <>
                <FaSearch className="text-4xl mx-auto mb-4 text-gray-400" />
                No game zones match your search for "{searchTerm}"
              </>
            ) : gameZones.length === 0 ? (
              <>
                <FaExclamationTriangle className="text-4xl mx-auto mb-4 text-gray-400" />
                No gaming zones available at the moment
              </>
            ) : (
              'No game zones found within the selected radius.'
            )}
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-primary hover:text-primary/80 underline"
            >
              Clear search
            </button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredZones.map((zone) => (
            <motion.div 
              key={zone._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -5 }}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-all duration-200"
            >
              <div className="relative">
                <img 
                  src={zone.images && zone.images[0] ? zone.images[0] : 'https://via.placeholder.com/400x200?text=Gaming+Zone'} 
                  alt={zone.name} 
                  className="w-full h-48 object-cover"
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/400x200?text=Gaming+Zone';
                  }}
                />
                {zone.distance && (
                  <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-sm">
                    {zone.distance.toFixed(1)} km
                  </div>
                )}
              </div>
              
              <div className="p-4 space-y-3">
                <h2 className="text-xl font-semibold text-dark line-clamp-1">{zone.name}</h2>
                
                <div className="flex items-start text-gray-600">
                  <FaMapMarkerAlt className="mr-2 mt-1 flex-shrink-0" />
                  <span className="text-sm line-clamp-2">
                    {zone.location?.address || 'Address not available'}
                  </span>
                </div>
                
                {/* Amenities Preview */}
                {zone.amenities && zone.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {zone.amenities.slice(0, 3).map((amenity, index) => (
                      <span 
                        key={index}
                        className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs"
                      >
                        {amenity}
                      </span>
                    ))}
                    {zone.amenities.length > 3 && (
                      <span className="text-gray-500 text-xs px-2 py-1">
                        +{zone.amenities.length - 3} more
                      </span>
                    )}
                  </div>
                )}
                
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center">
                    <FaStar className="text-yellow-400 mr-1" />
                    <span className="font-medium">{zone.rating || 4.0}</span>
                    {zone.totalReviews > 0 && (
                      <span className="text-gray-500 text-sm ml-1">
                        ({zone.totalReviews})
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-primary text-lg">
                      ${zone.pricePerHour}
                    </span>
                    <span className="text-gray-500 text-sm">/hr</span>
                  </div>
                </div>
                
                <Link
                  to={`/zone/${zone._id}`}
                  className="block mt-4 bg-primary text-white text-center py-2 px-4 rounded-md hover:bg-primary/90 transition-colors font-medium"
                >
                  View Details & Book
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Debug Info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 bg-gray-100 rounded-lg text-sm text-gray-600">
          <strong>Debug Info:</strong>
          <div>Total zones: {gameZones.length}</div>
          <div>Filtered zones: {filteredZones.length}</div>
          <div>Loading: {loading.toString()}</div>
          <div>Error: {error || 'none'}</div>
        </div>
      )}
    </div>
  );
};

export default Home;