// Monaco Editor Configuration
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

class NotebookApp {
    constructor() {
        this.notebook = {
            id: 'ntbk-' + Date.now(),
            title: 'Untitled Notebook',
            cells: [],
            tags: []
        };
        this.editors = {}; // cellId -> monaco editor instance
        this.allNotebooks = []; // Store all notebooks for filtering
        this.filteredNotebooks = []; // Store currently filtered results
        this.userSettings = window.USER_SETTINGS || { defaultLanguage: 'javascript' };
        this._autoSave = debounce(() => this.saveToBackend(), 1500);

        this.db = window.ZohoLocalDB;
        this.sync = window.ZohoBackupEngine || window.ZohoSyncEngine;
        this.engine = window.ZohoBrowserEngine;
        this.broadcaster = window.ZohoBroadcastEngine;
        this.collab = window.ZohoCollabEngine;
        this.remoteDecorations = {}; // cellId -> { peerId -> decorationIds[] }
        this.sharedNotebooks = [];
        this.activeTypers = new Map(); // peerId -> { username, timer }

        this.expandedFolders = new Set(JSON.parse(localStorage.getItem('zoho-expanded-folders') || '[]'));
        this.persistedFolders = this.getPersistedFolders();
        this.currentPendingFolder = 'root';
        this.modalHistoryPushed = false;
        this.setupTheme();
        this.setupSmartOutput();
        this.setupEventListeners();
        this.setupBroadcastEngine();
        this.setupCollabEngine();
        this.setupMobileSidebar();
        this.initSplitJS();
        this.setupConsoleInterception();

        this.init();
    }

    setupConsoleInterception() {
        this.smartStringify = (val, maxDepth = 5, seen = new WeakSet()) => {
            if (val === null) return "null";
            if (val === undefined) return "undefined";
            if (typeof val === "string") return `"${val}"`;
            if (typeof val !== "object" && typeof val !== "function") return String(val);

            if (maxDepth < 0) return "[...]";
            if (seen.has(val)) return "[Circular]";
            seen.add(val);

            if (Array.isArray(val)) {
                let parts = [];
                let emptyCount = 0;
                for (let i = 0; i < val.length; i++) {
                    if (i in val) {
                        if (emptyCount > 0) {
                            parts.push(`<${emptyCount} empty items>`);
                            emptyCount = 0;
                        }
                        parts.push(this.smartStringify(val[i], maxDepth - 1, seen));
                    } else {
                        emptyCount++;
                    }
                }
                if (emptyCount > 0) {
                    parts.push(`<${emptyCount} empty items>`);
                }
                return `[${parts.join(", ")}]`;
            }

            if (typeof val === "function") return `[Function: ${val.name || "(anonymous)"}]`;

            // Regular Object
            try {
                const entries = Object.entries(val);
                if (entries.length === 0) return "{}";
                if (maxDepth === 0) return "{...}";
                const content = entries
                    .map(([k, v]) => `${k}: ${this.smartStringify(v, maxDepth - 1, seen)}`)
                    .join(", ");
                return `{ ${content} }`;
            } catch (e) {
                return "[Object]";
            }
        };

        this.originalLog = console.log;
        console.log = (...args) => {
            this.originalLog(...args);
            if (this.currentRunningCellId) {
                // Filter out system and backup engine logs so they never pollute code output
                const firstArg = typeof args[0] === 'string' ? args[0] : '';
                if (firstArg.startsWith('[BackupEngine]') ||
                    firstArg.startsWith('[SyncEngine]') ||
                    firstArg.startsWith('[OfflineManager]') ||
                    firstArg.startsWith('[NotebookApp]') ||
                    firstArg.startsWith('[SW]') ||
                    firstArg.startsWith('[ZohoLocalDB]')) {
                    return;
                }

                const outputDiv = document.getElementById(`output-${this.currentRunningCellId}`);
                if (outputDiv) {
                    outputDiv.classList.remove('hidden');
                    args.forEach(arg => {
                        const logElem = document.createElement('div');
                        logElem.className = 'output-log';
                        logElem.textContent = this.smartStringify(arg);
                        outputDiv.appendChild(logElem);
                    });
                }
            }
        };

        window.addEventListener('error', (e) => {
            if (this.currentRunningCellId) {
                const outputDiv = document.getElementById(`output-${this.currentRunningCellId}`);
                if (outputDiv) {
                    outputDiv.classList.remove('hidden');
                    const errElem = document.createElement('div');
                    errElem.className = 'output-error';
                    errElem.textContent = `Runtime Error: ${e.message}`;
                    outputDiv.appendChild(errElem);
                }
            }
        });
    }

    async init() {
        if (this.db) await this.db.init();
        if (this.sync) await this.sync.init();
        // CRITICAL: wait for account verification + cloud hydration to finish
        // BEFORE deciding what to render/create. Prevents the historical race
        // that created phantom "Getting Started" notes during sync.
        if (this.sync && typeof this.sync.waitForStartup === 'function') {
            await this.sync.waitForStartup();
        }

        // Listen for reactive updates from background sync
        if (this.db && this.db.notes$) {
            this.db.notes$.subscribe((change) => {
                if (change && change.isRemoteSync) {
                    this.refreshNotebookList(false);
                }
            });
        }

        // Fetch local notes first with zero network delay
        let notebooks = await this.refreshNotebookList(false);

        const urlParams = new URLSearchParams(window.location.search);
        const targetInitialId = urlParams.get('noteId') || window.INITIAL_NOTE_ID;
        if (targetInitialId) {
            await this.loadNotebook(targetInitialId);
            return;
        }

        const savedId = localStorage.getItem('zoho-notebook-current-id');
        if (savedId) {
            const existsInList = Array.isArray(notebooks) && notebooks.some(nb => nb.id === savedId);
            if (existsInList) {
                await this.loadNotebook(savedId);
                return;
            }

            // If not in the immediate list array, check DB directly
            if (this.db) {
                const localNote = await this.db.getNote(savedId);
                if (localNote && !localNote.isTrashed) {
                    await this.loadNotebook(savedId);
                    return;
                }
            }
        }

        if (Array.isArray(notebooks) && notebooks.length > 0) {
            await this.loadNotebook(notebooks[0].id);
        } else {
            // Check local DB before creating any new note
            let localCount = 0;
            if (this.db) {
                const allNotes = await this.db.getAllNotes();
                if (allNotes && allNotes.length > 0) {
                    await this.loadNotebook(allNotes[0].id);
                    return;
                }
                localCount = allNotes ? allNotes.length : 0;
            }

            // If local DB is empty, check remote before creating any default note
            if (localCount === 0 && navigator.onLine && this.sync) {
                try {
                    await this.sync.hydrateAllNotes();
                    if (this.db) {
                        const hydratedNotes = await this.db.getAllNotes();
                        if (hydratedNotes && hydratedNotes.length > 0) {
                            await this.refreshNotebookList(false);
                            await this.loadNotebook(hydratedNotes[0].id);
                            return;
                        }
                    }
                } catch (err) {
                    console.warn('[NotebookApp] Remote hydration check on init:', err);
                }
            }

            // Only create if genuinely completely empty across local & remote
            // AND we are not stuck on an expired session (creating a phantom
            // note here would push it into whichever account logs in next).
            const authBlocked = this.sync && typeof this.sync.isAuthRequired === 'function' && this.sync.isAuthRequired();
            if (localCount === 0 && !authBlocked) {
                await this.createNewNotebookInternal('root', 'Getting Started');
            } else if (localCount === 0 && authBlocked) {
                console.warn('[NotebookApp] Local DB empty but session expired. Waiting for login before creating a default note.');
            }
        }

        // Clear search on refresh
        const searchInput = document.getElementById('notebook-search');
        if (searchInput) searchInput.value = '';
    }

