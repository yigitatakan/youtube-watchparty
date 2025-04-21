import React, { useState, useRef, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { useRoomStore, ChatMessage } from '../stores/roomStore';
import { useSocket } from '../context/SocketContext';
import { nanoid } from 'nanoid';
import { Send, MessageSquare } from 'lucide-react';

interface ChatPanelProps {
  roomId: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ roomId }) => {
  const [message, setMessage] = useState('');
  const { userId, displayName } = useUser();
  const { messages, addMessage } = useRoomStore();
  const { socket } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Listen for incoming chat messages
  useEffect(() => {
    if (!socket) return;
    
    socket.on('chat:message', (data: { message: Omit<ChatMessage, 'id' | 'displayName'> & { userId: string } }) => {
      const { userId, text, timestamp } = data.message;
      
      // Find the display name from participants or use "Unknown" as fallback
      const sender = {
        userId,
        displayName: 'Unknown',
      };
      
      addMessage({
        id: nanoid(),
        userId: sender.userId,
        displayName: sender.displayName,
        text,
        timestamp,
      });
    });
    
    return () => {
      socket.off('chat:message');
    };
  }, [socket, addMessage]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || !socket) return;
    
    const newMessage: Omit<ChatMessage, 'id'> = {
      userId,
      displayName,
      text: message.trim(),
      timestamp: Date.now(),
    };
    
    // Emit message to server
    socket.emit('chat:message', {
      roomId,
      message: {
        text: newMessage.text,
        timestamp: newMessage.timestamp,
      },
    });
    
    // Add message to local state
    addMessage({
      ...newMessage,
      id: nanoid(),
    });
    
    // Clear input
    setMessage('');
  };
  
  // Format timestamp
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <div className="chat-container h-full">
      <div className="p-3 border-b border-gray-700 flex items-center">
        <MessageSquare className="h-5 w-5 mr-2 text-purple-500" />
        <h2 className="font-medium">Chat</h2>
      </div>
      
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
            <p>No messages yet</p>
            <p className="text-sm">Be the first to say something!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex flex-col ${msg.userId === userId ? 'items-end' : 'items-start'}`}
            >
              <div 
                className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  msg.userId === userId 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-700 text-white'
                }`}
              >
                {msg.userId !== userId && (
                  <div className="font-medium text-xs mb-1">{msg.displayName}</div>
                )}
                <p>{msg.text}</p>
              </div>
              <span className="text-xs text-gray-500 mt-1">
                {formatTimestamp(msg.timestamp)}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="chat-input">
        <div className="flex">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-gray-700 rounded-l-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <button
            type="submit"
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 rounded-r-md transition-colors"
            disabled={!message.trim()}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;