import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useGameZone } from '../context/GameZoneContext';
import { FaCalendarAlt, FaMoneyBillWave, FaQrcode } from 'react-icons/fa';

const VendorDashboard = () => {
  const { user } = useAuth();
  const { gameZones } = useGameZone();
  const [bookings, setBookings] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);

  useEffect(() => {
    // Mock data - in a real app, this would be an API call
    const mockBookings = [
      {
        id: '1',
        zoneId: 1,
        reference: 'GZ-123456',
        customer: 'user@example.com',
        date: '2023-06-15',
        time: '14:00',
        duration: 2,
        amount: 100,
        status: 'paid',
        qrData: 'GZ-123456'
      },
      {
        id: '2',
        zoneId: 1,
        reference: 'GZ-789012',
        customer: 'another@example.com',
        date: '2023-06-16',
        time: '16:00',
        duration: 1,
        amount: 50,
        status: 'pending',
        qrData: 'GZ-789012'
      }
    ];
    setBookings(mockBookings);
  }, []);

  const filteredBookings = selectedZone 
    ? bookings.filter(b => b.zoneId === selectedZone)
    : bookings;

  const totalRevenue = bookings
    .filter(b => b.status === 'paid')
    .reduce((sum, booking) => sum + booking.amount, 0);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold text-dark">Vendor Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div 
          whileHover={{ scale: 1.02 }}
          className="bg-white p-4 rounded-lg shadow-md"
        >
          <h3 className="text-gray-500">Total Bookings</h3>
          <p className="text-3xl font-bold">{bookings.length}</p>
        </motion.div>
        
        <motion.div 
          whileHover={{ scale: 1.02 }}
          className="bg-white p-4 rounded-lg shadow-md"
        >
          <h3 className="text-gray-500">Total Revenue</h3>
          <p className="text-3xl font-bold">${totalRevenue}</p>
        </motion.div>
        
        <motion.div 
          whileHover={{ scale: 1.02 }}
          className="bg-white p-4 rounded-lg shadow-md"
        >
          <h3 className="text-gray-500">Your Zones</h3>
          <p className="text-3xl font-bold">
            {gameZones.filter(z => z.vendorId === user?.id).length}
          </p>
        </motion.div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Bookings</h2>
          <select
            value={selectedZone || ''}
            onChange={(e) => setSelectedZone(e.target.value ? parseInt(e.target.value) : null)}
            className="border rounded-md p-2"
          >
            <option value="">All Zones</option>
            {gameZones.map(zone => (
              <option key={zone.id} value={zone.id}>{zone.name}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBookings.map(booking => {
                const zone = gameZones.find(z => z.id === booking.zoneId);
                return (
                  <tr key={booking.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{booking.reference}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {zone?.name || 'Unknown Zone'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {booking.date} at {booking.time}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${booking.amount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${booking.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <button className="text-primary hover:text-primary/80 mr-2">
                        <FaQrcode />
                      </button>
                      <button className="text-green-600 hover:text-green-800">
                        <FaMoneyBillWave />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VendorDashboard;