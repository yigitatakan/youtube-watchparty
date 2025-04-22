import React, { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../stores/roomStore';
import { useSocket } from '../context/SocketContext';

// YouTube API için tip tanımları
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

interface VideoPlayerProps {
  videoId: string | null;
  onReady: (player: any) => void;
  onStateChange: (event: any) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoId,
  onReady,
  onStateChange,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isPlaying, currentTime } = useRoomStore();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<any>(null);
  const { isConnected } = useSocket();

  // YouTube Player API'sini yükleme
  useEffect(() => {
    // YouTube IFrame Player API'yi yükle
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      // API hazır olduğunda player'ı başlat
      window.onYouTubeIframeAPIReady = initializePlayer;
    } else if (window.YT && window.YT.Player) {
      // API zaten yüklüyse player'ı hemen başlat
      initializePlayer();
    }

    return () => {
      // Temizleme işlemleri
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.error('Player destroy hatası:', e);
        }
      }
    };
  }, []);

  // Player'ı başlatma fonksiyonu
  const initializePlayer = () => {
    if (!videoId || !iframeRef.current) return;

    try {
      // YT Player örneği oluştur
      playerRef.current = new window.YT.Player(iframeRef.current, {
        videoId: videoId,
        playerVars: {
          autoplay: isPlaying ? 1 : 0,
          mute: 1, // Otomatik oynatma için gerekli
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          start: Math.floor(currentTime)
        },
        events: {
          onReady: handleReady,
          onStateChange: handleStateChange,
          onError: handleError
        }
      });

      console.log('YouTube Player başlatıldı');
    } catch (error) {
      console.error('Player başlatma hatası:', error);
      setError('Video oynatıcı başlatılamadı. Lütfen sayfayı yenileyin.');
    }
  };

  // Video değiştiğinde yeni bir player oluştur
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    if (videoId && window.YT && window.YT.Player) {
      if (playerRef.current) {
        try {
          // Mevcut oynatıcıyı temizle
          playerRef.current.destroy();
        } catch (e) {
          console.error('Player destroy hatası:', e);
        }
      }

      // Yeni bir iframe oluştur
      const iframe = document.createElement('iframe');
      iframe.id = 'youtube-player';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;

      // İframe container'ı temizle ve yeni iframe ekle
      const container = document.getElementById('player-container');
      if (container) {
        container.innerHTML = '';
        container.appendChild(iframe);
        iframeRef.current = iframe;

        // Yeni player başlat
        initializePlayer();
      }
    }
  }, [videoId]);

  // Hazır olduğunda
  const handleReady = (event: any) => {
    console.log('Player hazır');
    setIsLoading(false);

    if (onReady && event.target) {
      onReady(event.target);
      playerRef.current = event.target;
    }

    // Bağlantı varsa ve oynatılmalıysa
    if (isConnected && isPlaying) {
      try {
        event.target.playVideo();
      } catch (e) {
        console.error('Video oynatma hatası:', e);
      }
    }
  };

  // Durum değiştiğinde
  const handleStateChange = (event: any) => {
    if (onStateChange) {
      onStateChange(event);
    }
  };

  // Hata oluştuğunda
  const handleError = (event: any) => {
    const errorCodes: Record<number, string> = {
      2: 'Geçersiz video ID',
      5: 'HTML5 player hatası',
      100: 'Video bulunamadı veya kaldırıldı',
      101: 'Video sahibi iframe\'de oynatmaya izin vermiyor',
      150: 'Video sahibi iframe\'de oynatmaya izin vermiyor'
    };

    const errorCode = event.data;
    const errorMessage = errorCodes[errorCode] || `Bilinmeyen hata (${errorCode})`;

    console.error('YouTube Player hatası:', errorMessage, errorCode);
    setError(`Video yüklenemedi: ${errorMessage}`);
    setIsLoading(false);
  };

  return (
    <div className="relative flex-1 overflow-hidden bg-black">
      {/* Player container */}
      <div id="player-container" className="w-full h-full">
        {!videoId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-6 rounded-lg bg-gray-800 max-w-md">
              <h3 className="text-lg font-medium mb-3">Video seçilmedi</h3>
              <p className="text-gray-400 text-sm">
                Birlikte izlemek için bir YouTube videosu arayın
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Yükleniyor göstergesi */}
      {isLoading && videoId && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4"></div>
            <p className="text-white">Video yükleniyor...</p>
          </div>
        </div>
      )}

      {/* Hata mesajı */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-90">
          <div className="text-center p-6 bg-red-900 rounded-lg max-w-md">
            <h3 className="text-lg font-bold text-white mb-2">Hata</h3>
            <p className="text-white mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-white text-red-900 rounded font-medium hover:bg-gray-200"
            >
              Sayfayı Yenile
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;