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

export const useVideoSync = (roomId: string) => {
  const { socket, isConnected } = useSocket();
  const playerRef = useRef<any | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isUserSeeking, setIsUserSeeking] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(0);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seeking = useRef(false);
  const lastSyncReceived = useRef(0);
  const ignoreNextPlayEvent = useRef(false);
  const ignoreNextPauseEvent = useRef(false);
  const debugMode = useRef(import.meta.env.VITE_DEBUG_MODE === 'true');
  
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
    playerRef.current = player;
    setIsReady(true);
    logDebug('Player referansı ayarlandı');
  };

  // Video yükle ve oynat
  const loadVideo = useCallback((videoId: string) => {
    logDebug('Video yükleniyor:', videoId);
    
    // Socket.io üzerinden videoyu yükle
    if (socket && isConnected) {
      socket.emit('video:load', { roomId, videoId });
    }
    
    // Lokal olarak da yükle
    setCurrentVideoId(videoId);
    setIsPlaying(true);
  }, [socket, isConnected, roomId, setCurrentVideoId, setIsPlaying, logDebug]);

  // Senkronizasyon için düzenli olarak güncellemeler gönder
  useEffect(() => {
    if (!isReady || !socket || !isConnected || !roomId) return;

    // Periyodik senkronizasyon
    syncIntervalRef.current = setInterval(() => {
      if (playerRef.current && isReady) {
        try {
          const currentTime = playerRef.current.getCurrentTime() || 0;
          
          // Son güncellemeden bu yana belirli bir süre geçtiyse senkronize et
          const now = Date.now();
          if (now - lastUpdateTime > 5000) {
            socket.emit('video:sync', {
              roomId,
              time: currentTime,
              isPlaying,
              videoId: currentVideoId,
              timestamp: now
            });
            
            setLastUpdateTime(now);
            logDebug('Periyodik senkronizasyon gönderildi:', { currentTime, isPlaying });
          }
        } catch (error) {
          console.error('Senkronizasyon hatası:', error);
        }
      }
    }, 5000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isReady, socket, isConnected, roomId, isPlaying, currentVideoId, lastUpdateTime, logDebug]);

  // Socket event'lerini dinle
  useEffect(() => {
    if (!socket || !isConnected || !roomId) return;

    logDebug('Socket event dinleyicileri ekleniyor');

    // Video olaylarını dinle
    socket.on('video:load', ({ videoId }) => {
      logDebug('Socket: video:load olayı alındı, videoId:', videoId);
      if (videoId && videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
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
      seeking.current = true;
      setCurrentTime(time);
      
      // Player hazırsa belirli bir zamana atla
      if (playerRef.current && isReady) {
        try {
          playerRef.current.seekTo(time, true);
          setTimeout(() => {
            seeking.current = false;
          }, 1000);
        } catch (e) {
          console.error('Video ileri/geri sarma hatası:', e);
          seeking.current = false;
        }
      } else {
        seeking.current = false;
      }
    });
    
    socket.on('video:sync', ({ time, isPlaying: remotePlaying, videoId }) => {
      const now = Date.now();
      lastSyncReceived.current = now;
      
      logDebug('Socket: video:sync olayı alındı', { time, remotePlaying, videoId, now });
      
      // Video değiştiyse yeni videoyu yükle
      if (videoId && videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
      }
      
      // Zaman farkı büyükse senkronize et (500ms'den fazla)
      if (playerRef.current && isReady) {
        try {
          const currentTime = playerRef.current.getCurrentTime() || 0;
          const timeDiff = Math.abs(currentTime - time);
          
          if (timeDiff > 3) {
            logDebug('Zaman farkı büyük, senkronize ediliyor:', { currentTime, time, diff: timeDiff });
            seeking.current = true;
            playerRef.current.seekTo(time, true);
            setTimeout(() => {
              seeking.current = false;
            }, 1000);
          }
        } catch (e) {
          console.error('Senkronizasyon hatası:', e);
        }
      }
      
      // Oynatma durumunu senkronize et
      setIsPlaying(remotePlaying);
      if (playerRef.current && isReady) {
        try {
          if (remotePlaying && playerRef.current.getPlayerState() !== PLAYER_STATE.PLAYING) {
            playerRef.current.playVideo();
          } else if (!remotePlaying && playerRef.current.getPlayerState() === PLAYER_STATE.PLAYING) {
            playerRef.current.pauseVideo();
          }
        } catch (e) {
          console.error('Oynatma durumu senkronizasyon hatası:', e);
        }
      }
    });
    
    // Cleanup
    return () => {
      logDebug('Socket event dinleyicileri kaldırılıyor');
      socket.off('video:play');
      socket.off('video:pause');
      socket.off('video:seek');
      socket.off('video:load');
      socket.off('video:sync');
    };
  }, [socket, isConnected, roomId, currentVideoId, isReady, setCurrentVideoId, setIsPlaying, setCurrentTime, logDebug]);

  // Player kontrol fonksiyonları
  const playVideo = useCallback(() => {
    logDebug('Video oynatılıyor ve diğer kullanıcılara bildiriliyor');
    ignoreNextPlayEvent.current = true;
    setIsPlaying(true);
    
    if (socket && isConnected) {
      socket.emit('video:play', { roomId, timestamp: Date.now() });
    }
    
    if (playerRef.current && isReady) {
      try {
        playerRef.current.playVideo();
      } catch (e) {
        console.error('Video oynatma hatası:', e);
      }
    }
  }, [socket, isConnected, roomId, isReady, logDebug]);

  const pauseVideo = useCallback(() => {
    logDebug('Video duraklatılıyor ve diğer kullanıcılara bildiriliyor');
    ignoreNextPauseEvent.current = true;
    setIsPlaying(false);
    
    if (socket && isConnected) {
      socket.emit('video:pause', { roomId, timestamp: Date.now() });
    }
    
    if (playerRef.current && isReady) {
      try {
        playerRef.current.pauseVideo();
      } catch (e) {
        console.error('Video duraklatma hatası:', e);
      }
    }
  }, [socket, isConnected, roomId, isReady, logDebug]);

  const seekTo = useCallback((seconds: number) => {
    logDebug('Video belirli bir zamana sarılıyor ve diğer kullanıcılara bildiriliyor:', seconds);
    seeking.current = true;
    setCurrentTime(seconds);
    
    if (socket && isConnected) {
      socket.emit('video:seek', { roomId, time: seconds, timestamp: Date.now() });
    }
    
    if (playerRef.current && isReady) {
      try {
        playerRef.current.seekTo(seconds, true);
        setTimeout(() => {
          seeking.current = false;
        }, 1000);
      } catch (e) {
        console.error('Video ileri/geri sarma hatası:', e);
        seeking.current = false;
      }
    } else {
      seeking.current = false;
    }
  }, [socket, isConnected, roomId, isReady, setCurrentTime, logDebug]);

  // Player durum değişikliği olayını işle
  const handleStateChange = useCallback((event: any) => {
    if (!event || !event.data) return;
    
    const state = event.data;
    
    // Kullanıcı ile ilgili olayları önle
    if (seeking.current) return;
    
    // Durum değişikliğine göre işlem yap
    switch (state) {
      case PLAYER_STATE.PLAYING:
        if (!isPlaying) {
          logDebug('Player oynatılıyor, diğer kullanıcılara bildiriliyor');
          ignoreNextPlayEvent.current = true;
          setIsPlaying(true);
          
          if (socket && isConnected) {
            socket.emit('video:play', { roomId, timestamp: Date.now() });
          }
        }
        setIsBuffering(false);
        break;
        
      case PLAYER_STATE.PAUSED:
        if (isPlaying) {
          logDebug('Player duraklatıldı, diğer kullanıcılara bildiriliyor');
          ignoreNextPauseEvent.current = true;
          setIsPlaying(false);
          
          if (socket && isConnected) {
            socket.emit('video:pause', { roomId, timestamp: Date.now() });
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
        break;
    }
  }, [socket, isConnected, roomId, isPlaying, setIsPlaying, logDebug]);

  // Chat mesajı gönderme fonksiyonu
  const sendMessage = useCallback((text: string) => {
    if (socket && isConnected && text.trim()) {
      const messageId = nanoid();
      const timestamp = Date.now();
      
      logDebug('Chat mesajı gönderiliyor');
      socket.emit('chat:message', {
        roomId,
        message: {
          id: messageId,
          text,
          timestamp
        }
      });
    }
  }, [socket, isConnected, roomId, logDebug]);

  return {
    isReady,
    setPlayerRef,
    loadVideo,
    playVideo,
    pauseVideo,
    seekTo,
    handleStateChange,
    sendMessage,
    isBuffering
  };
};