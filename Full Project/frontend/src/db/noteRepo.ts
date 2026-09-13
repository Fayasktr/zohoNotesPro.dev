import { db, SyncQueueItem } from './indexedDb';
import { Note } from '../types/note.types';

export const noteRepo = {
  /**
   * Get all active notes from local IndexedDB
   */
  async getActiveNotes(): Promise<Note[]> {
    return await db.notes
      .filter(n => !n.isTrashed)
      .reverse()
      .sortBy('updatedAt');
  },

  /**
   * Get all trashed notes from local IndexedDB
   */
  async getTrashedNotes(): Promise<Note[]> {
    return await db.notes
      .filter(n => !!n.isTrashed)
      .reverse()
      .sortBy('updatedAt');
  },

  /**
   * Get a single note by ID
   */
  async getNoteById(id: string): Promise<Note | undefined> {
    return await db.notes.get(id);
  },

  /**
   * Create a new note locally and queue for Atlas backup
   */
  async createNote(partialNote: Partial<Note>, currentUserId: string): Promise<Note> {
    const id = partialNote.id || `ntbk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const newNote: Note = {
      id,
      title: partialNote.title || 'Untitled Notebook',
      folder: partialNote.folder || 'root',
      isStarred: !!partialNote.isStarred,
      isTrashed: false,
      trashedAt: null,
      cells: partialNote.cells || [
        {
          id: `cell-${Date.now()}`,
          type: 'code',
          language: 'javascript',
          content: '// Start coding here\nconsole.log("Hello from Zoho Notes Pro!");',
          output: null
        }
      ],
      tags: partialNote.tags || [],
      _version: 1,
      updatedAt: now,
      owner: currentUserId,
      ...partialNote
    };

    const queueItem: SyncQueueItem = {
      queueId: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      noteId: id,
      action: 'CREATE',
      note: newNote,
      queuedAt: now
    };

    // Atomic transaction: save note & queue backup event
    await db.transaction('rw', db.notes, db.syncQueue, async () => {
      await db.notes.put(newNote);
      await db.syncQueue.add(queueItem);
    });

    return newNote;
  },

  /**
   * Update an existing note locally and queue for Atlas backup
   */
  async updateNote(id: string, updates: Partial<Note>): Promise<Note | null> {
    const existing = await db.notes.get(id);
    if (!existing) return null;

    const now = Date.now();
    const updatedNote: Note = {
      ...existing,
      ...updates,
      _version: (existing._version || 1) + 1,
      updatedAt: now
    };

    const queueItem: SyncQueueItem = {
      queueId: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      noteId: id,
      action: 'UPDATE',
      note: updatedNote,
      queuedAt: now
    };

    await db.transaction('rw', db.notes, db.syncQueue, async () => {
      await db.notes.put(updatedNote);
      await db.syncQueue.add(queueItem);
    });

    return updatedNote;
  },

  /**
   * Soft delete (move to trash)
   */
  async trashNote(id: string): Promise<boolean> {
    const existing = await db.notes.get(id);
    if (!existing) return false;

    const now = Date.now();
    const trashedNote: Note = {
      ...existing,
      isTrashed: true,
      trashedAt: now,
      _version: (existing._version || 1) + 1,
      updatedAt: now
    };

    const queueItem: SyncQueueItem = {
      queueId: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      noteId: id,
      action: 'UPDATE',
      note: trashedNote,
      queuedAt: now
    };

    await db.transaction('rw', db.notes, db.syncQueue, async () => {
      await db.notes.put(trashedNote);
      await db.syncQueue.add(queueItem);
    });

    return true;
  },

  /**
   * Restore note from trash
   */
  async restoreNote(id: string): Promise<boolean> {
    const existing = await db.notes.get(id);
    if (!existing) return false;

    const now = Date.now();
    const restoredNote: Note = {
      ...existing,
      isTrashed: false,
      trashedAt: null,
      _version: (existing._version || 1) + 1,
      updatedAt: now
    };

    const queueItem: SyncQueueItem = {
      queueId: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      noteId: id,
      action: 'UPDATE',
      note: restoredNote,
      queuedAt: now
    };

    await db.transaction('rw', db.notes, db.syncQueue, async () => {
      await db.notes.put(restoredNote);
      await db.syncQueue.add(queueItem);
    });

    return true;
  },

  /**
   * Permanently delete a note
   */
  async deletePermanently(id: string): Promise<void> {
    const queueItem: SyncQueueItem = {
      queueId: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      noteId: id,
      action: 'DELETE',
      queuedAt: Date.now()
    };

    await db.transaction('rw', db.notes, db.syncQueue, async () => {
      await db.notes.delete(id);
      await db.syncQueue.add(queueItem);
    });
  },

  /**
   * Bulk ingest cloud notes (Hydration)
   * Merges server notes while preserving unsaved local queue edits
   */
  async bulkIngestCloudNotes(cloudNotes: Note[]): Promise<void> {
    if (!cloudNotes || cloudNotes.length === 0) return;

    // Get noteIds that have pending un-synced edits locally
    const pendingQueue = await db.syncQueue.toArray();
    const pendingNoteIds = new Set(pendingQueue.map(q => q.noteId));

    await db.transaction('rw', db.notes, async () => {
      for (const cloudNote of cloudNotes) {
        // If the user made edits locally that haven't pushed yet, don't overwrite with older cloud snapshot
        if (pendingNoteIds.has(cloudNote.id)) {
          const localNote = await db.notes.get(cloudNote.id);
          if (localNote && localNote.updatedAt > cloudNote.updatedAt) {
            continue;
          }
        }
        await db.notes.put(cloudNote);
      }
    });
  },

  /**
   * Get all queued changes awaiting backup in Atlas
   */
  async getPendingQueue(): Promise<SyncQueueItem[]> {
    return await db.syncQueue.toArray();
  },

  /**
   * Remove processed items from queue after successful backup
   */
  async clearQueueItems(queueIds: string[]): Promise<void> {
    if (!queueIds || queueIds.length === 0) return;
    const idsToDelete = await db.syncQueue
      .filter(item => queueIds.includes(item.queueId))
      .primaryKeys();

    await db.syncQueue.bulkDelete(idsToDelete);
  },

  /**
   * Queue all active local notes for backup to MongoDB Atlas
   */
  async queueAllNotesForBackup(): Promise<void> {
    const allNotes = await db.notes.toArray();
    const existingQueue = await db.syncQueue.toArray();
    const queuedNoteIds = new Set(existingQueue.map(q => q.noteId));

    for (const note of allNotes) {
      if (!queuedNoteIds.has(note.id)) {
        const queueId = `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await db.syncQueue.put({
          queueId,
          noteId: note.id,
          action: 'UPDATE',
          note,
          queuedAt: Date.now()
        });
      }
    }
  },

  /**
   * Adopt server version when backend signals a conflict
   */
  async resolveConflictWithServer(serverNote: Note): Promise<void> {
    if (!serverNote || !serverNote.id) return;
    await db.notes.put(serverNote);
  },

  /**
   * Rename a folder across all matching notes in IndexedDB and queue sync updates
   */
  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    const allNotes = await db.notes.toArray();
    for (const note of allNotes) {
      if (note.folder === oldPath) {
        await this.updateNote(note.id, { folder: newPath });
      } else if (note.folder && note.folder.startsWith(oldPath + '/')) {
        const updatedPath = newPath + note.folder.slice(oldPath.length);
        await this.updateNote(note.id, { folder: updatedPath });
      }
    }
  },

  /**
   * Delete a folder by moving all contained notebooks to trash
   */
  async deleteFolder(folderPath: string): Promise<void> {
    const allNotes = await db.notes.toArray();
    for (const note of allNotes) {
      if (!note.isTrashed && (note.folder === folderPath || (note.folder && note.folder.startsWith(folderPath + '/')))) {
        await this.trashNote(note.id);
      }
    }
  },

  /**
   * Move a specific note to a target folder
   */
  async moveNoteToFolder(noteId: string, newFolder: string): Promise<void> {
    await this.updateNote(noteId, { folder: newFolder });
  }
};
