import { createContext, useContext, useState } from 'react';

const PaymentContext = createContext();

export const usePayment = () => useContext(PaymentContext);

export const PaymentProvider = ({ children }) => {
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [processing, setProcessing] = useState(false);

  const validateCard = (number) => {
    return /^[0-9]{16}$/.test(number.replace(/\s/g, ''));
  };

  const validateExpiry = (expiry) => {
    const [month, year] = expiry.split('/');
    const currentYear = new Date().getFullYear() % 100;
    const currentMonth = new Date().getMonth() + 1;
    
    return month >= 1 && month <= 12 && 
           year >= currentYear &&
           (year > currentYear || month >= currentMonth);
  };

  const validateCVV = (cvv) => {
    return /^[0-9]{3,4}$/.test(cvv);
  };

  const processPayment = async (paymentDetails, amount) => {
    setProcessing(true);
    setPaymentStatus(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!validateCard(paymentDetails.cardNumber) ||
          !validateExpiry(paymentDetails.expiry) ||
          !validateCVV(paymentDetails.cvv)) {
        throw new Error('Invalid card details');
      }

      setPaymentStatus({ success: true, message: 'Payment processed successfully' });
      return true;
    } catch (error) {
      setPaymentStatus({ success: false, message: error.message });
      return false;
    } finally {
      setProcessing(false);
    }
  };

  return (
    <PaymentContext.Provider value={{
      processPayment,
      paymentStatus,
      processing
    }}>
      {children}
    </PaymentContext.Provider>
  );
};