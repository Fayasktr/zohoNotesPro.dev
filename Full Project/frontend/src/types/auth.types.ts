export interface UserSettings {
  defaultLanguage: string;
  theme?: string;
  autoSaveIntervalMs?: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  avatar?: string;
  isGoogleAuth?: boolean;
  isBlocked?: boolean;
  settings?: UserSettings;
  lastLogin?: string;
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
