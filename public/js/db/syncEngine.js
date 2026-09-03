/**
 * Zoho Notes Pro - Local-First Cloud Backup Engine
 *
 * Core Architecture Principles:
 * 1. LOCAL-FIRST IS ABSOLUTE PRIORITY: All notes, cells, edits, and state are saved locally immediately (<5ms).
 * 2. CLOUD IS A SAFE BACKUP TARGET: The client backs up local state to MongoDB Atlas in the background when idle.
 * 3. ZERO INPUT DELAY: Backups run strictly asynchronously and never block typing, UI transitions, or execution.
 * 4. ACTIVE EDITOR IMMUNITY: User keystrokes and open Monaco editor states are NEVER overwritten by network responses.
 * 5. SAFE RESTORATION: Cloud restore is explicit (e.g. fresh device setup or manual user request) and never wipes local work.
 * 6. NO SILENT DATA LOSS: Stale devices can never overwrite newer cloud backups
 *    (server recency guard) and conflicts are self-healed by adopting the cloud copy.
 * 7. NO PHANTOM NOTES: Startup reconciliation is deterministic (waitForStartup),
 *    default-note creation is gated on hydration + auth state.
 * 8. NO CROSS-ACCOUNT LEAKS / NO RESURRECTION: Local stores are wiped on account
 *    switch; purged notes send DELETE tombstones so they stay deleted.
 */

