import React, { useEffect, useRef, useState } from 'react';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';
import { useRoomStore } from '../stores/roomStore';

interface VideoPlayerProps {
  videoId: string | null;
  onReady: (player: YouTubePlayer) => void;
  onStateChange: (event: YouTubeEvent) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoId,
  onReady,
  onStateChange,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const { isPlaying, currentTime } = useRoomStore();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Video değiştiğinde yükleniyor durumuna geç
  useEffect(() => {
    if (videoId) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [videoId]);

  // İframe URL'ini duruma göre oluştur
  const getIframeUrl = () => {
    if (!videoId) return '';

    let url = `https://www.youtube.com/embed/${videoId}?`;
    url += `autoplay=${isPlaying ? 1 : 0}`;
    url += `&mute=1`;
    url += `&modestbranding=1`;
    url += `&rel=0`;
    url += `&playsinline=1`;
    url += `&enablejsapi=1`;
    url += `&origin=${encodeURIComponent(window.location.origin)}`;

    // Belirli bir zaman varsa
    if (currentTime > 0) {
      url += `&start=${Math.floor(currentTime)}`;
    }

    return url;
  };

  // İframe yeniden yüklendiğinde
  const handleIframeLoad = () => {
    setIsLoading(false);
    if (iframeRef.current) {
      console.log('İframe yüklendi, videoId:', videoId);
    }
  };

  return (
    <div className="relative flex-1 overflow-hidden bg-black">
      {videoId ? (
        <>
          <div className="w-full h-full">
            <iframe
              ref={iframeRef}
              src={getIframeUrl()}
              width="100%"
              height="100%"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
              onLoad={handleIframeLoad}
            ></iframe>
          </div>

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4"></div>
                <p className="text-white">Video yükleniyor...</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-6 rounded-lg bg-gray-800 max-w-md">
            <h3 className="text-lg font-medium mb-3">Video seçilmedi</h3>
            <p className="text-gray-400 text-sm">
              Birlikte izlemek için bir YouTube videosu arayın
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// YT Player API'si için global tip tanımı
declare global {
  interface Window {
    YT: {
      Player: any;
      PlayerState?: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export default VideoPlayer;