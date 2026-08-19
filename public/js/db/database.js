/**
 * Zoho Notes Pro - Local-First Reactive Database Layer
 * Powered by Dexie / IndexedDB with RxDB-compatible Reactive Observables
 * 
 * Features:
 * - Atomic ACID transactions preventing corruption on sudden laptop shutdown/crash
 * - Reactive change subscriptions (.$.subscribe) for future Yjs/Hocuspocus live collaboration
 * - Version history snapshotting for undo/recovery across sessions
 * - Storage quota monitoring & telemetry
 */

(function (window) {
    'use strict';

    class ReactiveSubject {
        constructor() {
            this.observers = new Set();
        }

        subscribe(callback) {
            if (typeof callback !== 'function') return () => { };
            this.observers.add(callback);
            return {
                unsubscribe: () => {
                    this.observers.delete(callback);
                }
            };
        }

        next(value) {
            for (const observer of this.observers) {
                try {
                    observer(value);
                } catch (err) {
                    console.error('[RxDB Reactive Error]', err);
                }
            }
        }
    }

    class ZohoLocalDatabase {
        constructor() {
            this.dbName = 'ZohoNotesPro_LocalDB';
            this.version = 1;
            this.db = null;
            this.isReady = false;
            this.readyPromise = null;

            // Reactive change channels
            this.channels = {
                notes: new ReactiveSubject(),
                trash: new ReactiveSubject(),
                syncQueue: new ReactiveSubject(),
                settings: new ReactiveSubject()
            };

            this.init();
        }

        init() {
            if (this.readyPromise) return this.readyPromise;

            this.readyPromise = new Promise((resolve, reject) => {
                try {
                    if (window.Dexie) {
                        this.initDexie(resolve, reject);
                    } else {
                        // Fallback to Native IndexedDB if Dexie is not yet loaded
                        this.initNativeIndexedDB(resolve, reject);
                    }
                } catch (err) {
                    console.error('[ZohoLocalDB] Initialization failed, falling back to Native IndexedDB', err);
                    this.initNativeIndexedDB(resolve, reject);
                }
            });

            return this.readyPromise;
        }

        initDexie(resolve, reject) {
            try {
                const db = new window.Dexie(this.dbName);
                db.version(1).stores({
                    notes: 'id, title, folder, isStarred, isTrashed, owner, updatedAt, trashedAt, _version, _syncStatus, _hasFullContent',
                    trashedCells: 'id, noteId, cellType, language, trashedAt, owner',
                    settings: 'key, updatedAt',
                    syncQueue: '++autoId, id, action, entityType, entityId, timestamp, retryCount',
                    conflictHistory: 'id, noteId, timestamp, resolutionType',
                    noteVersions: 'id, noteId, version, timestamp, source'
                });

                db.open().then(() => {
                    this.db = db;
                    this.isDexie = true;
                    this.isReady = true;
                    console.log('[ZohoLocalDB] Dexie/IndexedDB initialized successfully');
                    resolve(this);
                }).catch(err => {
                    console.warn('[ZohoLocalDB] Dexie open failed, falling back to native IndexedDB', err);
                    this.initNativeIndexedDB(resolve, reject);
                });
            } catch (err) {
                this.initNativeIndexedDB(resolve, reject);
            }
        }

        initNativeIndexedDB(resolve, reject) {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('notes')) {
                    const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
                    notesStore.createIndex('folder', 'folder', { unique: false });
                    notesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    notesStore.createIndex('isTrashed', 'isTrashed', { unique: false });
                    notesStore.createIndex('isStarred', 'isStarred', { unique: false });
                    notesStore.createIndex('owner', 'owner', { unique: false });
                    notesStore.createIndex('_syncStatus', '_syncStatus', { unique: false });
                }

                if (!db.objectStoreNames.contains('trashedCells')) {
                    const trashStore = db.createObjectStore('trashedCells', { keyPath: 'id' });
                    trashStore.createIndex('noteId', 'noteId', { unique: false });
                    trashStore.createIndex('trashedAt', 'trashedAt', { unique: false });
                }

                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                if (!db.objectStoreNames.contains('syncQueue')) {
                    const queueStore = db.createObjectStore('syncQueue', { keyPath: 'autoId', autoIncrement: true });
                    queueStore.createIndex('timestamp', 'timestamp', { unique: false });
                    queueStore.createIndex('entityId', 'entityId', { unique: false });
                }

                if (!db.objectStoreNames.contains('conflictHistory')) {
                    const confStore = db.createObjectStore('conflictHistory', { keyPath: 'id' });
                    confStore.createIndex('noteId', 'noteId', { unique: false });
                }

                if (!db.objectStoreNames.contains('noteVersions')) {
                    const verStore = db.createObjectStore('noteVersions', { keyPath: 'id' });
                    verStore.createIndex('noteId', 'noteId', { unique: false });
                    verStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isDexie = false;
                this.isReady = true;
                console.log('[ZohoLocalDB] Native IndexedDB initialized successfully');
                resolve(this);
            };

            request.onerror = (event) => {
                console.error('[ZohoLocalDB] IndexedDB failed to open', event.target.error);
                reject(event.target.error);
            };
        }

        // --- Reactive Observables (RxDB API Style) ---
        get notes$() {
            return this.channels.notes;
        }

        get trash$() {
            return this.channels.trash;
        }

        get syncQueue$() {
            return this.channels.syncQueue;
        }

        get settings$() {
            return this.channels.settings;
        }

        // --- Note Operations ---

        /**
         * Save or update a note atomically in local IndexedDB.
         * Creates a version history snapshot and notifies reactive listeners.
         */
        async putNote(noteData, options = {}) {
            await this.init();
            if (!noteData || !noteData.id) throw new Error('Note ID is required');

            const now = Date.now();
            const noteRecord = {
                id: noteData.id,
                title: noteData.title || 'Untitled Notebook',
                folder: noteData.folder || 'root',
                isStarred: !!noteData.isStarred,
                isTrashed: !!noteData.isTrashed,
                trashedAt: noteData.trashedAt || null,
                cells: Array.isArray(noteData.cells) ? noteData.cells : [],
                tags: Array.isArray(noteData.tags) ? noteData.tags : [],
                owner: noteData.owner || 'current_user',
                updatedAt: noteData.updatedAt ? new Date(noteData.updatedAt).getTime() : now,
                _version: (noteData._version || 0) + (options.isRemoteSync ? 0 : 1),
                _syncStatus: options.isRemoteSync ? 'synced' : (options.syncStatus || 'pending'),
                _hasFullContent: options.hasFullContent !== undefined ? options.hasFullContent : true
            };

            if (this.isDexie) {
                await this.db.transaction('rw', [this.db.notes, this.db.noteVersions], async () => {
                    await this.db.notes.put(noteRecord);

                    // Create version history snapshot if this is a user edit
                    if (!options.isRemoteSync && noteRecord._hasFullContent && noteRecord.cells.length > 0) {
                        const versionId = `ver_${noteRecord.id}_${now}`;
                        await this.db.noteVersions.put({
                            id: versionId,
                            noteId: noteRecord.id,
                            version: noteRecord._version,
                            title: noteRecord.title,
                            cells: noteRecord.cells,
                            timestamp: now,
                            source: options.source || 'user-edit'
                        });

                        // Keep only last 10 versions per note locally to preserve storage
                        const allVersions = await this.db.noteVersions
                            .where('noteId')
                            .equals(noteRecord.id)
                            .sortBy('timestamp');

                        if (allVersions.length > 10) {
                            const toDelete = allVersions.slice(0, allVersions.length - 10);
                            await Promise.all(toDelete.map(v => this.db.noteVersions.delete(v.id)));
                        }
                    }
                });
            } else {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['notes', 'noteVersions'], 'readwrite');
                    const store = tx.objectStore('notes');
                    store.put(noteRecord);

                    // Also save snapshot in native IndexedDB
                    if (noteRecord.content || (noteRecord.cells && noteRecord.cells.length > 0)) {
                        const vStore = tx.objectStore('noteVersions');
                        vStore.put({
                            id: `v_${noteRecord.id}_${Date.now()}`,
                            noteId: noteRecord.id,
                            timestamp: Date.now(),
                            title: noteRecord.title,
                            cells: noteRecord.cells || [],
                            content: noteRecord.content || ''
                        });
                    }

                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            }

            // Emit reactive change notification
            this.channels.notes.next({
                action: options.isNew ? 'CREATE' : 'UPDATE',
                note: noteRecord,
                isRemoteSync: !!options.isRemoteSync
            });

            return noteRecord;
        }

        /**
         * Get a single note by ID from local database.
         */
        async getNote(id) {
            await this.init();
            if (!id) return null;

            if (this.isDexie) {
                return await this.db.notes.get(id);
            } else {
                return await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['notes'], 'readonly');
                    const store = tx.objectStore('notes');
                    const req = store.get(id);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => reject(req.error);
                });
            }
        }

        /**
         * Get list of all non-trashed notes (for sidebar and search).
         */
        async getAllNotes(options = {}) {
            await this.init();

            if (this.isDexie) {
                let collection = this.db.notes.filter(n => !n.isTrashed);
                if (options.folder && options.folder !== 'all') {
                    collection = collection.filter(n => n.folder === options.folder);
                }
                const notes = await collection.toArray();
                notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                return notes;
            } else {
                return await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['notes'], 'readonly');
                    const store = tx.objectStore('notes');
                    const req = store.getAll();
                    req.onsuccess = () => {
                        let notes = (req.result || []).filter(n => !n.isTrashed);
                        if (options.folder && options.folder !== 'all') {
                            notes = notes.filter(n => n.folder === options.folder);
                        }
                        notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                        resolve(notes);
                    };
                    req.onerror = () => reject(req.error);
                });
            }
        }

        /**
         * Get all starred notes / cells.
         */
        async getStarredNotes() {
            await this.init();
            const notes = await this.getAllNotes();
            const starred = [];

            for (const nb of notes) {
                if (nb.isStarred) {
                    starred.push(nb);
                } else if (Array.isArray(nb.cells)) {
                    const starredCells = nb.cells.filter(c => c.isStarred);
                    if (starredCells.length > 0) {
                        starred.push({
                            ...nb,
                            cells: starredCells
                        });
                    }
                }
            }
            return starred;
        }

        /**
         * Soft delete a note (move to trash).
         */
        async trashNote(id) {
            await this.init();
            const note = await this.getNote(id);
            if (!note) return false;

            note.isTrashed = true;
            note.trashedAt = Date.now();
            note.updatedAt = Date.now();
            note._syncStatus = 'pending';

            await this.putNote(note, { source: 'trash' });
            this.channels.trash.next({ action: 'TRASH_NOTE', noteId: id });
            return true;
        }

        /**
         * Restore a note from trash.
         */
        async restoreNote(id) {
            await this.init();
            const note = await this.getNote(id);
            if (!note) return false;

            note.isTrashed = false;
            note.trashedAt = null;
            note.updatedAt = Date.now();
            note._syncStatus = 'pending';

            await this.putNote(note, { source: 'restore' });
            this.channels.trash.next({ action: 'RESTORE_NOTE', noteId: id });
            return true;
        }

        /**
         * Permanently delete a note from local DB.
         */
        async permanentlyDeleteNote(id) {
            await this.init();
            if (this.isDexie) {
                await this.db.transaction('rw', [this.db.notes, this.db.noteVersions], async () => {
                    await this.db.notes.delete(id);
                    await this.db.noteVersions.where('noteId').equals(id).delete();
                });
            } else {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['notes'], 'readwrite');
                    const store = tx.objectStore('notes');
                    const req = store.delete(id);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }

            this.channels.notes.next({ action: 'DELETE', noteId: id });
            return true;
        }

        /**
         * Get all trashed notes and cells.
         */
        async getTrash() {
            await this.init();
            if (this.isDexie) {
                const notebooks = await this.db.notes.filter(n => !!n.isTrashed).toArray();
                const cells = await this.db.trashedCells.toArray();
                notebooks.sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
                cells.sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
                return { notebooks, cells };
            } else {
                return await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['notes', 'trashedCells'], 'readonly');
                    const notesStore = tx.objectStore('notes');
                    const cellsStore = tx.objectStore('trashedCells');

                    const notesReq = notesStore.getAll();
                    notesReq.onsuccess = () => {
                        const notebooks = (notesReq.result || []).filter(n => !!n.isTrashed);
                        const cellsReq = cellsStore.getAll();
                        cellsReq.onsuccess = () => {
                            resolve({
                                notebooks,
                                cells: cellsReq.result || []
                            });
                        };
                    };
                    notesReq.onerror = () => reject(notesReq.error);
                });
            }
        }

        // --- Trashed Cell Operations ---

        async addTrashedCell(cellData) {
            await this.init();
            const record = {
                id: cellData.id || `trash_cell_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                noteId: cellData.noteId,
                cellType: cellData.cellType || cellData.type || 'code',
                content: cellData.content || '',
                language: cellData.language || cellData.lang || 'javascript',
                trashedAt: Date.now(),
                owner: cellData.owner || 'current_user'
            };

            if (this.isDexie) {
                await this.db.trashedCells.put(record);
            } else {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['trashedCells'], 'readwrite');
                    const req = tx.objectStore('trashedCells').put(record);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }

            this.channels.trash.next({ action: 'ADD_CELL', cell: record });
            return record;
        }

        async deleteTrashedCell(id) {
            await this.init();
            if (this.isDexie) {
                await this.db.trashedCells.delete(id);
            } else {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['trashedCells'], 'readwrite');
                    const req = tx.objectStore('trashedCells').delete(id);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }
            this.channels.trash.next({ action: 'DELETE_CELL', cellId: id });
            return true;
        }

        async clearAllTrash() {
            await this.init();
            if (this.isDexie) {
                await this.db.transaction('rw', [this.db.notes, this.db.trashedCells], async () => {
                    const trashedNotes = await this.db.notes.filter(n => !!n.isTrashed).toArray();
                    for (const n of trashedNotes) {
                        await this.db.notes.delete(n.id);
                    }
                    await this.db.trashedCells.clear();
                });
            } else {
                const trash = await this.getTrash();
                for (const n of trash.notebooks) {
                    await this.permanentlyDeleteNote(n.id);
                }
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['trashedCells'], 'readwrite');
                    const req = tx.objectStore('trashedCells').clear();
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }
            this.channels.trash.next({ action: 'CLEAR_ALL' });
            return true;
        }

        // --- Sync Queue Operations ---

        async addToSyncQueue(item) {
            await this.init();

            if (this.isDexie) {
                // Deduplicate: If an item for this entity already exists in queue, update it in place!
                const existing = await this.db.syncQueue
                    .where('entityId').equals(item.entityId)
                    .and(q => q.entityType === (item.entityType || 'note'))
                    .first();

                if (existing) {
                    existing.action = item.action;
                    existing.payload = item.payload || null;
                    existing.timestamp = Date.now();
                    await this.db.syncQueue.put(existing);
                    this.channels.syncQueue.next({ action: 'ENQUEUE', item: existing });
                    return existing;
                }
            }

            const record = {
                id: item.id || `sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                action: item.action, // 'CREATE' | 'UPDATE' | 'DELETE' | 'TRASH'
                entityType: item.entityType || 'note',
                entityId: item.entityId,
                payload: item.payload || null,
                timestamp: Date.now(),
                retryCount: 0
            };

            if (this.isDexie) {
                await this.db.syncQueue.put(record);
            } else {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['syncQueue'], 'readwrite');
                    const req = tx.objectStore('syncQueue').put(record);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }

            this.channels.syncQueue.next({ action: 'ENQUEUE', item: record });
            return record;
        }

        async getSyncQueue() {
            await this.init();
            if (this.isDexie) {
                return await this.db.syncQueue.toArray();
            } else {
                return await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['syncQueue'], 'readonly');
                    const req = tx.objectStore('syncQueue').getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
            }
        }

        async removeFromSyncQueue(autoIdOrId) {
            await this.init();
            if (this.isDexie) {
                await this.db.syncQueue.delete(autoIdOrId);
            } else {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['syncQueue'], 'readwrite');
                    const req = tx.objectStore('syncQueue').delete(autoIdOrId);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }
            this.channels.syncQueue.next({ action: 'DEQUEUE', id: autoIdOrId });
        }

        async clearSyncQueue() {
            await this.init();
            if (this.isDexie) {
                await this.db.syncQueue.clear();
            } else {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['syncQueue'], 'readwrite');
                    const req = tx.objectStore('syncQueue').clear();
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }
            this.channels.syncQueue.next({ action: 'CLEAR' });
        }

        // --- Settings & Metadata ---

        async getSetting(key, defaultValue = null) {
            await this.init();
            if (this.isDexie) {
                const row = await this.db.settings.get(key);
                return row ? row.value : defaultValue;
            } else {
                return await new Promise((resolve) => {
                    const tx = this.db.transaction(['settings'], 'readonly');
                    const req = tx.objectStore('settings').get(key);
                    req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
                    req.onerror = () => resolve(defaultValue);
                });
            }
        }

        async setSetting(key, value) {
            await this.init();
            const record = { key, value, updatedAt: Date.now() };
            if (this.isDexie) {
                await this.db.settings.put(record);
            } else {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(['settings'], 'readwrite');
                    const req = tx.objectStore('settings').put(record);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }
            this.channels.settings.next({ key, value });
            return value;
        }

        // --- Storage Quota Inspection ---

        async getStorageEstimate() {
            if (navigator.storage && navigator.storage.estimate) {
                try {
                    const estimate = await navigator.storage.estimate();
                    const usedMB = (estimate.usage / (1024 * 1024)).toFixed(2);
                    const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(2);
                    const percent = ((estimate.usage / estimate.quota) * 100).toFixed(1);

                    return {
                        supported: true,
                        usedMB: parseFloat(usedMB),
                        quotaMB: parseFloat(quotaMB),
                        percentUsed: parseFloat(percent),
                        isNearFull: parseFloat(percent) > 85
                    };
                } catch (err) {
                    console.warn('[ZohoLocalDB] Storage estimate error', err);
                }
            }
            return { supported: false, usedMB: 0, quotaMB: 0, percentUsed: 0, isNearFull: false };
        }
    }

    // Export singleton
    window.ZohoLocalDB = new ZohoLocalDatabase();
})(window);