(function (window) {
    'use strict';

    class ZohoBackupEngine {
        constructor() {
            this.db = window.ZohoLocalDB;
            this.status = 'SYNCED'; // 'SYNCED' (Backed Up) | 'SYNCING' (Backing Up) | 'PENDING' (Saved Locally) | 'OFFLINE' | 'AUTH_REQUIRED'
            this.lastSyncTime = null;
            this.unsyncedCount = 0;
            this.listeners = new Set();
            this.isSyncing = false;

            // Startup reconciliation: hydration MUST complete before the app
            // decides whether to auto-create a default note. This kills the
            // historical race that spawned phantom "Getting Started" notes.
            this.startupPromise = null;
            this.accountVerified = false;

            // Idle & Inactivity Backup Controls
            this.idleTimeoutMs = 2500; // 2.5s of typing pause triggers automatic background cloud backup
            this.maxWaitMs = 10000; // 10s maximum ceiling for unsynced changes during continuous non-stop editing
            this.idleDebounceTimer = null;
            this.maxWaitTimer = null;
            this.lockRetryTimer = null;
            this.lastActivityTime = Date.now();
            this.firstPendingChangeTime = null;
            this.isUserActive = false;

            // Periodic backup check for unsynced changes (Runs on idle or when max wait exceeded)
            this.pollIntervalMs = 30000; // 30s
            this.pollTimer = null;

            this.setupActivityListeners();
            this.setupNetworkListeners();
            this.setupLifecycleListeners();
        }

        async init() {
            if (!this.db) {
                console.warn('[BackupEngine] ZohoLocalDB not found on window');
                return;
            }
            if (this.startupPromise) return this.waitForStartup();

            this.startupPromise = (async () => {
                await this.db.init();

                const lastSync = await this.db.getSetting('lastAtlasSyncTime');
                if (lastSync) this.lastSyncTime = new Date(lastSync);

                // Account-switch protection: if a different user signed in on
                // this browser, wipe local stores BEFORE anything else so
                // notes never leak between accounts.
                if (navigator.onLine) {
                    try {
                        await this.verifyAccountIdentity();
                    } catch (err) {
                        console.warn('[BackupEngine] Account identity check deferred:', err.message || err);
                    }
                }

                await this.updateUnsyncedCount();

                // Deterministic initial reconciliation (no setTimeout race)
                if (navigator.onLine && !this.isAuthRequired()) {
                    try {
                        const localNotes = await this.db.getAllNotes();
                        if (!localNotes || localNotes.length === 0) {
                            console.log('[BackupEngine] Empty local database detected. Restoring notes from cloud backup...');
                            await this.restoreFromCloud({ isInitial: true });
                        } else if (this.unsyncedCount > 0) {
                            // Pending local changes from an offline session: back up,
                            // but never block startup on it.
                            this.backupNow({ reason: 'initial_reconnect_backup' }).catch(err => {
                                console.warn('[BackupEngine] Initial cloud backup deferred:', err);
                            });
                        }
                    } catch (err) {
                        console.warn('[BackupEngine] Initial setup check deferred:', err);
                    }
                } else if (!navigator.onLine) {
                    this.setStatus('OFFLINE');
                }

                this.startBackgroundPoll();
            })();

            return this.waitForStartup();
        }

        /**
         * Resolves once startup reconciliation (hydration / identity check) is done.
         * The notebook UI must await this before creating any default note.
         */
        waitForStartup() {
            return (this.startupPromise || Promise.resolve()).catch(err => {
                console.warn('[BackupEngine] Startup reconcile warning:', err);
            });
        }

        isAuthRequired() {
            return this.status === 'AUTH_REQUIRED';
        }

        /**
         * Compares the signed-in account with the account that owns the data
         * currently sitting in IndexedDB. On mismatch the local stores are wiped
         * so user B never inherits (and re-uploads) user A's notes.
         */
        async verifyAccountIdentity() {
            if (!this.db) return;
            const res = await this.safeFetch('/api/sync/status');
            if (!res.ok) return;
            const info = await res.json();
            if (!info || !info.userId) return;

            const storedOwner = await this.db.getSetting('ownerId');
            if (storedOwner && storedOwner !== String(info.userId)) {
                console.warn('[BackupEngine] Different account detected. Wiping stale local cache before hydration.');
                await this.db.wipeAllData();
                this.unsyncedCount = 0;
            }
            await this.db.setSetting('ownerId', String(info.userId));
            this.accountVerified = true;
        }

        /**
         * User Activity Detection: Resets idle timer when user types or interacts.
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

            // Arm maxWait ceiling so continuous typing doesn't starve cloud backup
            if (this.unsyncedCount > 0 && !this.maxWaitTimer) {
                this.maxWaitTimer = setTimeout(() => {
                    this.onMaxWaitReached();
                }, this.maxWaitMs);
            }
        }

        onUserIdle() {
            this.isUserActive = false;
            // When user stops typing/interacting and changes are pending, safely backup to cloud
            if (this.unsyncedCount > 0 && navigator.onLine && !this.isSyncing) {
                console.log('[BackupEngine] User is idle. Starting background cloud backup...');
                this.backupNow({ reason: 'user_idle_break' });
            }
        }

        onMaxWaitReached() {
            if (this.maxWaitTimer) {
                clearTimeout(this.maxWaitTimer);
                this.maxWaitTimer = null;
            }
            if (this.unsyncedCount > 0 && navigator.onLine && !this.isSyncing) {
                console.log('[BackupEngine] Continuous editing detected: forcing background cloud backup...');
                this.backupNow({ reason: 'max_wait_forced_backup' });
            }
        }

        setupNetworkListeners() {
            window.addEventListener('online', () => {
                console.log('[BackupEngine] Network reconnected. Notes are safe locally; scheduling backup...');
                if (this.unsyncedCount > 0) {
                    this.setStatus('PENDING');
                    this.recordUserActivity();
                } else {
                    this.setStatus('SYNCED');
                }
            });

            window.addEventListener('offline', () => {
                console.log('[BackupEngine] Network offline. 100% local-first mode active.');
                this.setStatus('OFFLINE');
            });
        }

        setupLifecycleListeners() {
            // When tab is hidden/closed, attempt a clean flush of pending changes
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
                // Push backups when user is idle OR when pending changes have exceeded maxWaitMs
                const now = Date.now();
                const isIdle = (now - this.lastActivityTime) >= this.idleTimeoutMs;
                const hasExceededMaxWait = this.firstPendingChangeTime && (now - this.firstPendingChangeTime) >= this.maxWaitMs;

                if (navigator.onLine && !this.isSyncing && this.unsyncedCount > 0 && (isIdle || hasExceededMaxWait)) {
                    this.backupNow({ reason: isIdle ? 'periodic_idle_backup' : 'periodic_max_wait_backup' });
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
            if (!this.db) return;
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
         * Enqueues a locally modified note for cloud backup and arms the idle detector.
         */
        async notifyLocalChange(noteId, action = 'UPDATE', payload = null) {
            if (!noteId || noteId === 'starred' || noteId === 'trash') return;

            // Anti-Wipeout safety: if action is UPDATE, verify note exists
            if (action === 'UPDATE' && this.db) {
                const note = await this.db.getNote(noteId);
                if (!note) return;
            }

            if (this.db) {
                await this.db.addToSyncQueue({
                    action,
                    entityType: 'note',
                    entityId: noteId,
                    payload
                });
            }

            if (!this.firstPendingChangeTime) {
                this.firstPendingChangeTime = Date.now();
            }

            await this.updateUnsyncedCount();

            // Refresh user activity and arm idle timer + maxWait ceiling
            this.recordUserActivity();
        }

        /**
         * Immediately flushes all queued items to cloud backup.
         */
        async flushPendingSyncs() {
            if (this.idleDebounceTimer) {
                clearTimeout(this.idleDebounceTimer);
                this.idleDebounceTimer = null;
            }
            if (this.maxWaitTimer) {
                clearTimeout(this.maxWaitTimer);
                this.maxWaitTimer = null;
            }
            return this.backupNow({ immediate: true, keepalive: true, reason: 'flush_lifecycle' });
        }

        /**
         * Serializes backups across browser tabs. Uses the Web Locks API when
         * available so two tabs can never interleave pushes; falls back to an
         * in-tab mutex otherwise.
         * Resolves true if fn ran, false if skipped because another tab holds the lock.
         */
        runExclusive(fn) {
            if (navigator.locks && typeof navigator.locks.request === 'function') {
                return navigator.locks.request('zoho_backup_lock', { ifAvailable: true }, lock => {
                    if (!lock) {
                        console.log('[BackupEngine] Another tab is backing up. Skipping this cycle.');
                        return Promise.resolve(false);
                    }
                    return fn().then(() => true);
                }).then(val => val !== false);
            }
            return fn().then(() => true);
        }

        /**
         * Cloud Backup Routine (Push Queue -> Atlas -> Update Local Backup Status)
         * Runs 100% non-blocking without overwriting active editors or local database.
         */
        async backupNow(options = {}) {
            if (this.isSyncing) return;
            if (!navigator.onLine) {
                this.setStatus('OFFLINE');
                return;
            }

            this.isSyncing = true;
            this.setStatus('SYNCING');

            try {
                const didRun = await this.runExclusive(async () => {
                    // Step 1: Push all pending local modifications to MongoDB Atlas
                    await this.pushPendingChanges(options);

                    this.lastSyncTime = new Date();
                    if (this.db) {
                        await this.db.setSetting('lastAtlasSyncTime', this.lastSyncTime.toISOString());
                    }
                    await this.updateUnsyncedCount();

                    if (this.unsyncedCount === 0) {
                        this.firstPendingChangeTime = null;
                        if (this.maxWaitTimer) {
                            clearTimeout(this.maxWaitTimer);
                            this.maxWaitTimer = null;
                        }
                        if (this.lockRetryTimer) {
                            clearTimeout(this.lockRetryTimer);
                            this.lockRetryTimer = null;
                        }
                    }

                    this.setStatus('SYNCED');
                });

                if (didRun === false) {
                    // Another tab owns the backup cycle right now; our changes
                    // remain queued locally. Check count and schedule retry.
                    await this.updateUnsyncedCount();
                    if (this.status === 'SYNCING') this.setStatus(this.unsyncedCount > 0 ? 'PENDING' : 'SYNCED');
                    if (this.unsyncedCount > 0) {
                        this.scheduleLockRetry();
                    }
                }
            } catch (err) {
                console.warn('[BackupEngine] Cloud backup note:', err.message || err);
                if (!navigator.onLine) {
                    this.setStatus('OFFLINE');
                } else if (err.message && err.message.includes('Authentication')) {
                    this.setStatus('AUTH_REQUIRED');
                } else {
                    this.setStatus('PENDING');
                }
            } finally {
                this.isSyncing = false;
                this.broadcastStatus();
            }
        }

        scheduleLockRetry() {
            if (this.lockRetryTimer) clearTimeout(this.lockRetryTimer);
            this.lockRetryTimer = setTimeout(() => {
                this.lockRetryTimer = null;
                if (this.unsyncedCount > 0 && navigator.onLine && !this.isSyncing) {
                    console.log('[BackupEngine] Retrying backup after cross-tab lock release...');
                    this.backupNow({ reason: 'lock_contention_retry' });
                }
            }, 2500);
        }

        // Backwards compatibility alias
        async syncNow(options = {}) {
            return this.backupNow(options);
        }

        /**
         * Pushes items in syncQueue to MongoDB Atlas via POST /api/sync/push
         * Hardened pipeline:
         *  - Orphaned queue entries (note purged locally) become DELETE tombstones
         *    so purged notes can never resurrect from the cloud.
         *  - Server conflicts (anti-wipeout / stale device) are auto-adopted:
         *    the newer cloud copy is written into the local DB, healing any
         *    truncated or stale local state instead of diverging silently.
         */
        async pushPendingChanges(options = {}) {
            if (!this.db) return;
            const queue = await this.db.getSyncQueue();
            if (queue.length === 0) return;

            // Deduplicate items by entityId, keeping latest action and gathering all queueIds
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
                            action: item.action === 'DELETE' ? 'DELETE' : (item.action || 'UPDATE'),
                            note: localNote
                        });
                    } else if (item.action === 'CREATE') {
                        // Note was created then removed before ever syncing - safe to drop.
                        console.log('[BackupEngine] Dropping never-synced CREATE for', item.entityId);
                        for (const qId of entry.queueIds) await this.db.removeFromSyncQueue(qId);
                    } else {
                        // Note existed in queue but is gone locally: it was purged.
                        // Send a tombstone so the cloud copy is deleted too,
                        // otherwise restore-from-cloud resurrects dead notes.
                        console.log('[BackupEngine] Local note missing for queued change; sending DELETE tombstone for', item.entityId);
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
                body: JSON.stringify({ batch: pushBatch }),
                ...(options.keepalive ? { keepalive: true } : {})
            });

            if (response.status === 401 || response.status === 403) {
                this.setStatus('AUTH_REQUIRED');
                if (window.ZohoOfflineManager && typeof window.ZohoOfflineManager.showAuthExpiredNotice === 'function') {
                    window.ZohoOfflineManager.showAuthExpiredNotice();
                }
                throw new Error('Authentication expired. Your changes are safely saved locally. Please log in to backup to cloud.');
            }

            if (!response.ok) {
                throw new Error(`Backup push failed with HTTP ${response.status}`);
            }

            const result = await response.json();

            // Conflict self-healing: adopt the authoritative cloud copy locally
            // so a truncated/stale local note is repaired instead of fighting
            // the server on every future backup.
            let conflictCount = 0;
            if (result.conflicts && Array.isArray(result.conflicts)) {
                for (const conflict of result.conflicts) {
                    if (!conflict.serverNote || !conflict.serverNote.id) continue;
                    conflictCount++;
                    try {
                        await this.adoptServerNote(conflict.serverNote);
                    } catch (err) {
                        console.warn('[BackupEngine] Failed to adopt server note for conflict:', err);
                    }
                }
                if (conflictCount > 0 && window.ZohoOfflineManager && typeof window.ZohoOfflineManager.showToast === 'function') {
                    window.ZohoOfflineManager.showToast(`☁️ ${conflictCount} note(s) were restored from your newer cloud backup during sync.`, 'info');
                }
            }

            // Clear ONLY successfully processed queue items
            if (result.processedQueueIds && Array.isArray(result.processedQueueIds)) {
                for (const qId of result.processedQueueIds) {
                    await this.db.removeFromSyncQueue(qId);
                }
            }

            if (window.app && typeof window.app.refreshNotebookList === 'function' && conflictCount > 0) {
                window.app.refreshNotebookList(false);
            }
        }

        /** Writes an authoritative server-shaped note into the local DB without bumping versions. */
        async adoptServerNote(serverNote) {
            if (!this.db || !serverNote) return null;
            return this.db.putNote({
                id: serverNote.id,
                title: serverNote.title || 'Untitled Notebook',
                folder: serverNote.folder || 'root',
                isStarred: !!serverNote.isStarred,
                isTrashed: !!serverNote.isTrashed,
                trashedAt: serverNote.trashedAt || null,
                cells: serverNote.cells || [],
                tags: serverNote.tags || [],
                updatedAt: serverNote.updatedAt || Date.now(),
                owner: serverNote.owner,
                _version: serverNote._version || 1,
                _syncStatus: 'synced',
                _hasFullContent: true
            }, { isRemoteSync: true, hasFullContent: true });
        }

        /**
         * Explicit Cloud Restore: Downloads full notes from cloud backup.
         * Safe by design: NEVER overwrites an actively open note while user is typing.
         */
        async restoreFromCloud(options = {}) {
            if (!navigator.onLine) {
                throw new Error('Cannot restore from cloud while offline');
            }

            try {
                const response = await this.safeFetch('/api/sync/hydrate');
                if (response.status === 401 || response.status === 403) {
                    this.setStatus('AUTH_REQUIRED');
                    return { success: false, reason: 'auth_required' };
                }
                if (!response.ok) {
                    throw new Error(`Cloud restore request failed (${response.status})`);
                }

                const data = await response.json();
                const remoteNotes = data.notes;
                if (!Array.isArray(remoteNotes)) return { success: false, count: 0 };

                const activeNotebookId = window.app && window.app.notebook ? window.app.notebook.id : null;
                let restoredCount = 0;

                for (const remote of remoteNotes) {
                    const local = this.db ? await this.db.getNote(remote.id) : null;
                    const isActiveInUI = (activeNotebookId && activeNotebookId === remote.id);

                    // Never clobber local work that has not been backed up yet
                    // and is newer than (or equal to) the cloud copy.
                    const localPendingNewer = local &&
                        local._syncStatus === 'pending' &&
                        (local.updatedAt || 0) >= (remote.updatedAt || 0);

                    // Insert if note doesn't exist locally, or if explicit overwrite was requested (and not active note)
                    if (!local || (options.forceOverwrite && !isActiveInUI && !localPendingNewer)) {
                        if (this.db) {
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
                            restoredCount++;
                        }
                    }
                }

                // Update sidebar list in notebook UI if available
                if (window.app && typeof window.app.refreshNotebookList === 'function') {
                    window.app.refreshNotebookList(false);
                }

                this.lastSyncTime = new Date();
                if (this.db) {
                    await this.db.setSetting('lastAtlasSyncTime', this.lastSyncTime.toISOString());
                }
                await this.updateUnsyncedCount();

                return { success: true, count: restoredCount, total: remoteNotes.length };
            } catch (err) {
                console.error('[BackupEngine] Cloud restore warning:', err);
                throw err;
            }
        }

        // Backwards compatibility alias for manifest / initial hydration
        async syncManifest() {
            // In the backup model, manifest check does not overwrite local notes
            const localNotes = this.db ? await this.db.getAllNotes() : [];
            if (!localNotes || localNotes.length === 0) {
                return this.restoreFromCloud({ isInitial: true });
            }
            return { success: true, count: localNotes.length };
        }

        // Backwards compatibility alias
        async hydrateAllNotes() {
            return this.restoreFromCloud({ isInitial: false });
        }

        /**
         * Pull single note content on-demand (Fallback for individual un-cached shared notes)
         */
        async pullNote(noteId) {
            if (this.db) {
                const local = await this.db.getNote(noteId);
                if (local && local._hasFullContent && local.cells && local.cells.length > 0) {
                    return local;
                }
            }

            try {
                const res = await this.safeFetch('/api/sync/pull', {
                    method: 'POST',
                    body: JSON.stringify({ noteIds: [noteId] })
                });

                if (!res.ok) throw new Error('Failed to pull note content');
                const data = await res.json();
                const remoteNote = (data.notes && data.notes[0]) || data[0];

                // Guard: never overwrite unsaved local edits with an older cloud copy
                const local = this.db ? await this.db.getNote(noteId) : null;
                const localPendingNewer = local &&
                    local._syncStatus === 'pending' &&
                    (local.updatedAt || 0) >= (new Date(remoteNote.updatedAt).getTime() || 0);

                if (remoteNote && this.db && !localPendingNewer) {
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
                console.warn('[BackupEngine] Pull failed, serving local cached version if available', err);
            }

            return this.db ? await this.db.getNote(noteId) : null;
        }
    }

    // Export singleton with both new name and legacy alias
    const instance = new ZohoBackupEngine();
    window.ZohoBackupEngine = instance;
    window.ZohoSyncEngine = instance;
})(window);
