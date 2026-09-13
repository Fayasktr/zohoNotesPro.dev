import axios from 'axios';

export const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request Interceptor: Attach Bearer JWT
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('zoho_notes_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response Interceptor: Auto-logout on 401 & single-retry on network error / idle reset
axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    // Auto-retry once on network glitch / idle socket reset
    if (config && !config._retry && (error.message === 'Network Error' || error.code === 'ERR_NETWORK' || error.code === 'ECONNRESET')) {
      config._retry = true;
      try {
        return await axiosClient(config);
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('zoho_notes_token');
      localStorage.removeItem('zoho_notes_user');
      // If not already on auth pages, redirect to login
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
