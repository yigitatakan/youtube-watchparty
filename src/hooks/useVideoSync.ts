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
  const timeBeforeBlur = useRef<number>(0); // Sekme kapatıldığındaki zaman
  const wasPlayingBeforeBlur = useRef<boolean>(false); // Sekme kapatılmadan önce oynatılıyor muydu
  const blurHandled = useRef<boolean>(false); // Sekme değişikliği işlendi mi
  const forceResumeOnFocus = useRef<boolean>(false); // Sekmeye dönüldüğünde zorla devam ettir
  const lastVisibilityChange = useRef<number>(Date.now()); // Son sekme değişikliği zamanı
  
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

  // Window focus/blur olaylarını dinle - sekme değiştirildiğinde video süresini koru
  useEffect(() => {
    if (!isReady) return;

    const handleVisibilityChange = () => {
      const now = Date.now();
      const timeSinceLastChange = now - lastVisibilityChange.current;
      lastVisibilityChange.current = now;
      
      // Çok hızlı değişiklikleri engelle (bazen olay tekrar edebilir)
      if (timeSinceLastChange < 100) {
        logDebug('Çok hızlı sekme değişikliği - işlem atlanıyor');
        return;
      }
      
      if (document.hidden) {
        // Sayfa arka plana gitti, mevcut durumu kaydet
        try {
          // Player durumunu kontrol et ve mevcut zamanı al
          let currentPlayerTime = currentTime;
          let currentPlayingState = isPlaying;
          
          if (playerRef.current) {
            try {
              const playerTime = playerRef.current.getCurrentTime();
              if (!isNaN(playerTime) && playerTime > 0) {
                currentPlayerTime = playerTime;
              }
            } catch (e) {
              console.warn('Video zamanı alınamadı, store değeri kullanılıyor:', e);
            }
          }
          
          // Durumu kaydet
          timeBeforeBlur.current = currentPlayerTime;
          wasPlayingBeforeBlur.current = currentPlayingState;
          blurHandled.current = true;
          
          logDebug('Sayfa arka plana gitti, durum kaydedildi:', { 
            time: timeBeforeBlur.current, 
            isPlaying: wasPlayingBeforeBlur.current 
          });
          
          // Sekmeyi kapatmadan önceki son bilinen hızı ve zamanı gönder
          if (socket && isConnected && !syncPending.current && currentVideoId) {
            socket.emit('video:sync', {
              roomId,
              time: currentPlayerTime,
              isPlaying: currentPlayingState,
              videoId: currentVideoId,
              timestamp: now
            });
            logDebug('Sekme değişimi sırasında senkronizasyon bilgisi gönderildi');
          }
        } catch (e) {
          console.error('Sekme değişikliğinde video süresi kaydedilemedi:', e);
        }
      } else {
        // Sayfa tekrar aktif oldu, durumu geri yükle
        if (blurHandled.current) {
          try {
            // Ne kadar süre geçtiğini hesapla
            const timeElapsed = (now - lastVisibilityChange.current) / 1000; // saniye cinsinden
            let targetTime = timeBeforeBlur.current;
            
            logDebug('Sayfa tekrar aktif oldu, durum geri yükleniyor:', { 
              savedTime: timeBeforeBlur.current, 
              isPlaying: wasPlayingBeforeBlur.current,
              timeElapsed: timeElapsed
            });
            
            // Eğer oynatılıyorsa ve çok uzun süre geçmediyse, geçen süreyi hesaba kat
            if (wasPlayingBeforeBlur.current && timeElapsed < 60) {
              targetTime = timeBeforeBlur.current + timeElapsed;
              logDebug('Oynatma sürerken sekme değiştirildi, hedef zaman güncellendi:', targetTime);
            }
            
            // Socket aracılığıyla güncel durumu al
            if (socket && isConnected && currentVideoId) {
              syncPending.current = true;
              socket.emit('video:get_current', { roomId, timestamp: now });
              logDebug('Sekme değişimi sonrası güncel video durumu isteniyor');
              
              // 1 saniye içinde yanıt gelmezse manuel olarak devam et
              setTimeout(() => {
                if (syncPending.current) {
                  syncPending.current = false;
                  forceResumeOnFocus.current = true;
                  logDebug('Senkronizasyon yanıtı gecikti, video manuel olarak devam ettirilecek');
                }
              }, 1000);
            } else {
              forceResumeOnFocus.current = true;
            }
            
            // Zaman bilgisini geri yükle
            if (targetTime > 0 && playerRef.current && forceResumeOnFocus.current) {
              seeking.current = true;
              
              // Oynatıcı hazır olduğundan emin ol ve video konumunu ayarla
              setTimeout(() => {
                if (playerRef.current) {
                  logDebug('Video konumu geri yükleniyor:', targetTime);
                  playerRef.current.seekTo(targetTime);
                  
                  // Oynatma durumunu geri yükle
                  setTimeout(() => {
                    seeking.current = false;
                    if (playerRef.current) {
                      if (wasPlayingBeforeBlur.current || isPlaying) {
                        playerRef.current.playVideo();
                        logDebug('Video oynatma geri yüklendi');
                      } else {
                        playerRef.current.pauseVideo();
                        logDebug('Video duraklatma geri yüklendi');
                      }
                    }
                    
                    // Senkronizasyon durumunu temizle
                    forceResumeOnFocus.current = false;
                  }, 300);
                }
              }, 300);
            }
            
            blurHandled.current = false;
          } catch (e) {
            console.error('Sekme değişikliğinde video durumu geri yüklenemedi:', e);
            blurHandled.current = false;
          }
        }
      }
    };

    // Sayfa görünürlük değişikliğini dinle
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Temizleme
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isReady, isPlaying, currentTime, currentVideoId, roomId, socket, isConnected, logDebug]);

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
      
      // Senkronizasyon beklemesi varsa kaldır
      if (syncPending.current) {
        syncPending.current = false;
        forceResumeOnFocus.current = false;
        logDebug('Bekleyen senkronizasyon işlemi tamamlandı');
      }
      
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