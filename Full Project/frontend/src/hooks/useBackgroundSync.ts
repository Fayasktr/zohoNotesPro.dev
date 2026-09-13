import { useEffect } from 'react';
import { syncService } from '../services/syncService';
import { useAuthStore } from '../store/useAuthStore';
import { useUIStore } from '../store/useUIStore';

export function useBackgroundSync(intervalMs = 15000) {
  const { isAuthenticated } = useAuthStore();
  const { setSyncStatus } = useUIStore();

  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Periodic background timer
    const interval = setInterval(() => {
      syncService.performSync();
    }, intervalMs);

    // 2. Window events triggers: on reconnection & when user switches tabs
    const handleOnline = () => {
      setSyncStatus('saving');
      syncService.performSync();
    };

    const handleOffline = () => {
      setSyncStatus('offline');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        syncService.performSync();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, intervalMs, setSyncStatus]);

  return { triggerSyncNow: (forceAll = false) => syncService.performSync(forceAll) };
}
