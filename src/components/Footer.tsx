import React from 'react';
import { Github, Heart } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-800 border-t border-gray-700 py-4 text-gray-400">
      <div className="container mx-auto px-4 text-center text-sm">
        <p className="flex items-center justify-center mb-2">
          Made with <Heart className="h-4 w-4 text-red-500 mx-1" /> by WatchSync
        </p>
        <div className="flex items-center justify-center">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center hover:text-white transition-colors"
          >
            <Github className="h-4 w-4 mr-1" />
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;