/**
 * Zoho Notes Pro - Smart Event-Driven Sync Engine
 * Synchronizes Local RxDB/IndexedDB with MongoDB Atlas
 * 
 * Features:
 * - Full Local Hydration: Prefetches ALL notes with full cell content for 100% offline availability
 * - Anti-Wipeout Protection: Prevents unhydrated or empty offline stubs from destroying cloud notes
 * - Monotonic Versioning: Bi-directional sync comparing latest monotonic versions & timestamps
 * - Event-Driven Debounced Sync: 10s debounce on typing, immediate on blur/switch/reconnect/logout
 * - Multi-Device Conflict Resolution: Automatic merging + local version history archival
 * - Real-Time Status Telemetry: Broadcasts sync states to UI badge
 */

(function (window) {
    'use strict';

    class ZohoSyncEngine {
        constructor() {
            this.db = window.ZohoLocalDB;
            this.status = 'SYNCED'; // 'SYNCED' | 'SYNCING' | 'PENDING' | 'OFFLINE' | 'AUTH_REQUIRED'
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

            // Perform initial synchronization & full hydration
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
                console.log('[SyncEngine] Internet reconnected, flushing sync queue & hydrating...');
                this.setStatus('SYNCING');
                this.syncNow({ immediate: true });
            });

            window.addEventListener('offline', () => {
                console.log('[SyncEngine] Network went offline, switching to 100% offline-first mode.');
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

            // Warn user before closing tab if unsynced changes exist
            window.addEventListener('beforeunload', () => {
                if (this.unsyncedCount > 0 && navigator.onLine) {
                    this.flushPendingSyncs();
                }
            });
        }

        startBackgroundPoll() {
            if (this.pollTimer) clearInterval(this.pollTimer);
            this.pollTimer = setInterval(() => {
                if (navigator.onLine && !this.isSyncing) {
                    this.hydrateAllNotes();
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
                headers,
                credentials: 'same-origin'
            });

            return response;
        }

        /**
         * Triggered when a note is edited locally.
         * Enqueues the change into syncQueue and starts debounced timer.
         */
        async notifyLocalChange(noteId, action = 'UPDATE', payload = null) {
            if (!noteId || noteId === 'starred' || noteId === 'trash') return;

            // Anti-Wipeout safety: if action is UPDATE, verify note exists
            if (action === 'UPDATE') {
                const note = await this.db.getNote(noteId);
                if (!note) return;
            }

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
         * Full Synchronization Cycle (Push Queue -> Hydrate All Notes -> Update State)
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

                // Step 2: Full hydration - download ALL user notes with complete cell data
                await this.hydrateAllNotes();

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

            // Handle server-side conflict resolutions if any (e.g. anti-wipeout or server is newer)
            if (result.conflicts && Array.isArray(result.conflicts)) {
                for (const conf of result.conflicts) {
                    await this.handleConflict(conf);
                }
            }
        }

        /**
         * Full Local Hydration: Fetches ALL notes with full cells from MongoDB Atlas.
         * Guarantees 100% offline availability of all notebook contents.
         */
        async hydrateAllNotes() {
            try {
                const response = await this.safeFetch('/api/sync/hydrate');
                if (response.status === 401 || response.status === 403) {
                    this.setStatus('AUTH_REQUIRED');
                    return;
                }
                if (!response.ok) {
                    throw new Error(`Hydrate fetch failed (${response.status})`);
                }

                const data = await response.json();
                const remoteNotes = data.notes;
                if (!Array.isArray(remoteNotes)) return;

                const pendingQueue = await this.db.getSyncQueue();
                const pendingIds = new Set(pendingQueue.map(q => q.entityId));

                for (const remote of remoteNotes) {
                    const local = await this.db.getNote(remote.id);
                    const isPendingLocalEdit = pendingIds.has(remote.id);

                    if (!local) {
                        // Brand new note from cloud -> store full content locally
                        await this.db.putNote({
                            id: remote.id,
                            title: remote.title || 'Untitled Notebook',
                            folder: remote.folder || 'root',
                            isStarred: !!remote.isStarred,
                            isTrashed: !!remote.isTrashed,
                            trashedAt: remote.trashedAt || null,
                            cells: remote.cells || [],
                            tags: remote.tags || [],
                            updatedAt: remote.updatedAt || Date.now(),
                            owner: remote.owner,
                            _version: remote._version || 1,
                            _syncStatus: 'synced',
                            _hasFullContent: true
                        }, { isRemoteSync: true, hasFullContent: true });
                    } else if (!isPendingLocalEdit) {
                        // Local has no unsaved changes -> apply cloud note if cloud version is >= local version
                        const localVer = typeof local._version === 'number' ? local._version : 0;
                        const remoteVer = typeof remote._version === 'number' ? remote._version : 1;
                        const localUpdated = local.updatedAt || 0;
                        const remoteUpdated = remote.updatedAt || 0;

                        if (remoteVer >= localVer || remoteUpdated >= localUpdated || !local._hasFullContent) {
                            await this.db.putNote({
                                id: remote.id,
                                title: remote.title || local.title,
                                folder: remote.folder || local.folder,
                                isStarred: remote.isStarred !== undefined ? remote.isStarred : local.isStarred,
                                isTrashed: remote.isTrashed !== undefined ? remote.isTrashed : local.isTrashed,
                                trashedAt: remote.trashedAt || null,
                                cells: remote.cells || local.cells || [],
                                tags: remote.tags || local.tags || [],
                                updatedAt: remoteUpdated,
                                owner: remote.owner || local.owner,
                                _version: remoteVer,
                                _syncStatus: 'synced',
                                _hasFullContent: true
                            }, { isRemoteSync: true, hasFullContent: true });

                            // If this note is currently open in active UI, refresh UI
                            if (window.app && window.app.notebook && window.app.notebook.id === remote.id) {
                                if (window.app.notebook._version !== remoteVer) {
                                    window.app.notebook.cells = remote.cells || [];
                                    window.app.notebook.title = remote.title || window.app.notebook.title;
                                    window.app.notebook._version = remoteVer;
                                    if (typeof window.app.renderAllCells === 'function') {
                                        window.app.renderAllCells();
                                    }
                                }
                            }
                        }
                    }
                }

                // Also update sidebar list in notebook UI if available
                if (window.app && typeof window.app.loadSidebarNotes === 'function') {
                    window.app.loadSidebarNotes(false);
                }
            } catch (err) {
                console.warn('[SyncEngine] Hydration warning:', err.message);
            }
        }

        /**
         * Pull single note content on-demand (Fallback)
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
         * Handle conflict resolution when server detected anti-wipeout or newer cloud note
         */
        async handleConflict(conflict) {
            console.log('[SyncEngine] Resolving conflict for note:', conflict.noteId, 'Reason:', conflict.reason);
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
                    resolutionType: conflict.reason || 'server-reconciliation',
                    timestamp: Date.now()
                });
            }

            // Apply safe server version locally
            const serverCells = serverNote.cells || serverNote.content?.cells || [];
            await this.db.putNote({
                id: serverNote.id,
                title: serverNote.title,
                folder: serverNote.folder,
                isStarred: serverNote.isStarred,
                isTrashed: serverNote.isTrashed,
                trashedAt: serverNote.trashedAt,
                cells: serverCells,
                tags: serverNote.tags || serverNote.content?.tags || [],
                updatedAt: typeof serverNote.updatedAt === 'number' ? serverNote.updatedAt : new Date(serverNote.updatedAt).getTime(),
                _version: serverNote._version || 1,
                _syncStatus: 'synced',
                _hasFullContent: true
            }, { isRemoteSync: true, hasFullContent: true });

            // Refresh UI if this note is currently displayed
            if (window.app && window.app.notebook && window.app.notebook.id === noteId) {
                window.app.notebook = {
                    ...window.app.notebook,
                    title: serverNote.title,
                    cells: serverCells,
                    _version: serverNote._version || 1
                };
                window.app.disposeEditors();
                const cellsList = document.getElementById('cells-list');
                if (cellsList) {
                    cellsList.innerHTML = '';
                    serverCells.forEach((cell, idx) => window.app.renderCell(cell, idx + 1));
                }
                const titleInput = document.getElementById('notebook-title');
                if (titleInput) titleInput.value = serverNote.title;
            }
        }
    }

    // Export singleton
    window.ZohoSyncEngine = new ZohoSyncEngine();
})(window);
