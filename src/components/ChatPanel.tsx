import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { Send } from 'lucide-react';

// Mesaj tipi tanımlamaları
interface Message {
  id: string;
  text: string;
  userId: string;
  displayName: string;
  timestamp: number;
  status?: 'sending' | 'sent' | 'error';
}

interface ChatPanelProps {
  roomId: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ roomId }) => {
  const { socket, isConnected } = useSocket();
  const { userId, displayName } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [hasSentMessage, setHasSentMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingNotificationRef = useRef(0);

  // Socket olaylarını dinle
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Yeni mesaj geldiğinde
    const handleNewMessage = ({ message }: { message: Message }) => {
      console.log('Yeni mesaj alındı:', message);

      // Kendi gönderdiğimiz bir mesaj ise, durumunu güncelle
      if (message.userId === userId) {
        setMessages(prev => prev.map(m =>
          m.id === message.id ? { ...m, status: 'sent' } : m
        ));
      } else {
        // Başkasının gönderdiği bir mesaj ise, mesajlar listesine ekle
        setMessages(prev => [...prev, message]);
      }

      // Mesaj listesine kaydır
      scrollToBottom();
    };

    // Mesaj durum güncellemeleri
    const handleMessageStatus = ({ messageId, status }: { messageId: string; status: 'sent' | 'error' }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status } : m
      ));
    };

    // Kullanıcı yazıyor olayı
    const handleUserTyping = ({ userId, displayName }: { userId: string; displayName: string }) => {
      // Kendimiz yazıyorsak bildirmeye gerek yok
      if (userId === userId) return;

      setIsTyping(true);

      // Yazma durumu belirli bir süre sonra kaldırılır
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
      }, 2000);
    };

    // Yeni katılan kullanıcıya geçmiş mesajları gönder
    const handleUserJoined = ({ participant }: { participant: { userId: string; displayName: string } }) => {
      if (hasSentMessage && participant.userId !== userId) {
        // Sadece mesaj gönderilmişse geçmiş mesajları gönderelim
        socket.emit('chat:history_request', { roomId, targetUserId: participant.userId });
      }
    };

    // Mesaj geçmişi isteği
    const handleHistoryRequest = ({ targetUserId }: { targetUserId: string }) => {
      if (hasSentMessage) {
        // Sadece mesaj gönderilmişse yanıt verelim
        socket.emit('chat:history_response', {
          roomId,
          targetUserId,
          messages: messages.filter(m => m.userId === userId) // Sadece kendi mesajlarımızı gönderelim
        });
      }
    };

    // Mesaj geçmişi yanıtı
    const handleHistoryResponse = ({ messages: historyMessages }: { messages: Message[] }) => {
      // Tekrarlayan mesajları filtrele
      const newMessages = historyMessages.filter(
        newMsg => !messages.some(existingMsg => existingMsg.id === newMsg.id)
      );

      if (newMessages.length > 0) {
        setMessages(prev => [...prev, ...newMessages].sort((a, b) => a.timestamp - b.timestamp));
        scrollToBottom();
      }
    };

    // Olay dinleyicilerini ekle
    socket.on('chat:message', handleNewMessage);
    socket.on('chat:status', handleMessageStatus);
    socket.on('chat:typing', handleUserTyping);
    socket.on('room:user-joined', handleUserJoined);
    socket.on('chat:history_request', handleHistoryRequest);
    socket.on('chat:history_response', handleHistoryResponse);

    // Temizleme işlemleri
    return () => {
      socket.off('chat:message', handleNewMessage);
      socket.off('chat:status', handleMessageStatus);
      socket.off('chat:typing', handleUserTyping);
      socket.off('room:user-joined', handleUserJoined);
      socket.off('chat:history_request', handleHistoryRequest);
      socket.off('chat:history_response', handleHistoryResponse);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [socket, isConnected, roomId, userId, messages, hasSentMessage]);

  // Mesaj listesine kaydırma
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Mesajı gönder
  const sendMessage = () => {
    if (!socket || !isConnected || !inputValue.trim()) return;

    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();

    // Yeni mesajı oluştur
    const newMessage: Message = {
      id: messageId,
      text: inputValue.trim(),
      userId,
      displayName,
      timestamp,
      status: 'sending'
    };

    // Mesajı listeye ekle
    setMessages(prev => [...prev, newMessage]);

    // Mesajı gönder
    socket.emit('chat:message', {
      roomId,
      message: {
        id: messageId,
        text: inputValue.trim(),
        timestamp
      }
    });

    // Yazma alanını temizle ve focus'u koru
    setInputValue('');
    setHasSentMessage(true);
    inputRef.current?.focus();
    scrollToBottom();
  };

  // Enter tuşu ile gönder
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Kullanıcı yazıyor bildirimini gönder
  const handleTyping = () => {
    if (!socket || !isConnected) return;

    const now = Date.now();
    // En son bildirimi 2 saniyede bir gönder
    if (now - lastTypingNotificationRef.current > 2000) {
      socket.emit('chat:typing', { roomId, userId, displayName });
      lastTypingNotificationRef.current = now;
    }
  };

  // Mesaj zaman formatı
  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gray-800 border-b border-gray-700 p-3">
        <h2 className="font-bold">Sohbet</h2>
      </div>

      <div className="flex-1 p-3 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-gray-500 text-center my-4">
            <p>Henüz mesaj bulunmuyor.</p>
            <p className="text-sm">İlk mesajı gönderen siz olun!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.userId === userId ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 ${message.userId === userId
                    ? 'bg-purple-600 text-white rounded-br-none'
                    : 'bg-gray-700 text-white rounded-bl-none'
                  }`}>
                  {message.userId !== userId && (
                    <div className="text-xs font-medium text-purple-300 mb-1">{message.displayName}</div>
                  )}
                  <div className="break-words">{message.text}</div>
                  <div className="text-xs text-gray-300 mt-1 flex justify-between">
                    <span>{formatMessageTime(message.timestamp)}</span>
                    {message.userId === userId && message.status && (
                      <span className="ml-2">
                        {message.status === 'sending' && '⭕ Gönderiliyor...'}
                        {message.status === 'sent' && '✅ Gönderildi'}
                        {message.status === 'error' && '⚠️ Hata'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {isTyping && (
        <div className="px-3 py-1 text-xs text-gray-400">
          Birisi yazıyor...
        </div>
      )}

      <div className="p-3 border-t border-gray-700">
        <div className="flex">
          <input
            type="text"
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Mesajınızı yazın..."
            className="flex-1 input-field mr-2"
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || !isConnected}
            className={`p-2 rounded ${inputValue.trim() && isConnected
                ? 'bg-purple-600 hover:bg-purple-500'
                : 'bg-gray-700 cursor-not-allowed'
              }`}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        {!isConnected && (
          <div className="text-red-500 text-xs mt-1">
            Bağlantı kesildi. Mesaj gönderilemez.
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;