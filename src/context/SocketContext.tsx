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
  private debugMode = true; // Hata ayıklama için
  private mockSocket: any = {
    on: (event: string, handler: (data: any) => void) => {
      if (!this.eventHandlers[event]) {
        this.eventHandlers[event] = [];
      }
      this.eventHandlers[event].push(handler);
      return this.mockSocket;
    },
    emit: (event: string, data: any) => {
      // Debug log
      if (this.debugMode) {
        console.log(`[MockSocket] ${event} olayı gönderiliyor:`, data);
      }

      // Broadcast kanalı üzerinden diğer sekmelere gönder
      if (this.channel) {
        try {
          // Video olayları için özellikle içeriği zenginleştir
          if (event.startsWith('video:')) {
            // Videoyla ilgili olaylar için mevcut zaman bilgisini kaydet
            if (event === 'video:play' || event === 'video:pause' || event === 'video:seek' || event === 'video:sync' || event === 'video:force_sync') {
              if (!data.timestamp) {
                data.timestamp = Date.now();
              }

              // Odadaki herkese anında yanıt ver
              this.broadcastToRoom(event, data);
            }

            // Video yükleme için özel işlem
            if (event === 'video:load') {
              safeStorage.setItem(`video_${data.roomId}`, data.videoId);

              // Odadaki herkese anında yanıt ver
              this.broadcastToRoom(event, data);
            }
          }

          // Tüm mesajları BroadcastChannel üzerinden gönder
          this.channel.postMessage({
            event,
            data,
            sender: this.userId,
            timestamp: Date.now()
          });
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

      return this.mockSocket;
    },
    off: (event: string) => {
      delete this.eventHandlers[event];
      return this.mockSocket;
    },
    executeHandlers: (event: string, data: any) => {
      if (this.eventHandlers[event]) {
        if (this.debugMode) {
          console.log(`[MockSocket] Olay işleniyor: ${event}`, data);
        }
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

  // Oda tabanlı yayın fonksiyonu - aynı odadaki diğer kullanıcılara mesaj gönderir
  private broadcastToRoom(event: string, data: any) {
    if (this.debugMode) {
      console.log(`[MockSocket] Odaya yayın: ${event}`, data);
    }

    // Bu olay için odadaki tüm dinleyicileri tetikle
    setTimeout(() => {
      this.mockSocket.executeHandlers(event, data);
    }, 10);
  }

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
        const { event: eventName, data, sender, timestamp } = event.data;

        // Kendi gönderdiğimiz mesajları işleme - sadece diğer sekmelerden gelenleri işle
        if (sender !== this.userId && this.eventHandlers[eventName]) {
          if (this.debugMode) {
            console.log(`[MockSocket] ${eventName} olayı alındı (${Date.now() - timestamp}ms gecikme):`, data);
          }
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
  const maxReconnectAttempts = 3; // 5'ten 3'e düşürdüm, daha hızlı yedek mod geçişi için
  const forceMockSocket = false; // TEST: Her zaman BroadcastChannel kullan

  useEffect(() => {
    if (!userId || !displayName) return;

    // Bağlantı durumunu sıfırla
    setConnectionError(null);
    reconnectAttemptsRef.current = 0;

    // TEST: Doğrudan mock socket kullanmak için
    if (forceMockSocket) {
      console.log('TEST MODU: BroadcastChannel kullanılıyor (zorunlu)');
      setupMockSocket(userId, displayName, setSocket, setIsConnected, setUsingMockSocket);
      return;
    }

    // Gerçek socket.io kullan
    console.log('Gerçek socket.io sunucusuna bağlanılıyor:', API_URL);
    const socketIo = io(API_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      timeout: 5000, // Daha hızlı bağlantı timeout'u
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
    console.log('Mock socket kullanılıyor - BroadcastChannel aracılığıyla sekmeler arası senkronizasyon aktif');
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
      {connectionError && !usingMockSocket && (
        <div className="bg-red-600 text-white p-2 text-center text-sm">
          <p><strong>Bağlantı Hatası:</strong> {connectionError}</p>
          <p className="text-xs">Tekrar bağlanılmaya çalışılıyor... ({reconnectAttemptsRef.current}/{maxReconnectAttempts})</p>
        </div>
      )}
      {usingMockSocket && (
        <div className="bg-yellow-600 text-white p-2 text-center text-sm">
          <p><strong>Yerel Mod Aktif:</strong> BroadcastChannel kullanılıyor - Senkronizasyon yalnızca aynı tarayıcıdaki sekmeler arasında çalışacak.</p>
        </div>
      )}
      {children}
    </SocketContext.Provider>
  );
};