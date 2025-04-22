import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: React.ReactNode;
}

// API URL'i - environment değişkeni veya varsayılan değer
const API_URL = import.meta.env.VITE_SOCKET_API_URL || 'https://youtube-watchparty.onrender.com';

// Safe localStorage access from UserContext
const memoryStorage: Record<string, string> = {};
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('localStorage erişimi reddedildi, hafıza içi depolama kullanılıyor');
      return memoryStorage[key] || null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('localStorage erişimi reddedildi, hafıza içi depolama kullanılıyor');
      memoryStorage[key] = value;
    }
  }
};

// Tarayıcıda BroadcastChannel ile yapılmış Mock Socket Server
class MockSocketServer {
  private eventHandlers: Record<string, Array<(data: any) => void>> = {};
  private channel: BroadcastChannel | null = null;
  private userId: string;
  private displayName: string;
  private mockSocket: any = {
    on: (event: string, handler: (data: any) => void) => {
      if (!this.eventHandlers[event]) {
        this.eventHandlers[event] = [];
      }
      this.eventHandlers[event].push(handler);
      return this.mockSocket;
    },
    emit: (event: string, data: any) => {
      // Broadcast kanalı üzerinden diğer sekmelere gönder
      if (this.channel) {
        try {
          this.channel.postMessage({ event, data, sender: this.userId });
        } catch (error) {
          console.warn('BroadcastChannel gönderme hatası:', error);
        }
      }

      // Özel olayları hemen işle
      if (event === 'room:join') {
        // Kullanıcı katıldığında tüm katılımcıları bilgilendir
        setTimeout(() => {
          this.mockSocket.executeHandlers('room:participants', {
            participants: [{ userId: this.userId, displayName: this.displayName }]
          });
        }, 100);
      }

      if (event === 'video:get_current') {
        // Mevcut video için güvenli depolamayı kontrol et
        const currentVideo = safeStorage.getItem(`video_${data.roomId}`);
        if (currentVideo) {
          setTimeout(() => {
            this.mockSocket.executeHandlers('video:current', { videoId: currentVideo });
          }, 200);
        }
      }

      // Video yüklendiğinde güvenli depoya kaydet
      if (event === 'video:load') {
        safeStorage.setItem(`video_${data.roomId}`, data.videoId);
      }

      return this.mockSocket;
    },
    off: (event: string) => {
      delete this.eventHandlers[event];
      return this.mockSocket;
    },
    executeHandlers: (event: string, data: any) => {
      if (this.eventHandlers[event]) {
        this.eventHandlers[event].forEach(handler => handler(data));
      }
    },
    disconnect: () => {
      if (this.channel) {
        try {
          this.channel.close();
        } catch (error) {
          console.warn('BroadcastChannel kapatma hatası:', error);
        }
      }
    }
  };

  constructor(userId: string, displayName: string) {
    this.userId = userId;
    this.displayName = displayName;

    // BroadcastChannel'ı güvenli bir şekilde oluştur
    try {
      // Not: BroadcastChannel yalnızca aynı tarayıcıdaki sekmeler arasında çalışır
      // Farklı tarayıcılar veya cihazlar arasında iletişim SAĞLAMAZ
      this.channel = new BroadcastChannel('youtube_sync_mock_socket');
      console.log('BroadcastChannel başarıyla oluşturuldu. Aynı tarayıcı içindeki senkronizasyon aktif.');

      // Diğer sekmelerin mesajlarını dinle
      this.channel.addEventListener('message', (event) => {
        const { event: eventName, data, sender } = event.data;

        // Kendi gönderdiğimiz mesajları işleme - sadece diğer sekmelerden gelenleri işle
        if (sender !== this.userId && this.eventHandlers[eventName]) {
          console.log(`Mock Socket: ${eventName} olayı alındı:`, data);
          this.mockSocket.executeHandlers(eventName, data);
        }
      });
    } catch (error) {
      console.warn('BroadcastChannel oluşturma hatası:', error);
      console.warn('Tarayıcınız BroadcastChannel API\'sini desteklemiyor. Senkronizasyon yalnızca tek bir sekmede çalışacak.');
      // BroadcastChannel desteklenmiyor, yalnızca yerel olarak devam ediyoruz
      this.channel = null;
    }

    // Bağlantı başarılı olayını tetikle
    setTimeout(() => {
      if (this.eventHandlers['connect']) {
        this.eventHandlers['connect'].forEach(handler => handler({}));
      }
    }, 100);
  }

