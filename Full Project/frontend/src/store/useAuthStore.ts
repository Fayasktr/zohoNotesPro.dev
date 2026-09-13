import { create } from 'zustand';
import { User } from '../types/auth.types';
import { authApi } from '../api/authApi';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setAuth: (user: User, token: string) => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

const savedToken = localStorage.getItem('zoho_notes_token');
const savedUser = localStorage.getItem('zoho_notes_user');

export const useAuthStore = create<AuthState>((set) => ({
  user: savedUser ? JSON.parse(savedUser) : null,
  token: savedToken || null,
  isAuthenticated: !!savedToken,
  isLoading: false,
  error: null,

  setAuth: (user, token) => {
    localStorage.setItem('zoho_notes_token', token);
    localStorage.setItem('zoho_notes_user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true, error: null });
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.login(email, password);
      if (res.success && res.data) {
        const { user, token } = res.data;
        localStorage.setItem('zoho_notes_token', token);
        localStorage.setItem('zoho_notes_user', JSON.stringify(user));
        set({ user, token, isAuthenticated: true, isLoading: false });
        return true;
      }
      set({ error: res.message || 'Login failed', isLoading: false });
      return false;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const msg = error.response?.data?.error?.message || error.message || 'Login failed';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.register(username, email, password);
      if (res.success && res.data) {
        const { user, token } = res.data;
        localStorage.setItem('zoho_notes_token', token);
        localStorage.setItem('zoho_notes_user', JSON.stringify(user));
        set({ user, token, isAuthenticated: true, isLoading: false });
        return true;
      }
      set({ error: res.message || 'Registration failed', isLoading: false });
      return false;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const msg = error.response?.data?.error?.message || error.message || 'Registration failed';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('zoho_notes_token');
    localStorage.removeItem('zoho_notes_user');
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('zoho_notes_token');
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }

    try {
      const res = await authApi.getMe();
      if (res.success && res.data) {
        set({ user: res.data, isAuthenticated: true });
        localStorage.setItem('zoho_notes_user', JSON.stringify(res.data));
      } else {
        localStorage.removeItem('zoho_notes_token');
        localStorage.removeItem('zoho_notes_user');
        set({ user: null, token: null, isAuthenticated: false });
      }
    } catch {
      localStorage.removeItem('zoho_notes_token');
      localStorage.removeItem('zoho_notes_user');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },

  clearError: () => set({ error: null })
}));
