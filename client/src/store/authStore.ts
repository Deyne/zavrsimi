import { create } from 'zustand';
import { User } from '@zavrsi-mi/shared';
import { api } from '../services/api';
import { disconnectSocket } from '../services/socket';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: true,

  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    set({ user, token, isLoading: false });
  },

  logout: () => {
    disconnectSocket();
    localStorage.removeItem('token');
    api.post('/auth/logout').catch(() => {});
    set({ user: null, token: null });
  },

  fetchUser: async () => {
    const token = get().token;
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      const user = await api.get<User>('/auth/me');
      set({ user, isLoading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, isLoading: false });
    }
  },

  updateUser: (updates) => {
    const user = get().user;
    if (user) set({ user: { ...user, ...updates } });
  },
}));
