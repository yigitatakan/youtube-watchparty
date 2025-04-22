import { create } from 'zustand';

export interface Participant {
  userId: string;
  displayName: string;
  isHost?: boolean;
}

interface RoomState {
  roomId: string | null;
  participants: Participant[];
  currentVideoId: string | null;
  isPlaying: boolean;
  currentTime: number;
  setRoomId: (id: string) => void;
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (userId: string) => void;
  setCurrentVideoId: (id: string) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  clearRoom: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomId: null,
  participants: [],
  currentVideoId: null,
  isPlaying: false,
  currentTime: 0,
  setRoomId: (id) => set({ roomId: id }),
  setParticipants: (participants) => set({ participants }),
  addParticipant: (participant) =>
    set((state) => ({
      participants: state.participants.some(p => p.userId === participant.userId)
        ? state.participants
        : [...state.participants, participant]
    })),
  removeParticipant: (userId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.userId !== userId),
    })),
  setCurrentVideoId: (id) => set({ currentVideoId: id }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (time) => set({ currentTime: time }),
  clearRoom: () => set({
    participants: [],
    currentVideoId: null,
    isPlaying: false,
    currentTime: 0
  }),
}));