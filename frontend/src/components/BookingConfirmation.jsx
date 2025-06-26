import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { FaCheckCircle, FaClock, FaMapMarkerAlt, FaDownload } from 'react-icons/fa';
import { useBooking } from '../context/BookingContext';

const BookingConfirmation = () => {
  const { currentBooking } = useBooking();

  useEffect(() => {
    if (currentBooking) {
      // Save booking to local storage
      const savedBookings = JSON.parse(localStorage.getItem('bookings') || '[]');
      savedBookings.push(currentBooking);
      localStorage.setItem('bookings', JSON.stringify(savedBookings));
    }
  }, [currentBooking]);

  if (!currentBooking) return null;

  const downloadQR = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `booking-${currentBooking.reference}.png`;
      link.href = url;
      link.click();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden"
    >
      <div className="bg-primary text-white p-6 text-center">
        <FaCheckCircle className="text-5xl mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Booking Confirmed!</h2>
        <p className="text-primary-100">Reference: {currentBooking.reference}</p>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex justify-center">
          <div className="p-4 bg-white rounded-lg shadow-md">
            <QRCodeSVG
              value={currentBooking.qrData}
              size={200}
              level="H"
              includeMargin
            />
            <button
              onClick={downloadQR}
              className="mt-4 flex items-center justify-center w-full gap-2 text-primary hover:text-primary/80 transition-colors"
            >
              <FaDownload />
              Download QR Code
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <FaMapMarkerAlt className="text-gray-400 mt-1" />
            <div>
              <h3 className="font-semibold">{currentBooking.zoneName}</h3>
              <p className="text-gray-600">{currentBooking.zoneLocation}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <FaClock className="text-gray-400 mt-1" />
            <div>
              <h3 className="font-semibold">Date & Time</h3>
              <p className="text-gray-600">
                {currentBooking.date} at {currentBooking.time}
              </p>
              <p className="text-gray-600">
                Duration: {currentBooking.duration} hour{currentBooking.duration > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Total Amount Paid</span>
            <span className="text-xl font-bold text-primary">
              ${currentBooking.amount}
            </span>
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-800 mb-2">Important Information</h4>
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• Please arrive 10 minutes before your scheduled time</li>
            <li>• Present this QR code at the venue</li>
            <li>• Booking is non-transferable</li>
            <li>• Cancellation policy applies</li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
};

export default BookingConfirmation;