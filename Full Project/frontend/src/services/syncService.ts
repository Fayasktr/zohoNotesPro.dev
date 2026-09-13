import { noteRepo } from '../db/noteRepo';
import { noteApi } from '../api/noteApi';
import { useUIStore } from '../store/useUIStore';
import { useAuthStore } from '../store/useAuthStore';
import { Note } from '../types/note.types';

let isSyncing = false;

export const syncService = {
  isSyncing(): boolean {
    return isSyncing;
  },

  /**
   * Perform batch sync to Atlas.
   * If forceAll is true, all local notes are queued if queue is currently empty.
   */
  async performSync(forceAll = false): Promise<boolean> {
    const { isAuthenticated } = useAuthStore.getState();
    const { setSyncStatus } = useUIStore.getState();

    if (!isAuthenticated || isSyncing || !navigator.onLine) {
      if (!navigator.onLine) setSyncStatus('offline');
      return false;
    }

    try {
      if (forceAll) {
        await noteRepo.queueAllNotesForBackup();
      }

      const queue = await noteRepo.getPendingQueue();
      if (queue.length === 0) {
        setSyncStatus('synced');
        return true;
      }

      isSyncing = true;
      setSyncStatus('saving');

      // Package queue items into push batch
      const batch = queue.map(item => ({
        queueId: item.queueId,
        action: item.action,
        noteId: item.noteId,
        note: item.note
      }));

      const res = await noteApi.pushBatch(batch);

      if (res.success && res.data) {
        const { processedQueueIds, conflicts } = res.data;

        // 1. Purge successfully backed up queue items
        if (Array.isArray(processedQueueIds) && processedQueueIds.length > 0) {
          await noteRepo.clearQueueItems(processedQueueIds);
        }

        // 2. Handle any conflict resolutions returned by backend guards
        if (Array.isArray(conflicts) && conflicts.length > 0) {
          for (const conflict of conflicts as { serverNote: Note }[]) {
            if (conflict.serverNote) {
              console.warn('[SyncService] Guard conflict detected, adopting cloud version.');
              await noteRepo.resolveConflictWithServer(conflict.serverNote);
            }
          }
        }

        // Check remaining queue
        const remaining = await noteRepo.getPendingQueue();
        setSyncStatus(remaining.length === 0 ? 'synced' : 'saving');
        return true;
      } else {
        setSyncStatus('error');
        return false;
      }
    } catch (err: unknown) {
      const e = err as Error;
      console.warn('[SyncService] Backup push failed:', e.message);
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
      return false;
    } finally {
      isSyncing = false;
    }
  }
};
