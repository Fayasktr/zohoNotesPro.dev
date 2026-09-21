/**
 * Zoho Notes - Live Viewer Screen Script
 * 
 * Subscribes to Firebase Realtime Database and live-reflects host typing,
 * cell focus, and local execution outputs with zero compilation needed on the viewer device.
 */

(function () {
    const sessionId = window.SESSION_ID;
    let followHost = true;
    let activeCellId = null;
    let localCells = {}; // cellId -> cellData
    let db = null;
    let viewerId = 'v_' + Math.random().toString(36).substring(2, 9);

    // DOM Elements
    const sessionTitleEl = document.getElementById('session-title');
    const hostNameEl = document.getElementById('host-name');
    const liveBadgeEl = document.getElementById('live-badge');
    const liveStatusTextEl = document.getElementById('live-status-text');
    const viewerCountEl = document.getElementById('viewer-count');
    const offlineBannerEl = document.getElementById('offline-banner');
    const viewerCellsEl = document.getElementById('viewer-cells');
    const btnToggleFollow = document.getElementById('btn-toggle-follow');
    const btnCopyLiveLink = document.getElementById('btn-copy-live-link');

    // Initialize viewer
    async function initViewer() {
        if (!sessionId) {
            showError('Invalid or missing session ID in link.');
            return;
        }

        // Get Firebase Config
        let config = window.FIREBASE_CONFIG;
        if (!config || !config.apiKey) {
            try {
                const res = await fetch('/api/firebase-config');
                if (res.ok) config = await res.json();
            } catch (e) { }
        }

        if (!config || !config.apiKey || !config.databaseURL) {
            // Check localStorage
            const localStored = localStorage.getItem('zoho_firebase_config');
            if (localStored) {
                try { config = JSON.parse(localStored); } catch (e) { }
            }
        }

        if (!config || !config.apiKey || !config.databaseURL) {
            showConfigModal();
            return;
        }

        try {
            const appName = 'zoho-spectator-app';
            let app = firebase.apps.find(a => a.name === appName);
            if (!app) {
                app = firebase.initializeApp(config, appName);
            }
            db = firebase.database(app);

            // Register viewer presence
            const viewerPresenceRef = db.ref(`live_sessions/${sessionId}/viewers/${viewerId}`);
            await viewerPresenceRef.set({ joinedAt: firebase.database.ServerValue.TIMESTAMP });
            viewerPresenceRef.onDisconnect().remove();

            // Track viewer count
            const viewersRef = db.ref(`live_sessions/${sessionId}/viewers`);
            viewersRef.on('value', (snap) => {
                const val = snap.val() || {};
                const count = Object.keys(val).length;
                if (viewerCountEl) viewerCountEl.innerText = count;
            });

            // Listen to session metadata
            const metaRef = db.ref(`live_sessions/${sessionId}/meta`);
            metaRef.on('value', (snap) => {
                const meta = snap.val();
                if (!meta) {
                    showError('This live session does not exist or has already been removed by the host.');
                    return;
                }
                updateMeta(meta);
            });

            // Listen to cells
            const cellsRef = db.ref(`live_sessions/${sessionId}/cells`);
            cellsRef.on('value', (snap) => {
                const cells = snap.val() || {};
                renderCells(cells);
            });

            setupControls();
        } catch (err) {
            console.error('[LiveViewer] Connection error:', err);
            showError(`Failed to connect to Firebase: ${err.message}`);
        }
    }

    function updateMeta(meta) {
        if (sessionTitleEl) sessionTitleEl.innerText = meta.title || 'Untitled Session';
        if (hostNameEl) hostNameEl.innerText = meta.hostName || 'Host';

        const isLive = !!meta.isLive;
        if (isLive) {
            if (liveBadgeEl) {
                liveBadgeEl.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
            }
            if (liveStatusTextEl) liveStatusTextEl.innerText = 'LIVE';
            if (offlineBannerEl) offlineBannerEl.classList.add('hidden');
        } else {
            if (liveBadgeEl) {
                liveBadgeEl.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/30';
            }
            if (liveStatusTextEl) liveStatusTextEl.innerText = 'OFFLINE';
            if (offlineBannerEl) offlineBannerEl.classList.remove('hidden');
        }

        // Active cell tracking
        if (meta.activeCellId && meta.activeCellId !== activeCellId) {
            activeCellId = meta.activeCellId;
            highlightActiveCell(activeCellId);
            if (followHost) {
                scrollToCell(activeCellId);
            }
        }
    }

    function renderCells(cellsMap) {
        localCells = cellsMap;
        const sortedCells = Object.values(cellsMap).sort((a, b) => (a.order || 0) - (b.order || 0));

        if (sortedCells.length === 0) {
            viewerCellsEl.innerHTML = `
                <div class="p-12 text-center text-gray-400 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                    <i data-lucide="file-code" class="w-8 h-8 mx-auto mb-2 text-gray-500"></i>
                    <p class="text-sm font-semibold">Host has not added any cells yet.</p>
                    <p class="text-xs text-gray-500 mt-1">Waiting for host to start writing...</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Remove loading state if present
        const loadingState = document.getElementById('loading-state');
        if (loadingState) loadingState.remove();

        sortedCells.forEach(cell => {
            let cellEl = document.getElementById(`viewer-cell-${cell.id}`);
            if (!cellEl) {
                cellEl = document.createElement('div');
                cellEl.id = `viewer-cell-${cell.id}`;
                cellEl.className = `p-5 rounded-2xl border transition-all duration-200 bg-[var(--card-bg)] border-[var(--border-color)] ${cell.id === activeCellId ? 'active-host-cell' : ''}`;
                viewerCellsEl.appendChild(cellEl);
            }

            updateCellDOM(cellEl, cell);
        });

        // Remove deleted cells
        const currentIds = new Set(sortedCells.map(c => `viewer-cell-${c.id}`));
        Array.from(viewerCellsEl.children).forEach(child => {
            if (child.id.startsWith('viewer-cell-') && !currentIds.has(child.id)) {
                child.remove();
            }
        });

        if (window.lucide) lucide.createIcons();
    }

    function updateCellDOM(container, cell) {
        if (cell.type === 'markdown') {
            const raw = cell.content || '*Empty markdown cell*';
            const parsed = window.marked ? marked.parse(raw) : raw;
            container.innerHTML = `
                <div class="flex items-center justify-between pb-2 mb-3 border-b border-white/5 text-[11px] text-[var(--text-dim)]">
                    <span class="flex items-center gap-1.5 font-medium"><i data-lucide="book-open" class="w-3.5 h-3.5 text-blue-400"></i> Markdown Note</span>
                    <span class="opacity-60">Read-Only</span>
                </div>
                <div class="markdown-render text-sm">${parsed}</div>
            `;
        } else {
            // Code cell
            const lang = cell.lang || 'javascript';
            const rawCode = cell.content || '';
            const status = cell.status || 'idle';
            const isRunning = status === 'running';

            let statusBadge = '';
            if (isRunning) {
                statusBadge = `
                    <span class="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-md">
                        <i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Running on Host...
                    </span>
                `;
            } else if (cell.output && cell.output.executionTime !== undefined) {
                statusBadge = `
                    <span class="text-[11px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-md">
                        ✓ ${cell.output.executionTime}ms
                    </span>
                `;
            }

            // Syntax highlighting
            let highlighted = escapeHtml(rawCode);
            if (window.hljs) {
                try {
                    highlighted = hljs.highlightAuto(rawCode).value;
                } catch (e) { }
            }

            // Output container
            let outputHtml = '';
            if (cell.output) {
                const out = cell.output;
                const stdoutText = out.stdout || (out.logs ? out.logs.join('\n') : '') || '';
                const stderrText = out.stderr || out.error || '';

                if (stdoutText || stderrText) {
                    outputHtml = `
                        <div class="mt-4 pt-3 border-t border-white/10">
                            <div class="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1.5 flex items-center gap-1">
                                <i data-lucide="terminal" class="w-3 h-3 text-emerald-400"></i> Host Output
                            </div>
                            <div class="p-3 rounded-xl bg-black/60 border border-white/10 font-mono text-xs overflow-x-auto custom-scrollbar">
                                ${stdoutText ? `<pre class="text-emerald-300 leading-relaxed whitespace-pre-wrap">${escapeHtml(stdoutText)}</pre>` : ''}
                                ${stderrText ? `<pre class="text-rose-400 mt-2 leading-relaxed whitespace-pre-wrap">${escapeHtml(stderrText)}</pre>` : ''}
                            </div>
                        </div>
                    `;
                }
            }

            container.innerHTML = `
                <div class="flex items-center justify-between pb-2 mb-3 border-b border-white/5 text-xs text-[var(--text-dim)]">
                    <span class="flex items-center gap-1.5 font-semibold text-gray-300 capitalize">
                        <i data-lucide="code-2" class="w-3.5 h-3.5 text-indigo-400"></i> ${lang}
                    </span>
                    <div>${statusBadge}</div>
                </div>
                <div class="relative bg-black/40 rounded-xl p-3 border border-white/5 font-mono text-xs overflow-x-auto custom-scrollbar">
                    <pre class="leading-relaxed"><code class="language-${lang}">${highlighted || '<span class="opacity-30 italic">No code typed yet</span>'}</code></pre>
                </div>
                ${outputHtml}
            `;
        }
    }

    function highlightActiveCell(targetId) {
        document.querySelectorAll('#viewer-cells > div').forEach(el => {
            el.classList.remove('active-host-cell');
        });
        const targetEl = document.getElementById(`viewer-cell-${targetId}`);
        if (targetEl) {
            targetEl.classList.add('active-host-cell');
        }
    }

    function scrollToCell(targetId) {
        const targetEl = document.getElementById(`viewer-cell-${targetId}`);
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function setupControls() {
        if (btnToggleFollow) {
            btnToggleFollow.addEventListener('click', () => {
                followHost = !followHost;
                if (followHost) {
                    btnToggleFollow.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white shadow-md hover:brightness-110 active:scale-95 transition-all';
                    if (activeCellId) scrollToCell(activeCellId);
                } else {
                    btnToggleFollow.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-all';
                }
            });
        }

        if (btnCopyLiveLink) {
            btnCopyLiveLink.addEventListener('click', () => {
                navigator.clipboard.writeText(window.location.href);
                const originalHtml = btnCopyLiveLink.innerHTML;
                btnCopyLiveLink.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i> Copied!`;
                if (window.lucide) lucide.createIcons();
                setTimeout(() => {
                    btnCopyLiveLink.innerHTML = originalHtml;
                    if (window.lucide) lucide.createIcons();
                }, 2000);
            });
        }
    }

    function showError(msg) {
        viewerCellsEl.innerHTML = `
            <div class="p-8 text-center text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-2xl max-w-lg mx-auto">
                <i data-lucide="alert-circle" class="w-10 h-10 mx-auto mb-3 text-rose-400"></i>
                <h3 class="text-base font-bold mb-1">Session Error</h3>
                <p class="text-xs text-rose-200/80 leading-relaxed">${escapeHtml(msg)}</p>
                <a href="/" class="inline-block mt-4 text-xs font-semibold px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 rounded-xl transition-all">Go to Zoho Notes</a>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    }

    function showConfigModal() {
        viewerCellsEl.innerHTML = `
            <div class="p-8 bg-[#16171f] border border-white/10 rounded-2xl max-w-md mx-auto text-center space-y-4">
                <div class="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
                    <i data-lucide="key" class="w-6 h-6"></i>
                </div>
                <h3 class="text-base font-bold text-white">Firebase Setup Required</h3>
                <p class="text-xs text-gray-400">Enter your Firebase configuration to connect to this live broadcast session.</p>
                <div class="text-left space-y-2">
                    <label class="text-[11px] font-semibold text-gray-300">Firebase Config JSON or API Key & Database URL</label>
                    <textarea id="manual-firebase-json" placeholder='{"apiKey": "...", "databaseURL": "..."}' class="w-full h-24 p-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-gray-200 outline-none focus:border-[var(--accent)]"></textarea>
                </div>
                <button id="btn-save-manual-config" class="w-full py-2.5 bg-[var(--accent)] hover:brightness-110 font-bold rounded-xl text-xs transition-all">Connect</button>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

        document.getElementById('btn-save-manual-config')?.addEventListener('click', () => {
            const raw = document.getElementById('manual-firebase-json').value.trim();
            try {
                const parsed = JSON.parse(raw);
                if (parsed.apiKey && parsed.databaseURL) {
                    localStorage.setItem('zoho_firebase_config', JSON.stringify(parsed));
                    window.location.reload();
                } else {
                    alert('Configuration must contain apiKey and databaseURL');
                }
            } catch (e) {
                alert('Invalid JSON format');
            }
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Start on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initViewer);
    } else {
        initViewer();
    }
})();
