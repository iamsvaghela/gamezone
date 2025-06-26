import { createContext, useContext, useState, useEffect } from 'react';
import ApiService from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await ApiService.getProfile();
          setUser(response.user);
          
          // Redirect vendors to dashboard if they're on wrong page
          if (response.user.role === 'vendor' && !window.location.hash.includes('/vendor')) {
            window.location.hash = '#/vendor';
          }
        } catch (error) {
          console.error('Failed to load user profile:', error);
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (credentials) => {
    try {
      const response = await ApiService.login(credentials);
      localStorage.setItem('token', response.token);
      setUser(response.user);
      
      // Redirect based on role
      if (response.user.role === 'vendor') {
        window.location.hash = '#/vendor';
      } else {
        window.location.hash = '#/';
      }
      
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const register = async (userData) => {
    try {
      const response = await ApiService.register(userData);
      localStorage.setItem('token', response.token);
      setUser(response.user);
      
      // Redirect based on role
      if (response.user.role === 'vendor') {
        window.location.hash = '#/vendor';
      } else {
        window.location.hash = '#/';
      }
      
      return response;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    window.location.hash = '#/';
  };

  const isVendor = () => {
    return user?.role === 'vendor';
  };

  const isUser = () => {
    return user?.role === 'user';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      register,
      logout, 
      isVendor, 
      isUser 
    }}>
      {children}
    </AuthContext.Provider>
  );
};