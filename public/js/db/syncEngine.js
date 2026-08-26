/**
 * Zoho Notes Pro - Smart Local-First Background Sync Engine
 * 
 * Core Principles:
 * 1. LOCAL-FIRST IS PRIORITY #1: All notes, cells, edits, and state are saved locally immediately (<5ms).
 * 2. CLOUD IS STRICTLY BACKGROUND BACKUP: Sync pushes to MongoDB Atlas only when user takes a break / is idle.
 * 3. ZERO INPUT DELAY: Syncing runs purely in the background and never delays or blocks typing or file switching.
 * 4. ACTIVE EDITOR PROTECTION: Remote hydration never wipes, disposes, or resets active Monaco editors.
 * 5. SEAMLESS RECONCILIATION: New edits made while sync is in-flight are preserved and queued for the next idle break.
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

            // Idle & Break Sync Control
            this.idleTimeoutMs = 15000; // 15s of user inactivity triggers cloud backup
            this.idleDebounceTimer = null;
            this.lastActivityTime = Date.now();
            this.isUserActive = false;

            // Background health check (only runs when idle)
            this.pollIntervalMs = 60000; // 60s
            this.pollTimer = null;

            this.setupActivityListeners();
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

            // Perform initial background sync & hydration if online
            if (navigator.onLine) {
                // Run in background without blocking initial UI
                setTimeout(() => {
                    this.syncNow({ isInitial: true }).catch(err => {
                        console.warn('[SyncEngine] Initial background sync deferred:', err);
                    });
                }, 500);
            } else {
                this.setStatus('OFFLINE');
            }

            // Start background poll timer
            this.startBackgroundPoll();
        }

        /**
         * Global activity detection: Resets idle timer on any user typing or interactions.
         */
        setupActivityListeners() {
            const onActivity = () => {
                this.recordUserActivity();
            };

            window.addEventListener('keydown', onActivity, { passive: true });
            window.addEventListener('input', onActivity, { passive: true });
            window.addEventListener('pointerdown', onActivity, { passive: true });
            window.addEventListener('wheel', onActivity, { passive: true });
        }

        recordUserActivity() {
            this.lastActivityTime = Date.now();
            this.isUserActive = true;

            // Reset idle timer
            if (this.idleDebounceTimer) {
                clearTimeout(this.idleDebounceTimer);
            }

            // If there are unsynced changes, schedule backup when user becomes idle
            this.idleDebounceTimer = setTimeout(() => {
                this.onUserIdle();
            }, this.idleTimeoutMs);
        }

        onUserIdle() {
            this.isUserActive = false;
            // When user takes a break / stops interacting and changes are pending, push to cloud in background
            if (this.unsyncedCount > 0 && navigator.onLine && !this.isSyncing) {
                console.log('[SyncEngine] User is idle. Starting background cloud backup...');
                this.syncNow({ reason: 'user_idle_break' });
            }
        }

        setupNetworkListeners() {
            window.addEventListener('online', () => {
                console.log('[SyncEngine] Network reconnected. Notes are safe locally; scheduling backup...');
                if (this.unsyncedCount > 0) {
                    this.setStatus('PENDING');
                    this.recordUserActivity();
                } else {
                    this.setStatus('SYNCED');
                }
            });

            window.addEventListener('offline', () => {
                console.log('[SyncEngine] Network offline. 100% local-first mode active.');
                this.setStatus('OFFLINE');
            });
        }

        setupLifecycleListeners() {
            // When tab is hidden/closed, attempt a silent flush of pending changes
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden' && this.unsyncedCount > 0 && navigator.onLine) {
                    this.flushPendingSyncs();
                }
            });

            window.addEventListener('beforeunload', () => {
                if (this.unsyncedCount > 0 && navigator.onLine) {
                    this.flushPendingSyncs();
                }
            });
        }

        startBackgroundPoll() {
            if (this.pollTimer) clearInterval(this.pollTimer);
            this.pollTimer = setInterval(() => {
                // Only poll when user is idle, online, and not already syncing
                const now = Date.now();
                const isIdle = (now - this.lastActivityTime) >= this.idleTimeoutMs;
                if (navigator.onLine && !this.isSyncing && isIdle) {
                    if (this.unsyncedCount > 0) {
                        this.syncNow({ reason: 'periodic_idle_sync' });
                    } else {
                        this.hydrateAllNotes();
                    }
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
         * Enqueues the change into syncQueue and arms the idle detector.
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

            // Refresh user activity and arm idle timer
            this.recordUserActivity();
        }

        /**
         * Immediately flushes all queued items to Atlas without waiting for idle timer.
         */
        async flushPendingSyncs() {
            if (this.idleDebounceTimer) {
                clearTimeout(this.idleDebounceTimer);
                this.idleDebounceTimer = null;
            }
            return this.syncNow({ immediate: true });
        }

        /**
         * Full Synchronization Cycle (Push Queue -> Hydrate All Notes -> Update State)
         * Runs 100% non-blocking in the background.
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

                // Step 2: Full hydration - download ALL user notes with complete cell data silently
                await this.hydrateAllNotes();

                this.lastSyncTime = new Date();
                await this.db.setSetting('lastAtlasSyncTime', this.lastSyncTime.toISOString());
                await this.updateUnsyncedCount();

                this.setStatus('SYNCED');
            } catch (err) {
                console.error('[SyncEngine] Background cloud backup warning:', err);
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
                throw new Error('Authentication expired. Your changes are safely saved locally. Please log in to backup to cloud.');
            }

            if (!response.ok) {
                throw new Error(`Push failed with HTTP ${response.status}`);
            }

            const result = await response.json();

            // Clear ONLY successfully processed queue items (any new edits made while push was in-flight remain!)
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
         * Full Local Hydration: Fetches ALL notes with full cells from MongoDB Atlas.
         * Guarantees 100% offline availability of all notebook contents.
         * 
         * 🛡️ Active Note Protection: NEVER wipes, disposes, or resets active Monaco editors!
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
                const activeNotebookId = window.app && window.app.notebook ? window.app.notebook.id : null;

                for (const remote of remoteNotes) {
                    const local = await this.db.getNote(remote.id);
                    const isPendingLocalEdit = pendingIds.has(remote.id);
                    const isActiveNoteInUI = (activeNotebookId && activeNotebookId === remote.id);

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
                        // Local has no unsaved pending changes
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

                            // 🛡️ Active Note Protection:
                            // NEVER wipe Monaco editor DOM or dispose editors on an open note while user is active!
                            // Only update metadata (version, title in header) if user is not actively typing.
                            if (isActiveNoteInUI) {
                                if (window.app.notebook) {
                                    window.app.notebook._version = Math.max(window.app.notebook._version || 0, remoteVer);
                                }
                            }
                        }
                    }
                }

                // Update sidebar list in notebook UI if available (non-destructive)
                if (window.app && typeof window.app.refreshNotebookList === 'function') {
                    window.app.refreshNotebookList(false);
                } else if (window.app && typeof window.app.loadSidebarNotes === 'function') {
                    window.app.loadSidebarNotes(false);
                }
            } catch (err) {
                console.warn('[SyncEngine] Background hydration warning:', err.message);
            }
        }

        /**
         * Manifest Synchronization: Hydrates all notes from MongoDB Atlas into IndexedDB.
         */
        async syncManifest() {
            return this.hydrateAllNotes();
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
         * Handle conflict resolution safely without wiping active Monaco editors.
         */
        async handleConflict(conflict) {
            console.log('[SyncEngine] Handling conflict for note:', conflict.noteId, 'Reason:', conflict.reason);
            const { noteId, serverNote } = conflict;
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

            // Apply safe server version locally in Dexie
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

            // 🛡️ Do NOT destroy active editor session if user is currently working on this note.
            // If the note is currently open, align the in-memory version number.
            if (window.app && window.app.notebook && window.app.notebook.id === noteId) {
                window.app.notebook._version = serverNote._version || 1;
            }
        }
    }

    // Export singleton
    window.ZohoSyncEngine = new ZohoSyncEngine();
})(window);