  getSocket() {
    return this.mockSocket;
  }
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const { userId, displayName } = useUser();
  const [usingMockSocket, setUsingMockSocket] = useState(false);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    if (!userId || !displayName) return;

    // Bağlantı durumunu sıfırla
    setConnectionError(null);
    reconnectAttemptsRef.current = 0;

    // Gerçek socket.io kullan
    console.log('Gerçek socket.io sunucusuna bağlanılıyor:', API_URL);
    const socketIo = io(API_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      timeout: 10000,
      query: {
        userId,
        displayName
      },
      transports: ['websocket', 'polling'] // WebSocket'i öncelikli yap, olmadığında polling'e düş
    });

    socketIo.on('connect', () => {
      console.log('Socket bağlandı, Socket ID:', socketIo.id);
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttemptsRef.current = 0;
    });

    socketIo.on('disconnect', (reason) => {
      console.log('Socket bağlantısı kesildi, Neden:', reason);
      setIsConnected(false);
    });

    socketIo.on('connect_error', (error) => {
      reconnectAttemptsRef.current += 1;
      console.error('Socket bağlantı hatası:', error.message);
      setConnectionError(`Sunucuya bağlanılamadı: ${error.message}`);

      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        console.error('Maksimum yeniden bağlanma denemesi aşıldı, MockSocket kullanılacak');
        socketIo.disconnect();
        // Otomatik olarak MockSocket kullanmaya geç
        setupMockSocket(userId, displayName, setSocket, setIsConnected, setUsingMockSocket);
      }
    });

    socketIo.io.on('reconnect', (attempt) => {
      console.log(`Socket ${attempt}. denemede yeniden bağlandı`);
    });

    socketIo.io.on('reconnect_attempt', (attempt) => {
      console.log(`Socket yeniden bağlanmayı deniyor, deneme: ${attempt}`);
    });

    socketIo.io.on('reconnect_error', (error) => {
      console.error('Socket yeniden bağlanma hatası:', error);
    });

    socketIo.io.on('reconnect_failed', () => {
      console.error('Socket yeniden bağlanma başarısız oldu');
    });

    setSocket(socketIo);

    return () => {
      console.log('Socket bağlantısı kapatılıyor');
      socketIo.disconnect();
    };
  }, [userId, displayName]);

  // MockSocket kurulum fonksiyonu
  const setupMockSocket = (userId: string, displayName: string, setSocket: any, setIsConnected: any, setUsingMockSocket: any) => {
    console.log('Mock socket kullanılıyor - Backend bağlantısı kurulamadı');
    setUsingMockSocket(true);

    const mockSocketServer = new MockSocketServer(userId, displayName);
    const mockSocket = mockSocketServer.getSocket();

    mockSocket.on('connect', () => {
      console.log('Mock Socket bağlandı');
      setIsConnected(true);
    });

    mockSocket.on('disconnect', () => {
      console.log('Mock Socket bağlantısı kesildi');
      setIsConnected(false);
    });

    setSocket(mockSocket as any);

    return () => {
      mockSocket.disconnect();
    };
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {connectionError && (
        <div className="bg-red-600 text-white p-2 text-center text-sm">
          <p><strong>Bağlantı Hatası:</strong> {connectionError}</p>
          <p className="text-xs">Tekrar bağlanılmaya çalışılıyor... ({reconnectAttemptsRef.current}/{maxReconnectAttempts})</p>
        </div>
      )}
      {usingMockSocket && (
        <div className="bg-yellow-600 text-white p-2 text-center text-sm">
          <p><strong>Uyarı:</strong> Mock socket kullanılıyor. Sadece aynı tarayıcıdaki sekmeler arasında senkronizasyon çalışacak.</p>
        </div>
      )}
      {children}
    </SocketContext.Provider>
  );
};