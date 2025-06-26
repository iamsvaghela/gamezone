import { useState } from 'react';
import { motion } from 'framer-motion';
import { FaUser, FaLock, FaSpinner } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const LoginForm = () => {
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!formData.email || !formData.password) {
        throw new Error('Please fill all fields');
      }

      console.log('Attempting login with:', { email: formData.email });
      
      const response = await login({
        email: formData.email,
        password: formData.password
      });

      console.log('Login successful:', response.user);
      
      // Redirect happens automatically in AuthContext
      
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillTestCredentials = (type) => {
    if (type === 'user') {
      setFormData({
        email: 'user@gamezone.com',
        password: 'password123'
      });
    } else if (type === 'vendor') {
      setFormData({
        email: 'vendor@gamezone.com',
        password: 'password123'
      });
    }
    if (error) setError('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md"
    >
      <h2 className="text-2xl font-bold text-center mb-6 text-dark">GameZone Login</h2>
      
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200"
        >
          {error}
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <div className="relative">
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="your@email.com"
              required
              disabled={loading}
            />
            <FaUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <div className="relative">
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="••••••••"
              required
              disabled={loading}
            />
            <FaLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <motion.button
          whileHover={{ scale: loading ? 1 : 1.02 }}
          whileTap={{ scale: loading ? 1 : 0.98 }}
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white py-3 rounded-md hover:bg-primary/90 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? (
            <>
              <FaSpinner className="animate-spin mr-2" />
              Logging in...
            </>
          ) : (
            'Login'
          )}
        </motion.button>
      </form>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <p className="text-center text-sm text-gray-600 mb-3">Test Accounts:</p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fillTestCredentials('user')}
            className="w-full text-left p-2 text-sm bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
            disabled={loading}
          >
            <div className="font-medium text-blue-800">User Account</div>
            <div className="text-blue-600">user@gamezone.com / password123</div>
          </button>
          <button
            type="button"
            onClick={() => fillTestCredentials('vendor')}
            className="w-full text-left p-2 text-sm bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors"
            disabled={loading}
          >
            <div className="font-medium text-green-800">Vendor Account</div>
            <div className="text-green-600">vendor@gamezone.com / password123</div>
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default LoginForm;