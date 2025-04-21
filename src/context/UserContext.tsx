import React, { createContext, useContext, useEffect, useState } from 'react';
import { nanoid } from 'nanoid';

interface UserContextType {
  userId: string;
  displayName: string;
  setDisplayName: (name: string) => void;
}

const UserContext = createContext<UserContextType>({
  userId: '',
  displayName: '',
  setDisplayName: () => { },
});

export const useUser = () => useContext(UserContext);

interface UserProviderProps {
  children: React.ReactNode;
}

// Hafıza içi depolama için yedek mekanizma
const memoryStorage: Record<string, string> = {};

// Güvenli bir şekilde localStorage erişimi için yardımcı fonksiyon
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

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [userId, setUserId] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');

  useEffect(() => {
    // Kullanıcı ID'sini güvenli bir şekilde yükle
    const storedUserId = safeStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    } else {
      const newUserId = nanoid();
      safeStorage.setItem('userId', newUserId);
      setUserId(newUserId);
    }

    // Kullanıcı adını güvenli bir şekilde yükle
    const storedDisplayName = safeStorage.getItem('displayName');
    if (storedDisplayName) {
      setDisplayName(storedDisplayName);
    } else {
      // Varsayılan bir kullanıcı adı ata
      const defaultName = `Misafir-${Math.floor(Math.random() * 1000)}`;
      setDisplayName(defaultName);
      safeStorage.setItem('displayName', defaultName);
    }
  }, []);

  // Kullanıcı adını değiştirme fonksiyonu
  const handleSetDisplayName = (name: string) => {
    safeStorage.setItem('displayName', name);
    setDisplayName(name);
  };

  return (
    <UserContext.Provider value={{ userId, displayName, setDisplayName: handleSetDisplayName }}>
      {children}
    </UserContext.Provider>
  );
};