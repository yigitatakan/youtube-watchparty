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
    
    // Senkronizasyon aralığında state yayını yap
    syncIntervalRef.current = setInterval(() => {
      // Eğer player hazır ve video oynatılıyor veya duraklatılmışsa
      if (playerRef.current && !seeking.current) {
        try {
          const currentPlayerTime = playerRef.current.getCurrentTime();
          
          // Eğer zaman bilgisi geçerliyse ve daha önceki zamandan farklıysa
          if (!isNaN(currentPlayerTime) && Math.abs(currentPlayerTime - lastUpdateTime) > 1) {
            setCurrentTime(currentPlayerTime);
            setLastUpdateTime(currentPlayerTime);
            
            // Senkronizasyon bilgisini socket üzerinden gönder
            socket.emit('video:sync', {
              roomId,
              time: currentPlayerTime,
              isPlaying,
              videoId: currentVideoId,
              timestamp: Date.now()
            });
            
            logDebug('Periyodik senkronizasyon bilgisi gönderildi:', {
              time: currentPlayerTime,
              isPlaying
            });
          }
        } catch (e) {
          console.error('Periyodik senkronizasyon hatası:', e);
        }
      }
    }, SYNC_CONFIG.SYNC_INTERVAL);
    
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [socket, isConnected, isReady, roomId, currentVideoId, isPlaying, lastUpdateTime, logDebug]);

  // Oynatma durumu değişikliklerinde bildirim gönder
  useEffect(() => {
    if (!socket || !isConnected || !isReady || !playerRef.current || seeking.current) return;
    
    try {
      // Oynatma/duraklatma durumu değiştiğinde
      if (isPlaying) {
        socket.emit('video:play', {
          roomId,
          time: currentTime,
          timestamp: Date.now()
        });
        
        logDebug('Video oynatma bilgisi gönderildi:', currentTime);
      } else {
        socket.emit('video:pause', {
          roomId,
          time: currentTime,
          timestamp: Date.now()
        });
        
        logDebug('Video duraklatma bilgisi gönderildi:', currentTime);
      }
    } catch (e) {
      console.error('Oynatma durumu değişikliği bildirme hatası:', e);
    }
  }, [socket, isConnected, isReady, isPlaying, currentTime, roomId, logDebug]);
  
  // Tüm izleyicileri zorla senkronize et - odadaki herkesin videoyu belirli bir noktada ve durumda izlemesini sağlar
  const forceSyncAll = useCallback(() => {
    if (!socket || !isConnected || !playerRef.current || !isReady) return;
    
    try {
      const currentPlayerTime = playerRef.current.getCurrentTime();
      
      socket.emit('video:force_sync', {
        roomId,
        time: currentPlayerTime,
        isPlaying,
        videoId: currentVideoId,
        timestamp: Date.now()
      });
      
      setLastForceSyncTime(Date.now());
      logDebug('Zorla senkronizasyon isteği gönderildi:', {
        time: currentPlayerTime,
        isPlaying
      });
    } catch (e) {
      console.error('Zorla senkronizasyon hatası:', e);
    }
  }, [socket, isConnected, isReady, roomId, currentVideoId, isPlaying, logDebug]);

  // Şimdiki durumu yayınla - herhangi bir kullanıcının mevcut durumu sunucuya göndermesini sağlar
  const broadcastState = useCallback(() => {
    if (!socket || !isConnected || !playerRef.current || !isReady) return;
    
    try {
      const currentPlayerTime = playerRef.current.getCurrentTime();
      
      // Sunucuya mevcut durumu bildir
      socket.emit('video:sync', {
        roomId,
        time: currentPlayerTime,
        isPlaying,
        videoId: currentVideoId,
        timestamp: Date.now()
      });
      
      logDebug('Durum yayını gönderildi:', {
        time: currentPlayerTime,
        isPlaying
      });
    } catch (e) {
      console.error('Durum yayını hatası:', e);
    }
  }, [socket, isConnected, isReady, roomId, currentVideoId, isPlaying, logDebug]);
  
  // Yeni kullanıcılar katıldığında durum yayını yap
  useEffect(() => {
    if (!socket || !isConnected || !isReady || !playerRef.current) return;
    
    // Yeni kullanıcı katıldığında
    const handleUserJoined = () => {
      try {
        // Kısa bir gecikme ile durum yayını yap
        setTimeout(() => {
          broadcastState();
        }, 1000);
      } catch (e) {
        console.error('Yeni kullanıcı için durum yayını hatası:', e);
      }
    };
    
    // Olay dinleyicisini ekle
    socket.on('room:user-joined', handleUserJoined);
    
    // Temizleme
    return () => {
      socket.off('room:user-joined', handleUserJoined);
    };
  }, [socket, isConnected, isReady, broadcastState]);

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
    if (!playerRef.current || seeking.current || !isReady) return;
    
    // YT.PlayerState değerleri
    // -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    const playerState = event.data;
    
    try {
      // Oynatılıyor
      if (playerState === 1) {
        if (!isPlaying) {
          setIsPlaying(true);
          
          // Oynatma durumunu diğer kullanıcılara bildir
          if (socket && isConnected && !syncPending.current) {
            socket.emit('video:play', {
              roomId,
              time: playerRef.current.getCurrentTime(),
              timestamp: Date.now()
            });
          }
        }
        
        setIsBuffering(false);
      }
      // Duraklatıldı
      else if (playerState === 2) {
        if (isPlaying) {
          setIsPlaying(false);
          
          // Duraklatma durumunu diğer kullanıcılara bildir
          if (socket && isConnected && !syncPending.current) {
            socket.emit('video:pause', {
              roomId,
              time: playerRef.current.getCurrentTime(),
              timestamp: Date.now()
            });
          }
        }
        
        setIsBuffering(false);
      }
      // Buffering
      else if (playerState === 3) {
        setIsBuffering(true);
      }
      // Bitti
      else if (playerState === 0) {
        setIsPlaying(false);
        setIsBuffering(false);
        
        // Video bittiğinde diğer kullanıcılara bildir
        if (socket && isConnected) {
          socket.emit('video:pause', {
            roomId,
            time: playerRef.current.getCurrentTime(),
            timestamp: Date.now()
          });
        }
      }
    } catch (e) {
      console.error('Player durum değişikliği hatası:', e);
    }
  }, [socket, isConnected, isReady, isPlaying, roomId, setIsPlaying]);

  // Manuel senkronizasyon
  const synchronizeNow = useCallback(() => {
    forceSyncAll();
  }, [forceSyncAll]);

  return {
    isReady,
    isBuffering,
    setPlayerRef,
    loadVideo,
    handleStateChange,
    playVideo,
    pauseVideo,
    seekTo,
    synchronizeNow,
    broadcastState
  };
};