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
        this._autoSave = debounce(() => this.saveToBackend(), 1500);

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.refreshNotebookList();

        const saved = localStorage.getItem('zoho-notebook-current-id');
        if (saved) {
            await this.loadNotebook(saved);
        } else {
            this.addCell('code');
        }
    }

    setupEventListeners() {
        document.getElementById('add-code-cell').addEventListener('click', () => this.addCell('code'));
        document.getElementById('btn-new-folder').addEventListener('click', () => this.createFolder());
        document.getElementById('run-all-cells').addEventListener('click', () => this.runAll());

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

        document.getElementById('btn-star').addEventListener('click', () => this.toggleStar());

        document.getElementById('nav-starred').addEventListener('click', () => {
            document.getElementById('starred-list').classList.toggle('collapsed');
        });

        const titleInput = document.getElementById('notebook-title');
        titleInput.addEventListener('input', (e) => {
            this.notebook.title = e.target.value;
            this.updateCurrentNotebookItemUI();
            this._autoSave();
        });

        document.getElementById('nav-starred-cells').addEventListener('click', () => this.loadStarredNotes());

        // Event Delegation for Sidebar
        document.getElementById('notebook-list').addEventListener('click', (e) => {
            const item = e.target.closest('.notebook-item');
            const folderHeader = e.target.closest('.folder-header');
            const addFileBtn = e.target.closest('.btn-add-file');

            if (addFileBtn) {
                e.stopPropagation();
                const folder = addFileBtn.getAttribute('data-folder');
                this.createNewNotebook(folder);
                return;
            }

            if (folderHeader) {
                const content = folderHeader.nextElementSibling;
                if (content && content.classList.contains('folder-content')) {
                    content.classList.toggle('collapsed');
                    const icon = folderHeader.querySelector('.folder-chevron');
                    if (icon) icon.classList.toggle('collapsed-chevron');
                }
                return;
            }

            if (item) {
                const id = item.getAttribute('data-id');
                if (e.target.closest('.delete-notebook-btn')) {
                    e.stopPropagation();
                    if (confirm('Delete this notebook permanently?')) {
                        this.deleteNotebook(id);
                    }
                } else {
                    this.loadNotebook(id);
                }
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

        document.getElementById('cells-list').addEventListener('input', (e) => {
            if (e.target.classList.contains('cell-title-input')) {
                const cellElem = e.target.closest('.cell');
                const cellId = cellElem.id.replace('container-', '');
                const cell = this.notebook.cells.find(c => c.id === cellId);
                if (cell) cell.title = e.target.value;
                this._autoSave();
            }
        });
    }

    async createFolder() {
        const folderName = prompt('Enter folder name:', 'New Folder');
        if (!folderName) return;
        // Folders are just metadata on notebooks, so we don't need a folder API.
        // We'll create a dummy notebook or just refresh.
        // Actually, let's just refresh the UI with the new folder concept.
        this.createNewNotebook(folderName);
    }

    async refreshNotebookList() {
        try {
            const res = await fetch('/api/notebooks');
            const list = await res.json();
            this.renderNotebookList(list);
        } catch (e) {
            console.error('Failed to load notebook list', e);
        }
    }

    async toggleStar() {
        this.notebook.isStarred = !this.notebook.isStarred;
        this.updateStarUI();
        await this.saveToBackend();
        await this.refreshNotebookList();
    }

    updateStarUI() {
        const btn = document.getElementById('btn-star');
        if (this.notebook.isStarred) {
            btn.style.color = '#ffcc00';
            btn.querySelector('i').setAttribute('data-lucide', 'star-off');
            btn.innerHTML = '<i data-lucide="star" style="fill: #ffcc00;"></i>';
        } else {
            btn.style.color = 'var(--text-dim)';
            btn.innerHTML = '<i data-lucide="star"></i>';
        }
        lucide.createIcons();
    }

    renderNotebookList(notebooks) {
        const listContainer = document.getElementById('notebook-list');
        const starredContainer = document.getElementById('starred-list');
        listContainer.innerHTML = '';
        starredContainer.innerHTML = '';

        const groups = {};
        const starred = notebooks.filter(nb => nb.isStarred);

        notebooks.forEach(nb => {
            const folder = nb.folder || 'root';
            if (!groups[folder]) groups[folder] = [];
            groups[folder].push(nb);
        });

        const renderItem = (nb, container) => {
            const item = document.createElement('div');
            item.className = `notebook-item ${nb.id === this.notebook.id ? 'active' : ''}`;
            item.setAttribute('data-id', nb.id);
            item.innerHTML = `
                <i data-lucide="${nb.id === this.notebook.id ? 'edit-3' : (nb.isStarred ? 'star' : 'file-code')}" 
                   style="width: 14px; ${nb.isStarred ? 'color: #ffcc00; fill: #ffcc00;' : ''}"></i> 
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis;">${nb.title}</span>
                <button class="btn-icon-sm delete-notebook-btn" title="Delete Notebook">
                    <i data-lucide="trash-2"></i>
                </button>
            `;
            container.appendChild(item);
        };

        // Render Starred List
        starred.forEach(nb => renderItem(nb, starredContainer));

        // Render Main List with Folders
        Object.keys(groups).sort().forEach(folder => {
            if (folder !== 'root') {
                const folderHeader = document.createElement('div');
                folderHeader.className = 'folder-header';
                folderHeader.innerHTML = `
                    <i data-lucide="chevron-down" class="folder-chevron" style="width: 12px;"></i>
                    <i data-lucide="folder" style="width: 14px;"></i> 
                    <span style="flex: 1;">${folder}</span>
                    <button class="btn-icon-sm btn-add-file" data-folder="${folder}" title="Add File">
                        <i data-lucide="file-plus"></i>
                    </button>
                `;
                listContainer.appendChild(folderHeader);
            }

            const folderContent = document.createElement('div');
            folderContent.className = folder === 'root' ? '' : 'folder-content';

            groups[folder].forEach(nb => renderItem(nb, folderContent));
            listContainer.appendChild(folderContent);
        });
        lucide.createIcons();
    }

    updateCurrentNotebookItemUI() {
        const activeItem = document.querySelector('.notebook-item.active');
        if (activeItem) {
            const span = activeItem.querySelector('span');
            if (span) span.innerText = this.notebook.title;
        }
    }

    async createNewNotebook(folderName = 'root') {
        const title = prompt('Enter file title:', 'New File');
        if (title === null) return;

        this.disposeEditors();
        const id = `ntbk-${Date.now()}`;
        this.notebook = {
            id: id,
            title: title || 'Untitled File',
            isStarred: false,
            folder: folderName,
            cells: [],
            tags: []
        };
        this.updateStarUI();
        document.getElementById('cells-list').innerHTML = '';
        document.getElementById('notebook-title').value = this.notebook.title;

        this.addCell('code');
        await this.saveToBackend();
        await this.refreshNotebookList();
        this.setActiveNotebookUI(this.notebook.id);
    }

    async loadNotebook(id) {
        try {
            const res = await fetch(`/api/notebooks/${id}`);
            if (!res.ok) throw new Error('Not found');
            const data = await res.json();

            this.disposeEditors();
            this.notebook = data;

            this.updateStarUI();

            document.getElementById('cells-list').innerHTML = '';
            document.getElementById('notebook-title').value = this.notebook.title;
            localStorage.setItem('zoho-notebook-current-id', id);

            this.setActiveNotebookUI(id);

            if (this.notebook.cells.length === 0) {
                this.addCell('code');
            } else {
                this.notebook.cells.forEach(cell => this.renderCell(cell));
            }
        } catch (e) {
            console.error('Failed to load notebook', e);
            localStorage.removeItem('zoho-notebook-current-id');
        }
    }

    setActiveNotebookUI(id) {
        document.querySelectorAll('.notebook-item').forEach(el => {
            el.classList.remove('active');
            if (el.getAttribute('data-id') === id) el.classList.add('active');
        });
        lucide.createIcons();
    }

    disposeEditors() {
        Object.values(this.editors).forEach(editor => editor.dispose());
        this.editors = {};
    }

    addCell(type, content = '') {
        const cellId = 'cell-' + Math.random().toString(36).substr(2, 9);
        const cell = {
            id: cellId,
            type: type,
            title: '',
            isStarred: false,
            content: content,
            output: null
        };

        this.notebook.cells.push(cell);
        this.renderCell(cell);
        this._autoSave();
    }

    renderCell(cell) {
        const container = document.getElementById('cells-list');
        const cellElem = document.createElement('div');
        cellElem.className = 'cell';
        cellElem.id = `container-${cell.id}`;

        const isMark = cell.type === 'markdown';

        cellElem.innerHTML = `
            <div class="cell-header">
                <div class="reorder-btns">
                    <button class="btn-reorder move-up" title="Move Up"><i data-lucide="chevron-up" style="width:12px;"></i></button>
                    <button class="btn-reorder move-down" title="Move Down"><i data-lucide="chevron-down" style="width:12px;"></i></button>
                </div>
                <input type="text" class="cell-title-input" placeholder="Set note label..." value="${cell.title || ''}">
                <div style="text-align: right; margin-right: 15px; font-size: 10px; opacity: 0.5;">${cell.type.toUpperCase()}</div>
                <div class="cell-actions">
                    <button class="btn-icon btn-star-cell" title="Star Note">
                        <i data-lucide="star" ${cell.isStarred ? 'style="fill: #ffcc00; color: #ffcc00;"' : ''}></i>
                    </button>
                    ${!isMark ? `<button class="btn-run" id="run-${cell.id}">Run</button>` : ''}
                    <button class="btn-icon delete-cell" title="Delete Note"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
            <div class="editor-container" id="editor-${cell.id}"></div>
            ${isMark ? `<div class="markdown-preview hidden" id="preview-${cell.id}"></div>` : ''}
            <div class="output-container ${cell.output ? '' : 'hidden'}" id="output-${cell.id}"></div>
        `;

        container.appendChild(cellElem);
        lucide.createIcons();

        if (cell.output) this.displayOutput(cell.id, cell.output);

        require(['vs/editor/editor.main'], () => {
            const editor = monaco.editor.create(document.getElementById(`editor-${cell.id}`), {
                value: cell.content,
                language: isMark ? 'markdown' : 'javascript',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
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
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                wrappingStrategy: 'advanced',
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true
            });

            this.editors[cell.id] = editor;

            const updateHeight = () => {
                const contentHeight = editor.getContentHeight();
                const editorDiv = document.getElementById(`editor-${cell.id}`);
                if (editorDiv) {
                    editorDiv.style.height = `${contentHeight}px`;
                    editor.layout();
                }
            };

            editor.onDidContentSizeChange(() => {
                updateHeight();
            });

            updateHeight();

            editor.onDidChangeModelContent(() => {
                const currentCell = this.notebook.cells.find(c => c.id === cell.id);
                if (currentCell) currentCell.content = editor.getValue();
                this._autoSave();
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
            }
        });
    }

    async runCell(cellId) {
        const cell = this.notebook.cells.find(c => c.id === cellId);
        if (!cell || cell.type !== 'code') return;
        const editor = this.editors[cellId];
        const code = editor.getValue();
        const runBtn = document.getElementById(`run-${cellId}`);
        if (runBtn) {
            runBtn.innerText = 'Running...';
            runBtn.disabled = true;
        }
        try {
            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const data = await response.json();
            cell.output = data;
            this.displayOutput(cellId, data);
            this._autoSave();
        } catch (err) {
            this.displayOutput(cellId, { success: false, error: err.message });
        } finally {
            if (runBtn) {
                runBtn.innerText = 'Run';
                runBtn.disabled = false;
            }
        }
    }

    moveCell(cellId, direction) {
        const index = this.notebook.cells.findIndex(c => c.id === cellId);
        if (index === -1) return;
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.notebook.cells.length) return;
        const temp = this.notebook.cells[index];
        this.notebook.cells[index] = this.notebook.cells[newIndex];
        this.notebook.cells[newIndex] = temp;
        this.disposeEditors();
        document.getElementById('cells-list').innerHTML = '';
        this.notebook.cells.forEach(cell => this.renderCell(cell));
        this._autoSave();
    }

    async runAll() {
        for (const cell of this.notebook.cells) {
            if (cell.type === 'code') await this.runCell(cell.id);
        }
    }

    displayOutput(cellId, data) {
        const outputDiv = document.getElementById(`output-${cellId}`);
        if (!outputDiv) return;
        outputDiv.classList.remove('hidden');
        outputDiv.innerHTML = '';
        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(log => {
                const logElem = document.createElement('div');
                logElem.className = 'output-log';
                logElem.textContent = log;
                outputDiv.appendChild(logElem);
            });
        }
        if (data.success) {
            if (data.result !== 'undefined') {
                const resElem = document.createElement('div');
                resElem.className = 'output-result';
                resElem.innerHTML = `<strong>Result:</strong> <pre>${data.result}</pre>`;
                outputDiv.appendChild(resElem);
            }
        } else {
            const errElem = document.createElement('div');
            errElem.className = 'output-error';
            errElem.textContent = data.error;
            outputDiv.appendChild(errElem);
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
            this._autoSave();
        }
    }

    deleteCell(cellId) {
        if (!confirm('Delete this note?')) return;
        this.notebook.cells = this.notebook.cells.filter(c => c.id !== cellId);
        if (this.editors[cellId]) {
            this.editors[cellId].dispose();
            delete this.editors[cellId];
        }
        document.getElementById(`container-${cellId}`).remove();
        this._autoSave();
    }

    async deleteNotebook(id) {
        try {
            const res = await fetch(`/api/notebooks/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (this.notebook.id === id) {
                    localStorage.removeItem('zoho-notebook-current-id');
                    location.reload();
                } else {
                    await this.refreshNotebookList();
                }
            }
        } catch (e) {
            console.error('Delete failed', e);
        }
    }

    async saveToBackend() {
        const statusEl = document.getElementById('save-status').querySelector('span');
        statusEl.innerText = 'Saving...';
        try {
            const res = await fetch('/api/notebooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.notebook)
            });
            if (res.ok) {
                statusEl.innerText = 'All saved';
                localStorage.setItem('zoho-notebook-current-id', this.notebook.id);
            } else {
                statusEl.innerText = 'Save error';
            }
        } catch (e) {
            console.error('Save failed', e);
            statusEl.innerText = 'Offline';
        }
    }
    async loadStarredNotes() {
        try {
            const res = await fetch('/api/notebooks');
            const notebooks = await res.json();
            const starredCells = [];

            // Fetch full content for all notebooks to find starred cells
            // Better would be a backend endpoint, but we can do it client-side for now
            // since notebooks are small usually.
            await Promise.all(notebooks.map(async (nb) => {
                const fullRes = await fetch(`/api/notebooks/${nb.id}`);
                const fullNb = await fullRes.json();
                const cells = fullNb.cells || [];
                cells.forEach(cell => {
                    if (cell.isStarred) {
                        starredCells.push({ ...cell, notebookTitle: fullNb.title, notebookId: fullNb.id });
                    }
                });
            }));

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
                             <button class="btn-icon btn-goto-notebook" data-id="${cell.notebookId}" title="Go to Notebook">
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
                this.loadNotebook(id);
            };
        });

        lucide.createIcons();
    }
}

window.onload = () => {
    window.app = new NotebookApp();
};
