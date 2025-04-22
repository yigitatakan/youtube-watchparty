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

export const useVideoSync = (roomId: string) => {
  const { socket, isConnected } = useSocket();
  const playerRef = useRef<any | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isUserSeeking, setIsUserSeeking] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(0);
  const [lastForceSyncTime, setLastForceSyncTime] = useState(0);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seeking = useRef(false);
  const lastSyncReceived = useRef(0);
  const ignoreNextPlayEvent = useRef(false);
  const ignoreNextPauseEvent = useRef(false);
  const syncRetryCount = useRef(0);
  const lastKnownDuration = useRef(0);
  const syncPending = useRef(false);
  const debugMode = useRef(import.meta.env.VITE_DEBUG_MODE === 'true' || true); // Senkronizasyon sorunlarını çözmek için debug modunu açık tut
  const seekDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
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

  // Playeri ayarla
  const setPlayerRef = (player: any) => {
    if (player) {
      playerRef.current = player;
      setIsReady(true);
      logDebug('Player referansı ayarlandı', player);
      
      // Player hazır olduğunda durumunu talep et
      if (socket && isConnected) {
        socket.emit('video:get_current', { roomId, timestamp: Date.now() });
      }
      
      // Oynatıcı süresi bilgisini güncelle
      try {
        const duration = player.getDuration();
        if (duration && duration > 0) {
          lastKnownDuration.current = duration;
        }
      } catch (e) {
        console.error('Video süresi alınamadı:', e);
      }
    } else {
      playerRef.current = null;
      setIsReady(false);
    }
  };

  // Video yükle ve oynat
  const loadVideo = useCallback((videoId: string) => {
    logDebug('Video yükleniyor:', videoId);
    
    // Socket.io üzerinden videoyu yükle
    if (socket && isConnected) {
      socket.emit('video:load', { roomId, videoId, timestamp: Date.now() });
    }
    
    // Lokal olarak da yükle
    setCurrentVideoId(videoId);
    setIsPlaying(true);
    setCurrentTime(0); // Yeni video yüklendiğinde zamanı sıfırla
    
    // Video yüklenirken buffer durumuna geç
    setIsBuffering(true);
    
    // Senkronizasyon sayacını sıfırla
    syncRetryCount.current = 0;
  }, [socket, isConnected, roomId, setCurrentVideoId, setIsPlaying, setCurrentTime, logDebug]);

  // Manuel olarak senkronizasyonu başlat
  const synchronizeNow = useCallback(() => {
    logDebug('Manuel senkronizasyon başlatıldı');
    
    if (!playerRef.current || !isReady) {
      logDebug('Player hazır değil, senkronizasyon yapılamıyor');
      return;
    }
    
    if (syncPending.current) {
      logDebug('Zaten bir senkronizasyon işlemi devam ediyor');
      return;
    }
    
    syncPending.current = true;
    
    try {
      // İlk olarak mevcut durumu al
      const playerTime = playerRef.current.getCurrentTime() || 0;
      const playerState = playerRef.current.getPlayerState();
      const duration = playerRef.current.getDuration() || 0;
      
      if (duration > 0) {
        lastKnownDuration.current = duration;
      }
      
      logDebug('Mevcut durum:', { playerTime, playerState, duration });
      
      // Videoyu odaya bağlı diğer katılımcılarla senkronize et
      if (socket && isConnected) {
        socket.emit('video:force_sync', {
          roomId,
          time: playerTime,
          isPlaying: playerState === PLAYER_STATE.PLAYING,
          videoId: currentVideoId,
          timestamp: Date.now()
        });
        
        logDebug('Zorunlu senkronizasyon gönderildi');
      }
      
      // Mevcut durumu güncelle
      setCurrentTime(playerTime);
      setIsPlaying(playerState === PLAYER_STATE.PLAYING);
      
      setTimeout(() => {
        syncPending.current = false;
      }, 1000);
    } catch (error) {
      console.error('Manuel senkronizasyon hatası:', error);
      syncPending.current = false;
    }
  }, [socket, isConnected, roomId, currentVideoId, isReady, setCurrentTime, setIsPlaying, logDebug]);

  // Gerçek zaman farkını hesapla ve senkronize et
  const synchronizeIfNeeded = useCallback(() => {
    if (!playerRef.current || !isReady || seeking.current || syncPending.current) return;
    
    try {
      const playerTime = playerRef.current.getCurrentTime() || 0;
      const timeDiff = Math.abs(playerTime - currentTime);
      
      // Zaman farkı eşik değerinden büyükse senkronize et
      if (timeDiff > SYNC_CONFIG.TIME_SYNC_THRESHOLD) {
        logDebug('Zaman farkı nedeniyle senkronize ediliyor:', { playerTime, storeTime: currentTime, diff: timeDiff });
        seeking.current = true;
        syncPending.current = true;
        
        playerRef.current.seekTo(currentTime, true);
        
        setTimeout(() => {
          seeking.current = false;
          syncPending.current = false;
        }, 500);
      }
      
      // Oynatma durumunu senkronize et
      const playerState = playerRef.current.getPlayerState();
      if (isPlaying && playerState !== PLAYER_STATE.PLAYING && playerState !== PLAYER_STATE.BUFFERING) {
        playerRef.current.playVideo();
      } else if (!isPlaying && playerState === PLAYER_STATE.PLAYING) {
        playerRef.current.pauseVideo();
      }
    } catch (error) {
      console.error('Senkronizasyon hatası:', error);
      syncPending.current = false;
    }
  }, [isReady, currentTime, isPlaying, logDebug]);

  // Diğer istemcilere durumu gönder
  const broadcastState = useCallback((force = false) => {
    if (!socket || !isConnected || !isReady || !playerRef.current) return;
    
    try {
      const now = Date.now();
      const playerTime = playerRef.current.getCurrentTime() || 0;
      const playerState = playerRef.current.getPlayerState();
      const isCurrentlyPlaying = playerState === PLAYER_STATE.PLAYING;
      const duration = playerRef.current.getDuration() || 0;
      
      if (duration > 0) {
        lastKnownDuration.current = duration;
      }
      
      // Son güncellemeden beri belirli bir süre geçtiyse veya zorunlu ise gönder
      if (force || now - lastUpdateTime > SYNC_CONFIG.SYNC_INTERVAL) {
        socket.emit('video:sync', {
          roomId,
          time: playerTime,
          isPlaying: isCurrentlyPlaying,
          videoId: currentVideoId,
          timestamp: now,
          duration: lastKnownDuration.current
        });
        
        setLastUpdateTime(now);
        logDebug('Video durumu gönderildi:', { 
          time: playerTime, 
          isPlaying: isCurrentlyPlaying,
          duration: lastKnownDuration.current,
          force 
        });
      }
      
      // Belirli aralıklarla zorunlu senkronizasyon
      if (now - lastForceSyncTime > SYNC_CONFIG.FORCE_SYNC_INTERVAL) {
        setLastForceSyncTime(now);
        socket.emit('video:force_sync', {
          roomId,
          time: playerTime,
          isPlaying: isCurrentlyPlaying,
          videoId: currentVideoId,
          timestamp: now,
          duration: lastKnownDuration.current
        });
        
        logDebug('Zorunlu senkronizasyon gönderildi');
      }
    } catch (error) {
      console.error('Durum gönderme hatası:', error);
    }
  }, [socket, isConnected, isReady, roomId, currentVideoId, lastUpdateTime, lastForceSyncTime, logDebug]);

  // Senkronizasyon için düzenli olarak güncellemeler gönder
  useEffect(() => {
    if (!isReady || !socket || !isConnected || !roomId) return;

    // İlk bağlantıda odaya katıldığımızı ve video durumu istediğimizi bildir
    socket.emit('room:joined', { roomId, timestamp: Date.now() });
    socket.emit('video:get_current', { roomId, timestamp: Date.now() });

    // Periyodik senkronizasyon
    syncIntervalRef.current = setInterval(() => {
      if (!seeking.current && !syncPending.current) {
        broadcastState();
        synchronizeIfNeeded();
      }
    }, SYNC_CONFIG.SYNC_INTERVAL);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isReady, socket, isConnected, roomId, broadcastState, synchronizeIfNeeded]);

  // Socket event'lerini dinle
  useEffect(() => {
    if (!socket || !isConnected || !roomId) return;

    logDebug('Socket event dinleyicileri ekleniyor');

    // Video olaylarını dinle
    socket.on('video:load', ({ videoId }) => {
      logDebug('Socket: video:load olayı alındı, videoId:', videoId);
      if (videoId && videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
        setCurrentTime(0); // Yeni video yüklendiğinde zamanı sıfırla
        setIsBuffering(true);
        
        // Yeni video yüklendiğinde senkronizasyon sayacını sıfırla
        syncRetryCount.current = 0;
      }
    });
    
    socket.on('video:play', () => {
      logDebug('Socket: video:play olayı alındı');
      if (ignoreNextPlayEvent.current) {
        ignoreNextPlayEvent.current = false;
        return;
      }
      
      setIsPlaying(true);
      // Player hazırsa oynat
      if (playerRef.current && isReady) {
        try {
          playerRef.current.playVideo();
        } catch (e) {
          console.error('Video oynatma hatası:', e);
        }
      }
    });
    
    socket.on('video:pause', () => {
      logDebug('Socket: video:pause olayı alındı');
      if (ignoreNextPauseEvent.current) {
        ignoreNextPauseEvent.current = false;
        return;
      }
      
      setIsPlaying(false);
      // Player hazırsa duraklat
      if (playerRef.current && isReady) {
        try {
          playerRef.current.pauseVideo();
        } catch (e) {
          console.error('Video duraklatma hatası:', e);
        }
      }
    });
    
    socket.on('video:seek', ({ time }) => {
      logDebug('Socket: video:seek olayı alındı, time:', time);
      
      if (syncPending.current) {
        logDebug('Zaten bir senkronizasyon işlemi devam ediyor, seek işlemi erteleniyor');
        return;
      }
      
      seeking.current = true;
      syncPending.current = true;
      setCurrentTime(time);
      
      // Player hazırsa belirli bir zamana atla
      if (playerRef.current && isReady) {
        try {
          playerRef.current.seekTo(time, true);
          setTimeout(() => {
            seeking.current = false;
            syncPending.current = false;
          }, SYNC_CONFIG.SEEK_DEBOUNCE);
        } catch (e) {
          console.error('Video ileri/geri sarma hatası:', e);
          seeking.current = false;
          syncPending.current = false;
        }
      } else {
        seeking.current = false;
        syncPending.current = false;
      }
    });
    
    // Normal senkronizasyon
    socket.on('video:sync', ({ time, isPlaying: remotePlaying, videoId, duration }) => {
      const now = Date.now();
      lastSyncReceived.current = now;
      
      logDebug('Socket: video:sync olayı alındı', { time, remotePlaying, videoId, duration, now });
      
      // Video değiştiyse yeni videoyu yükle
      if (videoId && videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
      }
      
      // Video süresini güncelle
      if (duration && duration > 0) {
        lastKnownDuration.current = duration;
      }
      
      // Zaman farkı büyükse senkronize et
      if (playerRef.current && isReady && !seeking.current && !syncPending.current) {
        try {
          const currentTime = playerRef.current.getCurrentTime() || 0;
          const timeDiff = Math.abs(currentTime - time);
          
          if (timeDiff > SYNC_CONFIG.TIME_SYNC_THRESHOLD) {
            logDebug('Zaman farkı büyük, senkronize ediliyor:', { currentTime, time, diff: timeDiff });
            seeking.current = true;
            syncPending.current = true;
            playerRef.current.seekTo(time, true);
            setTimeout(() => {
              seeking.current = false;
              syncPending.current = false;
            }, SYNC_CONFIG.SEEK_DEBOUNCE);
          }
        } catch (e) {
          console.error('Senkronizasyon hatası:', e);
          seeking.current = false;
          syncPending.current = false;
        }
      }
      
      // Oynatma durumunu senkronize et
      setIsPlaying(remotePlaying);
    });
    
    // Zorunlu senkronizasyon - her durumda uygulanır
    socket.on('video:force_sync', ({ time, isPlaying: remotePlaying, videoId, duration }) => {
      logDebug('Socket: video:force_sync olayı alındı', { time, remotePlaying, videoId, duration });
      
      if (videoId && videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
      }
      
      // Video süresini güncelle
      if (duration && duration > 0) {
        lastKnownDuration.current = duration;
      }
      
      // Her durumda pozisyonu güncelle
      setCurrentTime(time);
      seeking.current = true;
      syncPending.current = true;
      
      if (playerRef.current && isReady) {
        try {
          playerRef.current.seekTo(time, true);
          
          if (remotePlaying) {
            playerRef.current.playVideo();
          } else {
            playerRef.current.pauseVideo();
          }
          
          setTimeout(() => {
            seeking.current = false;
            syncPending.current = false;
          }, SYNC_CONFIG.SEEK_DEBOUNCE);
        } catch (e) {
          console.error('Zorunlu senkronizasyon hatası:', e);
          seeking.current = false;
          syncPending.current = false;
        }
      } else {
        seeking.current = false;
        syncPending.current = false;
      }
      
      setIsPlaying(remotePlaying);
    });
    
    // Odaya katıldığında mevcut video bilgisini iste
    socket.emit('video:get_current', { roomId });
    
    // Cleanup
    return () => {
      logDebug('Socket event dinleyicileri kaldırılıyor');
      socket.off('video:play');
      socket.off('video:pause');
      socket.off('video:seek');
      socket.off('video:load');
      socket.off('video:sync');
      socket.off('video:force_sync');
    };
  }, [socket, isConnected, roomId, currentVideoId, isReady, setCurrentVideoId, setIsPlaying, setCurrentTime, logDebug]);

  // Player kontrol fonksiyonları
  const playVideo = useCallback(() => {
    logDebug('Video oynatılıyor ve diğer kullanıcılara bildiriliyor');
    ignoreNextPlayEvent.current = true;
    setIsPlaying(true);
    
    if (socket && isConnected) {
      socket.emit('video:play', { roomId, timestamp: Date.now() });
      // İşlem sonrası durumu gönder
      setTimeout(() => broadcastState(true), 500);
    }
    
    if (playerRef.current && isReady) {
      try {
        playerRef.current.playVideo();
      } catch (e) {
        console.error('Video oynatma hatası:', e);
      }
    }
  }, [socket, isConnected, roomId, isReady, broadcastState, logDebug]);

  const pauseVideo = useCallback(() => {
    logDebug('Video duraklatılıyor ve diğer kullanıcılara bildiriliyor');
    ignoreNextPauseEvent.current = true;
    setIsPlaying(false);
    
    if (socket && isConnected) {
      socket.emit('video:pause', { roomId, timestamp: Date.now() });
      // İşlem sonrası durumu gönder
      setTimeout(() => broadcastState(true), 500);
    }
    
    if (playerRef.current && isReady) {
      try {
        playerRef.current.pauseVideo();
      } catch (e) {
        console.error('Video duraklatma hatası:', e);
      }
    }
  }, [socket, isConnected, roomId, isReady, broadcastState, logDebug]);

  const seekTo = useCallback((seconds: number) => {
    logDebug('Video belirli bir zamana sarılıyor ve diğer kullanıcılara bildiriliyor:', seconds);
    
    if (syncPending.current) {
      logDebug('Zaten bir senkronizasyon işlemi devam ediyor, seek işlemi erteleniyor');
      return;
    }
    
    seeking.current = true;
    syncPending.current = true;
    setCurrentTime(seconds);
    
    // Debounce seek olaylarını - çok fazla ileri/geri hızlı yapılırsa
    if (seekDebounceTimerRef.current) {
      clearTimeout(seekDebounceTimerRef.current);
    }
    
    seekDebounceTimerRef.current = setTimeout(() => {
      if (socket && isConnected) {
        socket.emit('video:seek', { roomId, time: seconds, timestamp: Date.now() });
        // İşlem sonrası durumu gönder
        setTimeout(() => broadcastState(true), 500);
      }
    }, 300); // Seek olaylarını 300ms debounce et
    
    if (playerRef.current && isReady) {
      try {
        playerRef.current.seekTo(seconds, true);
        setTimeout(() => {
          seeking.current = false;
          syncPending.current = false;
        }, SYNC_CONFIG.SEEK_DEBOUNCE);
      } catch (e) {
        console.error('Video ileri/geri sarma hatası:', e);
        seeking.current = false;
        syncPending.current = false;
      }
    } else {
      seeking.current = false;
      syncPending.current = false;
    }
  }, [socket, isConnected, roomId, isReady, setCurrentTime, broadcastState, logDebug]);

  // Player durum değişikliği olayını işle
  const handleStateChange = useCallback((event: any) => {
    if (!event || !event.data) return;
    
    const state = event.data;
    
    // Kullanıcı ile ilgili olayları önle
    if (seeking.current || syncPending.current) return;
    
    // Durum değişikliğine göre işlem yap
    switch (state) {
      case PLAYER_STATE.PLAYING:
        if (!isPlaying) {
          logDebug('Player oynatılıyor, diğer kullanıcılara bildiriliyor');
          ignoreNextPlayEvent.current = true;
          setIsPlaying(true);
          
          if (socket && isConnected) {
            socket.emit('video:play', { roomId, timestamp: Date.now() });
            // Durumu gönder
            setTimeout(() => broadcastState(true), 500);
          }
        }
        setIsBuffering(false);
        
        // Player süresini güncelle
        try {
          const duration = playerRef.current.getDuration();
          if (duration && duration > 0) {
            lastKnownDuration.current = duration;
          }
        } catch (e) {
          console.error('Video süresi alınamadı:', e);
        }
        break;
        
      case PLAYER_STATE.PAUSED:
        if (isPlaying) {
          logDebug('Player duraklatıldı, diğer kullanıcılara bildiriliyor');
          ignoreNextPauseEvent.current = true;
          setIsPlaying(false);
          
          if (socket && isConnected) {
            socket.emit('video:pause', { roomId, timestamp: Date.now() });
            // Durumu gönder
            setTimeout(() => broadcastState(true), 500);
          }
        }
        setIsBuffering(false);
        break;
        
      case PLAYER_STATE.BUFFERING:
        logDebug('Player arabelleğe alınıyor');
        setIsBuffering(true);
        break;
        
      case PLAYER_STATE.ENDED:
        logDebug('Video sona erdi');
        setIsPlaying(false);
        setIsBuffering(false);
        
        if (socket && isConnected) {
          socket.emit('video:ended', { roomId, timestamp: Date.now() });
        }
        break;
    }
  }, [socket, isConnected, roomId, isPlaying, setIsPlaying, broadcastState, logDebug]);

  // Mevcut zamanı düzenli olarak güncelle
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    
    const updateTimeInterval = setInterval(() => {
      if (isPlaying && !seeking.current && !syncPending.current && playerRef.current) {
        try {
          const time = playerRef.current.getCurrentTime() || 0;
          setCurrentTime(time);
        } catch (e) {
          console.error('Zaman güncelleme hatası:', e);
        }
      }
    }, 1000);
    
    return () => clearInterval(updateTimeInterval);
  }, [isReady, isPlaying, setCurrentTime]);

  return {
    isReady,
    setPlayerRef,
    loadVideo,
    playVideo,
    pauseVideo,
    seekTo,
    handleStateChange,
    isBuffering,
    synchronizeNow
  };
};