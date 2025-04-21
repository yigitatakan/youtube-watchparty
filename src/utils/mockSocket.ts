import { nanoid } from 'nanoid';
import { Participant, ChatMessage } from '../stores/roomStore';

// This is a mock implementation of socket.io for local testing without a real backend
export class MockSocket {
  private eventListeners: Record<string, Function[]> = {};
  private connected = false;
  private rooms: Record<string, {
    participants: Participant[];
    currentVideoId: string | null;
    isPlaying: boolean;
    currentTime: number;
    messages: ChatMessage[];
  }> = {};
  private userId: string;
  private displayName: string;

  constructor(userId: string, displayName: string) {
    this.userId = userId;
    this.displayName = displayName;
    
    // Simulate connection after a short delay
    setTimeout(() => {
      this.connected = true;
      this.emit('connect');
    }, 500);
  }

  // Register event listener
  on(event: string, callback: Function) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
    return this;
  }

  // Remove event listener
  off(event: string) {
    this.eventListeners[event] = [];
    return this;
  }

  // Emit event to listeners
  emit(event: string, ...args: any[]) {
    if (event === 'room:join') {
      const { roomId, userId, displayName } = args[0];
      this.handleJoinRoom(roomId, userId, displayName);
    }
    else if (event === 'room:leave') {
      const { roomId, userId } = args[0];
      this.handleLeaveRoom(roomId, userId);
    }
    else if (event === 'chat:message') {
      const { roomId, message } = args[0];
      this.handleChatMessage(roomId, message);
    }
    else if (event === 'video:load') {
      const { roomId, videoId } = args[0];
      this.handleVideoLoad(roomId, videoId);
    }
    else if (event === 'video:play') {
      const { roomId } = args[0];
      this.handleVideoPlay(roomId);
    }
    else if (event === 'video:pause') {
      const { roomId } = args[0];
      this.handleVideoPause(roomId);
    }
    else if (event === 'video:seek') {
      const { roomId, time } = args[0];
      this.handleVideoSeek(roomId, time);
    }
    else if (event === 'video:sync') {
      // Just pass through for mock implementation
    }
    else if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(...args));
    }
    
    return true;
  }

  // Trigger an event from the server to clients
  private trigger(event: string, ...args: any[]) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(...args));
    }
  }

  // Simulate server-side logic
  private handleJoinRoom(roomId: string, userId: string, displayName: string) {
    // Create room if it doesn't exist
    if (!this.rooms[roomId]) {
      this.rooms[roomId] = {
        participants: [],
        currentVideoId: null,
        isPlaying: false,
        currentTime: 0,
        messages: []
      };
    }
    
    // Add participant if not already in room
    const existingParticipant = this.rooms[roomId].participants.find(p => p.userId === userId);
    if (!existingParticipant) {
      const isHost = this.rooms[roomId].participants.length === 0;
      const participant = { userId, displayName, isHost };
      this.rooms[roomId].participants.push(participant);
      
      // Notify others
      this.trigger('room:user-joined', { participant });
    }
    
    // Send room state
    this.trigger('room:participants', {
      participants: this.rooms[roomId].participants
    });
    
    // Send current video
    if (this.rooms[roomId].currentVideoId) {
      this.trigger('video:current', {
        videoId: this.rooms[roomId].currentVideoId,
        isPlaying: this.rooms[roomId].isPlaying,
        currentTime: this.rooms[roomId].currentTime
      });
    }
  }
  
  private handleLeaveRoom(roomId: string, userId: string) {
    if (this.rooms[roomId]) {
      // Remove participant
      this.rooms[roomId].participants = this.rooms[roomId].participants.filter(p => p.userId !== userId);
      
      // Notify others
      this.trigger('room:user-left', { userId });
      
      // If room is empty, delete it
      if (this.rooms[roomId].participants.length === 0) {
        delete this.rooms[roomId];
      }
    }
  }
  
  private handleChatMessage(roomId: string, message: { text: string, timestamp: number }) {
    if (this.rooms[roomId]) {
      const chatMessage = {
        userId: this.userId,
        text: message.text,
        timestamp: message.timestamp
      };
      
      // Store message
      this.rooms[roomId].messages.push({
        id: nanoid(),
        userId: this.userId,
        displayName: this.displayName,
        text: message.text,
        timestamp: message.timestamp
      });
      
      // Broadcast to others (excluding sender who handles it locally)
      this.trigger('chat:message', { message: chatMessage });
    }
  }
  
  private handleVideoLoad(roomId: string, videoId: string) {
    if (this.rooms[roomId]) {
      this.rooms[roomId].currentVideoId = videoId;
      this.rooms[roomId].currentTime = 0;
      this.rooms[roomId].isPlaying = false;
      
      // Broadcast to all
      this.trigger('video:load', { videoId });
    }
  }
  
  private handleVideoPlay(roomId: string) {
    if (this.rooms[roomId]) {
      this.rooms[roomId].isPlaying = true;
      
      // Broadcast to all
      this.trigger('video:play');
    }
  }
  
  private handleVideoPause(roomId: string) {
    if (this.rooms[roomId]) {
      this.rooms[roomId].isPlaying = false;
      
      // Broadcast to all
      this.trigger('video:pause');
    }
  }
  
  private handleVideoSeek(roomId: string, time: number) {
    if (this.rooms[roomId]) {
      this.rooms[roomId].currentTime = time;
      
      // Broadcast to all
      this.trigger('video:seek', { time });
    }
  }
  
  // Simulate disconnect
  disconnect() {
    this.connected = false;
    this.trigger('disconnect');
    
    // Clear all event listeners
    this.eventListeners = {};
  }
}