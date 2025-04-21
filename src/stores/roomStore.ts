import { create } from 'zustand';

export interface Participant {
  userId: string;
  displayName: string;
  isHost: boolean;
}

interface RoomState {
  roomId: string | null;
  participants: Participant[];
  currentVideoId: string | null;
  isPlaying: boolean;
  currentTime: number;
  messages: ChatMessage[];
  setRoomId: (id: string | null) => void;
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (userId: string) => void;
  setCurrentVideoId: (videoId: string | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  addMessage: (message: ChatMessage) => void;
  clearRoom: () => void;
}

export interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  text: string;
  timestamp: number;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomId: null,
  participants: [],
  currentVideoId: null,
  isPlaying: false,
  currentTime: 0,
  messages: [],
  setRoomId: (id) => set({ roomId: id }),
  setParticipants: (participants) => set({ participants }),
  addParticipant: (participant) =>
    set((state) => ({
      participants: [...state.participants, participant],
    })),
  removeParticipant: (userId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.userId !== userId),
    })),
  setCurrentVideoId: (videoId) => set({ currentVideoId: videoId }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (time) => set({ currentTime: time }),
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  clearRoom: () =>
    set({
      roomId: null,
      participants: [],
      currentVideoId: null,
      isPlaying: false,
      currentTime: 0,
      messages: [],
    }),
}));