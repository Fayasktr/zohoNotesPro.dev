import { axiosClient } from './axiosClient';
import { ApiResponse, AuthResponse, User } from '../types/auth.types';

export const authApi = {
  async register(username: string, email: string, password: string):Promise<ApiResponse<AuthResponse>> {
    const res = await axiosClient.post<ApiResponse<AuthResponse>>('/auth/register', { username, email, password });
    return res.data;
  },

  async login(email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    const res = await axiosClient.post<ApiResponse<AuthResponse>>('/auth/login', { email, password });
    return res.data;
  },

  async getMe(): Promise<ApiResponse<User>> {
    const res = await axiosClient.get<ApiResponse<User>>('/auth/me');
    return res.data;
  },

  async forgotPassword(email: string): Promise<ApiResponse> {
    const res = await axiosClient.post<ApiResponse>('/auth/forgot-password', { email });
    return res.data;
  },

  async resetPassword(token: string, password: string): Promise<ApiResponse> {
    const res = await axiosClient.post<ApiResponse>('/auth/reset-password', { token, password });
    return res.data;
  }
};
