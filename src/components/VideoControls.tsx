import React, { useState, useEffect } from 'react';
import { useVideoSync } from '../hooks/useVideoSync';
import { useRoomStore } from '../stores/roomStore';
import { Play, Pause } from 'lucide-react';

interface VideoControlsProps {
  roomId: string;
}

const VideoControls: React.FC<VideoControlsProps> = ({ roomId }) => {
  const { isPlaying, currentTime } = useRoomStore();
  const { playVideo, pauseVideo, seekTo } = useVideoSync(roomId);
  const [showControls, setShowControls] = useState(true);
  const [localTime, setLocalTime] = useState(currentTime);
  const [isDragging, setIsDragging] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  
  // Hide controls after 3 seconds of inactivity
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isDragging) {
        setShowControls(false);
      }
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [showControls, isDragging]);
  
  // Update local time for smooth progress bar movement
  useEffect(() => {
    if (!isDragging) {
      setLocalTime(currentTime);
    }
    
    // If playing, update the progress bar continuously
    let interval: NodeJS.Timeout;
    if (isPlaying && !isDragging) {
      interval = setInterval(() => {
        setLocalTime((prev) => prev + 0.1);
      }, 100);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentTime, isPlaying, isDragging]);
  
  // Format seconds to MM:SS format
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const handlePlayPause = () => {
    if (isPlaying) {
      pauseVideo();
    } else {
      playVideo();
    }
  };
  
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setLocalTime(time);
  };
  
  const handleSeekCommit = () => {
    seekTo(localTime);
    setIsDragging(false);
  };
  
  return (
    <div 
      className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 transition-opacity duration-300 ${
        showControls ? 'opacity-100' : 'opacity-0'
      }`}
      onMouseEnter={() => setShowControls(true)}
      onMouseMove={() => setShowControls(true)}
      onTouchStart={() => setShowControls(true)}
    >
      {/* Progress bar */}
      <div className="mb-3">
        <input
          type="range"
          min={0}
          max={videoDuration || 100}
          value={localTime}
          onChange={handleSeek}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={handleSeekCommit}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={handleSeekCommit}
          className="w-full h-1 bg-gray-700 rounded-full appearance-none cursor-pointer"
          style={{
            backgroundImage: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${
              (localTime / (videoDuration || 100)) * 100
            }%, #4B5563 ${(localTime / (videoDuration || 100)) * 100}%, #4B5563 100%)`,
          }}
        />
      </div>
      
      {/* Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <button
            onClick={handlePlayPause}
            className="p-2 rounded-full hover:bg-gray-700/50 transition-colors"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5" />
            )}
          </button>
          
          <div className="text-sm ml-2">
            <span>{formatTime(localTime)}</span>
            {videoDuration > 0 && (
              <span className="text-gray-400"> / {formatTime(videoDuration)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoControls;