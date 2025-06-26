import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { format, addDays, parseISO } from 'date-fns';
import { useGameZone } from '../context/GameZoneContext';
import { FaClock, FaCheck, FaTimes } from 'react-icons/fa';

const AvailabilityCalendar = ({ zoneId, onSlotSelect }) => {
  const { availabilityData, generateMockAvailability } = useGameZone();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState(null);

  const updateAvailability = useCallback(() => {
    generateMockAvailability(zoneId, selectedDate);
  }, [generateMockAvailability, zoneId, selectedDate]);

  useEffect(() => {
    updateAvailability();
  }, [updateAvailability]);

  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(new Date(), i);
    return format(date, 'yyyy-MM-dd');
  });

  const handleDateChange = (date) => {
    setSelectedDate(date);
    setSelectedTime(null);
  };

  const handleTimeSelect = (time) => {
    setSelectedTime(time);
    onSlotSelect({ date: selectedDate, time });
  };

  return (
    <div className="space-y-6">
      {/* Date Selection */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-700">Select Date</h3>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {dateOptions.map((date) => (
            <motion.button
              key={date}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleDateChange(date)}
              className={`p-3 rounded-lg text-center transition-colors ${
                selectedDate === date
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <div className="text-sm">{format(parseISO(date), 'EEE')}</div>
              <div className="font-semibold">{format(parseISO(date), 'd')}</div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Time Slots */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-700">Select Time</h3>
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {Object.entries(availabilityData[zoneId]?.[selectedDate] || {}).map(([time, available]) => (
            <motion.button
              key={time}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!available}
              onClick={() => handleTimeSelect(time)}
              className={`
                p-3 rounded-lg flex items-center justify-center gap-2
                ${available 
                  ? selectedTime === time
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              <FaClock className="text-sm" />
              <span>{time}</span>
              {available ? (
                <FaCheck className="text-green-500" />
              ) : (
                <FaTimes className="text-red-500" />
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {selectedTime && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-green-50 rounded-lg"
        >
          <p className="text-green-800">
            Selected slot: {format(parseISO(selectedDate), 'MMMM d, yyyy')} at {selectedTime}
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default AvailabilityCalendar;