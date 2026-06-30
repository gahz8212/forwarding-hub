import { create } from 'zustand';
import axios from 'axios';

interface User {
  id: number;
  username: string;
  role: string;
  kakaoToken?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  checkAuth: async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/auth/check', { withCredentials: true });
      if (response.data.success) {
        set({ user: response.data.user, isAuthenticated: true });
      }
    } catch (error) {
      set({ user: null, isAuthenticated: false });
    }
  }
}));
