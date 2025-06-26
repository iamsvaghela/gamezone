import { Link } from 'react-router-dom';
import { FaGamepad, FaUser, FaSignOutAlt } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <nav className="bg-primary text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2">
            <FaGamepad className="text-2xl" />
            <span className="font-bold text-xl">GameZone</span>
          </Link>

          <div className="flex items-center space-x-4">
            {user ? (
              <>
                {user.role === 'vendor' && (
                  <Link 
                    to="/vendor" 
                    className="flex items-center space-x-1 hover:text-gray-200"
                  >
                    <span>Dashboard</span>
                  </Link>
                )}
                <button 
                  onClick={logout}
                  className="flex items-center space-x-1 hover:text-gray-200"
                >
                  <FaSignOutAlt />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <Link 
                to="/login" 
                className="flex items-center space-x-1 hover:text-gray-200"
              >
                <FaUser />
                <span>Login</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;