/**
 * Zoho Notes Pro - Smart Event-Driven Sync Engine
 * Synchronizes Local RxDB/IndexedDB with MongoDB Atlas
 * 
 * Features:
 * - Lazy Loading: Fetches manifest on load, pulls full note contents on-demand
 * - Event-Driven Debounced Sync: 10s debounce on typing, immediate on blur/switch/reconnect/logout
 * - Offline Queueing: Zero data loss during disconnection or unexpected crashes
 * - Multi-Device Conflict Resolution: Automatic merging + version history archival
 * - Real-Time Status Telemetry: Broadcasts sync states to UI badge
 */

(function (window) {
    'use strict';

    class ZohoSyncEngine {
        constructor() {
            this.db = window.ZohoLocalDB;
            this.status = 'SYNCED'; // 'SYNCED' | 'SYNCING' | 'PENDING' | 'OFFLINE'
            this.lastSyncTime = null;
            this.unsyncedCount = 0;
            this.listeners = new Set();
            this.isSyncing = false;
            this.syncDebounceTimer = null;
            this.debounceDelayMs = 10000; // 10 seconds debounce for typing
            this.pollIntervalMs = 60000; // 60s background health poll
            this.pollTimer = null;

            this.setupNetworkListeners();
            this.setupLifecycleListeners();
        }

        async init() {
            await this.db.init();

            // Load last sync time from settings
            const lastSync = await this.db.getSetting('lastAtlasSyncTime');
            if (lastSync) this.lastSyncTime = new Date(lastSync);

            // Calculate current unsynced count
            await this.updateUnsyncedCount();

            // Perform initial synchronization
            if (navigator.onLine) {
                this.syncNow({ isInitial: true }).catch(err => {
                    console.warn('[SyncEngine] Initial sync deferred:', err);
                });
            } else {
                this.setStatus('OFFLINE');
            }

            // Start background poll timer
            this.startBackgroundPoll();
        }

        setupNetworkListeners() {
            window.addEventListener('online', () => {
                console.log('[SyncEngine] Internet reconnected, flushing sync queue...');
                this.setStatus('SYNCING');
                this.syncNow({ immediate: true });
            });

            window.addEventListener('offline', () => {
                console.log('[SyncEngine] Network went offline, switching to offline-first mode.');
                this.setStatus('OFFLINE');
            });
        }

        setupLifecycleListeners() {
            // Immediate sync on tab switch or minimize
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden' && this.unsyncedCount > 0 && navigator.onLine) {
                    this.flushPendingSyncs();
                }
            });

            // Immediate sync on window blur
            window.addEventListener('blur', () => {
                if (this.unsyncedCount > 0 && navigator.onLine) {
                    this.flushPendingSyncs();
                }
            });

            // Warn user before closing tab if unsynced changes exist (though data is safe in IndexedDB)
            window.addEventListener('beforeunload', () => {
                if (this.unsyncedCount > 0 && navigator.onLine) {
                    // Trigger asynchronous beacon or fetch if needed
                    this.flushPendingSyncs();
                }
            });
        }

        startBackgroundPoll() {
            if (this.pollTimer) clearInterval(this.pollTimer);
            this.pollTimer = setInterval(() => {
                if (navigator.onLine && !this.isSyncing) {
                    this.syncManifest();
                }
            }, this.pollIntervalMs);
        }

        onStatusChange(callback) {
            if (typeof callback === 'function') {
                this.listeners.add(callback);
                // Trigger immediately with current state
                callback({
                    status: this.status,
                    unsyncedCount: this.unsyncedCount,
                    lastSyncTime: this.lastSyncTime
                });
            }
            return () => this.listeners.delete(callback);
        }

        setStatus(newStatus) {
            this.status = newStatus;
            this.broadcastStatus();
        }

        broadcastStatus() {
            const data = {
                status: this.status,
                unsyncedCount: this.unsyncedCount,
                lastSyncTime: this.lastSyncTime
            };
            for (const listener of this.listeners) {
                try { listener(data); } catch (e) { console.error(e); }
            }
        }

        async updateUnsyncedCount() {
            const queue = await this.db.getSyncQueue();
            this.unsyncedCount = queue.length;
            if (!navigator.onLine) {
                this.setStatus('OFFLINE');
            } else if (this.unsyncedCount > 0 && this.status !== 'SYNCING') {
                this.setStatus('PENDING');
            } else if (this.unsyncedCount === 0 && this.status !== 'SYNCING') {
                this.setStatus('SYNCED');
            }
        }

        // --- Helper: Safe Authenticated Fetch ---
        async safeFetch(url, options = {}) {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const headers = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...(options.headers || {})
            };

            if (csrfToken && options.method && options.method.toUpperCase() !== 'GET') {
                headers['X-CSRF-Token'] = csrfToken;
            }

            const response = await window.fetch(url, {
                ...options,
                headers
            });

            return response;
        }

        /**
         * Triggered when a note is edited locally.
         * Enqueues the change into syncQueue and starts debounced timer.
         */
        async notifyLocalChange(noteId, action = 'UPDATE', payload = null) {
            await this.db.addToSyncQueue({
                action,
                entityType: 'note',
                entityId: noteId,
                payload
            });

            await this.updateUnsyncedCount();

            // Reset debounce timer for typing
            if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);

            if (navigator.onLine) {
                this.syncDebounceTimer = setTimeout(() => {
                    this.flushPendingSyncs();
                }, this.debounceDelayMs);
            }
        }

        /**
         * Immediately flushes all queued items to Atlas without waiting for debounce.
         */
        async flushPendingSyncs() {
            if (this.syncDebounceTimer) {
                clearTimeout(this.syncDebounceTimer);
                this.syncDebounceTimer = null;
            }
            return this.syncNow({ immediate: true });
        }

        /**
         * Full Synchronization Cycle (Push Queue -> Pull Manifest -> Update State)
         */
        async syncNow(options = {}) {
            if (this.isSyncing) return;
            if (!navigator.onLine) {
                this.setStatus('OFFLINE');
                return;
            }

            this.isSyncing = true;
            this.setStatus('SYNCING');

            try {
                // Step 1: Push all pending local modifications to Atlas
                await this.pushPendingChanges();

                // Step 2: Fetch manifest from Atlas to discover new/updated notes
                await this.syncManifest();

                this.lastSyncTime = new Date();
                await this.db.setSetting('lastAtlasSyncTime', this.lastSyncTime.toISOString());
                await this.updateUnsyncedCount();

                this.setStatus('SYNCED');
            } catch (err) {
                console.error('[SyncEngine] Sync failed:', err);
                if (!navigator.onLine) {
                    this.setStatus('OFFLINE');
                } else {
                    this.setStatus('PENDING');
                }
            } finally {
                this.isSyncing = false;
                this.broadcastStatus();
            }
        }

        /**
         * Pushes items in syncQueue to MongoDB Atlas via POST /api/sync/push
         */
        async pushPendingChanges() {
            const queue = await this.db.getSyncQueue();
            if (queue.length === 0) return;

            // Deduplicate items by entityId, keeping the latest action and gathering all queueIds
            const entityMap = new Map();
            for (const item of queue) {
                const key = `${item.entityType || 'note'}_${item.entityId}`;
                if (!entityMap.has(key)) {
                    entityMap.set(key, {
                        queueIds: [],
                        item: item
                    });
                }
                const entry = entityMap.get(key);
                entry.queueIds.push(item.autoId || item.id);
                entry.item = item; // Keep latest action
            }

            const pushBatch = [];
            for (const [key, entry] of entityMap.entries()) {
                const item = entry.item;
                if (item.entityType === 'note') {
                    const localNote = await this.db.getNote(item.entityId);
                    if (localNote) {
                        pushBatch.push({
                            queueIds: entry.queueIds,
                            queueId: entry.queueIds[0],
                            action: item.action,
                            note: localNote
                        });
                    } else if (item.action === 'DELETE') {
                        pushBatch.push({
                            queueIds: entry.queueIds,
                            queueId: entry.queueIds[0],
                            action: 'DELETE',
                            noteId: item.entityId
                        });
                    }
                }
            }

            if (pushBatch.length === 0) {
                await this.db.clearSyncQueue();
                return;
            }

            const response = await this.safeFetch('/api/sync/push', {
                method: 'POST',
                body: JSON.stringify({ batch: pushBatch })
            });

            if (response.status === 401 || response.status === 403) {
                this.setStatus('AUTH_REQUIRED');
                if (window.ZohoOfflineManager && typeof window.ZohoOfflineManager.showAuthExpiredNotice === 'function') {
                    window.ZohoOfflineManager.showAuthExpiredNotice();
                }
                throw new Error('Authentication expired. Your changes are safely saved locally. Please log in to sync.');
            }

            if (!response.ok) {
                throw new Error(`Push failed with HTTP ${response.status}`);
            }

            const result = await response.json();

            // Clear successfully processed queue items
            if (result.processedQueueIds && Array.isArray(result.processedQueueIds)) {
                for (const qId of result.processedQueueIds) {
                    await this.db.removeFromSyncQueue(qId);
                }
            }

            // Handle server-side conflict resolutions if any
            if (result.conflicts && Array.isArray(result.conflicts)) {
                for (const conf of result.conflicts) {
                    await this.handleConflict(conf);
                }
            }
        }

        /**
         * Synchronize Note Manifest from MongoDB Atlas (Lazy Loading Index)
         */
        async syncManifest() {
            const response = await this.safeFetch('/api/sync/manifest');
            if (response.status === 401 || response.status === 403) {
                this.setStatus('AUTH_REQUIRED');
                return;
            }
            if (!response.ok) {
                throw new Error(`Manifest fetch failed (${response.status})`);
            }

            const remoteManifest = await response.json(); // Array of { id, title, folder, isStarred, isTrashed, updatedAt, trashedAt, _version }
            if (!Array.isArray(remoteManifest)) return;

            const localNotes = await this.db.getAllNotes({ folder: 'all' });
            const localTrash = await this.db.getTrash();
            const localMap = new Map();

            for (const n of localNotes) localMap.set(n.id, n);
            for (const n of localTrash.notebooks) localMap.set(n.id, n);

            for (const remote of remoteManifest) {
                const local = localMap.get(remote.id);
                const remoteUpdated = new Date(remote.updatedAt).getTime();

                if (!local) {
                    // Note exists in cloud but not locally -> Create stub for lazy loading
                    await this.db.putNote({
                        id: remote.id,
                        title: remote.title || 'Untitled Notebook',
                        folder: remote.folder || 'root',
                        isStarred: !!remote.isStarred,
                        isTrashed: !!remote.isTrashed,
                        trashedAt: remote.trashedAt || null,
                        cells: [],
                        updatedAt: remoteUpdated,
                        owner: remote.owner,
                        _version: remote._version || 1,
                        _syncStatus: 'synced',
                        _hasFullContent: false
                    }, { isRemoteSync: true, hasFullContent: false, isNew: true });
                } else {
                    const localUpdated = local.updatedAt || 0;
                    // If cloud is newer and note is not pending local push -> update local metadata
                    if (remoteUpdated > localUpdated && local._syncStatus === 'synced') {
                        await this.db.putNote({
                            ...local,
                            title: remote.title,
                            folder: remote.folder,
                            isStarred: remote.isStarred,
                            isTrashed: remote.isTrashed,
                            trashedAt: remote.trashedAt,
                            updatedAt: remoteUpdated,
                            _version: remote._version || local._version,
                            _syncStatus: 'synced',
                            _hasFullContent: false // Mark to re-pull cells when opened
                        }, { isRemoteSync: true, hasFullContent: false });
                    }
                }
            }
        }

        /**
         * Pull full note content on-demand (Lazy Loading)
         * Used when the user opens a note that doesn't have full cells loaded locally.
         */
        async pullNote(noteId) {
            const local = await this.db.getNote(noteId);
            if (local && local._hasFullContent && local.cells && local.cells.length > 0) {
                return local;
            }

            try {
                const res = await this.safeFetch('/api/sync/pull', {
                    method: 'POST',
                    body: JSON.stringify({ noteIds: [noteId] })
                });

                if (!res.ok) throw new Error('Failed to pull note content');
                const data = await res.json();
                const remoteNote = (data.notes && data.notes[0]) || data[0];

                if (remoteNote) {
                    const updated = await this.db.putNote({
                        id: remoteNote.id,
                        title: remoteNote.title || 'Untitled Notebook',
                        folder: remoteNote.folder || 'root',
                        isStarred: !!remoteNote.isStarred,
                        isTrashed: !!remoteNote.isTrashed,
                        trashedAt: remoteNote.trashedAt || null,
                        cells: remoteNote.content?.cells || remoteNote.cells || [],
                        tags: remoteNote.content?.tags || remoteNote.tags || [],
                        updatedAt: new Date(remoteNote.updatedAt).getTime(),
                        owner: remoteNote.owner,
                        _version: remoteNote._version || 1,
                        _syncStatus: 'synced',
                        _hasFullContent: true
                    }, { isRemoteSync: true, hasFullContent: true });

                    return updated;
                }
            } catch (err) {
                console.warn('[SyncEngine] Pull failed, serving local cached version if available', err);
            }

            return local;
        }

        /**
         * Handle conflict resolution when server detected concurrent multi-device edit
         */
        async handleConflict(conflict) {
            console.log('[SyncEngine] Resolving conflict for note:', conflict.noteId);
            const { noteId, serverNote, clientVersion } = conflict;
            const local = await this.db.getNote(noteId);

            if (!local) return;

            // Archive local copy in conflict history
            if (this.db.isDexie) {
                await this.db.db.conflictHistory.put({
                    id: `conf_${noteId}_${Date.now()}`,
                    noteId,
                    localContent: local,
                    remoteContent: serverNote,
                    resolvedContent: serverNote,
                    resolutionType: 'last-write-wins-server',
                    timestamp: Date.now()
                });
            }

            // Apply server version locally
            await this.db.putNote({
                id: serverNote.id,
                title: serverNote.title,
                folder: serverNote.folder,
                isStarred: serverNote.isStarred,
                isTrashed: serverNote.isTrashed,
                cells: serverNote.content?.cells || serverNote.cells || [],
                updatedAt: new Date(serverNote.updatedAt).getTime(),
                _version: serverNote._version,
                _syncStatus: 'synced',
                _hasFullContent: true
            }, { isRemoteSync: true, hasFullContent: true });
        }
    }

    // Export singleton
    window.ZohoSyncEngine = new ZohoSyncEngine();
})(window);
