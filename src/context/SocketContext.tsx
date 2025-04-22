import React, { createContext, useContext, useEffect, useState } from 'react';
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
  const { userId, displayName } = useUser();
  const [usingMockSocket, setUsingMockSocket] = useState(false);

  useEffect(() => {
    if (!userId || !displayName) return;

    // Geliştirme ortamında ve API_URL localhost ise mock socket kullanabilirsiniz
    // const useMockSocket = process.env.NODE_ENV === 'development' && API_URL.includes('localhost');
    const useMockSocket = false; // Gerçek socketio sunucusu için false

    if (useMockSocket) {
      // Mock socket kullan (yerel test için)
      console.log('Mock socket kullanılıyor');
      setUsingMockSocket(true);

      // Burada önceki MockSocketServer kodunuz olacaktı
      // ...
    } else {
      // Gerçek socket.io kullan
      console.log('Gerçek socket.io sunucusuna bağlanılıyor:', API_URL);
      const socketIo = io(API_URL, {
        autoConnect: true,
        reconnection: true,
        query: {
          userId,
          displayName
        }
      });

      socketIo.on('connect', () => {
        console.log('Socket bağlandı');
        setIsConnected(true);
      });

      socketIo.on('disconnect', () => {
        console.log('Socket bağlantısı kesildi');
        setIsConnected(false);
      });

      socketIo.on('connect_error', (error) => {
        console.error('Socket bağlantı hatası:', error);
      });

      setSocket(socketIo);

      return () => {
        socketIo.disconnect();
      };
    }
  }, [userId, displayName]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {usingMockSocket && (
        <div className="bg-red-600 text-white p-2 text-center text-sm">
          <p><strong>Uyarı:</strong> Mock socket kullanılıyor. Gerçek senkronizasyon için backend gereklidir.</p>
        </div>
      )}
      {children}
    </SocketContext.Provider>
  );
};