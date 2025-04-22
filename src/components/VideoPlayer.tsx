import React, { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../stores/roomStore';
import { useSocket } from '../context/SocketContext';

// Video player interface'ı için basit bir tip tanımı
interface VideoPlayerInterface {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

// YouTube postMessage API için tip tanımlamaları
declare global {
  interface Window {
    updateVideoDuration?: (duration: number) => void;
  }
}

interface VideoPlayerProps {
  videoId: string | null;
  onReady: (player: VideoPlayerInterface) => void;
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
  const playerReadyRef = useRef<boolean>(false);
  const { isConnected } = useSocket();

  // Direkt iframe ile basit bir video player oluştur
  useEffect(() => {
    if (!videoId) return;

    setIsLoading(true);
    setError(null);
    playerReadyRef.current = false;

    // İframe içeriğini güncelle
    const playerContainer = document.getElementById('player-container');
    if (playerContainer) {
      // İframe URL oluştur - mevcut player parametrelerini kullan
      let embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&mute=1&modestbranding=1&rel=0&playsinline=1&start=${Math.floor(currentTime)}`;

      // İframe elementini oluştur
      playerContainer.innerHTML = `
        <iframe
          id="youtube-player"
          src="${embedUrl}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          class="w-full h-full border-0"
        ></iframe>
      `;

      // İframe referansını al
      iframeRef.current = document.getElementById('youtube-player') as HTMLIFrameElement;

      // YouTube iframe API eventlerini dinle
      window.addEventListener('message', handleYouTubeEvents);

      // Basit bir kontrolcü oluştur
      const simplePlayer: VideoPlayerInterface = {
        playVideo: () => {
          if (iframeRef.current) {
            iframeRef.current.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
          }
        },
        pauseVideo: () => {
          if (iframeRef.current) {
            iframeRef.current.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
          }
        },
        seekTo: (seconds: number) => {
          if (iframeRef.current) {
            iframeRef.current.contentWindow?.postMessage(`{"event":"command","func":"seekTo","args":[${seconds}, true]}`, '*');
          }
        },
        getCurrentTime: () => {
          // İframe içinden gerçek zamanı alamayız, bu yüzden store değerini döndür
          return currentTime;
        },
        getDuration: () => {
          // Basit bir fixed değer dön (bu tam doğru olmayacak ama varsayılan olarak gerekli)
          return 0;
        }
      };

      // Player hazır olduğunda onReady'i çağır
      setTimeout(() => {
        setIsLoading(false);
        playerReadyRef.current = true;
        onReady(simplePlayer);

        // İstemci bağlıysa ve video oynatılması gerekiyorsa oynat
        if (isConnected && isPlaying) {
          simplePlayer.playVideo();
        }

        console.log('Basit iframe player hazır');
      }, 1500); // iFrame yüklenmesine zaman tanı
    }

    // Temizleme işlemleri
    return () => {
      window.removeEventListener('message', handleYouTubeEvents);
    };
  }, [videoId, currentTime]);

  // YouTube iframe API mesajlarını işle
  const handleYouTubeEvents = (event: MessageEvent) => {
    // YouTube'dan gelen mesajları kontrol et
    if (event.origin !== "https://www.youtube.com") return;

    try {
      const data = JSON.parse(event.data);

      // YouTube'un olay bilgilerini kontrol et
      if (data.event === "onReady") {
        setIsLoading(false);
        console.log('YouTube iframe API: Player hazır');
      }
      else if (data.event === "onStateChange") {
        // Durum değişikliklerini işle
        const state = data.info;

        // Durum değişikliği olayını bildir
        onStateChange({ data: state });

        // Uygun durum verisi süresini güncelle
        if (data.info === 1) { // Playing
          if (window.updateVideoDuration && data.duration) {
            window.updateVideoDuration(data.duration);
          }
        }
      }
      else if (data.event === "onError") {
        const errorCode = data.info;
        handleError(errorCode);
      }
    } catch (e) {
      // JSON.parse hatası veya diğer hatalar
      console.warn('YouTube postMessage işlenirken hata:', e);
    }
  };

  // Hata oluştuğunda
  const handleError = (errorCode: number) => {
    const errorCodes: Record<number, string> = {
      2: 'Geçersiz video ID',
      5: 'HTML5 player hatası',
      100: 'Video bulunamadı veya kaldırıldı',
      101: 'Video sahibi iframe\'de oynatmaya izin vermiyor',
      150: 'Video sahibi iframe\'de oynatmaya izin vermiyor'
    };

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