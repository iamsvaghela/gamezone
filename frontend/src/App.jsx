import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import GameZoneDetails from './pages/GameZoneDetails';
import Booking from './pages/Booking';
import LoginForm from './components/LoginForm';
import VendorDashboard from './pages/VendorDashboard';
import { GameZoneProvider } from './context/GameZoneContext';
import { PaymentProvider } from './context/PaymentContext';
import { BookingProvider } from './context/BookingContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <GameZoneProvider>
        <PaymentProvider>
          <BookingProvider>
            <div className="min-h-screen bg-gray-50">
              <Navbar />
              <main className="container mx-auto px-4 py-6">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/login" element={<LoginForm />} />
                  <Route path="/zone/:id" element={<GameZoneDetails />} />
                  <Route 
                    path="/booking/:id" 
                    element={
                      <ProtectedRoute role="user">
                        <Booking />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/vendor" 
                    element={
                      <ProtectedRoute role="vendor">
                        <VendorDashboard />
                      </ProtectedRoute>
                    } 
                  />
                </Routes>
              </main>
            </div>
          </BookingProvider>
        </PaymentProvider>
      </GameZoneProvider>
    </AuthProvider>
  );
}

export default App;