    setupEventListeners() {
        document.getElementById('add-code-cell').addEventListener('click', () => this.addCell('code'));
        // document.getElementById('btn-new-folder').addEventListener('click', () => this.createFolder()); // Removed as per Phase 5
        document.getElementById('run-all-cells').addEventListener('click', () => this.runAll());
        document.getElementById('clear-all-outputs').addEventListener('click', () => this.clearAllOutputs());
        document.getElementById('copy-all-cells').addEventListener('click', () => this.copyAllCells());
        document.getElementById('scroll-to-bottom').addEventListener('click', () => {
            const main = document.querySelector('main');
            main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
        });

        document.getElementById('toggle-notebooks').addEventListener('click', (e) => {
            if (e.target.closest('#add-folder-sidebar')) return;
            const list = document.getElementById('notebook-list');
            const chevron = document.getElementById('chevron-notebooks');
            list.classList.toggle('collapsed');
            chevron.classList.toggle('collapsed-chevron');
        });

        document.getElementById('add-folder-sidebar').addEventListener('click', (e) => {
            e.stopPropagation();
            this.createFolder();
        });

        // Wire Live Notes Section
        document.getElementById('toggle-live-notes')?.addEventListener('click', (e) => {
            if (e.target.closest('#btn-create-live-note')) return;
            const list = document.getElementById('live-notes-list');
            const chevron = document.getElementById('chevron-live-notes');
            if (list) list.classList.toggle('hidden');
            if (chevron) chevron.classList.toggle('rotate-180');
        });

        document.getElementById('btn-create-live-note')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.createLiveNotebook();
        });

        const titleInput = document.getElementById('notebook-title');
        titleInput.addEventListener('input', (e) => {
            this.notebook.title = e.target.value;
            this.updateCurrentNotebookItemUI();
            if (this.sync && typeof this.sync.recordUserActivity === 'function') {
                this.sync.recordUserActivity();
            }
            if (this.broadcaster && this.broadcaster.isBroadcasting) {
                this.broadcaster.syncNotebookTitle(e.target.value);
            }
            if (this.collab && this.collab.isConnected) {
                this.collab.broadcastNotebookTitle(e.target.value);
            }
            this._autoSave();
        });

        document.getElementById('nav-starred-cells').addEventListener('click', () => this.loadStarredNotes());
        document.getElementById('nav-trash').addEventListener('click', () => this.loadTrash());


        // Event Delegation for Sidebar
        document.getElementById('notebook-list').addEventListener('click', (e) => {
            // 1. Folder Actions (Buttons)
            const addFileBtn = e.target.closest('.btn-add-file');
            if (addFileBtn) {
                e.preventDefault();
                e.stopPropagation();
                const folder = addFileBtn.getAttribute('data-folder');
                this.createNewNotebook(folder);
                return;
            }

            const deleteFolderBtn = e.target.closest('.btn-delete-folder');
            if (deleteFolderBtn) {
                e.preventDefault();
                e.stopPropagation();
                const path = deleteFolderBtn.getAttribute('data-full-path');
                this.deleteFolder(path);
                return;
            }

            const renameFolderBtn = e.target.closest('.btn-rename-folder');
            if (renameFolderBtn) {
                e.preventDefault();
                e.stopPropagation();
                const path = renameFolderBtn.getAttribute('data-full-path');
                this.renameFolder(path);
                return;
            }

            // 2. File Actions (Buttons)
            const deleteNoteBtn = e.target.closest('.delete-notebook-btn');
            if (deleteNoteBtn) { // Changed priority
                e.stopPropagation();
                const item = deleteNoteBtn.closest('.notebook-item');
                if (item) this.deleteNotebook(item.getAttribute('data-id'));
                return;
            }

            const renameNoteBtn = e.target.closest('.rename-notebook-btn');
            if (renameNoteBtn) {
                e.stopPropagation();
                const item = renameNoteBtn.closest('.notebook-item');
                if (item) {
                    const title = item.querySelector('.tree-label').innerText;
                    this.renameNotebook(item.getAttribute('data-id'), title);
                }
                return;
            }

            const moveNoteBtn = e.target.closest('.move-notebook-btn');
            if (moveNoteBtn) {
                e.stopPropagation();
                const item = moveNoteBtn.closest('.notebook-item');
                if (item) {
                    this.moveNotebookToFolderPrompt(item.getAttribute('data-id'));
                }
                return;
            }

            // 3. Tree Navigation (Folders & File Selection)
            const folderItem = e.target.closest('.tree-item.is-folder');
            if (folderItem) {
                // Toggle Collapse
                const children = folderItem.nextElementSibling;
                const arrow = folderItem.querySelector('.tree-arrow');
                const path = folderItem.getAttribute('data-full-path') || folderItem.getAttribute('data-path');
                if (children && children.classList.contains('tree-children')) {
                    const isCollapsed = children.classList.toggle('collapsed');
                    if (arrow) arrow.classList.toggle('rotated', !isCollapsed);
                    if (path) {
                        if (isCollapsed) {
                            this.expandedFolders.delete(path);
                        } else {
                            this.expandedFolders.add(path);
                        }
                        localStorage.setItem('zoho-expanded-folders', JSON.stringify([...this.expandedFolders]));
                    }
                }
                return;
            }

            const fileItem = e.target.closest('.tree-item.is-file');
            if (fileItem) {
                const id = fileItem.getAttribute('data-id');
                this.loadNotebook(id);
                return;
            }
        });

        // Event Delegation for Cells
        document.getElementById('cells-list').addEventListener('click', (e) => {
            const cellElem = e.target.closest('.cell');
            if (!cellElem) return;
            const cellId = cellElem.id.replace('container-', '');

            if (e.target.closest('.btn-run')) {
                this.runCell(cellId);
            } else if (e.target.closest('.delete-cell')) {
                this.deleteCell(cellId);
            } else if (e.target.closest('.move-up')) {
                this.moveCell(cellId, -1);
            } else if (e.target.closest('.move-down')) {
                this.moveCell(cellId, 1);
            } else if (e.target.closest('.btn-star-cell')) {
                this.toggleCellStar(cellId);
            }
        });

        // Drag and Drop for Reordering Cells
        const cellsList = document.getElementById('cells-list');
        cellsList.addEventListener('dragstart', (e) => this.handleCellDragStart(e));
        cellsList.addEventListener('dragover', (e) => this.handleCellDragOver(e));
        cellsList.addEventListener('dragleave', (e) => this.handleCellDragLeave(e));
        cellsList.addEventListener('dragend', (e) => this.handleCellDragEnd(e));
        cellsList.addEventListener('drop', (e) => this.handleCellDrop(e));

        // Drag and Drop for Moving Notes to other Notebooks
        const notebookList = document.getElementById('notebook-list');
        notebookList.addEventListener('dragover', (e) => this.handleNotebookDragOver(e));
        notebookList.addEventListener('dragleave', (e) => this.handleNotebookDragLeave(e));
        notebookList.addEventListener('drop', (e) => this.handleNotebookDrop(e));

        document.getElementById('cells-list').addEventListener('input', (e) => {
            if (e.target.classList.contains('cell-title-input')) {
                const cellElem = e.target.closest('.cell');
                const cellId = cellElem.id.replace('container-', '');
                const cell = this.notebook.cells.find(c => c.id === cellId);
                if (cell) cell.title = e.target.value;
                if (this.broadcaster && this.broadcaster.isBroadcasting) {
                    this.broadcaster.syncNotebookStructure(this.notebook.cells);
                }
                if (this.collab && this.collab.isConnected) {
                    this.collab.broadcastCellTitle(cellId, e.target.value);
                }
                this._autoSave();
            }
        });

        // Modal Specific Listeners
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') this.closeAllModals();
        });

        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals());
        });

        window.addEventListener('popstate', () => {
            this.closeAllModals(true);
        });

        // Global Modal Keyboard Navigation: Enter to submit, Escape to close
        window.addEventListener('keydown', (e) => {
            const overlay = document.getElementById('modal-overlay');
            if (!overlay || overlay.classList.contains('hidden')) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeAllModals();
                return;
            }

            if (e.key === 'Enter') {
                // If user is editing in a textarea inside a modal, don't submit on plain Enter
                if (e.target && e.target.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) {
                    return;
                }

                const visibleModal = overlay.querySelector('.modal-content:not(.hidden)');
                if (!visibleModal) return;

                const primaryBtn = visibleModal.querySelector(
                    '#btn-modal-alert-confirm, #btn-modal-input-confirm, #btn-confirm-folder, #btn-confirm-file, .btn-primary:not(.modal-close)'
                );

                if (primaryBtn && !primaryBtn.disabled) {
                    e.preventDefault();
                    primaryBtn.click();
                }
            }
        });

        document.getElementById('btn-confirm-folder').addEventListener('click', () => this.handleFolderCreate());
        document.getElementById('btn-confirm-file').addEventListener('click', () => this.handleFileCreate());

        document.getElementById('nav-settings').addEventListener('click', () => this.openModal('modal-settings'));
        document.getElementById('btn-open-live-modal')?.addEventListener('click', () => {
            this.openModal('modal-live-broadcast');
            this.updateBroadcastModalUI();
        });

        document.getElementById('theme-switch').addEventListener('change', (e) => {
            this.toggleTheme(e.target.checked);
        });

        document.getElementById('smart-output-switch').addEventListener('change', (e) => {
            this.toggleSmartOutput(e.target.checked);
        });

        document.getElementById('setting-default-lang').addEventListener('change', (e) => {
            this.updateDefaultLanguage(e.target.value);
        });

        document.getElementById('btn-send-feedback').addEventListener('click', () => this.sendFeedback());

        // Generic Modal Action Listeners
        document.getElementById('btn-modal-input-confirm')?.addEventListener('click', () => {
            if (this.currentInputCallback) {
                const val = document.getElementById('modal-input-field')?.value || '';
                const cb = this.currentInputCallback;
                this.closeAllModals();
                cb(val);
            }
        });

        document.getElementById('btn-modal-alert-confirm')?.addEventListener('click', () => {
            if (this.currentConfirmCallback) {
                const cb = this.currentConfirmCallback;
                this.closeAllModals();
                cb();
            }
        });

        // Mobile Sidebar Listeners
        document.getElementById('open-sidebar').addEventListener('click', () => this.toggleMobileSidebar(true));
        document.getElementById('close-sidebar').addEventListener('click', () => this.toggleMobileSidebar(false));
        document.getElementById('sidebar-overlay').addEventListener('click', () => this.toggleMobileSidebar(false));

        // Search Listener
        const searchInput = document.getElementById('notebook-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                this.filterNotebooks(e.target.value);
            }, 300));

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.navigateToFirstMatch();
                }
            });
        }
        const sidebarSearchBtn = document.getElementById('sidebar-search-btn');
        if (sidebarSearchBtn) {
            sidebarSearchBtn.addEventListener('click', () => {
                this.filterNotebooks(document.getElementById('notebook-search').value);
            });
        }

        /* Removed search-lens-btn listener as button was removed in Phase 5 */
        // const searchLensBtn = document.getElementById('search-lens-btn');
        // if (searchLensBtn) {
        //     searchLensBtn.addEventListener('click', () => {
        //         this.navigateToFirstMatch();
        //     });
        // }

        // Note Label Search (Phase 6)
        const noteSearchInput = document.getElementById('note-label-search');
        if (noteSearchInput) {
            noteSearchInput.addEventListener('input', (e) => {
                this.filterCells(e.target.value);
            });
        }

        const joinWhatsappBtn = document.getElementById('btn-join-whatsapp');
        if (joinWhatsappBtn) {
            joinWhatsappBtn.addEventListener('click', () => {
                this.openModal('modal-whatsapp');
            });
        }
        const noteSearchBtn = document.getElementById('note-label-search-btn');
        if (noteSearchBtn) {
            noteSearchBtn.addEventListener('click', () => {
                this.filterCells(document.getElementById('note-label-search').value);
            });
        }
    }

    setupBroadcastEngine() {
        if (!this.broadcaster) return;

        // Viewer count change callback
        this.broadcaster.viewerCountCallback = (count) => {
            const countEl = document.getElementById('broadcast-viewers-count');
            const tagEl = document.getElementById('broadcast-viewers-tag');
            if (countEl) countEl.innerText = count;
            if (tagEl) {
                if (count > 0) tagEl.classList.remove('hidden');
                else tagEl.classList.add('hidden');
            }
        };

        // Wire modal controls
        document.getElementById('btn-start-broadcast')?.addEventListener('click', () => this.startLiveBroadcast());
        document.getElementById('btn-stop-broadcast')?.addEventListener('click', () => this.stopLiveBroadcast());

        document.getElementById('btn-copy-broadcast-link')?.addEventListener('click', () => {
            const input = document.getElementById('live-share-link-input');
            if (input && input.value) {
                navigator.clipboard.writeText(input.value);
                const btn = document.getElementById('btn-copy-broadcast-link');
                const orig = btn.innerHTML;
                btn.innerHTML = `<i data-lucide="check" style="width: 14px;"></i> Copied!`;
                if (window.lucide) lucide.createIcons();
                setTimeout(() => {
                    btn.innerHTML = orig;
                    if (window.lucide) lucide.createIcons();
                }, 2000);
            }
        });

        document.getElementById('btn-toggle-firebase-setup')?.addEventListener('click', () => {
            const drawer = document.getElementById('firebase-setup-drawer');
            if (drawer) drawer.classList.toggle('hidden');
        });

        document.getElementById('btn-save-firebase-cfg')?.addEventListener('click', () => {
            const val = document.getElementById('live-firebase-cfg-input')?.value.trim();
            if (!val) return;
            try {
                const parsed = JSON.parse(val);
                this.broadcaster.saveConfig(parsed);
                const msg = document.getElementById('firebase-cfg-saved-msg');
                if (msg) {
                    msg.style.display = 'inline-flex';
                    setTimeout(() => { msg.style.display = 'none'; }, 2500);
                }
            } catch (err) {
                this.showToast('Invalid JSON: ' + err.message, 'error');
            }
        });
    }

    setupCollabEngine() {
        if (!this.collab) return;

        // 0. Host presence status changed: gate guest collaboration when host is offline
        this.collab.onHostStatusChanged = (isOnline, hostInfo) => {
            const overlay = document.getElementById('collab-host-offline-overlay');
            const hostNameEl = document.getElementById('collab-offline-host-name');
            if (hostNameEl && hostInfo && hostInfo.username) {
                hostNameEl.innerText = '@' + hostInfo.username;
            }

            if (this.collab.isHost) {
                if (overlay) overlay.classList.add('hidden');
                this.setEditorsReadOnly(false);
            } else {
                if (isOnline) {
                    if (overlay) overlay.classList.add('hidden');
                    this.setEditorsReadOnly(false);
                } else {
                    if (overlay) overlay.classList.remove('hidden');
                    this.setEditorsReadOnly(true);
                }
            }
        };

        // 1. Presence changed: update top collaboration bar with active users count and avatars
        this.collab.onPresenceChanged = (users, count) => {
            const countEl = document.getElementById('collab-user-count');
            const avatarsContainer = document.getElementById('collab-avatars');
            const topBar = document.getElementById('collab-top-bar');

            if (countEl) countEl.innerText = count;
            if (topBar) {
                if (this.notebook && this.notebook.id && this.notebook.isLive) topBar.classList.remove('hidden');
                else topBar.classList.add('hidden');
            }

            if (avatarsContainer) {
                avatarsContainer.innerHTML = '';
                users.forEach(u => {
                    const chip = document.createElement('div');
                    chip.className = 'collab-avatar-chip';
                    chip.style.backgroundColor = u.color || '#6d5dfc';
                    chip.title = `${u.username || 'User'}${u.peerId === this.collab.peerId ? ' (You)' : ''}`;
                    chip.innerText = (u.username || 'U').charAt(0).toUpperCase();
                    avatarsContainer.appendChild(chip);
                });
            }

            if (this.activeTypers && this.activeTypers.size > 0) {
                const activePeerIds = new Set(users.map(u => u.peerId));
                let changed = false;
                for (const [peerId, t] of this.activeTypers.entries()) {
                    if (!activePeerIds.has(peerId)) {
                        clearTimeout(t.timer);
                        this.activeTypers.delete(peerId);
                        changed = true;
                    }
                }
                if (changed) this.updateTypingIndicatorUI();
            }
            this.updateCollabTopBar();
        };

        // 1.5 Initial state sync when joining an active live session
        this.collab.onRemoteInitSync = (cachedCells, cachedMetadata = null) => {
            if (Array.isArray(cachedCells) && cachedCells.length > 0) {
                cachedCells.forEach(({ cellId, content }) => {
                    const editor = this.editors[cellId];
                    if (editor && typeof content === 'string' && editor.getValue() !== content) {
                        this.collab.suppressLocalEdits = true;
                        editor.setValue(content);
                        this.collab.suppressLocalEdits = false;
                        const cell = this.notebook?.cells?.find(c => c.id === cellId);
                        if (cell) cell.content = content;
                    }
                });
            }

            if (cachedMetadata) {
                if (cachedMetadata.title && typeof cachedMetadata.title === 'string') {
                    if (this.notebook) this.notebook.title = cachedMetadata.title;
                    const titleEl = document.getElementById('notebook-title');
                    if (titleEl) titleEl.value = cachedMetadata.title;
                    this.updateCurrentNotebookItemUI();
                }
                if (Array.isArray(cachedMetadata.cells)) {
                    cachedMetadata.cells.forEach(meta => {
                        const cell = this.notebook?.cells?.find(c => c.id === meta.cellId);
                        if (cell) {
                            if (typeof meta.title === 'string') {
                                cell.title = meta.title;
                                const titleInp = document.querySelector(`#container-${meta.cellId} .cell-title-input`);
                                if (titleInp) titleInp.value = meta.title;
                            }
                            if (typeof meta.lang === 'string') {
                                cell.lang = meta.lang;
                                const langSel = document.querySelector(`#container-${meta.cellId} .cell-lang-select`);
                                if (langSel) langSel.value = meta.lang;
                            }
                            if (typeof meta.isStarred === 'boolean') {
                                cell.isStarred = meta.isStarred;
                                const starI = document.querySelector(`#container-${meta.cellId} .btn-star-cell i`);
                                if (starI) {
                                    starI.style.fill = meta.isStarred ? '#ffcc00' : 'none';
                                    starI.style.color = meta.isStarred ? '#ffcc00' : 'var(--text-dim)';
                                }
                            }
                        }
                    });
                }
            }
        };

        // 1.8 Remote typing indicator: "fayas coding..."
        this.collab.onRemoteTyping = (data) => {
            if (data && data.peerId) {
                this.handlePeerTyping(data.peerId, data.username);
            }
        };

        // 2. Remote edits: apply non-conflicting operational changes to Monaco
        this.collab.onRemoteEdit = (cellId, changes, senderId) => {
            const peer = this.collab?.usersList?.find(u => u.peerId === senderId);
            this.handlePeerTyping(senderId, peer?.username);
            const editor = this.editors[cellId];
            if (!editor || !changes || !changes.length) return;

            try {
                const monacoEdits = changes.map(c => ({
                    range: new monaco.Range(
                        c.range.startLineNumber,
                        c.range.startColumn,
                        c.range.endLineNumber,
                        c.range.endColumn
                    ),
                    text: c.text,
                    forceMoveMarkers: true
                }));

                this.collab.suppressLocalEdits = true;
                editor.executeEdits('remote-peer', monacoEdits);
                this.collab.suppressLocalEdits = false;

                // Sync internal cell content
                const cell = this.notebook?.cells?.find(c => c.id === cellId);
                if (cell) {
                    cell.content = editor.getValue();
                }
            } catch (err) {
                console.warn('[Collab] Failed to apply remote edit:', err);
                this.collab.suppressLocalEdits = false;
            }
        };

        // 3. Remote cursor & selection: render colored caret lines and name tags
        this.collab.onRemoteCursor = (peer) => {
            if (!peer || !peer.activeCellId || !peer.cursor) {
                // Clear any leftover decorations for this peer across all editors
                Object.keys(this.editors).forEach(cId => {
                    if (this.remoteDecorations[cId] && this.remoteDecorations[cId][peer.id]) {
                        const editor = this.editors[cId];
                        if (editor) editor.deltaDecorations(this.remoteDecorations[cId][peer.id], []);
                        delete this.remoteDecorations[cId][peer.id];
                    }
                });
                return;
            }

            const targetCellId = peer.activeCellId;
            const editor = this.editors[targetCellId];
            if (!editor) return;

            // Ensure store initialized
            if (!this.remoteDecorations[targetCellId]) this.remoteDecorations[targetCellId] = {};
            const oldDecs = this.remoteDecorations[targetCellId][peer.id] || [];

            // Clear this peer's decorations on other cells
            Object.keys(this.editors).forEach(cId => {
                if (cId !== targetCellId && this.remoteDecorations[cId] && this.remoteDecorations[cId][peer.id]) {
                    this.editors[cId].deltaDecorations(this.remoteDecorations[cId][peer.id], []);
                    delete this.remoteDecorations[cId][peer.id];
                }
            });

            // Prepare decoration for cursor and optional selection
            const decs = [];
            const pos = peer.cursor;
            decs.push({
                range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                options: {
                    className: 'remote-cursor-caret',
                    hoverMessage: { value: `**${peer.username || 'User'}** is here` },
                    before: {
                        content: peer.username || 'User',
                        inlineClassName: 'remote-cursor-label'
                    }
                }
            });

            if (peer.selection) {
                const sel = peer.selection;
                decs.push({
                    range: new monaco.Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn),
                    options: {
                        className: 'remote-selection-highlight'
                    }
                });
            }

            try {
                this.remoteDecorations[targetCellId][peer.id] = editor.deltaDecorations(oldDecs, decs);
            } catch (e) { }
        };

        // 4. Remote cell added: mount and render new cell in DOM
        this.collab.onRemoteCellAdded = (cell) => {
            if (!this.notebook || !Array.isArray(this.notebook.cells)) return;
            const exists = this.notebook.cells.some(c => c.id === cell.id);
            if (exists) return;

            this.notebook.cells.push(cell);
            this.renderCell(cell, this.notebook.cells.length);
            this._autoSave();
            if (window.lucide) lucide.createIcons();
        };

        // 5. Remote cell deleted
        this.collab.onRemoteCellDeleted = (cellId) => {
            if (!this.notebook || !Array.isArray(this.notebook.cells)) return;
            const idx = this.notebook.cells.findIndex(c => c.id === cellId);
            if (idx !== -1) {
                this.notebook.cells.splice(idx, 1);
                const elem = document.getElementById(`container-${cellId}`);
                if (elem) elem.remove();
                if (this.editors[cellId]) {
                    this.editors[cellId].dispose();
                    delete this.editors[cellId];
                }
                this.updateCellIndices();
                this._autoSave();
            }
        };

        // 5.1 Remote cell title updated lively
        this.collab.onRemoteCellTitle = (cellId, title) => {
            const cell = this.notebook?.cells?.find(c => c.id === cellId);
            if (cell) {
                cell.title = title;
            }
            const input = document.querySelector(`#container-${cellId} .cell-title-input`);
            if (input && input.value !== title) {
                const isFocused = document.activeElement === input;
                const start = input.selectionStart;
                const end = input.selectionEnd;
                input.value = title || '';
                if (isFocused && start !== null) {
                    try { input.setSelectionRange(start, end); } catch (_) {}
                }
            }
        };

        // 5.2 Remote notebook title updated lively
        this.collab.onRemoteNotebookTitle = (title) => {
            if (this.notebook) {
                this.notebook.title = title;
            }
            const titleInput = document.getElementById('notebook-title');
            if (titleInput && titleInput.value !== title) {
                const isFocused = document.activeElement === titleInput;
                const start = titleInput.selectionStart;
                const end = titleInput.selectionEnd;
                titleInput.value = title || '';
                if (isFocused && start !== null) {
                    try { titleInput.setSelectionRange(start, end); } catch (_) {}
                }
            }
            this.updateCurrentNotebookItemUI();
        };

        // 5.3 Remote cell language selector changed lively
        this.collab.onRemoteCellLang = (cellId, lang) => {
            const cell = this.notebook?.cells?.find(c => c.id === cellId);
            if (cell) {
                cell.lang = lang;
            }
            const select = document.querySelector(`#container-${cellId} .cell-lang-select`);
            if (select) {
                select.value = lang;
            }
            const editor = this.editors[cellId];
            if (editor) {
                let monacoLang = 'javascript';
                if (lang === 'python') monacoLang = 'python';
                else if (lang === 'java') monacoLang = 'java';
                else if (lang === 'c') monacoLang = 'c';
                else if (lang === 'cpp') monacoLang = 'cpp';
                else if (lang === 'typescript') monacoLang = 'typescript';
                const model = editor.getModel();
                if (model) {
                    monaco.editor.setModelLanguage(model, monacoLang);
                }
                editor.updateOptions({
                    hover: { enabled: lang === 'typescript' },
                    parameterHints: { enabled: lang === 'typescript' }
                });
            }
        };

        // 5.4 Remote cell star toggled lively
        this.collab.onRemoteCellStar = (cellId, isStarred) => {
            const cell = this.notebook?.cells?.find(c => c.id === cellId);
            if (cell) {
                cell.isStarred = Boolean(isStarred);
            }
            const btn = document.querySelector(`#container-${cellId} .btn-star-cell i`);
            if (btn) {
                if (isStarred) {
                    btn.style.fill = '#ffcc00';
                    btn.style.color = '#ffcc00';
                } else {
                    btn.style.fill = 'none';
                    btn.style.color = 'var(--text-dim)';
                }
            }
        };

        // 5.5 Remote cell reorder synchronized
        this.collab.onRemoteCellReorder = (cellIdsOrder) => {
            if (!this.notebook || !Array.isArray(this.notebook.cells) || !Array.isArray(cellIdsOrder)) return;
            const cellsListEl = document.getElementById('cells-list');
            if (!cellsListEl) return;

            cellIdsOrder.forEach(id => {
                const elem = document.getElementById(`container-${id}`);
                if (elem) {
                    cellsListEl.appendChild(elem);
                }
            });

            const cellMap = new Map(this.notebook.cells.map(c => [c.id, c]));
            const newCells = [];
            cellIdsOrder.forEach(id => {
                if (cellMap.has(id)) {
                    newCells.push(cellMap.get(id));
                    cellMap.delete(id);
                }
            });
            for (const rem of cellMap.values()) {
                newCells.push(rem);
            }
            this.notebook.cells = newCells;
            this.updateCellIndices();
        };

        // 6. Remote execution event (another peer clicked Run on their machine)
        this.collab.onRemoteExecution = (cellId, execData) => {
            const cellElem = document.getElementById(`container-${cellId}`);
            if (!cellElem) return;

            const runBtn = cellElem.querySelector('.btn-run');
            const outputContainer = cellElem.querySelector('.output-container');
            const runner = execData.runnerName || 'Collaborator';

            if (execData.status === 'running') {
                if (runBtn) {
                    runBtn.disabled = true;
                    runBtn.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 12px;"></i> Running (@${runner})...`;
                    if (window.lucide) lucide.createIcons();
                }
                if (outputContainer) {
                    outputContainer.classList.remove('hidden');
                    outputContainer.innerHTML = `
                        <div class="output-header flex items-center justify-between" style="font-size: 10px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                            <span class="output-label" style="color: var(--text-dim); text-transform: uppercase; font-weight: bold; opacity: 0.7;">OUTPUT:</span>
                            <span class="output-runner-badge flex items-center gap-1.5" style="color: #6d5dfc; font-size: 10px;">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#6d5dfc] animate-ping inline-block"></span>
                                <span>Running by <strong style="color: #6d5dfc; font-weight: 600;">${runner}</strong>...</span>
                            </span>
                        </div>
                        <div class="output-log" style="color: #6d5dfc; font-size: 11px; opacity: 0.85;">
                            ⚡ Running code on <strong>${runner}</strong>'s machine...
                        </div>
                    `;
                }
            } else if (execData.status === 'completed' || execData.status === 'error') {
                if (runBtn) {
                    runBtn.disabled = false;
                    runBtn.innerHTML = `<i data-lucide="play" style="width: 12px;"></i> Run`;
                    if (window.lucide) lucide.createIcons();
                }
                const cell = this.notebook?.cells?.find(c => c.id === cellId);
                if (cell) {
                    cell.lastRunBy = runner;
                }
                if (execData.output) {
                    this.displayOutput(cellId, execData.output, runner);
                }
            }
        };

        // 7. Streaming terminal logs from peer execution
        this.collab.onRemoteLogChunk = (cellId, chunk) => {
            const cellElem = document.getElementById(`container-${cellId}`);
            if (!cellElem) return;
            const outputContainer = cellElem.querySelector('.output-container');
            const outputContent = cellElem.querySelector('.output-content');
            if (outputContainer) outputContainer.classList.remove('hidden');
            if (outputContent) {
                outputContent.innerText += chunk;
                outputContent.scrollTop = outputContent.scrollHeight;
            }
        };

        // 8. Live session ended or deleted by host
        this.collab.onSessionEnded = (msg) => {
            this.showToast(msg.message || 'This live session was ended or deleted by the host.', 'error');
            this.setEditorsReadOnly(true);
            const topBar = document.getElementById('collab-top-bar');
            if (topBar) topBar.classList.add('hidden');
            const overlay = document.getElementById('collab-host-offline-overlay');
            if (overlay) {
                const title = overlay.querySelector('h3');
                const desc = overlay.querySelector('p');
                if (title) title.innerText = 'Live Session Ended';
                if (desc) desc.innerText = msg.message || 'The host has ended or deleted this live session.';
                overlay.classList.remove('hidden');
            }
        };

        // Wire Copy Live Share Link button (direct 1-click clipboard copy)
        document.getElementById('btn-copy-collab-link')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.copyCollabShareLink();
        });

        // Wire Collab Info button (opens detailed modal with QR & instructions)
        document.getElementById('btn-open-collab-modal')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.openLiveShareModal();
        });

        // Wire Header Live Share Link button (opens modal & auto-copies)
        document.getElementById('btn-live-share-header')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.openLiveShareModal();
        });

        // Wire Revoke / Delete Live Link button in modal
        document.getElementById('btn-revoke-live-link')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetNote = this._liveShareModalTargetNote || this.notebook;
            if (targetNote) {
                await this.revokeLiveShareLink(targetNote.id);
            }
        });

        // Wire Delete Live Note button in modal
        document.getElementById('btn-delete-live-note-modal')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetNote = this._liveShareModalTargetNote || this.notebook;
            if (targetNote) {
                await this.deleteLiveNote(targetNote.id, targetNote.title, true);
            }
        });

        // Wire Modal Copy button
        document.getElementById('btn-copy-modal-link')?.addEventListener('click', async () => {
            const input = document.getElementById('live-share-modal-input');
            const btnText = document.getElementById('btn-copy-modal-link-text');
            if (input && input.value) {
                await navigator.clipboard.writeText(input.value);
                if (btnText) btnText.innerText = 'Copied!';
                setTimeout(() => {
                    if (btnText) btnText.innerText = 'Copy Link';
                }, 2500);
                this.showToast('Live link copied to clipboard!');
            }
        });

        // Click on input selects all
        document.getElementById('live-share-modal-input')?.addEventListener('click', (e) => {
            e.target.select();
        });

        // Wire Toggle Shared Notes section accordion
        document.getElementById('toggle-shared-section')?.addEventListener('click', () => {
            const list = document.getElementById('shared-notes-list');
            if (list) list.classList.toggle('hidden');
        });
    }

    setEditorsReadOnly(readOnly) {
        Object.values(this.editors).forEach(editor => {
            if (editor && typeof editor.updateOptions === 'function') {
                editor.updateOptions({ readOnly });
            }
        });
        document.querySelectorAll('#cells-list .cell-title-input').forEach(input => {
            input.readOnly = Boolean(readOnly);
        });
        document.querySelectorAll('#cells-list .cell-lang-select').forEach(sel => {
            sel.disabled = Boolean(readOnly);
        });
    }

    handlePeerTyping(peerId, username) {
        if (!this.activeTypers) this.activeTypers = new Map();

        // Do not show typing indicator for yourself
        if (this.collab && peerId === this.collab.peerId) return;

        const cleanName = (username && username !== 'Anonymous') ? username : 'Collaborator';

        if (this.activeTypers.has(peerId)) {
            clearTimeout(this.activeTypers.get(peerId).timer);
        }

        const timer = setTimeout(() => {
            if (this.activeTypers) {
                this.activeTypers.delete(peerId);
                this.updateTypingIndicatorUI();
            }
        }, 2500);

        this.activeTypers.set(peerId, { username: cleanName, timer });
        this.updateTypingIndicatorUI();
    }

    updateTypingIndicatorUI() {
        const indicatorEl = document.getElementById('note-typing-indicator');
        const textEl = document.getElementById('note-typing-text');
        if (!indicatorEl || !textEl) return;

        if (!this.activeTypers || this.activeTypers.size === 0) {
            indicatorEl.classList.add('hidden');
            indicatorEl.classList.remove('flex');
            textEl.innerText = '';
            return;
        }

        const names = Array.from(this.activeTypers.values()).map(t => t.username);
        let displayText = '';

        if (names.length === 1) {
            displayText = `${names[0]} coding...`;
        } else if (names.length === 2) {
            displayText = `${names[0]} & ${names[1]} coding...`;
        } else {
            displayText = `${names[0]} & ${names.length - 1} others coding...`;
        }

        textEl.innerText = displayText;
        indicatorEl.classList.remove('hidden');
        indicatorEl.classList.add('flex');
    }

    async getLiveShareUrl(noteObj = null) {
        const note = noteObj || this.notebook;
        if (!note || !note.id) return null;

        if (note.shareUrl) return note.shareUrl;

        // If shareUrl is not already present, fetch from server /api/notes/:id/share-code
        try {
            const res = await this.safeFetch(`/api/notes/${note.id}/share-code`, {
                method: 'POST'
            });
            if (res.ok) {
                const data = await res.json();
                if (data.shareUrl) {
                    note.shareUrl = data.shareUrl;
                    if (data.shareCode) note.shareCode = data.shareCode;
                    if (this.notebook && this.notebook.id === note.id) {
                        this.notebook.shareUrl = data.shareUrl;
                        if (data.shareCode) this.notebook.shareCode = data.shareCode;
                    }
                    return data.shareUrl;
                }
            }
        } catch (err) {
            console.warn('[LiveShare] Failed to get shareUrl from server:', err);
        }

        const fallbackCode = note.shareCode || `collab-${note.id.replace('ntbk-', '').replace('live-', '')}`;
        const shareUrl = `${window.location.origin}/note/join/${fallbackCode}`;
        note.shareUrl = shareUrl;
        return shareUrl;
    }

    async openLiveShareModal(noteObj = null) {
        const note = noteObj || this.notebook;
        if (!note || !note.id) return;

        this._liveShareModalTargetNote = note;

        this.openModal('modal-live-share');
        const input = document.getElementById('live-share-modal-input');
        const titleEl = document.getElementById('live-share-modal-title');
        const testLinkBtn = document.getElementById('btn-open-live-guest-view');
        const copyBtnText = document.getElementById('btn-copy-modal-link-text');
        const dangerZone = document.getElementById('live-share-modal-danger-zone');

        const ownerId = note.owner?._id ? String(note.owner._id) : String(note.owner || '');
        const currentUserId = window.CURRENT_USER?.id ? String(window.CURRENT_USER.id) : '';
        const isOwner = Boolean(
            note.isOwner === true ||
            (ownerId && currentUserId && (ownerId === currentUserId))
        );

        if (dangerZone) {
            dangerZone.style.display = isOwner ? 'block' : 'none';
        }

        if (titleEl) {
            titleEl.innerText = note.title || 'Live Coding Session';
        }

        if (input) {
            input.value = 'Generating live link...';
        }
        if (copyBtnText) {
            copyBtnText.innerText = 'Copy Link';
        }

        const shareUrl = await this.getLiveShareUrl(note);

        if (input && shareUrl) {
            input.value = shareUrl;
            input.select();
        }

        if (testLinkBtn && shareUrl) {
            testLinkBtn.href = shareUrl;
        }

        if (shareUrl) {
            try {
                await navigator.clipboard.writeText(shareUrl);
                if (copyBtnText) {
                    copyBtnText.innerText = 'Copied!';
                    setTimeout(() => {
                        if (copyBtnText) copyBtnText.innerText = 'Copy Link';
                    }, 2500);
                }
                this.showToast('Live link copied to clipboard!');
            } catch (_) {}
        }

        if (window.lucide) lucide.createIcons();
    }

    async copyCollabShareLink() {
        const shareUrl = await this.getLiveShareUrl();
        if (!shareUrl) return;

        const btn = document.getElementById('btn-copy-collab-link');
        const textEl = document.getElementById('collab-share-btn-text');

        try {
            await navigator.clipboard.writeText(shareUrl);
            if (btn) btn.classList.add('copied');
            if (textEl) textEl.innerText = 'Copied!';
            this.showToast('Live link copied to clipboard!');

            setTimeout(() => {
                if (btn) btn.classList.remove('copied');
                if (textEl) textEl.innerText = 'Copy Live Link';
            }, 2500);
        } catch (err) {
            // Fallback to opening modal if clipboard permission denied
            await this.openLiveShareModal();
        }
    }

    async revokeLiveShareLink(noteId = null) {
        const id = noteId || this.notebook?.id;
        if (!id) return;

        this.confirmAction(
            'Delete Live Link?',
            'Collaborators will immediately lose access and live editing will be disabled. The note will be kept as a private note.',
            async () => {
                try {
                    const res = await this.safeFetch(`/api/notes/${id}/revoke-share`, { method: 'POST' });
                    if (res.ok) {
                        if (this.notebook && this.notebook.id === id) {
                            this.notebook.isLive = false;
                            this.notebook.shareCode = null;
                            this.notebook.shareUrl = null;
                            if (this.collab) await this.collab.disconnect();
                            const topBar = document.getElementById('collab-top-bar');
                            if (topBar) topBar.classList.add('hidden');
                            const headerBtn = document.getElementById('btn-live-share-header');
                            if (headerBtn) headerBtn.classList.add('hidden');
                        }

                        if (this.db) {
                            const localNote = await this.db.getNote(id);
                            if (localNote) {
                                localNote.isLive = false;
                                localNote.shareCode = null;
                                localNote.shareUrl = null;
                                await this.db.putNote(localNote);
                            }
                        }

                        this.closeModal('modal-live-share');
                        await this.fetchAndRenderLiveNotes();
                        await this.refreshNotebookList();
                        this.showToast('Live link deleted and live session ended.');
                    } else {
                        const errData = await res.json().catch(() => ({}));
                        this.showToast(errData.error || 'Failed to revoke live link', 'error');
                    }
                } catch (e) {
                    console.error('Revoke live link failed:', e);
                    this.showToast('Failed to revoke live link', 'error');
                }
            }
        );
    }

    async deleteLiveNote(id, title = null, isOwner = true) {
        const noteTitle = title || (this.notebook?.id === id ? this.notebook.title : 'Live Session');

        const modalTitle = isOwner ? 'Delete Live Note?' : 'Leave Live Session?';
        const modalDesc = isOwner
            ? `Permanently delete "${noteTitle}" and revoke its live share link for all collaborators?`
            : `Remove "${noteTitle}" from your joined live notes?`;

        this.confirmAction(modalTitle, modalDesc, async () => {
            try {
                const res = await this.safeFetch(`/api/notes/live/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    if (this.db) {
                        await this.db.permanentlyDeleteNote(id);
                    }

                    const isActive = this.notebook && this.notebook.id === id;
                    if (isActive) {
                        if (this.collab) await this.collab.disconnect();
                        const topBar = document.getElementById('collab-top-bar');
                        if (topBar) topBar.classList.add('hidden');
                        const headerBtn = document.getElementById('btn-live-share-header');
                        if (headerBtn) headerBtn.classList.add('hidden');

                        const savedId = localStorage.getItem('zoho-notebook-current-id');
                        if (savedId === id) {
                            localStorage.removeItem('zoho-notebook-current-id');
                        }
                        this.closeModal('modal-live-share');
                        await this.init();
                    } else {
                        this.closeModal('modal-live-share');
                        await this.fetchAndRenderLiveNotes();
                        await this.refreshNotebookList();
                    }

                    this.showToast(isOwner ? 'Live note and link deleted.' : 'Removed from joined live notes.');
                } else {
                    const errData = await res.json().catch(() => ({}));
                    this.showToast(errData.error || 'Failed to delete live note', 'error');
                }
            } catch (e) {
                console.error('Delete live note failed:', e);
                this.showToast('Failed to delete live note', 'error');
            }
        });
    }

    showToast(message, type = 'info') {
        if (window.ZohoOfflineManager && typeof window.ZohoOfflineManager.showToast === 'function') {
            window.ZohoOfflineManager.showToast(message, type);
            return;
        }
        const toast = document.getElementById('toast');
        if (!toast) return;
        const msgEl = document.getElementById('toast-message');
        if (msgEl) msgEl.innerText = message;
        toast.classList.remove('translate-y-24', 'opacity-0');
        setTimeout(() => toast.classList.add('translate-y-24', 'opacity-0'), 3000);
    }

    updateCollabTopBar() {
        const topBar = document.getElementById('collab-top-bar');
        const authorEl = document.getElementById('collab-author-info');
        if (!this.notebook || !this.notebook.id || !this.notebook.isLive) {
            if (topBar) topBar.classList.add('hidden');
            return;
        }

        if (topBar) topBar.classList.remove('hidden');

        if (authorEl) {
            const ownerId = this.notebook.owner?._id ? String(this.notebook.owner._id) : String(this.notebook.owner || '');
            const isHost = Boolean(ownerId && window.CURRENT_USER?.id && (ownerId === String(window.CURRENT_USER.id)));
            const author = this.notebook.authorName || (isHost ? `${window.CURRENT_USER?.username || 'You'} (Host)` : 'Host');
            authorEl.innerText = `Host: @${author}`;
        }
    }

    async startLiveBroadcast() {
        if (!this.broadcaster) return;
        const btn = document.getElementById('btn-start-broadcast');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 16px;"></i> Connecting...`;
            if (window.lucide) lucide.createIcons();
        }

        try {
            const hostName = window.USER_SETTINGS?.username || 'Host';
            const result = await this.broadcaster.startBroadcast(this.notebook, hostName);
            const input = document.getElementById('live-share-link-input');
            if (input) input.value = result.shareUrl;

            // Update modal UI
            this.updateBroadcastModalUI();

            // Highlight live broadcast button in nav header
            const liveNavBtn = document.getElementById('btn-open-live-modal');
            if (liveNavBtn) {
                liveNavBtn.classList.add('bg-rose-500/20', 'text-rose-400', 'border-rose-500/40');
                liveNavBtn.innerHTML = `<i data-lucide="radio" class="w-4 h-4 text-rose-400"></i>`;
                if (window.lucide) lucide.createIcons();
            }
        } catch (err) {
            if (err.message === 'MISSING_CONFIG') {
                const drawer = document.getElementById('firebase-setup-drawer');
                if (drawer) drawer.classList.remove('hidden');
                this.showToast('Firebase configuration not found. Check setup drawer below or .env', 'warning');
            } else {
                this.showToast('Could not start live broadcast: ' + err.message, 'error');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="play" style="width: 16px;"></i> Start Live Broadcast`;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    async stopLiveBroadcast() {
        if (!this.broadcaster) return;
        await this.broadcaster.stopBroadcast();
        this.updateBroadcastModalUI();

        const liveNavBtn = document.getElementById('btn-open-live-modal');
        if (liveNavBtn) {
            liveNavBtn.classList.remove('bg-rose-500/20', 'text-rose-400', 'border-rose-500/40');
            liveNavBtn.innerHTML = `<i data-lucide="radio" class="w-4 h-4"></i>`;
            if (window.lucide) lucide.createIcons();
        }
    }

    updateBroadcastModalUI() {
        const isLive = this.broadcaster && this.broadcaster.isBroadcasting;
        const activeControls = document.getElementById('broadcast-active-controls');
        const inactiveControls = document.getElementById('broadcast-inactive-controls');
        const statusLabel = document.getElementById('broadcast-status-label');

        if (isLive) {
            if (activeControls) activeControls.classList.remove('hidden');
            if (inactiveControls) inactiveControls.classList.add('hidden');
            if (statusLabel) {
                statusLabel.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: #30ff6a; display: inline-block; box-shadow: 0 0 8px #30ff6a;"></span> <span style="color: #30ff6a;">Broadcasting Live</span>`;
            }
        } else {
            if (activeControls) activeControls.classList.add('hidden');
            if (inactiveControls) inactiveControls.classList.remove('hidden');
            if (statusLabel) {
                statusLabel.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: #6b7280; display: inline-block;"></span> <span>Inactive</span>`;
            }
        }

        const cfgInput = document.getElementById('live-firebase-cfg-input');
        if (cfgInput && !cfgInput.value && this.broadcaster) {
            this.broadcaster.getConfig().then(cfg => {
                if (cfg && cfgInput && !cfgInput.value) {
                    cfgInput.value = JSON.stringify(cfg, null, 2);
                }
            });
        }
    }

    setupMobileSidebar() {
        this.toggleMobileSidebar(false);
    }

    toggleMobileSidebar(open) {
        const sidebar = document.getElementById('main-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (open) {
            sidebar.classList.add('sidebar-open');
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.add('opacity-100'), 10);
        } else {
            sidebar.classList.remove('sidebar-open');
            overlay.classList.remove('opacity-100');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        }
    }

    initSplitJS() {
        if (window.innerWidth <= 1024) return;

        // Global debug helper for the user to run in console
        window.debugSplitJS = () => {
            console.log({
                libLoaded: typeof Split !== 'undefined',
                containerWidth: document.getElementById('layout-container')?.offsetWidth,
                sidebarWidth: document.getElementById('main-sidebar')?.offsetWidth,
                contentWidth: document.getElementById('main-content')?.offsetWidth,
                localStorageWidth: localStorage.getItem('zoho-sidebar-width')
            });
            return 'Check layout data above.';
        };

        // Small delay to ensure all dynamic elements and layout are fully settled
        setTimeout(() => {
            if (typeof Split === 'undefined') {
                console.error('[SplitJS] Library not found! Check your internet or CDN link.');
                return;
            }

            const container = document.getElementById('layout-container');
            const sidebar = document.getElementById('main-sidebar');
            const content = document.getElementById('main-content');

            if (!container || !sidebar || !content) {
                console.error('[SplitJS] Elements missing.', { container: !!container, sidebar: !!sidebar, content: !!content });
                return;
            }

            const savedWidth = localStorage.getItem('zoho-sidebar-width');
            const containerWidth = container.offsetWidth;
            let sidebarPercent = 20; // Default to 20% (~380px on 1080p)

            if (savedWidth && containerWidth > 0) {
                sidebarPercent = (parseInt(savedWidth) / containerWidth) * 100;
                // Bound it strictly: 15% minimum, 30% maximum
                sidebarPercent = Math.max(15, Math.min(30, sidebarPercent));
            }

            if (this.splitInstance) {
                this.splitInstance.destroy();
            }

            try {
                // Use more forgiving minimum sizes so the gutter is always draggable,
                // even on smaller laptop widths.
                this.splitInstance = Split(['#main-sidebar', '#main-content'], {
                    sizes: [sidebarPercent, 100 - sidebarPercent],
                    minSize: [200, 400], // sidebar min 200px, content min 400px
                    gutterSize: 2, // Thinner gutter for a cleaner look
                    direction: 'horizontal',
                    cursor: 'col-resize',
                    onDragStart: (sizes) => {
                        console.log('[SplitJS] Drag start', sizes);
                    },
                    onDrag: (sizes) => {
                        // Enforce 30% max width for the sidebar
                        if (sizes[0] > 30) {
                            this.splitInstance.setSizes([30, 70]);
                        }
                    },
                    onDragEnd: (sizes) => {
                        const currentContainerWidth = document.getElementById('layout-container').offsetWidth;
                        const sidebarWidth = (sizes[0] / 100) * currentContainerWidth;
                        localStorage.setItem('zoho-sidebar-width', parseInt(sidebarWidth));
                        console.log('[SplitJS] Saved width:', parseInt(sidebarWidth) + 'px');
                    }
                });
                console.log('[SplitJS] Loaded at ' + sidebarPercent.toFixed(1) + '%');
            } catch (err) {
                console.error('[SplitJS] Init error:', err);
            }

            if (!this.hasSplitResizeListener) {
                window.addEventListener('resize', debounce(() => {
                    if (window.innerWidth <= 1024) {
                        if (this.splitInstance) {
                            this.splitInstance.destroy();
                            this.splitInstance = null;
                        }
                        const sb = document.getElementById('main-sidebar');
                        if (sb) sb.style.width = '';
                    } else if (!this.splitInstance) {
                        this.initSplitJS();
                    }
                }, 200));
                this.hasSplitResizeListener = true;
            }
        }, 200);
    }

    setupTheme() {
        const isLight = localStorage.getItem('theme-light') === 'true';
        this.applyTheme(isLight);
        document.getElementById('theme-switch').checked = isLight;
    }

    applyTheme(isLight) {
        if (isLight) {
            document.body.classList.add('light-theme');
            localStorage.setItem('theme-light', 'true');
        } else {
            document.body.classList.remove('light-theme');
            localStorage.setItem('theme-light', 'false');
        }
    }

    toggleTheme(isLight) {
        this.applyTheme(isLight);
    }

    setupSmartOutput() {
        // Default is false (Log Only) as per user request
        const isSmart = localStorage.getItem('smart-output') === 'true';
        this.smartOutput = isSmart;
        document.getElementById('smart-output-switch').checked = isSmart;
    }

    toggleSmartOutput(isSmart) {
        this.smartOutput = isSmart;
        localStorage.setItem('smart-output', isSmart);
        // We don't necessarily need to re-render everything, 
        // but new executions will respect this.
    }

    openModal(modalId) {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) overlay.classList.remove('hidden');
        document.querySelectorAll('.modal-content').forEach(m => m.classList.add('hidden'));
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('hidden');

        // Auto-focus input if available, else auto-focus primary action button
        const input = modal.querySelector('input:not([type="hidden"]), select, textarea');
        if (input) {
            setTimeout(() => {
                input.focus();
                if (input.select) input.select();
            }, 50);
        } else {
            const primaryBtn = modal.querySelector('#btn-modal-alert-confirm, #btn-modal-input-confirm, .btn-primary:not(.modal-close)');
            if (primaryBtn) {
                setTimeout(() => primaryBtn.focus(), 50);
            }
        }

        // Push state for browser back-button to close modals
        if (!this.modalHistoryPushed) {
            window.history.pushState({ modalOpen: true }, '');
            this.modalHistoryPushed = true;
        }
    }

    closeModal(modalId) {
        if (modalId) {
            const el = document.getElementById(modalId);
            if (el) el.classList.add('hidden');
            const anyVisible = document.querySelector('#modal-overlay .modal-content:not(.hidden)');
            if (!anyVisible) {
                this.closeAllModals();
            }
        } else {
            this.closeAllModals();
        }
    }

    closeAllModals(fromPopState = false) {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) overlay.classList.add('hidden');
        document.querySelectorAll('.modal-content').forEach(m => m.classList.add('hidden'));
        this.currentConfirmCallback = null;
        this.currentInputCallback = null;

        // Clean up history state: if modal is closed manually, pop the state we pushed
        if (this.modalHistoryPushed && !fromPopState) {
            this.modalHistoryPushed = false;
            window.history.back();
        } else {
            this.modalHistoryPushed = false;
        }
    }

    async loadLiveNotes() {
        return this.fetchAndRenderLiveNotes();
    }

    async safeFetch(url, options = {}) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        const method = (options.method || 'GET').toUpperCase();
        const nonMutating = ['GET', 'HEAD', 'OPTIONS'];

        // Enforce JSON acceptance
        options.headers = {
            'Accept': 'application/json',
            ...(options.headers || {})
        };

        if (csrfToken && !nonMutating.includes(method)) {
            options.headers = {
                ...options.headers,
                'X-CSRF-Token': csrfToken
            };
        }

        const response = await window.fetch(url, options);

        // Validation: Verify if response is JSON (not HTML error page)
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('application/json') && response.status >= 400) {
            // If we got HTML but expected JSON for an error, it's likely a redirect or custom error page
            if (response.status === 401) throw new Error('AUTH_EXPIRED');
            if (response.status === 403) throw new Error('CSRF_ERROR');
            throw new Error('Unexpected server response format');
        }

        return response;
    }

    // Modal Helpers
    confirmAction(title, desc, onConfirm) {
        document.getElementById('modal-alert-title').innerText = title;
        document.getElementById('modal-alert-desc').innerText = desc;
        this.currentConfirmCallback = onConfirm;
        this.openModal('modal-alert');
    }

    inputAction(title, desc, defaultValue, onConfirm) {
        document.getElementById('modal-input-title').innerText = title;
        document.getElementById('modal-input-desc').innerText = desc;
        document.getElementById('modal-input-field').value = defaultValue;
        this.currentInputCallback = onConfirm;
        this.openModal('modal-input');
    }

    getPersistedFolders() {
        try {
            return new Set(JSON.parse(localStorage.getItem('zoho-persisted-folders') || '[]'));
        } catch (e) {
            return new Set();
        }
    }

    savePersistedFolders() {
        try {
            localStorage.setItem('zoho-persisted-folders', JSON.stringify([...this.persistedFolders]));
        } catch (e) {
            console.error('Failed to save persisted folders', e);
        }
    }

    addPersistedFolder(folderPath) {
        if (!folderPath || folderPath === 'root') return;
        if (!this.persistedFolders) this.persistedFolders = new Set();
        const parts = folderPath.split('/');
        let current = '';
        parts.forEach(part => {
            current = current ? `${current}/${part}` : part;
            this.persistedFolders.add(current);
        });
        this.savePersistedFolders();
    }

    async createFolder() {
        this.openModal('modal-folder');
    }

    async handleFolderCreate() {
        const folderName = document.getElementById('input-folder-name').value.trim();
        if (!folderName) return;
        this.closeAllModals();
        this.addPersistedFolder(folderName);
        if (this.expandedFolders) {
            this.expandedFolders.add(folderName);
            localStorage.setItem('zoho-expanded-folders', JSON.stringify([...this.expandedFolders]));
        }
        await this.refreshNotebookList();
    }

    async createNewNotebook(folderName = 'root') {
        this.currentPendingFolder = folderName;
        document.getElementById('target-folder-name').innerText = folderName;
        this.openModal('modal-file');
    }

    async handleFileCreate() {
        const title = document.getElementById('input-file-name').value;
        this.closeAllModals();
        this.createNewNotebookInternal(this.currentPendingFolder, title);
    }

    async createNewNotebookInternal(folderName = 'root', title = 'New File') {
        this.disposeEditors();
        const id = `ntbk-${Date.now()}`;
        const cellId = 'cell-' + Math.random().toString(36).substr(2, 9);
        const lang = this.userSettings.defaultLanguage || 'javascript';
        const templates = {
            'c': '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}',
            'cpp': '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}',
            'java': 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
            'typescript': 'let message: string = "Hello, TypeScript!";\nconsole.log(message);'
        };

        const initialCell = {
            id: cellId,
            type: 'code',
            lang: lang,
            title: '',
            isStarred: false,
            content: templates[lang] || '',
            output: null
        };

        this.notebook = {
            id: id,
            title: title || 'Untitled File',
            isStarred: false,
            folder: folderName,
            cells: [initialCell],
            tags: []
        };

        await this.saveToBackend();
        await this.refreshNotebookList();
        await this.loadNotebook(this.notebook.id);
    }


    async refreshNotebookList(fetchRemote = false) {
        try {
            let list = [];
            if (this.db) {
                list = await this.db.getAllNotes();
            }

            // If remote fetch requested, sync manifest/hydrate from Atlas to discover new/updated notes from other devices
            if (fetchRemote && this.sync && typeof this.sync.syncManifest === 'function') {
                try {
                    await this.sync.syncManifest();
                } catch (syncErr) {
                    console.warn('[NotebookApp] Sync manifest deferred:', syncErr);
                }
                if (this.db) list = await this.db.getAllNotes();
            }

            // Fallback to server endpoint if local is still empty
            if (list.length === 0 && fetchRemote) {
                try {
                    const res = await this.safeFetch('/api/notebooks');
                    if (res.ok) {
                        list = await res.json();
                    }
                } catch (fetchErr) {
                    console.warn('[NotebookApp] Server fallback fetch failed:', fetchErr);
                }
            }

            this.allNotebooks = list || [];
            this.filteredNotebooks = list || [];
            this.renderNotebookList(this.allNotebooks);
            this.fetchAndRenderSharedNotes();
            this.fetchAndRenderLiveNotes();
            return this.allNotebooks;
        } catch (e) {
            console.error('Failed to load notebook list', e);
            if (this.db) {
                try {
                    const fallback = await this.db.getAllNotes();
                    if (fallback && fallback.length > 0) {
                        this.allNotebooks = fallback;
                        this.filteredNotebooks = fallback;
                        this.renderNotebookList(fallback);
                        this.fetchAndRenderSharedNotes();
                        this.fetchAndRenderLiveNotes();
                        return fallback;
                    }
                } catch (err) { }
            }
            return this.allNotebooks || [];
        }
    }

    async fetchAndRenderSharedNotes() {
        try {
            const res = await this.safeFetch('/api/notes/shared');
            if (res.ok) {
                const sharedNotes = await res.json();
                this.sharedNotebooks = sharedNotes || [];
                this.renderSharedNotesList(this.sharedNotebooks);
            }
        } catch (e) {
            console.warn('[NotebookApp] Failed to load shared notes:', e);
        }
    }

    renderSharedNotesList(notes) {
        const countEl = document.getElementById('shared-notes-count');
        const listEl = document.getElementById('shared-notes-list');
        if (countEl) countEl.innerText = notes ? notes.length : 0;
        if (!listEl) return;

        listEl.innerHTML = '';
        if (!notes || notes.length === 0) {
            listEl.innerHTML = `
                <div style="font-size: 11px; color: var(--text-dim); padding: 8px 10px; font-style: italic;">
                    No notes shared with you yet.
                </div>
            `;
            return;
        }

        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'tree-item is-file flex items-center justify-between group py-1.5 px-2 rounded-lg cursor-pointer transition-all hover:bg-[var(--card-bg)]';
            const isActive = this.notebook && this.notebook.id === note.id;
            if (isActive) item.classList.add('active');

            item.innerHTML = `
                <div class="flex items-center gap-2 overflow-hidden flex-1">
                    <i data-lucide="file-code" class="tree-icon w-3.5 h-3.5 text-[#00d2ff] flex-shrink-0"></i>
                    <span class="tree-label truncate text-xs text-[var(--text-main)]" title="${note.title}">${note.title || 'Untitled'}</span>
                </div>
                <span class="shared-note-author-tag" title="Created by @${note.authorName}">by @${note.authorName}</span>
            `;

            item.onclick = () => {
                note.isShared = true;
                this.loadNotebook(note.id);
            };

            listEl.appendChild(item);
        });

        if (window.lucide) lucide.createIcons();
    }

    async fetchAndRenderLiveNotes() {
        try {
            const res = await this.safeFetch('/api/notes/live');
            if (res.ok) {
                const data = await res.json();
                this.liveNotebooks = data || { hosted: [], joined: [] };
                this.renderLiveNotesList(this.liveNotebooks);
            }
        } catch (e) {
            console.warn('[NotebookApp] Failed to load live notes:', e);
        }
    }

    renderLiveNotesList(data) {
        const listEl = document.getElementById('live-notes-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        const hosted = (data && data.hosted) || [];
        const joined = (data && data.joined) || [];

        if (hosted.length === 0 && joined.length === 0) {
            listEl.innerHTML = `
                <div style="font-size: 11px; color: var(--text-dim); padding: 6px 10px; font-style: italic;">
                    No live notes yet. Click "+ New Live" to create one!
                </div>
            `;
            return;
        }

        // Render Hosted live notes
        hosted.forEach(note => {
            const item = document.createElement('div');
            item.className = 'live-note-item group flex items-center justify-between gap-1';
            const isActive = this.notebook && this.notebook.id === note.id;
            if (isActive) item.classList.add('active');

            item.innerHTML = `
                <div class="flex items-center gap-2 overflow-hidden flex-1 cursor-pointer">
                    <span class="relative flex h-2 w-2 flex-shrink-0">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                    <span class="truncate text-xs text-[var(--text-main)]" title="${note.title || 'Live Session'}">${note.title || 'Untitled Live'}</span>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    <button class="btn-share-live-item opacity-75 hover:opacity-100 text-rose-400 hover:text-white hover:bg-rose-500/20 p-1 rounded transition-all cursor-pointer" title="Share & Copy Live Link">
                        <i data-lucide="share-2" style="width: 12px; height: 12px;"></i>
                    </button>
                    <button class="btn-delete-live-item opacity-75 hover:opacity-100 text-[#a0a0a5] hover:text-rose-400 hover:bg-rose-500/20 p-1 rounded transition-all cursor-pointer" title="Delete Live Note & Invalidate Link">
                        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                    </button>
                    <span class="live-badge-host">Host</span>
                </div>
            `;

            const shareBtn = item.querySelector('.btn-share-live-item');
            if (shareBtn) {
                shareBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.openLiveShareModal(note);
                };
            }

            const deleteBtn = item.querySelector('.btn-delete-live-item');
            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.deleteLiveNote(note.id, note.title, true);
                };
            }

            item.onclick = () => {
                this.loadNotebook(note.id);
            };

            listEl.appendChild(item);
        });

        // Render Joined live notes
        joined.forEach(note => {
            const item = document.createElement('div');
            item.className = 'live-note-item group flex items-center justify-between gap-1';
            const isActive = this.notebook && this.notebook.id === note.id;
            if (isActive) item.classList.add('active');

            item.innerHTML = `
                <div class="flex items-center gap-2 overflow-hidden flex-1 cursor-pointer">
                    <span class="relative flex h-2 w-2 flex-shrink-0">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                    <span class="truncate text-xs text-[var(--text-main)]" title="${note.title || 'Live Session'}">${note.title || 'Untitled Live'}</span>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    <button class="btn-share-live-item opacity-75 hover:opacity-100 text-rose-400 hover:text-white hover:bg-rose-500/20 p-1 rounded transition-all cursor-pointer" title="Share & Copy Live Link">
                        <i data-lucide="share-2" style="width: 12px; height: 12px;"></i>
                    </button>
                    <button class="btn-delete-live-item opacity-75 hover:opacity-100 text-[#a0a0a5] hover:text-rose-400 hover:bg-rose-500/20 p-1 rounded transition-all cursor-pointer" title="Remove from Joined Notes">
                        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                    </button>
                    <span class="live-badge-guest">@${note.authorName || 'Host'}</span>
                </div>
            `;

            const shareBtn = item.querySelector('.btn-share-live-item');
            if (shareBtn) {
                shareBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.openLiveShareModal(note);
                };
            }

            const deleteBtn = item.querySelector('.btn-delete-live-item');
            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.deleteLiveNote(note.id, note.title, false);
                };
            }

            item.onclick = () => {
                note.isShared = true;
                this.loadNotebook(note.id);
            };

            listEl.appendChild(item);
        });

        if (window.lucide) lucide.createIcons();
    }

    async createLiveNotebook(title = null) {
        if (!title) {
            this.inputAction('Create Live Note', 'Enter a title for this live collaborative session:', 'Live Coding Session', async (chosenTitle) => {
                await this._doCreateLiveNotebook(chosenTitle);
            });
            return;
        }
        return this._doCreateLiveNotebook(title);
    }

    async _doCreateLiveNotebook(noteTitle) {
        try {
            const finalTitle = (noteTitle && noteTitle.trim()) ? noteTitle.trim() : 'Live Coding Session';
            const res = await this.safeFetch('/api/notes/live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: finalTitle,
                    cells: [{
                        id: 'cell-' + Date.now(),
                        type: 'code',
                        lang: this.userSettings?.defaultLanguage || 'javascript',
                        title: 'Live Cell 1',
                        content: '// Welcome to live collaborative coding!\nconsole.log("Hello from live session!");',
                        output: null
                    }]
                })
            });

            if (res.ok) {
                const newLiveNote = await res.json();
                if (this.db) {
                    await this.db.putNote(newLiveNote, { hasFullContent: true });
                }
                await this.fetchAndRenderLiveNotes();
                await this.loadNotebook(newLiveNote.id);
                this.showToast(`Live session "${finalTitle}" created!`);
                // Immediately display the live link share modal
                await this.openLiveShareModal(newLiveNote);
            } else {
                const err = await res.json().catch(() => ({}));
                this.showToast('Failed to create live note: ' + (err.error || 'Server error'), 'error');
            }
        } catch (e) {
            console.error('Failed to create live notebook:', e);
            this.showToast('Could not create live note: ' + e.message, 'error');
        }
    }

    filterNotebooks(query) {
        if (!query) {
            this.renderNotebookList(this.allNotebooks);
            return;
        }

        const lowerQuery = query.toLowerCase();
        const filtered = this.allNotebooks.filter(nb =>
            nb.title.toLowerCase().includes(lowerQuery) ||
            (nb.folder && nb.folder.toLowerCase().includes(lowerQuery))
        );

        this.filteredNotebooks = filtered;
        this.renderNotebookList(filtered);

        // Auto-expand all folders when searching
        if (query) {
            document.querySelectorAll('.tree-children').forEach(el => el.classList.remove('collapsed'));
            document.querySelectorAll('.tree-arrow').forEach(el => el.classList.add('rotated'));
        }
    }

    filterCells(query) {
        const lowerQuery = query.toLowerCase();
        this.notebook.cells.forEach(cell => {
            const cellElem = document.getElementById(`container-${cell.id}`);
            if (cellElem) {
                const titleMatch = (cell.title || '').toLowerCase().includes(lowerQuery);
                const contentMatch = (cell.content || '').toLowerCase().includes(lowerQuery);
                if (titleMatch || contentMatch) {
                    cellElem.classList.remove('hidden');
                } else {
                    cellElem.classList.add('hidden');
                }
            }
        });
    }

    navigateToFirstMatch() {
        if (this.filteredNotebooks.length > 0) {
            // Pick the first file (not folder) if possible
            const firstNote = this.filteredNotebooks.find(nb => nb.id);
            if (firstNote) {
                this.loadNotebook(firstNote.id);
                // Clear search and reset filter
                const searchInput = document.getElementById('notebook-search');
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.blur();
                }
                this.filterNotebooks('');
            }
        }
    }

    renderNotebookList(notebooks) {
        const listContainer = document.getElementById('notebook-list');
        listContainer.innerHTML = '';

        // 1. Build Tree Structure from Paths
        const tree = { name: 'root', type: 'folder', children: {}, files: [] };

        // Ensure all persisted folders are included in tree even if empty
        if (this.persistedFolders) {
            this.persistedFolders.forEach(folderPath => {
                if (!folderPath || folderPath === 'root') return;
                const pathParts = folderPath.split('/');
                let currentLevel = tree;
                let currentPath = '';
                pathParts.forEach(part => {
                    currentPath = currentPath ? `${currentPath}/${part}` : part;
                    if (!currentLevel.children[part]) {
                        currentLevel.children[part] = {
                            name: part,
                            fullPath: currentPath,
                            type: 'folder',
                            children: {},
                            files: []
                        };
                    }
                    currentLevel = currentLevel.children[part];
                });
            });
        }

        notebooks.forEach(nb => {
            let path = nb.folder && nb.folder !== 'root' ? nb.folder.split('/') : [];
            let currentLevel = tree;
            let currentPath = '';

            if (nb.folder && nb.folder !== 'root') {
                this.addPersistedFolder(nb.folder);
            }

            // Navigate/Build path
            path.forEach(part => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                if (!currentLevel.children[part]) {
                    currentLevel.children[part] = {
                        name: part,
                        fullPath: currentPath,
                        type: 'folder',
                        children: {},
                        files: []
                    };
                }
                currentLevel = currentLevel.children[part];
            });

            currentLevel.files.push(nb);
        });

        // 2. Recursive Render Function
        const renderTreeLevel = (node, container, level = 0) => {
            // Render Folders First (Alphabetical)
            Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name)).forEach(child => {
                const folderId = `folder-${Math.random().toString(36).substr(2, 9)}`;
                const currentNoteFolder = this.notebook ? this.notebook.folder : null;
                const isCurrentNoteAncestor = currentNoteFolder && (currentNoteFolder === child.fullPath || currentNoteFolder.startsWith(child.fullPath + '/'));
                const isExpanded = this.expandedFolders.has(child.fullPath) || isCurrentNoteAncestor;

                const item = document.createElement('div');
                item.className = 'tree-branch';
                item.innerHTML = `
                    <div class="tree-item is-folder" data-path="${child.name}" data-full-path="${child.fullPath}">
                        <i data-lucide="chevron-right" class="tree-arrow ${isExpanded ? 'rotated' : ''}"></i>
                        <i data-lucide="folder" class="tree-icon" style="color: #6d5dfc;"></i>
                        <span class="tree-label" title="${child.fullPath}">${child.name}</span>
                        <div class="tree-actions">
                            <button class="tree-action-btn btn-add-file" title="Create File" data-folder="${child.fullPath}">
                                <i data-lucide="plus-square" style="width:12px;"></i>
                            </button>
                            <button class="tree-action-btn btn-rename-folder" title="Rename Folder" data-full-path="${child.fullPath}">
                                <i data-lucide="edit-2" style="width:12px;"></i>
                            </button>
                            <button class="tree-action-btn danger btn-delete-folder" title="Delete Folder" data-full-path="${child.fullPath}">
                                <i data-lucide="trash-2" style="width:12px;"></i>
                            </button>
                        </div>
                    </div>
                    <div class="tree-children ${isExpanded ? '' : 'collapsed'}" id="${folderId}"></div>
                `;
                container.appendChild(item);

                // Recursively render children
                const childrenContainer = item.querySelector('.tree-children');
                renderTreeLevel(child, childrenContainer, level + 1);

                if (child.files.length === 0 && Object.keys(child.children).length === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.className = 'tree-item text-[11px] text-zinc-500 italic pl-6 py-1 select-none pointer-events-none';
                    emptyMsg.textContent = '(Empty folder)';
                    childrenContainer.appendChild(emptyMsg);
                }
            });

            // Render Files (Alphabetical)
            node.files.sort((a, b) => a.title.localeCompare(b.title)).forEach(file => {
                const isActive = file.id === this.notebook.id;
                const fileItem = document.createElement('div');
                fileItem.className = `tree-item is-file ${isActive ? 'active' : ''} notebook-item`; // notebook-item class kept for event delegation
                fileItem.setAttribute('data-id', file.id);
                fileItem.innerHTML = `
                    <div class="tree-arrow invisible"></div> <!-- Spacer -->
                    <i data-lucide="${file.isShared ? 'users' : 'file-code'}" class="tree-icon" style="${file.isShared ? 'color: #ffcc00;' : ''}"></i>
                    <span class="tree-label" title="${file.title}">${file.title}</span>
                    ${!file.isShared ? `
                    <div class="tree-actions">
                        <button class="tree-action-btn move-notebook-btn" title="Move to Folder"><i data-lucide="folder-input" style="width:12px;"></i></button>
                        <button class="tree-action-btn rename-notebook-btn" title="Rename Title"><i data-lucide="edit-2" style="width:12px;"></i></button>
                        <button class="tree-action-btn danger delete-notebook-btn" title="Move to Trash"><i data-lucide="trash-2" style="width:12px;"></i></button>
                    </div>
                    ` : ''}
                `;
                container.appendChild(fileItem);
            });
        };

        // Start Rendering
        const rootContainer = document.createElement('div');
        rootContainer.className = 'tree-root';
        renderTreeLevel(tree, rootContainer);
        listContainer.appendChild(rootContainer);

        lucide.createIcons();
    }



    updateCurrentNotebookItemUI() {
        const activeItem = document.querySelector('.notebook-item.active');
        if (activeItem) {
            const span = activeItem.querySelector('span');
            if (span) span.innerText = this.notebook.title;
        }
    }

    async loadNotebook(id, targetCellId = null) {
        try {
            let data = null;

            if (this.db) {
                data = await this.db.getNote(id);
                // If data is missing locally and we are online, try pulling from cloud
                if ((!data || !data._hasFullContent || !data.cells) && navigator.onLine) {
                    if (this.sync) {
                        data = await this.sync.pullNote(id);
                    }
                }
            }

            if (!data) {
                if (navigator.onLine) {
                    const res = await this.safeFetch(`/api/notebooks/${id}`);
                    if (!res.ok) throw new Error('Not found');
                    data = await res.json();
                    if (this.db) await this.db.putNote(data, { isRemoteSync: true, hasFullContent: true });
                } else {
                    console.warn('[NotebookApp] Note not cached locally for offline viewing');
                    return;
                }
            }

            this.disposeEditors();
            this.notebook = data;

            // Bulletproof guarantee: any note starting with 'live-' IS a live note
            if (this.notebook) {
                const isLiveNote = Boolean(this.notebook.isLive || (id && typeof id === 'string' && id.startsWith('live-')));
                this.notebook.isLive = isLiveNote;
            }

            if (this.activeTypers) {
                this.activeTypers.forEach(t => clearTimeout(t.timer));
                this.activeTypers.clear();
            }
            this.updateTypingIndicatorUI();

            document.getElementById('cells-list').innerHTML = '';
            document.getElementById('notebook-title').value = this.notebook.title || 'Untitled';
            localStorage.setItem('zoho-notebook-current-id', id);

            this.setActiveNotebookUI(id);

            if (!this.notebook.cells || this.notebook.cells.length === 0) {
                this.addCell('code');
            } else {
                this.notebook.cells.forEach((cell, idx) => this.renderCell(cell, idx + 1));
            }

            const topBar = document.getElementById('collab-top-bar');
            const liveHeaderBtn = document.getElementById('btn-live-share-header');
            const offlineOverlay = document.getElementById('collab-host-offline-overlay');

            if (this.notebook && this.notebook.isLive) {
                if (topBar) topBar.classList.remove('hidden');
                if (liveHeaderBtn) liveHeaderBtn.classList.remove('hidden');
                if (this.collab) {
                    const ownerId = this.notebook.owner?._id ? String(this.notebook.owner._id) : String(this.notebook.owner || '');
                    const currentUserId = window.CURRENT_USER?.id ? String(window.CURRENT_USER.id) : '';
                    const isHost = Boolean(
                        this.notebook.isOwner === true ||
                        (ownerId && currentUserId && (ownerId === currentUserId))
                    );
                    await this.collab.connectToNote(id, window.CURRENT_USER, isHost);
                    this.updateCollabTopBar();
                }
            } else {
                if (topBar) topBar.classList.add('hidden');
                if (liveHeaderBtn) liveHeaderBtn.classList.add('hidden');
                if (offlineOverlay) offlineOverlay.classList.add('hidden');
                if (this.collab) {
                    await this.collab.disconnect();
                }
                this.setEditorsReadOnly(false);
            }

            if (targetCellId) {
                setTimeout(() => {
                    const el = document.getElementById(`container-${targetCellId}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.classList.add('cell-highlight');
                        setTimeout(() => el.classList.remove('cell-highlight'), 3000);
                    }
                }, 500);
            }
        } catch (e) {
            console.error('Failed to load notebook', e);
        }
    }

    renderAllCells() {
        this.disposeEditors();
        const container = document.getElementById('cells-list');
        if (container) {
            container.innerHTML = '';
            if (this.notebook && this.notebook.cells && this.notebook.cells.length > 0) {
                this.notebook.cells.forEach((cell, idx) => this.renderCell(cell, idx + 1));
            } else {
                this.addCell('code');
            }
        }
    }

    setActiveNotebookUI(id) {
        let activeEl = null;
        document.querySelectorAll('.notebook-item').forEach(el => {
            el.classList.remove('active');
            if (el.getAttribute('data-id') === id) {
                el.classList.add('active');
                activeEl = el;
            }
        });

        if (activeEl) {
            // Expand all ancestor parent folders up the tree
            let parent = activeEl.parentElement;
            let hasExpandedAny = false;
            while (parent && !parent.classList.contains('tree-root')) {
                if (parent.classList.contains('tree-children')) {
                    parent.classList.remove('collapsed');
                    const folderItem = parent.previousElementSibling;
                    if (folderItem && folderItem.classList.contains('is-folder')) {
                        const arrow = folderItem.querySelector('.tree-arrow');
                        if (arrow) arrow.classList.add('rotated');
                        const pPath = folderItem.getAttribute('data-full-path');
                        if (pPath) {
                            this.expandedFolders.add(pPath);
                            hasExpandedAny = true;
                        }
                    }
                }
                parent = parent.parentElement;
            }
            if (hasExpandedAny) {
                localStorage.setItem('zoho-expanded-folders', JSON.stringify([...this.expandedFolders]));
            }

            // Expand notebook list if collapsed
            const list = document.getElementById('notebook-list');
            if (list && list.classList.contains('collapsed')) {
                list.classList.remove('collapsed');
                const chevron = document.getElementById('chevron-notebooks');
                if (chevron) chevron.classList.remove('collapsed-chevron');
            }

            // Use a slight delay to ensure the DOM is ready for scrolling
            setTimeout(() => {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
        lucide.createIcons();
    }

    disposeEditors() {
        Object.values(this.editors).forEach(editor => editor.dispose());
        this.editors = {};
    }

    async updateDefaultLanguage(lang) {
        this.userSettings.defaultLanguage = lang;
        try {
            await this.safeFetch('/api/user/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ defaultLanguage: lang })
            });
        } catch (err) {
            console.error('Failed to update default language:', err);
        }
    }

    async sendFeedback() {
        const textarea = document.getElementById('feedback-message');
        const message = textarea.value.trim();
        if (!message) return;

        const btn = document.getElementById('btn-send-feedback');
        btn.disabled = true;
        btn.textContent = 'Sending...';

        try {
            await this.safeFetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            textarea.value = '';
            btn.textContent = 'Sent Successfully!';
            setTimeout(() => {
                btn.textContent = 'Send Feedback';
                btn.disabled = false;
            }, 3000);
        } catch (err) {
            console.error('Feedback error:', err);
            btn.textContent = 'Failed to Send';
            btn.disabled = false;
        }
    }



    addCell(type, content = '') {
        if (this.notebook && this.notebook.isLive && this.collab && !this.collab.isHost && !this.collab.hostOnline) {
            this.showToast('Host is currently offline. Adding cells is paused until host reconnects.', 'warning');
            return;
        }

        const cellId = 'cell-' + Math.random().toString(36).substr(2, 9);
        const lang = type === 'code' ? (this.userSettings.defaultLanguage || 'javascript') : 'markdown';

        // Use templates for new cells
        const templates = {
            'c': '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}',
            'cpp': '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}',
            'java': 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
            'typescript': 'let message: string = "Hello, TypeScript!";\nconsole.log(message);'
        };

        const cell = {
            id: cellId,
            type: type,
            lang: lang,
            title: '',
            isStarred: false,
            content: content || (templates[lang] || ''),
            output: null
        };

        this.notebook.cells.push(cell);
        this.renderCell(cell, this.notebook.cells.length);
        this._autoSave();

        if (this.broadcaster && this.broadcaster.isBroadcasting) {
            this.broadcaster.syncNotebookStructure(this.notebook.cells);
            this.broadcaster.syncActiveCell(cell.id);
        }

        if (this.collab && this.collab.isConnected) {
            this.collab.broadcastCellAdded(cell);
        }

        // Auto-scroll to the new cell
        setTimeout(() => {
            const el = document.getElementById(`container-${cell.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    renderCell(cell, index = 1) {
        if (this.editors[cell.id]) {
            try { this.editors[cell.id].dispose(); } catch (_) {}
            delete this.editors[cell.id];
        }

        const container = document.getElementById('cells-list');
        const cellElem = document.createElement('div');
        cellElem.className = 'cell';
        cellElem.id = `container-${cell.id}`;
        // draggable="true" removed from here

        const isMark = cell.type === 'markdown';

        cellElem.innerHTML = `
            <div class="cell-header" draggable="true">
                <div class="drag-handle" title="Drag to Reorder">
                    <i data-lucide="grip-vertical" style="width: 14px;"></i>
                </div>
                <div class="cell-index">${index}</div>
                <div class="reorder-btns">
                    <button class="btn-reorder move-up" title="Move Up"><i data-lucide="chevron-up" style="width:12px;"></i></button>
                    <button class="btn-reorder move-down" title="Move Down"><i data-lucide="chevron-down" style="width:12px;"></i></button>
                </div>
                <input type="text" class="cell-title-input" placeholder="Set note label..." value="${cell.title || ''}">
                ${!isMark ? `
                <select class="cell-lang-select">
                    <option value="javascript" ${cell.lang === 'javascript' ? 'selected' : ''}>JS</option>
                    <option value="typescript" ${cell.lang === 'typescript' ? 'selected' : ''}>TS</option>
                    <option value="python" ${cell.lang === 'python' ? 'selected' : ''}>PY</option>
                    <option value="java" ${cell.lang === 'java' ? 'selected' : ''}>JAVA (JDK 17)</option>
                    <option value="c" ${cell.lang === 'c' ? 'selected' : ''}>C</option>
                    <option value="cpp" ${cell.lang === 'cpp' ? 'selected' : ''}>C++</option>
                </select>
                ` : `<div style="text-align: right; margin-right: 8px; font-size: 9px; opacity: 0.5; flex-shrink: 0;">MARKDOWN</div>`}
                <div class="cell-actions">
                    <button class="btn-icon btn-star-cell" title="Star Note">
                        <i data-lucide="star" ${cell.isStarred ? 'style="fill: #ffcc00; color: #ffcc00;"' : ''}></i>
                    </button>
                    ${!isMark ? `
                    <button class="btn-icon btn-toggle-stdin ${cell.stdin || cell.showStdin ? 'active' : ''}" id="stdin-btn-${cell.id}" title="Toggle Terminal Input (stdin / scanf / cin)">
                        <i data-lucide="terminal" style="width: 14px;"></i>
                    </button>
                    <button class="btn-run" id="run-${cell.id}">Run</button>
                    ` : ''}
                    <button class="btn-icon delete-cell" title="Delete Note"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
            <div class="editor-container" id="editor-${cell.id}"></div>
            ${!isMark ? `
            <div class="cell-stdin-container ${cell.stdin || cell.showStdin ? '' : 'hidden'}" id="stdin-container-${cell.id}">
                <div class="stdin-header">
                    <span class="stdin-label"><i data-lucide="terminal" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: -1px;"></i> Terminal Input (stdin / scanf / cin)</span>
                    <span class="stdin-hint">Values passed to standard input</span>
                </div>
                <textarea class="cell-stdin-input" id="stdin-input-${cell.id}" placeholder="Enter input values for scanf / cin / input() (e.g. 10 20)...">${cell.stdin || ''}</textarea>
            </div>
            ` : ''}
            ${isMark ? `<div class="markdown-preview hidden" id="preview-${cell.id}"></div>` : ''}
            <div class="output-container ${cell.output ? '' : 'hidden'}" id="output-${cell.id}"></div>
        `;

        container.appendChild(cellElem);
        lucide.createIcons();

        if (cell.output) this.displayOutput(cell.id, cell.output, cell.lastRunBy);

        require(['vs/editor/editor.main'], () => {
            // Global Monaco Configuration (Only once)
            if (!this._monacoConfigured) {
                // Define VS Code Dark+ Theme
                monaco.editor.defineTheme('vs-dark-plus', {
                    base: 'vs-dark',
                    inherit: true,
                    rules: [
                        { token: 'variable', foreground: '9CDCFE' },
                        { token: 'variable.predefined', foreground: '9CDCFE' },
                        { token: 'variable.parameter', foreground: '9CDCFE' },
                        { token: 'function', foreground: 'DCDCAA' },
                        { token: 'method', foreground: 'DCDCAA' },
                        { token: 'property', foreground: 'DCDCAA' },
                        { token: 'identifier', foreground: '9CDCFE' },
                        { token: 'type', foreground: '4EC9B0' },
                        { token: 'keyword', foreground: 'C586C0' },
                        { token: 'string', foreground: 'CE9178' },
                        { token: 'number', foreground: 'B5CEA8' },
                        { token: 'comment', foreground: '6A9955' }
                    ],
                    colors: {
                        'editor.background': '#1e1e1e',
                        'editor.foreground': '#D4D4D4',
                        'editorLineNumber.foreground': '#858585',
                        'editorCursor.foreground': '#AEAFAD',
                        'editor.selectionBackground': '#264F78',
                        'editor.inactiveSelectionBackground': '#3A3D41'
                    }
                });

                monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: true, // Disable semantic validation to remove buggy "unused" dots
                    noSyntaxValidation: false
                });
                monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
                    target: monaco.languages.typescript.ScriptTarget.ESNext,
                    allowNonTsExtensions: true,
                    checkJs: false, // Disable strict JS checking for parameters
                    noUnusedLocals: false,
                    noUnusedParameters: false
                });
                monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: false,
                    noSyntaxValidation: false
                });
                // Treat each TS cell as an isolated module so variables
                // declared in one note don't clash with another note.
                monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                    target: monaco.languages.typescript.ScriptTarget.ESNext,
                    allowNonTsExtensions: true,
                    moduleDetection: 3, // Force — every file is its own module
                    isolatedModules: true,
                    strict: false,
                    noUnusedLocals: false,
                    noUnusedParameters: false
                });
                this._monacoConfigured = true;
            }

            const lang = isMark ? 'markdown' : (cell.lang === 'cpp' ? 'cpp' : (cell.lang === 'c' ? 'c' : (cell.lang === 'python' ? 'python' : (cell.lang === 'java' ? 'java' : (cell.lang === 'typescript' ? 'typescript' : 'javascript')))));
            const ext = lang === 'javascript' ? 'js' : (lang === 'typescript' ? 'ts' : lang);
            const editorContainer = document.getElementById(`editor-${cell.id}`);
            if (!editorContainer || !document.body.contains(editorContainer)) {
                return; // Container was detached or removed from DOM
            }

            // If an editor or elements are already mounted in this container, cleanly clear them
            if (editorContainer.children.length > 0) {
                if (this.editors[cell.id]) {
                    try { this.editors[cell.id].dispose(); } catch (_) {}
                    delete this.editors[cell.id];
                }
                editorContainer.innerHTML = '';
            }

            const modelUri = monaco.Uri.parse(`file:///${cell.id}.${ext}`);
            let model = monaco.editor.getModel(modelUri);
            if (!model || model.isDisposed()) {
                model = monaco.editor.createModel(cell.content || '', lang, modelUri);
            } else {
                if (typeof model.getLanguageId === 'function' && model.getLanguageId() !== lang) {
                    monaco.editor.setModelLanguage(model, lang);
                }
                if (model.getValue() !== (cell.content || '')) {
                    model.setValue(cell.content || '');
                }
            }

            const editor = monaco.editor.create(editorContainer, {
                model: model,
                theme: 'vs-dark-plus',
                automaticLayout: true,
                minimap: { enabled: false },
                readOnly: !!(this.notebook && this.notebook.isLive && this.collab && !this.collab.isHost && !this.collab.hostOnline),
                scrollBeyondLastLine: false,
                fontSize: 14,
                lineNumbers: isMark ? 'off' : 'on',
                renderLineHighlight: 'all',
                padding: { top: 16, bottom: 10 },
                scrollbar: {
                    vertical: 'hidden',
                    horizontal: 'auto',
                    handleMouseWheel: false,
                    alwaysConsumeMouseWheel: false
                },
                wordWrap: 'on',
                wrappingStrategy: 'advanced',
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,

                // --- Study Mode Settings (Disabled Distractions) ---
                hover: { enabled: lang === 'typescript' },           // Disables the "big paragraph" on mouse hover except for TS
                suggest: { showDetails: false },     // Hides the side-panel in auto-complete
                parameterHints: { enabled: lang === 'typescript' },  // Disables hints while typing inside () except for TS

                quickSuggestions: {
                    other: true,
                    comments: true,
                    strings: true
                },
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: 'on',
                snippetSuggestions: 'top',
                wordBasedSuggestions: true,

                // Advanced Visuals & UX
                semanticHighlighting: { enabled: true },
                'bracketPairColorization.enabled': true,
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'always',
                autoClosingDelete: 'always',
                formatOnPaste: true,
                formatOnType: true,
                suggest: {
                    snippetsPreventQuickSuggestions: false,
                    showDetails: false // Duplicate safety for suggestion details
                },
                unicodeHighlight: {
                    ambiguousCharacters: false,
                    invisibleCharacters: false,
                }
            });

            this.editors[cell.id] = editor;

            // Keyboard Shortcut: Ctrl + Enter to run code
            if (!isMark) {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                    this.runCell(cell.id);
                });
            }

            const updateHeight = () => {
                const contentHeight = editor.getContentHeight();
                const options = editor.getOptions();
                const lineHeight = options.get(monaco.editor.EditorOption.lineHeight);
                const minHeight = (lineHeight * 5) + 26; // 16px top + 10px bottom padding
                const finalHeight = Math.max(contentHeight, minHeight);

                const editorDiv = document.getElementById(`editor-${cell.id}`);
                if (editorDiv) {
                    editorDiv.style.height = `${finalHeight}px`;
                    editor.layout();
                }
            };

            editor.onDidContentSizeChange(() => {
                updateHeight();
            });

            updateHeight();
            setTimeout(updateHeight, 50);

            editor.onDidChangeModelContent((event) => {
                const currentCell = this.notebook.cells.find(c => c.id === cell.id);
                if (currentCell) currentCell.content = editor.getValue();
                if (this.sync && typeof this.sync.recordUserActivity === 'function') {
                    this.sync.recordUserActivity();
                }
                if (this.broadcaster && this.broadcaster.isBroadcasting) {
                    this.broadcaster.syncCellContent(cell.id, editor.getValue(), cell.lang, cell.type);
                }
                if (this.collab && this.collab.isConnected && !this.collab.suppressLocalEdits) {
                    if (event && event.changes && event.changes.length > 0) {
                        this.collab.broadcastEdit(cell.id, event.changes, editor.getValue());
                        this.collab.broadcastTyping(cell.id);
                    }
                }
                this._autoSave();
            });

            editor.onDidChangeCursorPosition((e) => {
                if (this.collab && this.collab.isConnected) {
                    this.collab.broadcastCursor(cell.id, e.position, editor.getSelection());
                }
            });

            editor.onDidFocusEditorWidget(() => {
                if (this.broadcaster && this.broadcaster.isBroadcasting) {
                    this.broadcaster.syncActiveCell(cell.id);
                }
                if (this.collab && this.collab.isConnected) {
                    this.collab.broadcastCursor(cell.id, editor.getPosition(), editor.getSelection());
                }
            });

            if (isMark) {
                const preview = document.getElementById(`preview-${cell.id}`);
                const updatePreview = () => {
                    preview.innerHTML = marked.parse(editor.getValue());
                };

                editor.onDidBlurEditorWidget(() => {
                    if (editor.getValue().trim()) {
                        document.getElementById(`editor-${cell.id}`).classList.add('hidden');
                        preview.classList.remove('hidden');
                        updatePreview();
                    }
                });

                preview.onclick = () => {
                    preview.classList.add('hidden');
                    document.getElementById(`editor-${cell.id}`).classList.remove('hidden');
                    editor.focus();
                };

                if (cell.content) {
                    document.getElementById(`editor-${cell.id}`).classList.add('hidden');
                    preview.classList.remove('hidden');
                    updatePreview();
                }
            } else {
                // Language selection handling for code cells
                const langSelect = cellElem.querySelector('.cell-lang-select');
                if (langSelect) {
                    langSelect.addEventListener('change', (e) => {
                        const newLang = e.target.value;
                        cell.lang = newLang;

                        // Default templates for all languages
                        const templates = {
                            'javascript': 'console.log("Hello, World!");',
                            'typescript': 'let message: string = "Hello, TypeScript!";\nconsole.log(message);',
                            'python': 'print("Hello, Python!")',
                            'c': '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}',
                            'cpp': '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}',
                            'java': 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}'
                        };

                        // Map to Monaco Language identifier
                        let monacoLang = 'javascript';
                        if (newLang === 'python') { monacoLang = 'python'; }
                        else if (newLang === 'java') { monacoLang = 'java'; }
                        else if (newLang === 'c') { monacoLang = 'c'; }
                        else if (newLang === 'cpp') { monacoLang = 'cpp'; }
                        else if (newLang === 'typescript') { monacoLang = 'typescript'; }

                        const currentModel = editor.getModel();
                        if (currentModel) {
                            monaco.editor.setModelLanguage(currentModel, monacoLang);
                        }

                        const currentVal = editor.getValue().trim();
                        const isDefaultTemplate = Object.values(templates).some(t => t.trim() === currentVal) || currentVal === '' || currentVal === 'console.log("Hello, World!");';

                        if (isDefaultTemplate && templates[newLang]) {
                            editor.setValue(templates[newLang]);
                        }

                        editor.updateOptions({
                            hover: { enabled: newLang === 'typescript' },
                            parameterHints: { enabled: newLang === 'typescript' }
                        });

                        const currentCell = this.notebook.cells.find(c => c.id === cell.id);
                        if (currentCell) {
                            currentCell.lang = newLang;
                            currentCell.content = editor.getValue();
                        }

                        if (this.collab && this.collab.isConnected) {
                            this.collab.broadcastCellLang(cell.id, newLang);
                        }

                        this._autoSave();
                    });
                }

                // Terminal Input (stdin) Toggle and Input Listeners
                const stdinBtn = cellElem.querySelector(`#stdin-btn-${cell.id}`);
                const stdinContainer = cellElem.querySelector(`#stdin-container-${cell.id}`);
                const stdinInput = cellElem.querySelector(`#stdin-input-${cell.id}`);

                if (stdinBtn && stdinContainer) {
                    stdinBtn.onclick = () => {
                        const isHidden = stdinContainer.classList.toggle('hidden');
                        stdinBtn.classList.toggle('active', !isHidden);
                        cell.showStdin = !isHidden;
                        if (!isHidden && stdinInput) stdinInput.focus();
                        this._autoSave();
                    };
                }

                if (stdinInput) {
                    stdinInput.oninput = (e) => {
                        cell.stdin = e.target.value;
                        if (stdinBtn) stdinBtn.classList.toggle('active', !!e.target.value.trim());
                        this._autoSave();
                    };
                }
            }
        });
    }

    async runCell(cellId) {
        if (this.notebook && this.notebook.isLive && this.collab && !this.collab.isHost && !this.collab.hostOnline) {
            this.showToast('Host is currently offline. Code execution is paused until host reconnects.', 'warning');
            return;
        }

        const cell = this.notebook.cells.find(c => c.id === cellId);
        if (!cell || cell.type !== 'code') return;
        const editor = this.editors[cellId];
        const code = editor.getValue();
        const lang = cell.lang || 'javascript';
        const runBtn = document.getElementById(`run-${cellId}`);
        if (runBtn) {
            runBtn.innerText = 'Running...';
            runBtn.disabled = true;
        }

        const currentUsername = (this.collab?.currentUser?.username && this.collab.currentUser.username !== 'Anonymous')
            ? this.collab.currentUser.username
            : (this.userSettings?.username || window.CURRENT_USER?.username || 'You');
        const displayRunner = currentUsername === 'You' ? 'You' : currentUsername;
        cell.lastRunBy = displayRunner;

        const outputDiv = document.getElementById(`output-${cellId}`);
        if (outputDiv) {
            outputDiv.innerHTML = `
                <div class="output-header flex items-center justify-between" style="font-size: 10px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <span class="output-label" style="color: var(--text-dim); text-transform: uppercase; font-weight: bold; opacity: 0.7;">OUTPUT:</span>
                    <span class="output-runner-badge flex items-center gap-1.5" style="color: var(--text-dim); font-size: 10px;">
                        <span class="w-1.5 h-1.5 rounded-full bg-[#30ff6a] animate-pulse inline-block"></span>
                        <span>Running by <strong style="color: var(--text-main); font-weight: 600;">${displayRunner}</strong>...</span>
                    </span>
                </div>
            `;
            outputDiv.classList.remove('hidden');
        }

        this.currentRunningCellId = cellId;

        if (this.broadcaster && this.broadcaster.isBroadcasting) {
            this.broadcaster.syncActiveCell(cellId);
            this.broadcaster.syncCellStatus(cellId, 'running');
        }

        if (this.collab && this.collab.isConnected) {
            this.collab.broadcastExecutionStart(cellId, currentUsername);
        }

        const activeEngine = this.engine || window.ZohoBrowserEngine;

        // ── Interactive Terminal Mode ──
        // Activates only for server-executed languages with stdin-reading code
        if (activeEngine && activeEngine.needsInteractiveTerminal && activeEngine.needsInteractiveTerminal(code, lang)) {
            this._runInteractiveTerminal(cellId, code, lang, activeEngine, outputDiv, runBtn, displayRunner);
            return;
        }

        // ── Batch Execution Mode (existing behavior, unchanged) ──
        // Retrieve stdin input from cell or textarea
        const stdinInputElem = document.getElementById(`stdin-input-${cellId}`);
        const stdin = cell.stdin !== undefined ? cell.stdin : (stdinInputElem ? stdinInputElem.value : '');

        try {
            let data;
            if (activeEngine) {
                // Execute via Polyglot Browser Engine (Local JS/TS/Python WASM, Cloud for C/C++/Java with stdin)
                data = await activeEngine.execute(code, lang, { stdin });
            } else {
                // Fallback to direct server execution
                const response = await this.safeFetch('/api/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, lang, stdin })
                });
                data = await response.json();
            }

            cell.output = data;
            this.displayOutput(cellId, data, displayRunner);
            if (this.broadcaster && this.broadcaster.isBroadcasting) {
                this.broadcaster.syncCellOutput(cellId, data, data && data.success ? 'idle' : 'error');
            }
            if (this.collab && this.collab.isConnected) {
                this.collab.broadcastExecutionComplete(cellId, data, data && data.success, currentUsername);
            }
            this._autoSave();
        } catch (err) {
            let userMsg = err.message;
            if (err.message === 'AUTH_EXPIRED') userMsg = 'Session expired. Please login again.';
            if (err.message === 'CSRF_ERROR') userMsg = 'Security validation failed. Please refresh the page.';

            this.displayOutput(cellId, { success: false, error: userMsg }, displayRunner);
            if (this.broadcaster && this.broadcaster.isBroadcasting) {
                this.broadcaster.syncCellOutput(cellId, { success: false, error: userMsg }, 'error');
            }
            if (this.collab && this.collab.isConnected) {
                this.collab.broadcastExecutionComplete(cellId, { success: false, error: userMsg }, false, currentUsername);
            }
        } finally {
            if (runBtn) {
                runBtn.innerText = 'Run';
                runBtn.disabled = false;
            }
            // Clear running cell ID immediately so background logs never leak into cell output
            if (this.currentRunningCellId === cellId) {
                this.currentRunningCellId = null;
            }
        }
    }

    /**
     * Render a live interactive terminal in the output area.
     * Streams stdout/stderr in real-time and accepts stdin line-by-line via WebSocket.
     */
    _runInteractiveTerminal(cellId, code, lang, engine, outputDiv, runBtn, runnerName = null) {
        if (!outputDiv) return;

        const cell = this.notebook?.cells?.find(c => c.id === cellId);
        const finalRunner = runnerName || (cell && cell.lastRunBy) || null;

        // Build interactive terminal UI
        outputDiv.innerHTML = `
            <div class="interactive-terminal" id="terminal-${cellId}">
                <div class="terminal-header flex items-center justify-between" style="font-size: 10px;">
                    <div class="flex items-center gap-2">
                        <span class="terminal-title"><i data-lucide="terminal" style="width:12px;height:12px;margin-right:5px;vertical-align:-2px;"></i> Interactive Terminal</span>
                        <span class="terminal-status" id="terminal-status-${cellId}">Connecting...</span>
                    </div>
                    <div class="flex items-center gap-2">
                        ${finalRunner ? `
                        <span class="output-runner-badge flex items-center gap-1.5" style="color: var(--text-dim); font-size: 10px;">
                            <span class="w-1.5 h-1.5 rounded-full bg-[#30ff6a] inline-block"></span>
                            <span>Ran by <strong style="color: var(--text-main); font-weight: 600;">${finalRunner}</strong></span>
                        </span>` : ''}
                        <button class="terminal-kill-btn" id="terminal-kill-${cellId}" title="Kill Process">
                            <i data-lucide="square" style="width:12px;height:12px;"></i>
                        </button>
                    </div>
                </div>
                <div class="terminal-output" id="terminal-output-${cellId}"></div>
                <div class="terminal-input-line" id="terminal-input-line-${cellId}">
                    <span class="terminal-prompt">❯</span>
                    <input type="text" class="terminal-input" id="terminal-input-${cellId}" placeholder="Type input and press Enter..." autocomplete="off" spellcheck="false" />
                </div>
            </div>
        `;
        outputDiv.classList.remove('hidden');

        // Re-render Lucide icons
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const termOutput = document.getElementById(`terminal-output-${cellId}`);
        const termInput = document.getElementById(`terminal-input-${cellId}`);
        const termInputLine = document.getElementById(`terminal-input-line-${cellId}`);
        const termStatus = document.getElementById(`terminal-status-${cellId}`);
        const termKill = document.getElementById(`terminal-kill-${cellId}`);

        let isFinished = false;
        const collectedLogs = [];

        if (this.broadcaster && this.broadcaster.isBroadcasting) {
            this.broadcaster.syncActiveCell(cellId);
            this.broadcaster.syncCellStatus(cellId, 'running');
            this.broadcaster.clearTerminalStream(cellId);
        }

        // Helper: append text to terminal output
        const appendOutput = (text, className = 'terminal-stdout') => {
            const span = document.createElement('span');
            span.className = className;
            span.textContent = text;
            termOutput.appendChild(span);
            termOutput.scrollTop = termOutput.scrollHeight;
        };

        // Start interactive execution via WebSocket
        const handle = engine.executeInteractive(code, lang, {
            onStatus: (statusText) => {
                if (termStatus) termStatus.textContent = statusText;
            },

            onStdout: (data) => {
                appendOutput(data, 'terminal-stdout');
                collectedLogs.push(data);
                if (this.broadcaster && this.broadcaster.isBroadcasting) {
                    this.broadcaster.streamTerminalChunk(cellId, data);
                }
                if (this.collab && this.collab.isConnected) {
                    this.collab.broadcastLogChunk(cellId, data);
                }
                if (termInput && !isFinished) termInput.focus();
            },

            onStderr: (data) => {
                appendOutput(data, 'terminal-stderr');
                collectedLogs.push(`STDERR: ${data}`);
                if (this.broadcaster && this.broadcaster.isBroadcasting) {
                    this.broadcaster.streamTerminalChunk(cellId, `[STDERR] ${data}`);
                }
                if (this.collab && this.collab.isConnected) {
                    this.collab.broadcastLogChunk(cellId, `\n[STDERR] ${data}`);
                }
            },

            onExit: (exitCode) => {
                isFinished = true;
                const exitClass = exitCode === 0 ? 'terminal-exit-success' : 'terminal-exit-error';
                const exitSpan = document.createElement('div');
                exitSpan.className = `terminal-exit-line ${exitClass}`;
                exitSpan.textContent = `\n[Process exited with code ${exitCode}]`;
                termOutput.appendChild(exitSpan);
                termOutput.scrollTop = termOutput.scrollHeight;

                if (termStatus) {
                    termStatus.textContent = exitCode === 0 ? 'Exited (0)' : `Exited (${exitCode})`;
                    termStatus.classList.add(exitCode === 0 ? 'status-success' : 'status-error');
                }
                if (termInputLine) termInputLine.classList.add('terminal-disabled');
                if (termInput) {
                    termInput.disabled = true;
                    termInput.placeholder = 'Process has ended';
                }

                // Save output to cell for persistence
                const cell = this.notebook.cells.find(c => c.id === cellId);
                if (cell) {
                    cell.output = {
                        success: exitCode === 0,
                        logs: collectedLogs.join('').split('\n').filter(l => l),
                        error: exitCode !== 0 ? `Process exited with code ${exitCode}` : null,
                        interactive: true
                    };
                    this._autoSave();
                }

                if (this.broadcaster && this.broadcaster.isBroadcasting) {
                    this.broadcaster.syncCellOutput(cellId, {
                        success: exitCode === 0,
                        stdout: collectedLogs.join(''),
                        stderr: exitCode !== 0 ? `Process exited with code ${exitCode}` : ''
                    }, exitCode === 0 ? 'idle' : 'error');
                }
                if (this.collab && this.collab.isConnected) {
                    this.collab.broadcastExecutionComplete(cellId, cell ? cell.output : null, exitCode === 0, finalRunner);
                }

                // Reset run button
                if (runBtn) {
                    runBtn.innerText = 'Run';
                    runBtn.disabled = false;
                }
                if (this.currentRunningCellId === cellId) this.currentRunningCellId = null;
            },

            onError: (errMsg) => {
                isFinished = true;
                appendOutput(`\n[Error: ${errMsg}]`, 'terminal-stderr');

                if (termStatus) {
                    termStatus.textContent = 'Error';
                    termStatus.classList.add('status-error');
                }
                if (termInputLine) termInputLine.classList.add('terminal-disabled');
                if (termInput) {
                    termInput.disabled = true;
                    termInput.placeholder = 'Process has ended';
                }

                // Save error output
                const cell = this.notebook.cells.find(c => c.id === cellId);
                if (cell) {
                    cell.output = { success: false, logs: [], error: errMsg, interactive: true };
                    this._autoSave();
                }

                if (this.collab && this.collab.isConnected) {
                    this.collab.broadcastExecutionComplete(cellId, { success: false, error: errMsg }, false);
                }

                if (runBtn) {
                    runBtn.innerText = 'Run';
                    runBtn.disabled = false;
                }
                if (this.currentRunningCellId === cellId) this.currentRunningCellId = null;
            }
        });

        // Handle stdin input
        if (termInput) {
            termInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !isFinished) {
                    e.preventDefault();
                    const inputValue = termInput.value;
                    // Echo the input in the terminal
                    appendOutput(inputValue + '\n', 'terminal-stdin-echo');
                    collectedLogs.push(inputValue + '\n');
                    handle.sendStdin(inputValue);
                    termInput.value = '';
                }
            });
            termInput.focus();
        }

        // Kill button
        if (termKill) {
            termKill.onclick = () => {
                handle.kill();
            };
        }
    }

    moveCell(cellId, direction) {
        const index = this.notebook.cells.findIndex(c => c.id === cellId);
        if (index === -1) return;
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.notebook.cells.length) return;

        const currentElem = document.getElementById(`container-${cellId}`);
        if (currentElem) {
            if (direction === -1) {
                const prevElem = currentElem.previousElementSibling;
                if (prevElem) {
                    prevElem.before(currentElem);
                }
            } else if (direction === 1) {
                const nextElem = currentElem.nextElementSibling;
                if (nextElem) {
                    nextElem.after(currentElem);
                }
            }
        }

        const temp = this.notebook.cells[index];
        this.notebook.cells[index] = this.notebook.cells[newIndex];
        this.notebook.cells[newIndex] = temp;

        this.updateCellIndices();

        if (currentElem) {
            currentElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        this._autoSave();
        if (this.broadcaster && this.broadcaster.isBroadcasting) {
            this.broadcaster.syncNotebookStructure(this.notebook.cells);
        }
        if (this.collab && this.collab.isConnected) {
            this.collab.broadcastCellReorder(this.notebook.cells.map(c => c.id));
        }
    }

    updateCellIndices() {
        const cellElems = document.querySelectorAll('#cells-list .cell');
        cellElems.forEach((cellElem, idx) => {
            const indexElem = cellElem.querySelector('.cell-index');
            if (indexElem) {
                indexElem.textContent = idx + 1;
            }
        });
    }

    async runAll() {
        for (const cell of this.notebook.cells) {
            if (cell.type === 'code') await this.runCell(cell.id);
        }
    }

    clearAllOutputs() {
        this.notebook.cells.forEach(cell => {
            cell.output = null;
            const outputDiv = document.getElementById(`output-${cell.id}`);
            if (outputDiv) {
                outputDiv.innerHTML = '';
                outputDiv.classList.add('hidden');
            }
        });
        this._autoSave();
    }

    async copyAllCells() {
        if (!this.notebook.cells || this.notebook.cells.length === 0) return;

        const langLabels = {
            javascript: 'JS', typescript: 'TS', python: 'PY',
            java: 'JAVA', c: 'C', cpp: 'C++', markdown: 'MD'
        };

        const divider = '// ═══════════════════════════════════════';

        const blocks = this.notebook.cells.map(cell => {
            const title = cell.title || 'Untitled Note';
            const lang = langLabels[cell.lang] || cell.lang?.toUpperCase() || 'CODE';
            const content = this.editors[cell.id]
                ? this.editors[cell.id].getValue()
                : (cell.content || '');

            return `${divider}\n// Note: ${title}    [${lang}]\n${divider}\n\n${content}`;
        });

        const fullText = blocks.join('\n\n');

        try {
            await navigator.clipboard.writeText(fullText);
            // Brief visual feedback on the button
            const btn = document.getElementById('copy-all-cells');
            btn.style.background = '#30ff6a';
            btn.style.borderColor = '#30ff6a';
            btn.style.color = '#fff';
            btn.title = 'Copied!';
            setTimeout(() => {
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.style.color = '';
                btn.title = 'Copy All Notes';
            }, 1500);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    }

    displayOutput(cellId, data, runnerName = null) {
        const outputDiv = document.getElementById(`output-${cellId}`);
        if (!outputDiv) return;
        outputDiv.classList.remove('hidden');

        const cell = this.notebook?.cells?.find(c => c.id === cellId);
        const finalRunner = runnerName || (cell && cell.lastRunBy) || null;

        outputDiv.innerHTML = `
            <div class="output-header flex items-center justify-between" style="font-size: 10px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                <span class="output-label" style="color: var(--text-dim); text-transform: uppercase; font-weight: bold; opacity: 0.7;">OUTPUT:</span>
                ${finalRunner ? `
                <span class="output-runner-badge flex items-center gap-1.5" style="color: var(--text-dim); font-size: 10px;">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#30ff6a] inline-block"></span>
                    <span>Ran by <strong style="color: var(--text-main); font-weight: 600;">${finalRunner}</strong></span>
                </span>
                ` : ''}
            </div>
        `;

        const displayedLogs = new Set();

        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(log => {
                const logElem = document.createElement('div');
                logElem.className = 'output-log';
                logElem.textContent = log;
                outputDiv.appendChild(logElem);
                displayedLogs.add(log.trim());
            });
        }

        if (data.success) {
            if (this.smartOutput && data.result !== 'undefined' && data.result !== null) {
                const resultText = String(data.result).trim();
                // Avoid duplicating if it's already in logs
                if (!displayedLogs.has(resultText)) {
                    const resElem = document.createElement('div');
                    resElem.className = 'output-log';
                    resElem.textContent = data.result;
                    outputDiv.appendChild(resElem);
                }
            } else if (!this.smartOutput && (!data.logs || data.logs.length === 0)) {
                const infoElem = document.createElement('div');
                infoElem.className = 'output-log';
                infoElem.style.opacity = '0.5';
                infoElem.style.fontStyle = 'italic';
                infoElem.textContent = 'Program did not output anything!';
                outputDiv.appendChild(infoElem);
            }
        } else {
            const errorText = String(data.error).trim();
            // Avoid duplicating if the error was already captured in logs (via console.log(e))
            let alreadyShown = false;
            displayedLogs.forEach(log => {
                const logLower = log.toLowerCase();
                const errLower = errorText.toLowerCase();
                // Check if the error text is contained within any log (partial match for stacks)
                // or if the log contains the core message
                if (logLower.includes(errLower) || errLower.includes(logLower)) {
                    alreadyShown = true;
                }
            });

            if (!alreadyShown) {
                const errElem = document.createElement('div');
                errElem.className = 'output-error';
                errElem.textContent = data.error;
                outputDiv.appendChild(errElem);
            }
        }
    }

    toggleCellStar(cellId) {
        const cell = this.notebook.cells.find(c => c.id === cellId);
        if (cell) {
            cell.isStarred = !cell.isStarred;
            const btn = document.querySelector(`#container-${cellId} .btn-star-cell i`);
            if (btn) {
                if (cell.isStarred) {
                    btn.style.fill = '#ffcc00';
                    btn.style.color = '#ffcc00';
                } else {
                    btn.style.fill = 'none';
                    btn.style.color = 'var(--text-dim)';
                }
            }
            if (this.collab && this.collab.isConnected) {
                this.collab.broadcastCellStar(cellId, cell.isStarred);
            }
            this.saveToBackend();
        }
    }

    async deleteCell(cellId) {
        if (this.notebook && this.notebook.isLive && this.collab && !this.collab.isHost && !this.collab.hostOnline) {
            this.showToast('Host is currently offline. Deleting cells is paused until host reconnects.', 'warning');
            return;
        }

        this.confirmAction('Delete Cell?', 'Are you sure you want to remove this cell?', async () => {
            const cellIndex = this.notebook.cells.findIndex(c => c.id === cellId);
            if (cellIndex === -1) return;

            const [cell] = this.notebook.cells.splice(cellIndex, 1);

            try {
                if (this.db) {
                    await this.db.addTrashedCell({
                        id: cell.id,
                        noteId: this.notebook.id,
                        cellType: cell.type,
                        content: cell.content || '',
                        language: cell.lang || 'javascript'
                    });
                    await this.db.putNote(this.notebook);
                    if (this.sync) this.sync.notifyLocalChange(this.notebook.id, 'UPDATE');
                } else {
                    await this.safeFetch('/api/cells/trash', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            notebookId: this.notebook.id,
                            cell: cell
                        })
                    });
                }

                if (this.editors[cellId]) {
                    this.editors[cellId].dispose();
                    delete this.editors[cellId];
                }

                // If notebook is now empty, create a fresh cell
                if (this.notebook.cells.length === 0) {
                    this.notebook.cells.push({
                        id: 'cell-' + Date.now(),
                        type: 'code',
                        lang: this.userSettings?.defaultLanguage || 'javascript',
                        title: 'Cell 1',
                        content: '',
                        output: null
                    });
                }

                // Re-render to update sequence numbers
                this.disposeEditors();
                document.getElementById('cells-list').innerHTML = '';
                this.notebook.cells.forEach((c, idx) => this.renderCell(c, idx + 1));
                this._autoSave();
                if (this.broadcaster && this.broadcaster.isBroadcasting) {
                    this.broadcaster.syncNotebookStructure(this.notebook.cells);
                }
                if (this.collab && this.collab.isConnected) {
                    this.collab.broadcastCellDeleted(cell.id);
                }
                this.showToast('Cell deleted');
            } catch (err) {
                console.error('Delete cell failed', err);
                this.notebook.cells.splice(cellIndex, 0, cell);
                this.showToast('Failed to delete cell', 'error');
            }
        });
    }

    async deleteNotebook(id) {
        this.confirmAction('Move to Trash?', 'This notebook will be moved to the trash.', async () => {
            try {
                if (this.db) {
                    await this.db.trashNote(id);
                    if (this.sync) this.sync.notifyLocalChange(id, 'TRASH');
                }
                // Also issue remote delete so cloud is synchronized
                await this.safeFetch(`/api/notebooks/${id}`, { method: 'DELETE' }).catch(() => {});

                const savedId = localStorage.getItem('zoho-notebook-current-id');
                if (savedId === id) {
                    localStorage.removeItem('zoho-notebook-current-id');
                    await this.init(); // Re-initialize to load next available or new note
                } else {
                    await this.refreshNotebookList();
                }
                this.showToast('Notebook moved to trash');
            } catch (e) {
                console.error('Move to trash failed', e);
                this.showToast('Failed to delete notebook', 'error');
            }
        });
    }

    async renameNotebook(id, oldTitle) {
        this.inputAction('Rename Notebook', 'Enter a new title for this notebook:', oldTitle, async (newTitle) => {
            if (!newTitle) return;
            try {
                if (this.db) {
                    const note = await this.db.getNote(id);
                    if (note) {
                        note.title = newTitle;
                        await this.db.putNote(note);
                        if (this.sync) this.sync.notifyLocalChange(id, 'UPDATE');
                    }
                } else {
                    await this.safeFetch(`/api/notebooks/${id}/rename`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: newTitle })
                    });
                }

                if (this.notebook.id === id) {
                    this.notebook.title = newTitle;
                    document.getElementById('notebook-title').value = newTitle;
                }
                await this.refreshNotebookList();
            } catch (e) {
                console.error('Rename failed', e);
            }
        });
    }

    async moveNotebookToFolderPrompt(noteId) {
        let note = null;
        if (this.db) {
            note = await this.db.getNote(noteId);
        }
        if (!note && this.notebook && this.notebook.id === noteId) {
            note = this.notebook;
        }
        const currentFolder = note ? (note.folder || 'root') : 'root';

        this.inputAction('Move to Folder', 'Enter target folder name (or "root"):', currentFolder, async (targetFolder) => {
            const cleanTarget = targetFolder ? targetFolder.trim() : 'root';
            const folderVal = (!cleanTarget || cleanTarget === 'root') ? 'root' : cleanTarget;
            if (folderVal === currentFolder) return;

            try {
                if (folderVal !== 'root') {
                    this.addPersistedFolder(folderVal);
                    if (this.expandedFolders) {
                        this.expandedFolders.add(folderVal);
                        localStorage.setItem('zoho-expanded-folders', JSON.stringify([...this.expandedFolders]));
                    }
                }

                if (this.db) {
                    const targetNote = await this.db.getNote(noteId);
                    if (targetNote) {
                        targetNote.folder = folderVal;
                        await this.db.putNote(targetNote);
                        if (this.sync) this.sync.notifyLocalChange(noteId, 'UPDATE');
                    }
                }

                if (this.notebook && this.notebook.id === noteId) {
                    this.notebook.folder = folderVal;
                }

                // Always update remote server as well
                try {
                    await this.safeFetch('/api/notebooks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: noteId, folder: folderVal })
                    });
                } catch (remoteErr) {
                    console.warn('[NotebookApp] Remote folder move deferred:', remoteErr);
                }

                await this.refreshNotebookList();
            } catch (err) {
                console.error('Failed to move notebook', err);
            }
        });
    }

    // --- Drag and Drop Handlers ---

    handleCellDragStart(e) {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        this.draggedCellId = cell.id.replace('container-', '');
        cell.classList.add('dragging');
        e.dataTransfer.setData('text/plain', this.draggedCellId);
        e.dataTransfer.effectAllowed = 'move';
    }

    handleCellDragOver(e) {
        e.preventDefault();
        const cell = e.target.closest('.cell');
        if (!cell || cell.id.replace('container-', '') === this.draggedCellId) return;
        cell.classList.add('drag-over');
    }

    handleCellDragLeave(e) {
        const cell = e.target.closest('.cell');
        if (cell) cell.classList.remove('drag-over');
    }

    handleCellDragEnd(e) {
        const cell = e.target.closest('.cell');
        if (cell) cell.classList.remove('dragging');
        document.querySelectorAll('.cell').forEach(c => c.classList.remove('drag-over'));
    }

    handleCellDrop(e) {
        e.preventDefault();
        const targetCell = e.target.closest('.cell');
        if (!targetCell) return;

        const targetCellId = targetCell.id.replace('container-', '');
        if (targetCellId === this.draggedCellId) return;

        const sourceIndex = this.notebook.cells.findIndex(c => c.id === this.draggedCellId);
        const targetIndex = this.notebook.cells.findIndex(c => c.id === targetCellId);

        if (sourceIndex !== -1 && targetIndex !== -1) {
            const sourceElem = document.getElementById(`container-${this.draggedCellId}`);
            if (sourceElem && targetCell) {
                if (sourceIndex < targetIndex) {
                    targetCell.after(sourceElem);
                } else {
                    targetCell.before(sourceElem);
                }
            }

            const [movedCell] = this.notebook.cells.splice(sourceIndex, 1);
            this.notebook.cells.splice(targetIndex, 0, movedCell);

            this.updateCellIndices();

            if (sourceElem) {
                sourceElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            this._autoSave();
            if (this.broadcaster && this.broadcaster.isBroadcasting) {
                this.broadcaster.syncNotebookStructure(this.notebook.cells);
            }
            if (this.collab && this.collab.isConnected) {
                this.collab.broadcastCellReorder(this.notebook.cells.map(c => c.id));
            }
        }
    }

    handleNotebookDragOver(e) {
        e.preventDefault();
        const item = e.target.closest('.notebook-item');
        if (item && item.getAttribute('data-id') !== this.notebook.id) {
            item.classList.add('drag-over');
            e.dataTransfer.dropEffect = 'move';
        }
    }

    handleNotebookDragLeave(e) {
        const item = e.target.closest('.notebook-item');
        if (item) item.classList.remove('drag-over');
    }

    async handleNotebookDrop(e) {
        e.preventDefault();
        const item = e.target.closest('.notebook-item');
        if (!item) return;

        item.classList.remove('drag-over');
        const targetNotebookId = item.getAttribute('data-id');
        const cellId = e.dataTransfer.getData('text/plain');

        if (targetNotebookId === this.notebook.id) return;

        this.confirmAction('Move Note?', 'Move this note to another notebook?', async () => {
            try {
                const cellIndex = this.notebook.cells.findIndex(c => c.id === cellId);
                if (cellIndex === -1) return;

                const [cell] = this.notebook.cells.splice(cellIndex, 1);

                const res = await this.safeFetch('/api/notebooks/move-cell', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceNotebookId: this.notebook.id,
                        targetNotebookId: targetNotebookId,
                        cell: cell
                    })
                });

                if (res.ok) {
                    this.disposeEditors();
                    document.getElementById('cells-list').innerHTML = '';
                    this.notebook.cells.forEach((cell, idx) => this.renderCell(cell, idx + 1));
                    this._autoSave();
                } else {
                    // Restore cell if move failed
                    this.notebook.cells.splice(cellIndex, 0, cell);
                    this.showToast('Failed to move note', 'error');
                }
            } catch (err) {
                console.error('Move cell failed', err);
            }
        });
    }

    async renameFolder(oldPath) {
        const pathParts = oldPath.split('/');
        const oldBaseName = pathParts[pathParts.length - 1];
        const parentPath = pathParts.slice(0, -1).join('/');

        this.inputAction('Rename Folder', `Enter a new name for "${oldBaseName}":`, oldBaseName, async (newBaseName) => {
            if (!newBaseName || newBaseName === oldBaseName) return;
            const newPath = parentPath ? `${parentPath}/${newBaseName}` : newBaseName;
            try {
                if (this.db) {
                    const allNotes = await this.db.getAllNotes();
                    for (const n of allNotes) {
                        if (n.folder === oldPath) {
                            n.folder = newPath;
                            await this.db.putNote(n);
                            if (this.sync) this.sync.notifyLocalChange(n.id, 'UPDATE');
                        } else if (n.folder && n.folder.startsWith(oldPath + '/')) {
                            n.folder = newPath + n.folder.slice(oldPath.length);
                            await this.db.putNote(n);
                            if (this.sync) this.sync.notifyLocalChange(n.id, 'UPDATE');
                        }
                    }
                }
                try {
                    await this.safeFetch('/api/folders/rename', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ oldName: oldPath, newName: newPath })
                    });
                } catch (remoteErr) {
                    console.warn('[NotebookApp] Remote folder rename deferred:', remoteErr);
                }

                if (this.notebook.folder === oldPath) {
                    this.notebook.folder = newPath;
                } else if (this.notebook.folder && this.notebook.folder.startsWith(oldPath + '/')) {
                    this.notebook.folder = newPath + this.notebook.folder.slice(oldPath.length);
                }

                // Update expandedFolders and persistedFolders cache
                const updatedExpanded = new Set();
                for (const path of this.expandedFolders) {
                    if (path === oldPath) {
                        updatedExpanded.add(newPath);
                    } else if (path.startsWith(oldPath + '/')) {
                        updatedExpanded.add(newPath + path.slice(oldPath.length));
                    } else {
                        updatedExpanded.add(path);
                    }
                }
                this.expandedFolders = updatedExpanded;
                localStorage.setItem('zoho-expanded-folders', JSON.stringify([...this.expandedFolders]));

                if (this.persistedFolders) {
                    const updatedPersisted = new Set();
                    for (const path of this.persistedFolders) {
                        if (path === oldPath) {
                            updatedPersisted.add(newPath);
                        } else if (path.startsWith(oldPath + '/')) {
                            updatedPersisted.add(newPath + path.slice(oldPath.length));
                        } else {
                            updatedPersisted.add(path);
                        }
                    }
                    this.persistedFolders = updatedPersisted;
                    this.savePersistedFolders();
                }

                await this.refreshNotebookList();
            } catch (e) {
                console.error('Folder rename failed', e);
            }
        });
    }

    async deleteFolder(folderName) {
        this.confirmAction('Delete Folder?', `Move all notebooks in "${folderName}" to trash?`, async () => {
            try {
                if (this.db) {
                    const allNotes = await this.db.getAllNotes();
                    for (const n of allNotes) {
                        if (n.folder === folderName || (n.folder && n.folder.startsWith(folderName + '/'))) {
                            await this.db.trashNote(n.id);
                            if (this.sync) this.sync.notifyLocalChange(n.id, 'TRASH');
                        }
                    }
                }
                try {
                    await this.safeFetch(`/api/folders/${encodeURIComponent(folderName)}`, { method: 'DELETE' });
                } catch (remoteErr) {
                    console.warn('[NotebookApp] Remote folder delete deferred:', remoteErr);
                }

                // Remove from expandedFolders cache
                for (const path of [...this.expandedFolders]) {
                    if (path === folderName || path.startsWith(folderName + '/')) {
                        this.expandedFolders.delete(path);
                    }
                }
                localStorage.setItem('zoho-expanded-folders', JSON.stringify([...this.expandedFolders]));

                // Remove from persistedFolders cache
                if (this.persistedFolders) {
                    for (const path of [...this.persistedFolders]) {
                        if (path === folderName || path.startsWith(folderName + '/')) {
                            this.persistedFolders.delete(path);
                        }
                    }
                    this.savePersistedFolders();
                }

                if (this.notebook.folder === folderName || (this.notebook.folder && this.notebook.folder.startsWith(folderName + '/'))) {
                    localStorage.removeItem('zoho-notebook-current-id');
                    await this.init();
                } else {
                    await this.refreshNotebookList();
                }
            } catch (e) {
                console.error('Folder delete failed', e);
            }
        });
    }

    async loadTrash() {
        try {
            let data;
            if (this.db) {
                data = await this.db.getTrash();
            } else {
                const res = await this.safeFetch('/api/trash');
                if (!res.ok) throw new Error('Failed to fetch trash');
                data = await res.json();
            }
            this.renderTrashView(data);
        } catch (e) {
            console.error('Failed to load trash list', e);
        }
    }

    renderTrashView(data) {
        const { notebooks = [], cells = [] } = data;
        const totalItems = notebooks.length + cells.length;
        this.disposeEditors();

        const titleEl = document.getElementById('notebook-title');
        if (titleEl) titleEl.value = 'Trash';

        const listContainer = document.getElementById('cells-list');
        if (!listContainer) return;

        listContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 10px; border-bottom: 1px solid var(--border-color);">
                <div>
                    <h2 style="font-size: 18px; color: var(--accent);">Trash</h2>
                    <p style="font-size: 12px; color: var(--text-dim);">${totalItems} items</p>
                </div>
                ${totalItems > 0 ? `<button class="btn-run" id="btn-empty-trash" style="background: #ff3b30;">Empty Trash</button>` : ''}
            </div>
        `;

        if (totalItems === 0) {
            listContainer.innerHTML += `
                <div style="text-align: center; padding: 60px; color: var(--text-dim);">
                    <i data-lucide="trash-2" style="width: 48px; height: 48px; margin-bottom: 15px; opacity: 0.2;"></i>
                    <p>Trash is empty</p>
                </div>
            `;
        } else {
            // Render Notebooks
            notebooks.forEach(nb => {
                const item = document.createElement('div');
                item.className = 'cell';
                item.style.padding = '15px 20px';
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '15px';
                item.innerHTML = `
                    <div style="width: 24px; height: 24px; background: rgba(109, 93, 252, 0.1); border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                        <i data-lucide="book" style="width: 14px; color: var(--accent);"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${nb.title || 'Untitled Notebook'}</div>
                        <div style="font-size: 11px; color: var(--text-dim);">Type: Notebook • In ${nb.folder || 'root'}</div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn-icon btn-restore-notebook" data-id="${nb.id}" title="Restore">
                            <i data-lucide="rotate-ccw"></i>
                        </button>
                        <button class="btn-icon btn-delete-notebook-perm" data-id="${nb.id}" title="Delete Permanently" style="color: #ff3b30;">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                `;
                listContainer.appendChild(item);
            });

            // Render Cells
            cells.forEach(cell => {
                const item = document.createElement('div');
                item.className = 'cell';
                item.style.padding = '15px 20px';
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '15px';
                item.innerHTML = `
                    <div style="width: 24px; height: 24px; background: rgba(48, 255, 106, 0.1); border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                        <i data-lucide="file-code" style="width: 14px; color: #30ff6a;"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${cell.title || 'Untitled Note'}</div>
                        <div style="font-size: 11px; color: var(--text-dim);">Type: Note • Original: ${cell.originalNotebookTitle || 'Note'}</div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn-icon btn-restore-cell" data-id="${cell.id}" title="Restore">
                            <i data-lucide="rotate-ccw"></i>
                        </button>
                        <button class="btn-icon btn-delete-cell-perm" data-id="${cell.id}" title="Delete Permanently" style="color: #ff3b30;">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                `;
                listContainer.appendChild(item);
            });
        }

        // Event Listeners for Trash Actions
        const emptyBtn = document.getElementById('btn-empty-trash');
        if (emptyBtn) {
            emptyBtn.onclick = () => this.emptyTrash();
        }

        document.querySelectorAll('.btn-restore-notebook').forEach(btn => {
            btn.onclick = () => this.restoreNotebook(btn.getAttribute('data-id'));
        });

        document.querySelectorAll('.btn-delete-notebook-perm').forEach(btn => {
            btn.onclick = () => {
                const id = btn.getAttribute('data-id');
                this.confirmAction('Permanently Delete?', 'This notebook will be gone forever!', () => {
                    this.deletePermanently(id);
                });
            };
        });

        document.querySelectorAll('.btn-restore-cell').forEach(btn => {
            btn.onclick = () => this.restoreCell(btn.getAttribute('data-id'));
        });

        document.querySelectorAll('.btn-delete-cell-perm').forEach(btn => {
            btn.onclick = () => {
                const id = btn.getAttribute('data-id');
                this.confirmAction('Permanently Delete?', 'This note will be gone forever!', () => {
                    this.deleteCellPermanently(id);
                });
            };
        });

        lucide.createIcons();
    }

    async restoreCell(id) {
        try {
            if (this.db) {
                const trash = await this.db.getTrash();
                const cell = trash.cells.find(c => c.id === id);
                if (cell) {
                    const note = await this.db.getNote(cell.noteId);
                    if (note) {
                        note.cells = note.cells || [];
                        note.cells.push({
                            id: cell.id,
                            type: cell.cellType,
                            content: cell.content,
                            lang: cell.language
                        });
                        await this.db.putNote(note);
                        await this.db.deleteTrashedCell(id);
                        if (this.sync) this.sync.notifyLocalChange(note.id, 'UPDATE');
                    }
                }
                if (this.notebook.id === cell?.noteId) {
                    await this.loadNotebook(cell.noteId);
                } else {
                    await this.loadTrash();
                }
            } else {
                const res = await this.safeFetch(`/api/trash/restore-cell/${id}`, { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    if (this.notebook.id === data.notebookId) {
                        await this.loadNotebook(data.notebookId);
                    } else {
                        await this.loadTrash();
                    }
                }
            }
        } catch (e) {
            console.error('Restore failed', e);
        }
    }

    async deleteCellPermanently(id) {
        try {
            if (this.db) {
                await this.db.deleteTrashedCell(id);
            } else {
                await this.safeFetch(`/api/trash/cell/${id}`, { method: 'DELETE' });
            }
            await this.loadTrash();
        } catch (e) {
            console.error('Permanent delete failed', e);
        }
    }

    async restoreNotebook(id) {
        try {
            if (this.db) {
                await this.db.restoreNote(id);
                if (this.sync) this.sync.notifyLocalChange(id, 'UPDATE');
            } else {
                await this.safeFetch(`/api/trash/restore/${id}`, { method: 'POST' });
            }
            await this.refreshNotebookList();
            await this.loadTrash();
        } catch (e) {
            console.error('Restore failed', e);
        }
    }

    async deletePermanently(id) {
        try {
            if (this.db) {
                await this.db.permanentlyDeleteNote(id);
                if (this.sync) this.sync.notifyLocalChange(id, 'DELETE');
            } else {
                await this.safeFetch(`/api/trash/${id}`, { method: 'DELETE' });
            }
            await this.loadTrash();
        } catch (e) {
            console.error('Permanent delete failed', e);
        }
    }

    async emptyTrash() {
        this.confirmAction('Empty Trash?', 'Are you sure you want to empty the trash? This action cannot be undone.', async () => {
            try {
                if (this.db) {
                    const purgedIds = await this.db.clearAllTrash();
                    // Queue DELETE tombstones so purged notes are removed from
                    // the cloud too and can never resurrect on restore.
                    if (this.sync && Array.isArray(purgedIds)) {
                        for (const id of purgedIds) {
                            await this.sync.notifyLocalChange(id, 'DELETE');
                        }
                    }
                    if (this.sync) this.sync.syncNow({ immediate: true });
                } else {
                    await this.safeFetch('/api/trash-all', { method: 'DELETE' });
                }
                await this.loadTrash();
            } catch (e) {
                console.error('Empty trash failed', e);
            }
        });
    }

    async saveToBackend() {
        try {
            if (!this.notebook || !this.notebook.id) return;
            if (this.notebook.id === 'starred' || this.notebook.id === 'trash') return;

            if (this.db) {
                const savedRecord = await this.db.putNote(this.notebook, { hasFullContent: true });
                if (savedRecord) {
                    this.notebook._version = savedRecord._version;
                    this.notebook.updatedAt = savedRecord.updatedAt;
                }
                if (this.sync) {
                    this.sync.notifyLocalChange(this.notebook.id, 'UPDATE');
                }
            } else {
                await this.safeFetch('/api/notebooks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.notebook)
                });
            }
            localStorage.setItem('zoho-notebook-current-id', this.notebook.id);
        } catch (e) {
            console.error('Save failed', e);
        }
    }

    async loadStarredNotes() {
        try {
            let starredCells = [];
            if (this.db) {
                const notes = await this.db.getStarredNotes();
                notes.forEach(nb => {
                    if (nb.cells) {
                        nb.cells.forEach(cell => {
                            if (cell.isStarred) {
                                starredCells.push({ ...cell, notebookTitle: nb.title, notebookId: nb.id });
                            }
                        });
                    }
                });
            } else {
                const res = await this.safeFetch('/api/notebooks');
                const notebooks = await res.json();
                await Promise.all(notebooks.map(async (nb) => {
                    const fullRes = await this.safeFetch(`/api/notebooks/${nb.id}`);
                    const fullNb = await fullRes.json();
                    const cells = fullNb.cells || [];
                    cells.forEach(cell => {
                        if (cell.isStarred) {
                            starredCells.push({ ...cell, notebookTitle: fullNb.title, notebookId: fullNb.id });
                        }
                    });
                }));
            }

            this.renderStarredView(starredCells);
        } catch (e) {
            console.error('Failed to load starred notes', e);
        }
    }

    renderStarredView(cells) {
        this.disposeEditors();
        document.getElementById('cells-list').innerHTML = `
            <div style="margin-bottom: 20px; padding: 10px; border-bottom: 1px solid var(--border-color);">
                <h2 style="font-size: 18px; color: var(--accent);">Starred Notes</h2>
                <p style="font-size: 12px; color: var(--text-dim);">${cells.length} notes found</p>
            </div>
        `;
        document.getElementById('notebook-title').value = 'Starred Notes';

        if (cells.length === 0) {
            document.getElementById('cells-list').innerHTML += `
                <div style="text-align: center; padding: 40px; color: var(--text-dim);">
                    <i data-lucide="star" style="width: 48px; height: 48px; margin-bottom: 10px; opacity: 0.2;"></i>
                    <p>No starred notes yet.</p>
                </div>
            `;
        } else {
            cells.forEach(cell => {
                const container = document.getElementById('cells-list');
                const cellElem = document.createElement('div');
                cellElem.className = 'cell';
                cellElem.innerHTML = `
                    <div class="cell-header">
                        <span style="font-size: 10px; color: var(--accent); margin-right: 10px;">${cell.notebookTitle}</span>
                        <span class="cell-title-input" style="flex: 1; border: none;">${cell.title || 'Untitled'}</span>
                         <div class="cell-actions">
                             <button class="btn-icon btn-goto-notebook" data-id="${cell.notebookId}" data-cell-id="${cell.id}" title="Go to Note Phase">
                                 <i data-lucide="external-link"></i>
                             </button>
                        </div>
                    </div>
                    <div class="editor-container" style="padding: 20px; font-family: 'JetBrains Mono'; font-size: 14px; background: rgba(0,0,0,0.2);">
                        ${cell.type === 'markdown' ? marked.parse(cell.content) : `<pre>${cell.content}</pre>`}
                    </div>
                `;
                container.appendChild(cellElem);
            });
        }

        // Add listener for "Go to Notebook"
        document.querySelectorAll('.btn-goto-notebook').forEach(btn => {
            btn.onclick = (e) => {
                const id = btn.getAttribute('data-id');
                const cellId = btn.getAttribute('data-cell-id');
                this.loadNotebook(id, cellId);
            };
        });

        lucide.createIcons();
    }
}

window.onload = () => {
    window.app = new NotebookApp();
};
