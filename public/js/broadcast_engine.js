/**
 * Zoho Notes - Live Broadcast Engine (Host Side)
 * 
 * Synchronizes local editor state and local execution outputs to Firebase Realtime Database.
 * Runs 100% locally on the host machine and streams updates to spectators in real time.
 */

(function () {
    class BroadcastEngine {
        constructor() {
            this.app = null;
            this.db = null;
            this.sessionId = null;
            this.isBroadcasting = false;
            this.config = null;
            this.sessionRef = null;
            this.viewersRef = null;
            this.debounceTimers = new Map();
            this.viewerCountCallback = null;
        }

        /**
         * Load configuration from backend or localStorage
         */
        async getConfig() {
            // 1. Check window.FIREBASE_CONFIG injected directly from template
            if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.databaseURL) {
                return window.FIREBASE_CONFIG;
            }

            // 2. Check localStorage for user-overridden keys
            const localStored = localStorage.getItem('zoho_firebase_config');
            if (localStored) {
                try {
                    const parsed = JSON.parse(localStored);
                    if (parsed.apiKey && parsed.databaseURL) {
                        return parsed;
                    }
                } catch (e) { }
            }

            // 3. Fallback to server config endpoint
            try {
                const res = await fetch('/api/firebase-config');
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.apiKey && data.databaseURL) {
                        return data;
                    }
                }
            } catch (e) {
                console.warn('[BroadcastEngine] Could not fetch server Firebase config:', e);
            }

            // 4. No configuration available
            return null;
        }

        /**
         * Save user-provided Firebase config to localStorage
         */
        saveConfig(config) {
            localStorage.setItem('zoho_firebase_config', JSON.stringify(config));
            this.config = config;
        }

        /**
         * Initialize Firebase client
         */
        async init(customConfig = null) {
            this.config = customConfig || (await this.getConfig());
            if (!this.config || !this.config.apiKey || !this.config.databaseURL) {
                throw new Error('MISSING_CONFIG');
            }

            if (!window.firebase) {
                throw new Error('FIREBASE_SDK_NOT_LOADED: The Firebase library could not be loaded from CDN. Please check your internet connection or ad-blocker.');
            }

            try {
                // Check if already initialized
                const appName = 'zoho-live-broadcast';
                let app;
                const existing = firebase.apps && firebase.apps.find(a => a.name === appName);
                if (existing) {
                    app = existing;
                } else {
                    app = firebase.initializeApp(this.config, appName);
                }

                this.app = app;
                this.db = firebase.database(app);
                return true;
            } catch (err) {
                console.error('[BroadcastEngine] Firebase initialization failed:', err);
                throw new Error('FIREBASE_INIT_FAILED: ' + err.message);
            }
        }

        /**
         * Start a live broadcast session
         * @param {Object} notebook - Current notebook state
         * @param {string} hostName - Host username
         */
        async startBroadcast(notebook, hostName = 'Host') {
            if (!this.db) {
                await this.init();
            }

            // Generate clean random session ID: e.g. "live-8f92ab"
            this.sessionId = 'live-' + Math.random().toString(36).substring(2, 8) + Date.now().toString(36).slice(-4);
            this.sessionRef = this.db.ref(`live_sessions/${this.sessionId}`);

            // Prepare snapshot of cells
            const cellsMap = {};
            if (notebook && Array.isArray(notebook.cells)) {
                notebook.cells.forEach((cell, index) => {
                    cellsMap[cell.id] = {
                        id: cell.id,
                        type: cell.type || 'code',
                        lang: cell.lang || 'javascript',
                        content: cell.content || '',
                        order: index,
                        status: 'idle',
                        output: cell.output || null
                    };
                });
            }

            const initialPayload = {
                meta: {
                    sessionId: this.sessionId,
                    title: notebook.title || 'Untitled Notebook',
                    hostName: hostName || 'Anonymous',
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    lastUpdated: firebase.database.ServerValue.TIMESTAMP,
                    isLive: true,
                    activeCellId: (notebook.cells && notebook.cells[0]) ? notebook.cells[0].id : null
                },
                cells: cellsMap
            };

            // Set initial state
            await this.sessionRef.set(initialPayload);

            // Set onDisconnect hook so Firebase automatically marks session offline if browser closes
            const metaStatusRef = this.sessionRef.child('meta/isLive');
            metaStatusRef.onDisconnect().set(false);

            const lastSeenRef = this.sessionRef.child('meta/endedAt');
            lastSeenRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);

            // Track active viewers
            this.viewersRef = this.db.ref(`live_sessions/${this.sessionId}/viewers`);
            this.viewersRef.on('value', (snapshot) => {
                const viewers = snapshot.val() || {};
                const count = Object.keys(viewers).length;
                if (typeof this.viewerCountCallback === 'function') {
                    this.viewerCountCallback(count);
                }
            });

            this.isBroadcasting = true;

            const shareUrl = `${window.location.origin}/live/${this.sessionId}`;
            return {
                sessionId: this.sessionId,
                shareUrl
            };
        }

        /**
         * Stop the broadcast session
         */
        async stopBroadcast() {
            if (!this.isBroadcasting || !this.sessionRef) return;

            try {
                await this.sessionRef.child('meta/isLive').set(false);
                await this.sessionRef.child('meta/endedAt').set(firebase.database.ServerValue.TIMESTAMP);
                if (this.viewersRef) {
                    this.viewersRef.off();
                }
            } catch (e) {
                console.warn('[BroadcastEngine] Error stopping broadcast:', e);
            } finally {
                this.isBroadcasting = false;
                this.sessionId = null;
                this.sessionRef = null;
            }
        }

        /**
         * Stream cell content update (keystrokes) with 60ms debounce
         */
        syncCellContent(cellId, content, lang = 'javascript', type = 'code') {
            if (!this.isBroadcasting || !this.sessionRef || !cellId) return;

            // Debounce keystrokes to preserve network bandwidth and smooth remote typing
            if (this.debounceTimers.has(cellId)) {
                clearTimeout(this.debounceTimers.get(cellId));
            }

            const timer = setTimeout(async () => {
                this.debounceTimers.delete(cellId);
                try {
                    await this.sessionRef.child(`cells/${cellId}`).update({
                        content: content,
                        lang: lang,
                        type: type,
                        updatedAt: firebase.database.ServerValue.TIMESTAMP
                    });
                } catch (e) {
                    console.warn('[BroadcastEngine] Failed to sync content:', e);
                }
            }, 60);

            this.debounceTimers.set(cellId, timer);
        }

        /**
         * Broadcast active cell / focus change so viewer can follow
         */
        syncActiveCell(cellId) {
            if (!this.isBroadcasting || !this.sessionRef || !cellId) return;
            try {
                this.sessionRef.child('meta/activeCellId').set(cellId);
            } catch (e) { }
        }

        /**
         * Sync notebook title change
         */
        syncNotebookTitle(title) {
            if (!this.isBroadcasting || !this.sessionRef) return;
            try {
                this.sessionRef.child('meta/title').set(title || 'Untitled Notebook');
            } catch (e) { }
        }

        /**
         * Broadcast local execution status (e.g. 'running', 'success', 'error')
         */
        syncCellStatus(cellId, status) {
            if (!this.isBroadcasting || !this.sessionRef || !cellId) return;
            try {
                this.sessionRef.child(`cells/${cellId}/status`).set(status);
            } catch (e) { }
        }

        /**
         * Broadcast local execution output (stdout, stderr, execution time)
         */
        syncCellOutput(cellId, output, status = 'idle') {
            if (!this.isBroadcasting || !this.sessionRef || !cellId) return;
            try {
                this.sessionRef.child(`cells/${cellId}`).update({
                    output: output || null,
                    status: status,
                    executedAt: firebase.database.ServerValue.TIMESTAMP
                });
            } catch (e) { }
        }

        /**
         * Stream a chunk of interactive terminal stdout/stderr line-by-line
         */
        streamTerminalChunk(cellId, chunk) {
            if (!this.isBroadcasting || !this.sessionRef || !cellId || !chunk) return;
            try {
                // Push chunk to terminal log stream
                this.sessionRef.child(`cells/${cellId}/streamLogs`).push({
                    text: chunk,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            } catch (e) { }
        }

        /**
         * Clear streaming terminal logs before a new run
         */
        clearTerminalStream(cellId) {
            if (!this.isBroadcasting || !this.sessionRef || !cellId) return;
            try {
                this.sessionRef.child(`cells/${cellId}/streamLogs`).remove();
            } catch (e) { }
        }

        /**
         * Sync cell addition, deletion, or reordering
         */
        syncNotebookStructure(cells) {
            if (!this.isBroadcasting || !this.sessionRef || !Array.isArray(cells)) return;

            const cellsMap = {};
            cells.forEach((cell, index) => {
                cellsMap[cell.id] = {
                    id: cell.id,
                    type: cell.type || 'code',
                    lang: cell.lang || 'javascript',
                    content: cell.content || '',
                    order: index,
                    status: cell.status || 'idle',
                    output: cell.output || null
                };
            });

            try {
                this.sessionRef.child('cells').set(cellsMap);
            } catch (e) {
                console.warn('[BroadcastEngine] Failed to sync structure:', e);
            }
        }
    }

    // Expose global instance
    window.ZohoBroadcastEngine = new BroadcastEngine();
})();
