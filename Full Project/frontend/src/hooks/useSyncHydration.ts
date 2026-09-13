import { useEffect, useState } from 'react';
import { noteApi } from '../api/noteApi';
import { noteRepo } from '../db/noteRepo';
import { useAuthStore } from '../store/useAuthStore';
import { useUIStore } from '../store/useUIStore';

export function useSyncHydration() {
  const { isAuthenticated } = useAuthStore();
  const { setSyncStatus } = useUIStore();
  const [isHydrating, setIsHydrating] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsHydrated(false);
      return;
    }

    let isMounted = true;

    async function hydrate() {
      setIsHydrating(true);
      setError(null);

      try {
        const res = await noteApi.hydrate();
        if (!isMounted) return;

        if (res.success && res.data && Array.isArray(res.data.notes)) {
          await noteRepo.bulkIngestCloudNotes(res.data.notes);
          setSyncStatus('synced');
          setIsHydrated(true);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const e = err as Error;
        console.warn('[SyncHydration] Hydration error (running offline):', e.message);
        setSyncStatus('offline');
        setError(e.message);
        // Even if network fails, user can proceed with existing local IndexedDB notes!
        setIsHydrated(true);
      } finally {
        if (isMounted) setIsHydrating(false);
      }
    }

    hydrate();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, setSyncStatus]);

  return { isHydrating, isHydrated, error };
}
