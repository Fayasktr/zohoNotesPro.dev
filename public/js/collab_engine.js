/**
 * Zoho Notes - Real-Time Collaboration Engine (Multi-User Live Coding)
 * 
 * Powered by:
 * 1. Native High-Speed WebSocket Server (/ws/collab) for instant sub-millisecond local & LAN sync
 * 2. Firebase Realtime Database (/collab_notes/{noteId}) as optional cloud fallback
 * 
 * Manages:
 * - Peer-isolated Presence & Live Active User Counters per note session
 * - Monaco Remote Cursors & Selection Highlights
 * - Non-conflicting Operational Delta Edits (executeEdits)
 * - Dynamic Cell Structure (Add/Delete/Reorder sync)
 * - Distributed Local Execution State & Terminal Streaming
 * - Initial state synchronization upon guest connect
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
            this.ws = null;
            this.firebaseDb = null;
            this.noteId = null;
            this.noteRef = null;
            this.presenceRef = null;
            this.myPresenceRef = null;
            this.isConnected = false;
            this.wsConnected = false;

            this.isHost = false;
            this.hostOnline = false;
            this.hostInfo = null;

            // Unique Peer/Tab ID ensuring distinct presence and zero edit collision
            this.peerId = 'peer_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);

            // Local user identity
            this.currentUser = {
                id: 'anon_' + Math.random().toString(36).substring(2, 8),
                peerId: this.peerId,
                username: 'Anonymous',
                color: COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)]
            };

            // Callbacks
            this.onPresenceChanged = null; // (usersList, count) => {}
            this.onHostStatusChanged = null; // (isOnline, hostInfo) => {}
            this.onRemoteEdit = null;     // (cellId, changes, senderPeerId) => {}
            this.onRemoteCursor = null;   // (peerUser) => {}
            this.onRemoteCellAdded = null; // (cell) => {}
            this.onRemoteCellDeleted = null; // (cellId) => {}
            this.onRemoteCellTitle = null; // (cellId, title) => {}
            this.onRemoteNotebookTitle = null; // (title) => {}
            this.onRemoteCellLang = null; // (cellId, lang) => {}
            this.onRemoteCellStar = null; // (cellId, isStarred) => {}
            this.onRemoteCellReorder = null; // (cellIdsOrder) => {}
            this.onRemoteExecution = null; // (cellId, execData) => {}
            this.onRemoteLogChunk = null; // (cellId, chunk) => {}
            this.onRemoteInitSync = null; // (cachedCells) => {}

            this.cursorDebounce = null;
            this.suppressLocalEdits = false;
            this.pingTimer = null;
            this.reconnectTimer = null;
        }

        /**
         * Initialize Firebase Realtime Database (as cloud fallback)
         */
        async initFirebase() {
            if (this.firebaseDb) return this.firebaseDb;
            if (!window.firebase) return null;

            let config = window.FIREBASE_CONFIG;
            if (!config || !config.apiKey) {
                try {
                    const res = await fetch('/api/firebase-config');
                    if (res.ok) config = await res.json();
                } catch (_) { }
            }

            if (!config || !config.apiKey || !config.databaseURL) {
                return null;
            }

            try {
                const appName = 'zoho-collab-app';
                let app = firebase.apps && firebase.apps.find(a => a.name === appName);
                if (!app) {
                    app = firebase.initializeApp(config, appName);
                }
                this.firebaseDb = firebase.database(app);
                return this.firebaseDb;
            } catch (err) {
                console.warn('[CollabEngine] Firebase init skipped or failed:', err.message);
                return null;
            }
        }

        /**
         * Connect to native WebSocket collaboration server
         */
        connectWebSocket(noteId) {
            if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
                return;
            }

            try {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${window.location.host}/ws/collab`;
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    this.wsConnected = true;
                    this.isConnected = true;
                    console.log(`[CollabEngine] WebSocket connected for note ${noteId}`);

                    // Send Join payload
                    this.sendWsMessage({
                        type: 'join',
                        noteId: noteId,
                        peerId: this.peerId,
                        user: {
                            id: this.currentUser.id,
                            peerId: this.peerId,
                            username: this.currentUser.username,
                            color: this.currentUser.color,
                            isHost: this.isHost
                        }
                    });

                    // Heartbeat ping every 15 seconds
                    if (this.pingTimer) clearInterval(this.pingTimer);
                    this.pingTimer = setInterval(() => {
                        this.sendWsMessage({ type: 'ping' });
                    }, 15000);
                };

                this.ws.onmessage = (event) => {
                    let msg;
                    try {
                        msg = JSON.parse(event.data);
                    } catch (_) {
                        return;
                    }

                    switch (msg.type) {
                        case 'joined': {
                            if (msg.presence && typeof this.onPresenceChanged === 'function') {
                                this.onPresenceChanged(msg.presence.users || [], msg.presence.count || 1);
                            }
                            if (msg.presence && typeof this.onHostStatusChanged === 'function') {
                                this.hostOnline = Boolean(msg.presence.isHostOnline);
                                this.onHostStatusChanged(this.hostOnline, { isOnline: this.hostOnline });
                            }
                            if (Array.isArray(msg.cachedCells) && typeof this.onRemoteInitSync === 'function') {
                                this.onRemoteInitSync(msg.cachedCells, msg.cachedMetadata || null);
                            }
                            break;
                        }

                        case 'presence': {
                            const users = msg.users || [];
                            const count = msg.count || users.length;
                            const isHostOnline = Boolean(msg.isHostOnline || users.some(u => u.isHost === true));
                            this.hostOnline = isHostOnline;

                            if (typeof this.onPresenceChanged === 'function') {
                                this.onPresenceChanged(users, count);
                            }
                            if (typeof this.onHostStatusChanged === 'function') {
                                this.onHostStatusChanged(isHostOnline, { isOnline: isHostOnline });
                            }
                            break;
                        }

                        case 'session_deleted':
                        case 'session_ended': {
                            if (typeof this.onSessionEnded === 'function') {
                                this.onSessionEnded(msg);
                            }
                            break;
                        }

                        case 'edit': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (!this.isHost && !this.hostOnline) return;

                            if (typeof this.onRemoteEdit === 'function') {
                                this.onRemoteEdit(msg.cellId, msg.changes, msg.senderPeerId);
                            }
                            break;
                        }

                        case 'cell_title': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (!this.isHost && !this.hostOnline) return;

                            if (typeof this.onRemoteCellTitle === 'function') {
                                this.onRemoteCellTitle(msg.cellId, msg.title);
                            }
                            break;
                        }

                        case 'notebook_title': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (!this.isHost && !this.hostOnline) return;

                            if (typeof this.onRemoteNotebookTitle === 'function') {
                                this.onRemoteNotebookTitle(msg.title);
                            }
                            break;
                        }

                        case 'cell_lang': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (!this.isHost && !this.hostOnline) return;

                            if (typeof this.onRemoteCellLang === 'function') {
                                this.onRemoteCellLang(msg.cellId, msg.lang);
                            }
                            break;
                        }

                        case 'cell_star': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (!this.isHost && !this.hostOnline) return;

                            if (typeof this.onRemoteCellStar === 'function') {
                                this.onRemoteCellStar(msg.cellId, msg.isStarred);
                            }
                            break;
                        }

                        case 'cell_reorder': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (!this.isHost && !this.hostOnline) return;

                            if (typeof this.onRemoteCellReorder === 'function') {
                                this.onRemoteCellReorder(msg.cellIdsOrder);
                            }
                            break;
                        }

                        case 'cursor': {
                            if (msg.peerId === this.peerId) return;
                            if (typeof this.onRemoteCursor === 'function') {
                                this.onRemoteCursor({
                                    id: msg.peerId,
                                    peerId: msg.peerId,
                                    username: msg.user?.username || 'Collaborator',
                                    color: msg.user?.color || '#6d5dfc',
                                    activeCellId: msg.activeCellId,
                                    cursor: msg.cursor,
                                    selection: msg.selection
                                });
                            }
                            break;
                        }

                        case 'cell_add': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (!this.isHost && !this.hostOnline) return;

                            if (typeof this.onRemoteCellAdded === 'function') {
                                this.onRemoteCellAdded(msg.cell);
                            }
                            break;
                        }

                        case 'cell_delete': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (!this.isHost && !this.hostOnline) return;

                            if (typeof this.onRemoteCellDeleted === 'function') {
                                this.onRemoteCellDeleted(msg.cellId);
                            }
                            break;
                        }

                        case 'exec_start': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (typeof this.onRemoteExecution === 'function') {
                                this.onRemoteExecution(msg.cellId, {
                                    status: 'running',
                                    runnerId: msg.runnerId,
                                    runnerName: msg.runnerName
                                });
                            }
                            break;
                        }

                        case 'exec_log': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (typeof this.onRemoteLogChunk === 'function') {
                                this.onRemoteLogChunk(msg.cellId, msg.text);
                            }
                            break;
                        }

                        case 'exec_done': {
                            if (msg.senderPeerId === this.peerId) return;
                            if (typeof this.onRemoteExecution === 'function') {
                                this.onRemoteExecution(msg.cellId, {
                                    status: msg.success ? 'completed' : 'error',
                                    output: msg.output
                                });
                            }
                            break;
                        }
                    }
                };

                this.ws.onclose = () => {
                    this.wsConnected = false;
                    if (this.pingTimer) clearInterval(this.pingTimer);
                    // Reconnect if still attached to note
                    if (this.noteId === noteId) {
                        clearTimeout(this.reconnectTimer);
                        this.reconnectTimer = setTimeout(() => {
                            if (this.noteId === noteId) this.connectWebSocket(noteId);
                        }, 2000);
                    }
                };

                this.ws.onerror = () => {
                    this.wsConnected = false;
                };
            } catch (err) {
                console.warn('[CollabEngine] WebSocket connection failed:', err);
            }
        }

        sendWsMessage(payload) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify(payload));
                    return true;
                } catch (_) { }
            }
            return false;
        }

        /**
         * Connect to a live notebook session (Dual WebSocket + Firebase)
         */
        async connectToNote(noteId, user = null, isHost = false) {
            if (!noteId) return;

            // If already connected with same role, nothing to do
            if (this.isConnected && this.noteId === noteId && this.isHost === isHost) return;

            // Disconnect old note if switching
            if (this.isConnected) {
                await this.disconnect();
            }

            this.noteId = noteId;
            this.isHost = !!isHost;
            this.hostOnline = !!isHost; // Host tab knows host is online immediately

            // Setup local user identity with unique peer ID
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

            // 1. Establish native WebSocket connection (primary zero-latency channel)
            this.connectWebSocket(noteId);
            this.isConnected = true;

            // 2. Also initialize Firebase RTDB in background as secondary/cloud channel
            try {
                await this.initFirebase();
                if (this.firebaseDb) {
                    this.noteRef = this.firebaseDb.ref(`collab_notes/${this.noteId}`);
                    this.presenceRef = this.noteRef.child('presence');
                    this.myPresenceRef = this.presenceRef.child(this.peerId);

                    await this.myPresenceRef.set({
                        id: this.currentUser.id,
                        peerId: this.peerId,
                        username: this.currentUser.username,
                        color: this.currentUser.color,
                        isHost: this.isHost,
                        activeCellId: null,
                        cursor: null,
                        selection: null,
                        joinedAt: firebase.database.ServerValue.TIMESTAMP,
                        lastSeen: firebase.database.ServerValue.TIMESTAMP
                    });

                    this.myPresenceRef.onDisconnect().remove();

                    // Listen for Firebase presence
                    this.presenceRef.on('value', (snapshot) => {
                        const presenceData = snapshot.val() || {};
                        const users = Object.values(presenceData);
                        if (users.length > 0) {
                            const isHostOnline = users.some(u => u.isHost === true);
                            this.hostOnline = isHostOnline;
                            if (typeof this.onPresenceChanged === 'function') {
                                this.onPresenceChanged(users, users.length);
                            }
                            if (typeof this.onHostStatusChanged === 'function') {
                                this.onHostStatusChanged(isHostOnline, { isOnline: isHostOnline });
                            }
                        }
                    });
                }
            } catch (fbErr) {
                console.warn('[CollabEngine] Firebase fallback not active (using WebSocket):', fbErr.message);
            }

            console.log(`[CollabEngine] Active on note ${this.noteId} as ${this.currentUser.username} (Host: ${this.isHost}, Peer: ${this.peerId})`);
        }

        /**
         * Disconnect from current notebook session
         */
        async disconnect() {
            if (!this.isConnected) return;

            if (this.pingTimer) clearInterval(this.pingTimer);
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

            // Close WebSocket
            if (this.ws) {
                try {
                    this.ws.close();
                } catch (_) { }
                this.ws = null;
                this.wsConnected = false;
            }

            // Clean up Firebase
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
            } catch (_) { }

            this.isConnected = false;
            this.noteId = null;
            this.noteRef = null;
            this.presenceRef = null;
            this.myPresenceRef = null;
            this.isHost = false;
            this.hostOnline = false;
            this.hostInfo = null;
        }

        /**
         * Broadcast cursor and selection position
         */
        broadcastCursor(cellId, position, selection = null) {
            if (!this.isConnected) return;
            if (!this.isHost && !this.hostOnline) return;

            if (this.cursorDebounce) clearTimeout(this.cursorDebounce);
            this.cursorDebounce = setTimeout(() => {
                const pos = position ? { lineNumber: position.lineNumber, column: position.column } : null;
                const sel = selection ? {
                    startLineNumber: selection.startLineNumber,
                    startColumn: selection.startColumn,
                    endLineNumber: selection.endLineNumber,
                    endColumn: selection.endColumn
                } : null;

                // Send over WebSocket
                this.sendWsMessage({
                    type: 'cursor',
                    noteId: this.noteId,
                    peerId: this.peerId,
                    user: this.currentUser,
                    activeCellId: cellId,
                    cursor: pos,
                    selection: sel
                });

                // Update Firebase presence if connected
                if (this.myPresenceRef) {
                    try {
                        this.myPresenceRef.update({
                            activeCellId: cellId,
                            cursor: pos,
                            selection: sel,
                            lastSeen: firebase.database.ServerValue.TIMESTAMP
                        });
                    } catch (_) { }
                }
            }, 35);
        }

        /**
         * Broadcast Monaco operational delta edit
         */
        broadcastEdit(cellId, changes, fullContent = null) {
            if (!this.isConnected || this.suppressLocalEdits || !changes || !changes.length) return;
            if (!this.isHost && !this.hostOnline) return;

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

            // Send over WebSocket
            this.sendWsMessage({
                type: 'edit',
                noteId: this.noteId,
                cellId: cellId,
                changes: serialized,
                fullContent: fullContent,
                senderPeerId: this.peerId
            });

            // Mirror to Firebase if available
            if (this.noteRef) {
                try {
                    this.noteRef.child('edits').push({
                        cellId,
                        changes: serialized,
                        senderPeerId: this.peerId,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                } catch (_) { }
            }
        }

        /**
         * Broadcast dynamic cell creation
         */
        broadcastCellAdded(cell) {
            if (!this.isConnected || !cell) return;
            if (!this.isHost && !this.hostOnline) return;

            const cellPayload = {
                id: cell.id,
                type: cell.type || 'code',
                lang: cell.lang || 'javascript',
                title: cell.title || '',
                content: cell.content || '',
                output: null
            };

            this.sendWsMessage({
                type: 'cell_add',
                noteId: this.noteId,
                cell: cellPayload,
                senderPeerId: this.peerId
            });

            if (this.noteRef) {
                try {
                    this.noteRef.child('structure_events').push({
                        action: 'add',
                        cell: cellPayload,
                        senderPeerId: this.peerId,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                } catch (_) { }
            }
        }

        /**
         * Broadcast cell deletion
         */
        broadcastCellDeleted(cellId) {
            if (!this.isConnected || !cellId) return;
            if (!this.isHost && !this.hostOnline) return;

            this.sendWsMessage({
                type: 'cell_delete',
                noteId: this.noteId,
                cellId: cellId,
                senderPeerId: this.peerId
            });

            if (this.noteRef) {
                try {
                    this.noteRef.child('structure_events').push({
                        action: 'delete',
                        cellId,
                        senderPeerId: this.peerId,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                } catch (_) { }
            }
        }

        /**
         * Broadcast start of local execution
         */
        broadcastExecutionStart(cellId) {
            if (!this.isConnected || !cellId) return;
            if (!this.isHost && !this.hostOnline) return;

            this.sendWsMessage({
                type: 'exec_start',
                noteId: this.noteId,
                cellId: cellId,
                runnerId: this.currentUser.id,
                runnerName: this.currentUser.username,
                senderPeerId: this.peerId
            });

            if (this.noteRef) {
                try {
                    this.noteRef.child('log_streams').remove();
                    this.noteRef.child(`executions/${cellId}`).set({
                        status: 'running',
                        runnerId: this.currentUser.id,
                        runnerName: this.currentUser.username,
                        startedAt: firebase.database.ServerValue.TIMESTAMP
                    });
                } catch (_) { }
            }
        }

        /**
         * Stream a chunk of stdout/stderr from local execution
         */
        broadcastLogChunk(cellId, text) {
            if (!this.isConnected || !cellId || !text) return;
            if (!this.isHost && !this.hostOnline) return;

            this.sendWsMessage({
                type: 'exec_log',
                noteId: this.noteId,
                cellId: cellId,
                text: text,
                senderPeerId: this.peerId
            });

            if (this.noteRef) {
                try {
                    this.noteRef.child('log_streams').push({
                        cellId,
                        text,
                        senderPeerId: this.peerId,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                } catch (_) { }
            }
        }

        /**
         * Broadcast execution completion
         */
        broadcastExecutionComplete(cellId, output, success = true) {
            if (!this.isConnected || !cellId) return;
            if (!this.isHost && !this.hostOnline) return;

            this.sendWsMessage({
                type: 'exec_done',
                noteId: this.noteId,
                cellId: cellId,
                output: output || null,
                success: Boolean(success),
                senderPeerId: this.peerId
            });

            if (this.noteRef) {
                try {
                    this.noteRef.child(`executions/${cellId}`).set({
                        status: success ? 'completed' : 'error',
                        runnerId: this.currentUser.id,
                        runnerName: this.currentUser.username,
                        output: output || null,
                        completedAt: firebase.database.ServerValue.TIMESTAMP
                    });
                } catch (_) { }
            }
        }

        /**
         * Broadcast cell title change in real time
         */
        broadcastCellTitle(cellId, title) {
            if (!this.isConnected || !cellId) return;
            if (!this.isHost && !this.hostOnline) return;

            this.sendWsMessage({
                type: 'cell_title',
                noteId: this.noteId,
                cellId: cellId,
                title: title,
                senderPeerId: this.peerId
            });

            if (this.noteRef) {
                try {
                    this.noteRef.child(`cells/${cellId}/title`).set(title);
                } catch (_) { }
            }
        }

        /**
         * Broadcast notebook title change in real time
         */
        broadcastNotebookTitle(title) {
            if (!this.isConnected) return;
            if (!this.isHost && !this.hostOnline) return;

            this.sendWsMessage({
                type: 'notebook_title',
                noteId: this.noteId,
                title: title,
                senderPeerId: this.peerId
            });

            if (this.noteRef) {
                try {
                    this.noteRef.child('title').set(title);
                } catch (_) { }
            }
        }

        /**
         * Broadcast cell language selector change in real time
         */
        broadcastCellLang(cellId, lang) {
            if (!this.isConnected || !cellId) return;
            if (!this.isHost && !this.hostOnline) return;

            this.sendWsMessage({
                type: 'cell_lang',
                noteId: this.noteId,
                cellId: cellId,
                lang: lang,
                senderPeerId: this.peerId
            });

            if (this.noteRef) {
                try {
                    this.noteRef.child(`cells/${cellId}/lang`).set(lang);
                } catch (_) { }
            }
        }

        /**
         * Broadcast cell star status in real time
         */
        broadcastCellStar(cellId, isStarred) {
            if (!this.isConnected || !cellId) return;
            if (!this.isHost && !this.hostOnline) return;

            this.sendWsMessage({
                type: 'cell_star',
                noteId: this.noteId,
                cellId: cellId,
                isStarred: Boolean(isStarred),
                senderPeerId: this.peerId
            });

            if (this.noteRef) {
                try {
                    this.noteRef.child(`cells/${cellId}/isStarred`).set(Boolean(isStarred));
                } catch (_) { }
            }
        }

        /**
         * Broadcast cell reordering in real time
         */
        broadcastCellReorder(cellIdsOrder) {
            if (!this.isConnected || !Array.isArray(cellIdsOrder)) return;
            if (!this.isHost && !this.hostOnline) return;

            this.sendWsMessage({
                type: 'cell_reorder',
                noteId: this.noteId,
                cellIdsOrder: cellIdsOrder,
                senderPeerId: this.peerId
            });
        }
    }

    // Expose global instance
    window.ZohoCollabEngine = new CollabEngine();
})();
