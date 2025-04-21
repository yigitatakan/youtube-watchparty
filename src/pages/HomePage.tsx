import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { useUser } from '../context/UserContext';
import { Play, Users, Youtube, Share2 } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { displayName, setDisplayName } = useUser();
  const [roomIdToJoin, setRoomIdToJoin] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(!displayName);
  const [nameInput, setNameInput] = useState(displayName || '');
  const [joinError, setJoinError] = useState('');

  const handleCreateRoom = () => {
    if (!displayName) {
      setShowNamePrompt(true);
      return;
    }
    
    const newRoomId = nanoid(6);
    navigate(`/room/${newRoomId}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName) {
      setShowNamePrompt(true);
      return;
    }
    
    if (!roomIdToJoin.trim()) {
      setJoinError('Please enter a room code');
      return;
    }
    
    navigate(`/room/${roomIdToJoin.trim()}`);
  };

  const handleSetName = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim().length < 2) {
      return;
    }
    
    setDisplayName(nameInput.trim());
    setShowNamePrompt(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
        <div className="max-w-4xl w-full mx-auto text-center">
          <div className="mb-8 fade-in">
            <Youtube className="h-20 w-20 text-red-600 mx-auto mb-6" />
            <h1 className="text-4xl md:text-5xl font-bold mb-3 text-white">Watch Together</h1>
            <p className="text-xl text-gray-300 mb-8">
              Synchronize YouTube videos with friends in real-time
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto slide-up">
            <div className="card flex flex-col transition-all hover:border-purple-500">
              <h2 className="text-xl font-bold mb-4 flex items-center">
                <Play className="h-5 w-5 mr-2 text-purple-500" />
                Create a Room
              </h2>
              <p className="text-gray-300 mb-6">Start a new watching room and invite your friends to join you</p>
              <button 
                onClick={handleCreateRoom} 
                className="btn-primary mt-auto flex items-center justify-center"
              >
                <Users className="h-4 w-4 mr-2" />
                Create New Room
              </button>
            </div>

            <div className="card flex flex-col transition-all hover:border-teal-500">
              <h2 className="text-xl font-bold mb-4 flex items-center">
                <Share2 className="h-5 w-5 mr-2 text-teal-500" />
                Join a Room
              </h2>
              <p className="text-gray-300 mb-4">Enter a room code to join an existing session</p>
              <form onSubmit={handleJoinRoom} className="mt-auto">
                <input
                  type="text"
                  placeholder="Enter room code"
                  value={roomIdToJoin}
                  onChange={(e) => {
                    setJoinError('');
                    setRoomIdToJoin(e.target.value);
                  }}
                  className="input-field w-full mb-3"
                />
                {joinError && <p className="text-red-500 text-sm mb-3">{joinError}</p>}
                <button type="submit" className="btn-secondary w-full">
                  Join Room
                </button>
              </form>
            </div>
          </div>

          <div className="mt-12 text-gray-400 max-w-xl mx-auto">
            <h3 className="font-medium mb-2">How it works</h3>
            <p className="text-sm">
              Create a room, share the link with friends, and watch YouTube videos together with perfectly synchronized playback. 
              Chat while you watch and take turns controlling the video.
            </p>
          </div>
        </div>
      </main>

      <Footer />
      
      {/* Name prompt modal */}
      {showNamePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="card max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">What's your name?</h2>
            <p className="text-gray-300 mb-4">
              Enter a display name to use in the watching room
            </p>
            <form onSubmit={handleSetName}>
              <input
                type="text"
                placeholder="Your display name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="input-field w-full mb-4"
                autoFocus
              />
              <button 
                type="submit" 
                className="btn-primary w-full"
                disabled={nameInput.trim().length < 2}
              >
                Continue
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;