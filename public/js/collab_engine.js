/**
 * Zoho Notes - Real-Time Collaboration Engine (Multi-User Live Coding)
 * 
 * Manages:
 * 1. Presence & Live Active User Counters per note (/collab_notes/{noteId}/presence)
 * 2. Monaco Remote Cursors & Selection Highlights
 * 3. Non-conflicting Operational Delta Edits (executeEdits)
 * 4. Dynamic Cell Structure (Add/Delete/Reorder sync)
 * 5. Distributed Local Execution State & Terminal Streaming
 */

(function () {
    const COLLAB_COLORS = [
        '#6d5dfc', // Zoho Purple
        '#00d2ff', // Neon Cyan
        '#30ff6a', // Electric Green
        '#ff9f43', // Warm Amber
        '#ff5252', // Coral Red
        '#e056fd', // Orchid
        '#f368e0', // Pink
        '#feca57'  // Sun Yellow
    ];

    class CollabEngine {
        constructor() {
            this.db = null;
            this.noteId = null;
            this.noteRef = null;
            this.presenceRef = null;
            this.myPresenceRef = null;
            this.isConnected = false;

            // Local user profile
            this.currentUser = {
                id: 'anon_' + Math.random().toString(36).substring(2, 8),
                username: 'Anonymous',
                color: COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)]
            };

            // Callbacks
            this.onPresenceChanged = null; // (usersList, count) => {}
            this.onRemoteEdit = null;     // (cellId, changes, senderId) => {}
            this.onRemoteCursor = null;   // (peerUser) => {}
            this.onRemoteCellAdded = null; // (cell) => {}
            this.onRemoteCellDeleted = null; // (cellId) => {}
            this.onRemoteExecution = null; // (cellId, execData) => {}
            this.onRemoteLogChunk = null; // (cellId, chunk) => {}

            this.cursorDebounce = null;
            this.suppressLocalEdits = false;
        }

        /**
         * Initialize Firebase Realtime Database
         */
        async init() {
            if (this.db) return this.db;

            if (!window.firebase) {
                console.warn('[CollabEngine] Firebase SDK not available yet.');
                return null;
            }

            let config = window.FIREBASE_CONFIG;
            if (!config || !config.apiKey) {
                try {
                    const res = await fetch('/api/firebase-config');
                    if (res.ok) config = await res.json();
                } catch (e) { }
            }

            if (!config || !config.apiKey || !config.databaseURL) {
                console.error('[CollabEngine] Firebase configuration missing.');
                return null;
            }

            try {
                const appName = 'zoho-collab-app';
                let app = firebase.apps && firebase.apps.find(a => a.name === appName);
                if (!app) {
                    app = firebase.initializeApp(config, appName);
                }
                this.db = firebase.database(app);
                return this.db;
            } catch (err) {
                console.error('[CollabEngine] Firebase init error:', err);
                return null;
            }
        }

        /**
         * Connect to a specific notebook session
         */
        async connectToNote(noteId, user = null) {
            if (!noteId) return;

            // If already connected to this note, nothing to do
            if (this.isConnected && this.noteId === noteId) return;

            // Disconnect old note if switching
            if (this.isConnected) {
                await this.disconnect();
            }

            await this.init();
            if (!this.db) return;

            this.noteId = noteId;

            // Setup local user identity
            if (user && user.id) {
                this.currentUser.id = String(user.id);
                this.currentUser.username = user.username || 'User';
                // Deterministic color from user ID
                let hash = 0;
                for (let i = 0; i < this.currentUser.id.length; i++) {
                    hash = this.currentUser.id.charCodeAt(i) + ((hash << 5) - hash);
                }
                this.currentUser.color = COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
            }

            this.noteRef = this.db.ref(`collab_notes/${this.noteId}`);
            this.presenceRef = this.noteRef.child('presence');
            this.myPresenceRef = this.presenceRef.child(this.currentUser.id);

            // Register my presence
            const initialPresence = {
                id: this.currentUser.id,
                username: this.currentUser.username,
                color: this.currentUser.color,
                activeCellId: null,
                cursor: null,
                selection: null,
                joinedAt: firebase.database.ServerValue.TIMESTAMP,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            };

            await this.myPresenceRef.set(initialPresence);

            // Automatically remove presence on disconnect
            this.myPresenceRef.onDisconnect().remove();

            // 1. Listen for Presence changes (Active Users Counter & Avatars)
            this.presenceRef.on('value', (snapshot) => {
                const presenceData = snapshot.val() || {};
                const users = Object.values(presenceData);
                const count = users.length;

                if (typeof this.onPresenceChanged === 'function') {
                    this.onPresenceChanged(users, count);
                }

                // Also notify cursor updates for all remote peers
                users.forEach(user => {
                    if (user.id !== this.currentUser.id && typeof this.onRemoteCursor === 'function') {
                        this.onRemoteCursor(user);
                    }
                });
            });

            // 2. Listen for remote cell operational edits
            const editsRef = this.noteRef.child('edits');
            editsRef.limitToLast(20).on('child_added', (snapshot) => {
                const edit = snapshot.val();
                if (!edit || edit.senderId === this.currentUser.id) return;

                if (typeof this.onRemoteEdit === 'function') {
                    this.onRemoteEdit(edit.cellId, edit.changes, edit.senderId);
                }
            });

            // 3. Listen for dynamically added cells
            const structureRef = this.noteRef.child('structure_events');
            structureRef.limitToLast(10).on('child_added', (snapshot) => {
                const event = snapshot.val();
                if (!event || event.senderId === this.currentUser.id) return;

                if (event.action === 'add' && typeof this.onRemoteCellAdded === 'function') {
                    this.onRemoteCellAdded(event.cell);
                } else if (event.action === 'delete' && typeof this.onRemoteCellDeleted === 'function') {
                    this.onRemoteCellDeleted(event.cellId);
                }
            });

            // 4. Listen for execution events
            const execRef = this.noteRef.child('executions');
            execRef.on('child_changed', (snapshot) => {
                const execData = snapshot.val();
                const cellId = snapshot.key;
                if (!execData || execData.runnerId === this.currentUser.id) return;

                if (typeof this.onRemoteExecution === 'function') {
                    this.onRemoteExecution(cellId, execData);
                }
            });
            execRef.on('child_added', (snapshot) => {
                const execData = snapshot.val();
                const cellId = snapshot.key;
                if (!execData || execData.runnerId === this.currentUser.id) return;

                if (typeof this.onRemoteExecution === 'function') {
                    this.onRemoteExecution(cellId, execData);
                }
            });

            // 5. Listen for streaming terminal logs
            const streamRef = this.noteRef.child('log_streams');
            streamRef.limitToLast(50).on('child_added', (snapshot) => {
                const log = snapshot.val();
                if (!log || log.senderId === this.currentUser.id) return;

                if (typeof this.onRemoteLogChunk === 'function') {
                    this.onRemoteLogChunk(log.cellId, log.text);
                }
            });

            this.isConnected = true;
            console.log(`[CollabEngine] Connected to note ${this.noteId} as ${this.currentUser.username}`);
        }

        /**
         * Disconnect from current notebook session
         */
        async disconnect() {
            if (!this.isConnected) return;

            try {
                if (this.myPresenceRef) {
                    await this.myPresenceRef.remove();
                }
                if (this.presenceRef) this.presenceRef.off();
                if (this.noteRef) {
                    this.noteRef.child('edits').off();
                    this.noteRef.child('structure_events').off();
                    this.noteRef.child('executions').off();
                    this.noteRef.child('log_streams').off();
                }
            } catch (e) {
                console.warn('[CollabEngine] Disconnect cleanup warning:', e);
            } finally {
                this.isConnected = false;
                this.noteId = null;
                this.noteRef = null;
                this.presenceRef = null;
                this.myPresenceRef = null;
            }
        }

        /**
         * Broadcast cursor and selection position
         */
        broadcastCursor(cellId, position, selection = null) {
            if (!this.isConnected || !this.myPresenceRef) return;

            if (this.cursorDebounce) clearTimeout(this.cursorDebounce);
            this.cursorDebounce = setTimeout(() => {
                try {
                    this.myPresenceRef.update({
                        activeCellId: cellId,
                        cursor: position ? { lineNumber: position.lineNumber, column: position.column } : null,
                        selection: selection ? {
                            startLineNumber: selection.startLineNumber,
                            startColumn: selection.startColumn,
                            endLineNumber: selection.endLineNumber,
                            endColumn: selection.endColumn
                        } : null,
                        lastSeen: firebase.database.ServerValue.TIMESTAMP
                    });
                } catch (e) { }
            }, 35);
        }

        /**
         * Broadcast Monaco operational delta edit
         */
        broadcastEdit(cellId, changes) {
            if (!this.isConnected || !this.noteRef || this.suppressLocalEdits || !changes || !changes.length) return;

            try {
                // Serialize changes
                const serialized = changes.map(c => ({
                    range: {
                        startLineNumber: c.range.startLineNumber,
                        startColumn: c.range.startColumn,
                        endLineNumber: c.range.endLineNumber,
                        endColumn: c.range.endColumn
                    },
                    rangeLength: c.rangeLength,
                    rangeOffset: c.rangeOffset,
                    text: c.text
                }));

                this.noteRef.child('edits').push({
                    cellId,
                    changes: serialized,
                    senderId: this.currentUser.id,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            } catch (e) {
                console.warn('[CollabEngine] Error broadcasting edit:', e);
            }
        }

        /**
         * Broadcast dynamic cell creation
         */
        broadcastCellAdded(cell) {
            if (!this.isConnected || !this.noteRef || !cell) return;
            try {
                this.noteRef.child('structure_events').push({
                    action: 'add',
                    cell: {
                        id: cell.id,
                        type: cell.type || 'code',
                        lang: cell.lang || 'javascript',
                        title: cell.title || '',
                        content: cell.content || '',
                        output: null
                    },
                    senderId: this.currentUser.id,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            } catch (e) { }
        }

        /**
         * Broadcast cell deletion
         */
        broadcastCellDeleted(cellId) {
            if (!this.isConnected || !this.noteRef || !cellId) return;
            try {
                this.noteRef.child('structure_events').push({
                    action: 'delete',
                    cellId,
                    senderId: this.currentUser.id,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            } catch (e) { }
        }

        /**
         * Broadcast start of local execution
         */
        broadcastExecutionStart(cellId) {
            if (!this.isConnected || !this.noteRef || !cellId) return;
            try {
                // Clear old logs first
                this.noteRef.child(`log_streams`).remove();

                this.noteRef.child(`executions/${cellId}`).set({
                    status: 'running',
                    runnerId: this.currentUser.id,
                    runnerName: this.currentUser.username,
                    startedAt: firebase.database.ServerValue.TIMESTAMP
                });
            } catch (e) { }
        }

        /**
         * Stream a chunk of stdout/stderr from local execution
         */
        broadcastLogChunk(cellId, text) {
            if (!this.isConnected || !this.noteRef || !cellId || !text) return;
            try {
                this.noteRef.child('log_streams').push({
                    cellId,
                    text,
                    senderId: this.currentUser.id,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            } catch (e) { }
        }

        /**
         * Broadcast execution completion
         */
        broadcastExecutionComplete(cellId, output, success = true) {
            if (!this.isConnected || !this.noteRef || !cellId) return;
            try {
                this.noteRef.child(`executions/${cellId}`).set({
                    status: success ? 'completed' : 'error',
                    runnerId: this.currentUser.id,
                    runnerName: this.currentUser.username,
                    output: output || null,
                    completedAt: firebase.database.ServerValue.TIMESTAMP
                });
            } catch (e) { }
        }
    }

    // Expose global instance
    window.ZohoCollabEngine = new CollabEngine();
})();
