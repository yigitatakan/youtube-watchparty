import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { useRoomStore } from '../stores/roomStore';
import { useVideoSync } from '../hooks/useVideoSync';
import VideoPlayer from '../components/VideoPlayer';
import ChatPanel from '../components/ChatPanel';
import ParticipantsList from '../components/ParticipantsList';
import VideoControls from '../components/VideoControls';
import SearchVideo from '../components/SearchVideo';
import { ArrowLeft, Users, Menu } from 'lucide-react';

const RoomPage: React.FC = () => {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const { userId, displayName } = useUser();
  const [showParticipants, setShowParticipants] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const {
    participants,
    currentVideoId,
    isPlaying,
    setRoomId,
    setParticipants,
    addParticipant,
    removeParticipant,
    setCurrentVideoId,
    clearRoom,
  } = useRoomStore();

  const {
    isReady,
    setPlayerRef,
    loadVideo,
    handleStateChange,
    playVideo,
    pauseVideo,
    seekTo,
    synchronizeNow
  } = useVideoSync(roomId);

  // Set room ID in store
  useEffect(() => {
    setRoomId(roomId);

    return () => {
      clearRoom();
    };
  }, [roomId, setRoomId, clearRoom]);

  // Check if user has a display name
  useEffect(() => {
    if (!displayName && userId) {
      // Redirect to home if no display name
      navigate('/');
    }
  }, [displayName, userId, navigate]);

  // Handle room joining and socket events
  useEffect(() => {
    if (!socket || !isConnected || !roomId || !userId || !displayName) return;

    console.log("Odaya katılınıyor:", roomId);

    // Join room
    socket.emit('room:join', { roomId, userId, displayName });

    // Odadaki mevcut videoyu sorgula
    socket.emit('video:get_current', { roomId });

    // Socket event listeners
    socket.on('room:participants', (data) => {
      console.log("Katılımcılar:", data.participants);
      setParticipants(data.participants);
    });

    socket.on('room:user-joined', (data) => {
      console.log("Kullanıcı katıldı:", data.participant);
      addParticipant(data.participant);
    });

    socket.on('room:user-left', (data) => {
      console.log("Kullanıcı ayrıldı:", data.userId);
      removeParticipant(data.userId);
    });

    socket.on('video:current', (data) => {
      console.log("Mevcut video bilgisi alındı:", data);
      if (data.videoId) {
        setCurrentVideoId(data.videoId);
      }
    });

    // Cleanup
    return () => {
      socket.emit('room:leave', { roomId, userId });
      socket.off('room:participants');
      socket.off('room:user-joined');
      socket.off('room:user-left');
      socket.off('video:current');
    };
  }, [socket, isConnected, roomId, userId, displayName, addParticipant, removeParticipant, setParticipants, setCurrentVideoId]);

  // Load current video when it changes
  useEffect(() => {
    if (isReady && currentVideoId && typeof currentVideoId === 'string' && currentVideoId.trim() !== '') {
      try {
        loadVideo(currentVideoId);
      } catch (error) {
        console.error("Video yüklenirken bir hata oluştu:", error);
      }
    }
  }, [isReady, currentVideoId, loadVideo]);

  // Check if user is on mobile device
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setShowMobileMenu(false);
        setShowChat(true);
      } else {
        setShowChat(false);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleLeaveRoom = () => {
    navigate('/');
  };

  const handleVideoSearch = (videoId: string) => {
    if (socket && videoId) {
      // Gelen değer URL ise videoId'yi çıkar
      let actualVideoId = videoId;
      if (videoId.includes('youtube.com') || videoId.includes('youtu.be')) {
        const url = new URL(videoId);
        if (videoId.includes('youtube.com')) {
          // youtube.com/watch?v=VIDEO_ID formatı
          actualVideoId = url.searchParams.get('v') || '';
        } else if (videoId.includes('youtu.be')) {
          // youtu.be/VIDEO_ID formatı
          actualVideoId = url.pathname.substring(1);
        }
      }

      if (actualVideoId) {
        socket.emit('video:load', { roomId, videoId: actualVideoId });
        setCurrentVideoId(actualVideoId);
        setShowSearch(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
      {/* Room header */}
      <header className="bg-gray-800 border-b border-gray-700 p-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <button
              onClick={handleLeaveRoom}
              className="mr-3 p-2 rounded-full hover:bg-gray-700 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="font-bold">Watch Room</h1>
              <div className="flex items-center">
                <span className="text-xs text-gray-400">Room Code: </span>
                <span className="text-xs font-mono ml-1 bg-gray-700 px-2 py-0.5 rounded">{roomId}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center">
            <button
              onClick={() => setShowParticipants(!showParticipants)}
              className="p-2 rounded-full hover:bg-gray-700 transition-colors flex items-center mr-2"
            >
              <Users className="h-5 w-5 mr-1" />
              <span className="text-sm">{participants.length}</span>
            </button>

            {isMobile && (
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2 rounded-full hover:bg-gray-700 transition-colors"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {isMobile && showMobileMenu && (
        <div className="bg-gray-800 border-b border-gray-700 p-3 slide-up">
          <div className="flex justify-around">
            <button
              onClick={() => {
                setShowChat(true);
                setShowSearch(false);
                setShowMobileMenu(false);
              }}
              className={`px-4 py-2 rounded ${showChat ? 'bg-purple-600' : 'bg-gray-700'}`}
            >
              Chat
            </button>
            <button
              onClick={() => {
                setShowSearch(true);
                setShowChat(false);
                setShowMobileMenu(false);
              }}
              className={`px-4 py-2 rounded ${showSearch ? 'bg-purple-600' : 'bg-gray-700'}`}
            >
              Search Videos
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Video section */}
        <div className={`flex-1 flex flex-col ${isMobile ? 'h-[60vh]' : 'h-screen'}`}>
          <div className="relative flex-1 flex flex-col">
            <VideoPlayer
              videoId={currentVideoId}
              onReady={setPlayerRef}
              onStateChange={handleStateChange}
            />

            <VideoControls
              isReady={isReady}
              onPlay={playVideo}
              onPause={pauseVideo}
              onSeek={seekTo}
              onSync={synchronizeNow}
              isPlaying={isPlaying}
            />

            {!isMobile && (
              <div className="p-4 relative z-10">
                <button
                  onClick={() => setShowSearch(!showSearch)}
                  className="btn-secondary w-full"
                >
                  {showSearch ? 'Aramayı Gizle' : 'Video Ara'}
                </button>
                {showSearch && (
                  <div className="mt-4 absolute left-0 right-0 px-4 z-20 bg-gray-900 rounded-lg shadow-lg">
                    <SearchVideo onVideoSelect={handleVideoSearch} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        {(!isMobile || showChat || showSearch) && (
          <div className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-gray-700 flex flex-col max-h-screen md:max-h-none">
            {isMobile && showSearch && (
              <div className="p-4 bg-gray-800">
                <SearchVideo onVideoSelect={handleVideoSearch} />
              </div>
            )}

            {(!isMobile || showChat) && (
              <ChatPanel roomId={roomId} />
            )}
          </div>
        )}
      </div>

      {/* Mobile video ara butonu */}
      {isMobile && !showMobileMenu && !showChat && !showSearch && (
        <div className="fixed bottom-4 right-4 z-20">
          <button
            onClick={() => {
              setShowSearch(true);
              setShowChat(false);
            }}
            className="p-3 bg-purple-600 rounded-full shadow-lg hover:bg-purple-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-search"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
        </div>
      )}

      {/* Participants modal */}
      {showParticipants && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-50" onClick={() => setShowParticipants(false)}>
          <div className="card mt-20 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <ParticipantsList participants={participants} currentUserId={userId} />
            <div className="mt-4 text-center">
              <button onClick={() => setShowParticipants(false)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomPage;