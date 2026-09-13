import Dexie, { type Table } from 'dexie';
import { Note } from '../types/note.types';

export interface SyncQueueItem {
  id?: number;
  queueId: string;
  noteId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  note?: Note;
  queuedAt: number;
}

export interface LocalSetting {
  key: string;
  value: unknown;
}

export class ZohoNotesDatabase extends Dexie {
  notes!: Table<Note, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  settings!: Table<LocalSetting, string>;

  constructor() {
    super('ZohoNotesProDB');

    this.version(1).stores({
      notes: 'id, title, folder, isStarred, isTrashed, updatedAt, _version, owner',
      syncQueue: '++id, queueId, noteId, action, queuedAt',
      settings: 'key'
    });
  }
}

export const db = new ZohoNotesDatabase();
