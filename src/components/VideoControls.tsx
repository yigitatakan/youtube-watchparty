import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCw, Loader2 } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';

interface VideoControlsProps {
  isReady: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
  onSync: () => void;
  isPlaying?: boolean;
}

const VideoControls: React.FC<VideoControlsProps> = ({
  isReady,
  onPlay,
  onPause,
  onSeek,
  onSync,
  isPlaying: externalIsPlaying
}) => {
  const { isPlaying: storeIsPlaying, currentTime: storeCurrentTime } = useRoomStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  // Dış propları veya store değerlerini kullan
  useEffect(() => {
    if (externalIsPlaying !== undefined) {
      setIsPlaying(externalIsPlaying);
    } else {
      setIsPlaying(storeIsPlaying);
    }
  }, [externalIsPlaying, storeIsPlaying]);

  // Store'dan gelen zaman bilgisini kullan
  useEffect(() => {
    if (storeCurrentTime !== undefined) {
      setCurrentTime(storeCurrentTime);
    }
  }, [storeCurrentTime]);

  // Zamanı biçimlendir (saniye -> MM:SS)
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Oynatma durumunu değiştir
  const togglePlayPause = () => {
    if (isPlaying) {
      onPause();
      setIsPlaying(false);
    } else {
      onPlay();
      setIsPlaying(true);
    }
  };

  // İlerleme çubuğundaki tıklamayı işle
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !isReady) return;

    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const seekTime = pos * duration;

    onSeek(seekTime);
    setCurrentTime(seekTime);
  };

  // Senkronizasyon butonuna tıklanınca
  const handleSync = () => {
    setIsSyncing(true);
    onSync();
    setTimeout(() => setIsSyncing(false), 1000);
  };

  // Player'dan süre bilgisini al
  const updateDuration = (newDuration: number) => {
    if (newDuration > 0 && newDuration !== duration) {
      setDuration(newDuration);
    }
  };

  // Global bir fonksiyon olarak video süresini güncelleme metodunu tanımla
  useEffect(() => {
    // @ts-ignore
    window.updateVideoDuration = updateDuration;

    return () => {
      // @ts-ignore
      delete window.updateVideoDuration;
    };
  }, [duration]);

  return (
    <div className="video-controls bg-gray-800 p-3 flex flex-col">
      {/* İlerleme çubuğu */}
      <div
        ref={progressRef}
        className="progress-bar h-2 bg-gray-700 rounded-full mb-2 cursor-pointer relative"
        onClick={handleProgressClick}
      >
        <div
          className="progress-fill bg-purple-600 h-full rounded-full"
          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        />
      </div>

      {/* Kontroller ve zamanlayıcı */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={togglePlayPause}
            disabled={!isReady}
            className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <button
            onClick={handleSync}
            disabled={!isReady || isSyncing}
            className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            title="Videoyu herkesle senkronize et"
          >
            {isSyncing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RotateCw size={16} />
            )}
          </button>

          <div className="text-xs text-gray-400">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        <div className="text-xs">
          {!isReady ? (
            <span className="text-yellow-400 flex items-center">
              <Loader2 size={12} className="animate-spin mr-1" />
              Hazırlanıyor...
            </span>
          ) : (
            <span className="text-green-400">
              Video hazır
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoControls;