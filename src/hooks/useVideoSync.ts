import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRoomStore } from '../stores/roomStore';
import { nanoid } from 'nanoid';

// Player durumları için sabitler
const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5
};

// Senkronizasyon hassasiyeti için ayarlar
const SYNC_CONFIG = {
  SYNC_INTERVAL: 3000,         // Periyodik senkronizasyon aralığı (ms)
  TIME_SYNC_THRESHOLD: 1.5,    // Zaman farkı eşiği - bu değerden büyük farklar için pozisyon senkronize edilir (saniye)
  FORCE_SYNC_INTERVAL: 15000,  // Zorunlu senkronizasyon aralığı (ms)
  SEEK_DEBOUNCE: 500,          // Seek işlemlerini gruplama süresi (ms)
  RETRY_ATTEMPTS: 3,           // Senkronizasyon yeniden deneme sayısı
};

// Player tipi
interface VideoPlayerInterface {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

export const useVideoSync = (roomId: string) => {
  const { socket, isConnected } = useSocket();
  const playerRef = useRef<VideoPlayerInterface | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(0);
  const [lastForceSyncTime, setLastForceSyncTime] = useState(0);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seeking = useRef(false);
  const syncPending = useRef(false);
  const lastKnownDuration = useRef(0);
  const debugMode = useRef(import.meta.env.VITE_DEBUG_MODE === 'true' || true);
  
  const {
    currentVideoId,
    isPlaying,
    currentTime,
    setCurrentVideoId,
    setIsPlaying,
    setCurrentTime,
  } = useRoomStore();

  // Debug fonksiyonu
  const logDebug = useCallback((...args: any[]) => {
    if (debugMode.current) {
      console.log(`[VideoSync]`, ...args);
    }
  }, []);

  // Socket event dinleyicilerini kur
  useEffect(() => {
    if (!socket || !isConnected) return;

    logDebug('Socket event dinleyicileri ekleniyor');

    // Video yükleme olayı
    const handleVideoLoad = ({ videoId }: { videoId: string }) => {
      logDebug('Socket: video:load olayı alındı, videoId:', videoId);
      
      if (videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
        setCurrentTime(0);
        setIsPlaying(true);
      }
    };

    // Video oynatma olayı
    const handleVideoPlay = ({ time }: { time: number }) => {
      logDebug('Socket: video:play olayı alındı, time:', time);
      
      setIsPlaying(true);
      
      // Eğer zaman farkı büyükse zaman da güncelle
      const timeDiff = Math.abs(time - currentTime);
      if (timeDiff > SYNC_CONFIG.TIME_SYNC_THRESHOLD) {
        setCurrentTime(time);
        
        if (playerRef.current && isReady) {
          seeking.current = true;
          playerRef.current.seekTo(time);
          
          setTimeout(() => {
            seeking.current = false;
          }, 500);
        }
      }
      
      if (playerRef.current && isReady) {
        playerRef.current.playVideo();
      }
    };

    // Video duraklatma olayı
    const handleVideoPause = ({ time }: { time: number }) => {
      logDebug('Socket: video:pause olayı alındı, time:', time);
      
      setIsPlaying(false);
      
      // Zaman farkı büyükse zaman da güncelle
      const timeDiff = Math.abs(time - currentTime);
      if (timeDiff > SYNC_CONFIG.TIME_SYNC_THRESHOLD) {
        setCurrentTime(time);
        
        if (playerRef.current && isReady) {
          seeking.current = true;
          playerRef.current.seekTo(time);
          
          setTimeout(() => {
            seeking.current = false;
          }, 500);
        }
      }
      
      if (playerRef.current && isReady) {
        playerRef.current.pauseVideo();
      }
    };

    // Video zaman değişikliği (seek) olayı
    const handleVideoSeek = ({ time }: { time: number }) => {
      logDebug('Socket: video:seek olayı alındı, time:', time);
      
      setCurrentTime(time);
      
      if (playerRef.current && isReady) {
        seeking.current = true;
        playerRef.current.seekTo(time);
        
        setTimeout(() => {
          seeking.current = false;
        }, 500);
      }
    };

    // Video senkronizasyon olayı
    const handleVideoSync = ({ time, isPlaying: newIsPlaying, videoId }: { time: number, isPlaying: boolean, videoId: string }) => {
      logDebug('Socket: video:sync olayı alındı:', { time, isPlaying: newIsPlaying, videoId });
      
      // Video değiştiyse
      if (videoId && videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
        setCurrentTime(0);
        setIsPlaying(newIsPlaying);
        return;
      }
      
      // Oynatma durumu değiştiyse
      if (newIsPlaying !== isPlaying) {
        setIsPlaying(newIsPlaying);
        
        if (playerRef.current && isReady) {
          if (newIsPlaying) {
            playerRef.current.playVideo();
          } else {
            playerRef.current.pauseVideo();
          }
        }
      }
      
      // Zaman değiştiyse
      const timeDiff = Math.abs(time - currentTime);
      if (timeDiff > SYNC_CONFIG.TIME_SYNC_THRESHOLD) {
        setCurrentTime(time);
        
        if (playerRef.current && isReady) {
          seeking.current = true;
          playerRef.current.seekTo(time);
          
          setTimeout(() => {
            seeking.current = false;
          }, 500);
        }
      }
    };

    // Zorunlu senkronizasyon olayı
    const handleForceSync = ({ time, isPlaying: newIsPlaying, videoId }: { time: number, isPlaying: boolean, videoId: string }) => {
      logDebug('Socket: video:force_sync olayı alındı:', { time, isPlaying: newIsPlaying, videoId });
      
      // Video değiştiyse
      if (videoId && videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
        setCurrentTime(0);
        setIsPlaying(newIsPlaying);
        return;
      }
      
      // Her durumda güncellemeler yap
      setCurrentTime(time);
      setIsPlaying(newIsPlaying);
      
      if (playerRef.current && isReady) {
        seeking.current = true;
        playerRef.current.seekTo(time);
        
        setTimeout(() => {
          seeking.current = false;
          
          if (newIsPlaying) {
            playerRef.current?.playVideo();
          } else {
            playerRef.current?.pauseVideo();
          }
        }, 500);
      }
    };

    // Olay dinleyicilerini ekle
    socket.on('video:load', handleVideoLoad);
    socket.on('video:play', handleVideoPlay);
    socket.on('video:pause', handleVideoPause);
    socket.on('video:seek', handleVideoSeek);
    socket.on('video:sync', handleVideoSync);
    socket.on('video:force_sync', handleForceSync);

    // Temizleme
    return () => {
      logDebug('Socket event dinleyicileri kaldırılıyor');
      socket.off('video:load', handleVideoLoad);
      socket.off('video:play', handleVideoPlay);
      socket.off('video:pause', handleVideoPause);
      socket.off('video:seek', handleVideoSeek);
      socket.off('video:sync', handleVideoSync);
      socket.off('video:force_sync', handleForceSync);
    };
  }, [socket, isConnected, roomId, isReady, currentVideoId, currentTime, isPlaying, setCurrentVideoId, setCurrentTime, setIsPlaying, logDebug]);

  // Periyodik senkronizasyon için zamanlayıcı kur
  useEffect(() => {
    if (!socket || !isConnected || !isReady) return;
    
    // Periyodik olarak durum gönderme
    const broadcastState = () => {
      if (!playerRef.current || !isReady || seeking.current) return;
      
      try {
        const now = Date.now();
        if (now - lastUpdateTime > SYNC_CONFIG.SYNC_INTERVAL) {
          socket.emit('video:sync', {
            roomId,
            time: playerRef.current.getCurrentTime(),
            isPlaying,
            videoId: currentVideoId,
            timestamp: now
          });
          
          setLastUpdateTime(now);
        }
        
        // Zorunlu senkronizasyon
        if (now - lastForceSyncTime > SYNC_CONFIG.FORCE_SYNC_INTERVAL) {
          socket.emit('video:force_sync', {
            roomId,
            time: playerRef.current.getCurrentTime(),
            isPlaying,
            videoId: currentVideoId,
            timestamp: now
          });
          
          setLastForceSyncTime(now);
        }
      } catch (error) {
        console.error('Senkronizasyon durumu gönderme hatası:', error);
      }
    };
    
    // Zamanlayıcı başlat
    syncIntervalRef.current = setInterval(broadcastState, 1000);
    
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [socket, isConnected, roomId, isReady, currentVideoId, isPlaying, lastUpdateTime, lastForceSyncTime, setLastUpdateTime, setLastForceSyncTime, logDebug]);

  // Playeri ayarla
  const setPlayerRef = useCallback((player: VideoPlayerInterface) => {
    if (player) {
      playerRef.current = player;
      setIsReady(true);
      logDebug('Player referansı ayarlandı');
      
      // Player hazır olduğunda durumunu talep et
      if (socket && isConnected) {
        socket.emit('video:get_current', { roomId, timestamp: Date.now() });
      }
    } else {
      playerRef.current = null;
      setIsReady(false);
    }
  }, [socket, isConnected, roomId, logDebug]);

  // Video yükle
  const loadVideo = useCallback((videoId: string) => {
    logDebug('Video yükleniyor:', videoId);
    
    // Socket.io üzerinden videoyu yükle
    if (socket && isConnected) {
      socket.emit('video:load', { roomId, videoId, timestamp: Date.now() });
    }
    
    // Lokal olarak da yükle
    setCurrentVideoId(videoId);
    setIsPlaying(true);
    setCurrentTime(0);
    setIsBuffering(true);
  }, [socket, isConnected, roomId, setCurrentVideoId, setIsPlaying, setCurrentTime, logDebug]);

  // Video oynat
  const playVideo = useCallback(() => {
    logDebug('Video oynatma isteği');
    
    if (socket && isConnected) {
      socket.emit('video:play', { 
        roomId, 
        time: currentTime, 
        timestamp: Date.now() 
      });
    }
    
    setIsPlaying(true);
    
    if (playerRef.current && isReady) {
      playerRef.current.playVideo();
    }
  }, [socket, isConnected, roomId, currentTime, isReady, setIsPlaying, logDebug]);

  // Video duraklat
  const pauseVideo = useCallback(() => {
    logDebug('Video duraklatma isteği');
    
    if (socket && isConnected) {
      socket.emit('video:pause', { 
        roomId, 
        time: playerRef.current?.getCurrentTime() || currentTime, 
        timestamp: Date.now() 
      });
    }
    
    setIsPlaying(false);
    
    if (playerRef.current && isReady) {
      playerRef.current.pauseVideo();
    }
  }, [socket, isConnected, roomId, currentTime, isReady, setIsPlaying, logDebug]);

  // Video ileri/geri sarma
  const seekTo = useCallback((seconds: number) => {
    logDebug('Video ileri/geri sarma isteği:', seconds);
    
    if (socket && isConnected) {
      socket.emit('video:seek', { 
        roomId, 
        time: seconds, 
        timestamp: Date.now() 
      });
    }
    
    setCurrentTime(seconds);
    seeking.current = true;
    
    if (playerRef.current && isReady) {
      playerRef.current.seekTo(seconds);
      
      setTimeout(() => {
        seeking.current = false;
      }, 500);
    }
  }, [socket, isConnected, roomId, isReady, setCurrentTime, logDebug]);

  // Durum değişikliği olayını işle
  const handleStateChange = useCallback((event: any) => {
    if (!playerRef.current || seeking.current) return;
    
    const state = event.data;
    
    // Buffer durumunu güncelle
    setIsBuffering(state === PLAYER_STATE.BUFFERING);
    
    // Durumuna göre işlem yap
    if (state === PLAYER_STATE.PLAYING && !isPlaying) {
      setIsPlaying(true);
      
      if (socket && isConnected) {
        socket.emit('video:play', { 
          roomId, 
          time: playerRef.current.getCurrentTime() || currentTime, 
          timestamp: Date.now() 
        });
      }
    }
    else if (state === PLAYER_STATE.PAUSED && isPlaying) {
      setIsPlaying(false);
      
      if (socket && isConnected) {
        socket.emit('video:pause', { 
          roomId, 
          time: playerRef.current.getCurrentTime() || currentTime, 
          timestamp: Date.now() 
        });
      }
    }
    else if (state === PLAYER_STATE.ENDED) {
      setIsPlaying(false);
      
      if (socket && isConnected) {
        socket.emit('video:pause', { 
          roomId, 
          time: playerRef.current.getCurrentTime() || currentTime, 
          timestamp: Date.now() 
        });
      }
    }
  }, [socket, isConnected, roomId, isPlaying, currentTime, setIsPlaying, logDebug]);

  // Manuel senkronizasyon
  const synchronizeNow = useCallback(() => {
    logDebug('Manuel senkronizasyon başlatıldı');
    
    if (!playerRef.current || !isReady) {
      logDebug('Player hazır değil, senkronizasyon yapılamıyor');
      return;
    }
    
    try {
      const playerTime = playerRef.current.getCurrentTime();
      
      // Diğer katılımcıları senkronize et
      if (socket && isConnected) {
        socket.emit('video:force_sync', {
          roomId,
          time: playerTime,
          isPlaying,
          videoId: currentVideoId,
          timestamp: Date.now()
        });
        
        logDebug('Zorunlu senkronizasyon gönderildi');
      }
    } catch (error) {
      console.error('Manuel senkronizasyon hatası:', error);
    }
  }, [socket, isConnected, roomId, currentVideoId, isReady, isPlaying, logDebug]);

  return {
    isReady,
    isBuffering,
    setPlayerRef,
    loadVideo,
    playVideo,
    pauseVideo,
    seekTo,
    synchronizeNow,
    handleStateChange
  };
};