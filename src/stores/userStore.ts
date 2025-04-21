import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  userId: string;
  displayName: string;
  setUserId: (id: string) => void;
  setDisplayName: (name: string) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: '',
      displayName: '',
      setUserId: (id: string) => set({ userId: id }),
      setDisplayName: (name: string) => set({ displayName: name }),
    }),
    {
      name: 'user-storage',
    }
  )
);