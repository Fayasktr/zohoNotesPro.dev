import { useEffect, useRef } from 'react';
import { syncService } from '../services/syncService';
import { useAuthStore } from '../store/useAuthStore';
import { useUIStore } from '../store/useUIStore';

export function useBackgroundSync(idleDelayMs = 60000) {
  const { isAuthenticated } = useAuthStore();
  const { setSyncStatus } = useUIStore();
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Reset idle debounce timer on user interaction
    const resetIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = setTimeout(() => {
        syncService.performSync();
      }, idleDelayMs);
    };

    window.addEventListener('keydown', resetIdleTimer, { passive: true });
    window.addEventListener('input', resetIdleTimer, { passive: true });
    window.addEventListener('pointerdown', resetIdleTimer, { passive: true });

    // Initial check after mount: schedule idle sync
    resetIdleTimer();

    // Window events triggers: on reconnection & when user switches tabs
    const handleOnline = () => {
      resetIdleTimer();
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
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('input', resetIdleTimer);
      window.removeEventListener('pointerdown', resetIdleTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, idleDelayMs, setSyncStatus]);

  return { triggerSyncNow: (forceAll = false) => syncService.performSync(forceAll) };
}

