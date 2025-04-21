import React from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { Youtube, User } from 'lucide-react';

const Header: React.FC = () => {
  const { displayName } = useUser();
  
  return (
    <header className="bg-gray-800 border-b border-gray-700">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <Link to="/" className="flex items-center text-white">
            <Youtube className="h-6 w-6 text-red-600 mr-2" />
            <span className="font-bold text-lg">WatchSync</span>
          </Link>
          
          {displayName && (
            <div className="flex items-center text-gray-300">
              <User className="h-4 w-4 mr-1" />
              <span className="text-sm">{displayName}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;