import { axiosClient } from './axiosClient';
import { ApiResponse } from '../types/auth.types';
import { Note, NoteManifest } from '../types/note.types';

export const noteApi = {
  async listNotebooks(): Promise<ApiResponse<Note[]>> {
    const res = await axiosClient.get<ApiResponse<Note[]>>('/notebooks');
    return res.data;
  },

  async getNotebook(id: string): Promise<ApiResponse<Note>> {
    const res = await axiosClient.get<ApiResponse<Note>>(`/notebooks/${id}`);
    return res.data;
  },

  async saveNotebook(note: Partial<Note>): Promise<ApiResponse<Note>> {
    const res = await axiosClient.post<ApiResponse<Note>>('/notebooks', note);
    return res.data;
  },

  async renameNotebook(id: string, title: string): Promise<ApiResponse<Note>> {
    const res = await axiosClient.put<ApiResponse<Note>>(`/notebooks/${id}/rename`, { title });
    return res.data;
  },

  async toggleStar(id: string, isStarred: boolean): Promise<ApiResponse<Note>> {
    const res = await axiosClient.put<ApiResponse<Note>>(`/notebooks/${id}/star`, { isStarred });
    return res.data;
  },

  async trashNotebook(id: string): Promise<ApiResponse<Note>> {
    const res = await axiosClient.delete<ApiResponse<Note>>(`/notebooks/${id}`);
    return res.data;
  },

  async hydrate(): Promise<ApiResponse<{ count: number; notes: Note[]; serverTime: number }>> {
    const res = await axiosClient.get<ApiResponse<{ count: number; notes: Note[]; serverTime: number }>>('/sync/hydrate');
    return res.data;
  },

  async getManifest(): Promise<ApiResponse<NoteManifest[]>> {
    const res = await axiosClient.get<ApiResponse<NoteManifest[]>>('/sync/manifest');
    return res.data;
  },

  async pushBatch(batch: unknown[]): Promise<ApiResponse<{ processedCount: number; processedQueueIds: string[]; conflicts: unknown[] }>> {
    const res = await axiosClient.post<ApiResponse<{ processedCount: number; processedQueueIds: string[]; conflicts: unknown[] }>>('/sync/push', { batch });
    return res.data;
  }
};
