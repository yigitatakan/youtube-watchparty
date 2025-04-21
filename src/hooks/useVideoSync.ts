import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRoomStore } from '../stores/roomStore';
import { nanoid } from 'nanoid';
import { YouTubePlayer } from 'react-youtube';

export const useVideoSync = (roomId: string) => {
  const { socket } = useSocket();
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isUserSeeking, setIsUserSeeking] = useState(false);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const {
    currentVideoId,
    isPlaying,
    currentTime,
    setCurrentVideoId,
    setIsPlaying,
    setCurrentTime,
  } = useRoomStore();

  // Set player reference - artık sadece bir referans tutuyor
  const setPlayerRef = (player: YouTubePlayer) => {
    playerRef.current = player;
    setIsReady(true);
  };

  // Video yükleme için basitleştirilmiş fonksiyon
  const loadVideo = (videoId: string) => {
    // İframe kullandığımız için gerçek bir kontrol yapamıyoruz
    // Ama state'i güncelleyebiliriz
    setIsPlaying(true);
    console.log("Video yükleniyor:", videoId);
  };

  // Şimdi sadece socket olaylarını dinliyoruz
  useEffect(() => {
    if (!socket || !roomId) return;

    // Socket video olaylarını dinle
    socket.on('video:load', ({ videoId }) => {
      console.log('Socket: video:load olayı alındı, videoId:', videoId);
      if (videoId && videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
      }
    });
    
    socket.on('video:play', () => {
      console.log('Socket: video:play olayı alındı');
      setIsPlaying(true);
    });
    
    socket.on('video:pause', () => {
      console.log('Socket: video:pause olayı alındı');
      setIsPlaying(false);
    });
    
    socket.on('video:seek', ({ time }) => {
      console.log('Socket: video:seek olayı alındı, time:', time);
      setCurrentTime(time);
    });
    
    socket.on('video:sync', ({ time, isPlaying: remotePlaying, videoId }) => {
      console.log('Socket: video:sync olayı alındı', { time, remotePlaying, videoId });
      if (videoId && videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
      }
      setCurrentTime(time);
      setIsPlaying(remotePlaying);
    });
    
    return () => {
      socket.off('video:play');
      socket.off('video:pause');
      socket.off('video:seek');
      socket.off('video:load');
      socket.off('video:sync');
    };
  }, [socket, roomId, currentVideoId]);

  // Basitleştirilmiş kontrol fonksiyonları
  const playVideo = () => {
    console.log('Socket: video:play olayı gönderiliyor');
    socket?.emit('video:play', { roomId, timestamp: Date.now() });
    setIsPlaying(true);
  };

  const pauseVideo = () => {
    console.log('Socket: video:pause olayı gönderiliyor');
    socket?.emit('video:pause', { roomId, timestamp: Date.now() });
    setIsPlaying(false);
  };

  const seekTo = (seconds: number) => {
    console.log('Socket: video:seek olayı gönderiliyor, time:', seconds);
    socket?.emit('video:seek', { roomId, time: seconds, timestamp: Date.now() });
    setCurrentTime(seconds);
  };

  // State olaylarını handle et
  const handleStateChange = (event: { target: YouTubePlayer; data: number }) => {
    const { data: state } = event;
    
    if (state === 1) { // Playing
      setIsPlaying(true);
      setIsBuffering(false);
    } else if (state === 2) { // Paused
      setIsPlaying(false);
      setIsBuffering(false);
    } else if (state === 3) { // Buffering
      setIsBuffering(true);
    } else if (state === 0) { // Ended
      setIsPlaying(false);
      setIsBuffering(false);
    }
  };

  // Chat mesajı gönderme fonksiyonu
  const sendMessage = (text: string) => {
    if (socket && text.trim()) {
      const messageId = nanoid();
      const timestamp = Date.now();
      
      socket.emit('chat:message', {
        roomId,
        message: {
          id: messageId,
          text,
          timestamp
        }
      });
    }
  };

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