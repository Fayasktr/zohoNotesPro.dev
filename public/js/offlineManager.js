/**
 * Zoho Notes Pro - Offline Manager & Sync Status Badge
 * 
 * Provides:
 * - Live Sync Badge UI (Synced / Syncing / Unsynced Changes / Offline / Auth Required)
 * - Interactive Telemetry Modal showing Local Storage Usage & Last Atlas Backup
 * - Pre-warm Offline Runtimes (Pyodide WASM + TypeScript)
 * - Auth Expiration Notice on Reconnection
 * - Toast Notifications on Network Transitions
 */

(function (window) {
    'use strict';

    class OfflineManager {
        constructor() {
            this.db = window.ZohoLocalDB;
            this.sync = window.ZohoSyncEngine;
            this.badgeElement = null;
            this.modalElement = null;
            this.init();
        }

        async init() {
            this.createSyncBadgeUI();
            this.createSyncDetailsModal();
            this.setupSyncSubscription();
            this.setupNetworkToasts();
        }

        createSyncBadgeUI() {
            // Find header bar or top container
            const header = document.querySelector('header') || document.querySelector('.header') || document.querySelector('#header') || document.getElementById('notebook-title')?.parentElement?.parentElement;
            if (!header) {
                console.warn('[OfflineManager] Top header container not found, appending badge to body');
            }

            const badgeContainer = document.createElement('div');
            badgeContainer.id = 'zoho-sync-badge-container';
            badgeContainer.className = 'flex items-center gap-2 cursor-pointer select-none';
            badgeContainer.innerHTML = `
                <button id="zoho-sync-badge-btn" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#ffffff0a] border border-[#ffffff1a] hover:bg-[#ffffff15] text-xs font-semibold transition-all shadow-sm" title="Click for Cloud Sync & Storage Details">
                    <span id="zoho-sync-dot" class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                    <span id="zoho-sync-text" class="text-zinc-300">Synced</span>
                    <span id="zoho-sync-count" class="hidden px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[10px] rounded-full font-bold">0</span>
                </button>
            `;

            // Insert into header right actions if possible
            const actionContainer = document.querySelector('.header-actions') || document.querySelector('#header-actions') || header;
            if (actionContainer) {
                actionContainer.prepend(badgeContainer);
            } else {
                document.body.appendChild(badgeContainer);
            }

            this.badgeElement = document.getElementById('zoho-sync-badge-btn');
            if (this.badgeElement) {
                this.badgeElement.addEventListener('click', () => this.toggleSyncModal());
            }
        }

        createSyncDetailsModal() {
            const modal = document.createElement('div');
            modal.id = 'zoho-sync-modal';
            modal.className = 'fixed inset-0 z-[4000] hidden items-center justify-center bg-black/60 backdrop-blur-sm p-4';
            modal.innerHTML = `
                <div class="bg-[#151518] border border-[#ffffff1a] rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-zinc-200">
                    <button id="zoho-sync-modal-close" class="absolute top-4 right-4 text-zinc-400 hover:text-white text-lg font-bold">&times;</button>
                    
                    <div class="flex items-center gap-3 mb-5 border-b border-[#ffffff1a] pb-4">
                        <div class="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                            <i data-lucide="cloud" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <h3 class="font-bold text-base text-white">Cloud Backup & Storage</h3>
                            <p class="text-xs text-zinc-400">Local-First Reactive Architecture</p>
                        </div>
                    </div>

                    <div class="space-y-4 text-sm">
                        <div class="flex justify-between items-center bg-[#ffffff05] p-3 rounded-xl border border-[#ffffff0a]">
                            <span class="text-zinc-400">Sync Status:</span>
                            <span id="modal-sync-status-badge" class="font-bold text-green-400">🟢 Backed up to Atlas</span>
                        </div>

                        <div class="flex justify-between items-center bg-[#ffffff05] p-3 rounded-xl border border-[#ffffff0a]">
                            <span class="text-zinc-400">Unsynced Changes:</span>
                            <span id="modal-unsynced-count" class="font-bold text-zinc-200">0 notes</span>
                        </div>

                        <div class="flex justify-between items-center bg-[#ffffff05] p-3 rounded-xl border border-[#ffffff0a]">
                            <span class="text-zinc-400">Last Atlas Sync:</span>
                            <span id="modal-last-sync-time" class="font-bold text-zinc-200">Never</span>
                        </div>

                        <div class="bg-[#ffffff05] p-3 rounded-xl border border-[#ffffff0a] space-y-2">
                            <div class="flex justify-between text-xs text-zinc-400">
                                <span>IndexedDB Storage</span>
                                <span id="modal-storage-text">Calculating...</span>
                            </div>
                            <div class="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                                <div id="modal-storage-bar" class="bg-indigo-500 h-2 rounded-full transition-all duration-500" style="width: 2%"></div>
                            </div>
                            <p class="text-[11px] text-zinc-500">Atomic transactions ensure zero data loss even on sudden laptop shutdown.</p>
                        </div>

                        <div class="bg-indigo-950/30 border border-indigo-500/20 p-3 rounded-xl flex items-center justify-between">
                            <div>
                                <div class="text-xs font-semibold text-indigo-300">Offline Runtime Pack</div>
                                <div class="text-[11px] text-zinc-400">Pre-download Python WASM & TS compilers</div>
                            </div>
                            <button id="btn-prewarm-runtimes" class="px-3 py-1.5 bg-indigo-600/50 hover:bg-indigo-600 text-indigo-200 text-xs font-medium rounded-lg transition-all">
                                ⚡ Pre-warm
                            </button>
                        </div>
                    </div>

                    <div class="mt-6 flex gap-3">
                        <button id="btn-manual-sync" class="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/30">
                            <i data-lucide="refresh-cw" class="w-4 h-4"></i> Sync with Cloud Now
                        </button>
                        <button id="zoho-sync-modal-close-btn" class="py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl text-xs transition-all">
                            Close
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            this.modalElement = modal;

            document.getElementById('zoho-sync-modal-close')?.addEventListener('click', () => this.toggleSyncModal(false));
            document.getElementById('zoho-sync-modal-close-btn')?.addEventListener('click', () => this.toggleSyncModal(false));
            document.getElementById('btn-manual-sync')?.addEventListener('click', () => {
                const btn = document.getElementById('btn-manual-sync');
                if (btn) btn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> Syncing...';
                this.sync.syncNow({ immediate: true }).finally(() => {
                    if (btn) btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i> Sync with Cloud Now';
                    if (window.lucide) window.lucide.createIcons();
                    this.updateModalInfo();
                });
            });

            document.getElementById('btn-prewarm-runtimes')?.addEventListener('click', () => {
                if (window.ZohoBrowserEngine && typeof window.ZohoBrowserEngine.prewarm === 'function') {
                    const btn = document.getElementById('btn-prewarm-runtimes');
                    if (btn) btn.innerText = 'Downloading...';
                    window.ZohoBrowserEngine.prewarm().finally(() => {
                        if (btn) btn.innerText = '✅ Cached';
                    });
                }
            });

            if (window.lucide) window.lucide.createIcons();
        }

        setupSyncSubscription() {
            if (!this.sync) return;

            this.sync.onStatusChange((info) => {
                this.updateBadgeUI(info);
                this.updateModalInfo(info);
            });
        }

        updateBadgeUI(info) {
            const dot = document.getElementById('zoho-sync-dot');
            const text = document.getElementById('zoho-sync-text');
            const count = document.getElementById('zoho-sync-count');

            if (!dot || !text) return;

            switch (info.status) {
                case 'SYNCED':
                    dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
                    text.innerText = 'Synced';
                    text.className = 'text-emerald-300';
                    if (count) count.classList.add('hidden');
                    break;

                case 'SYNCING':
                    dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-spin';
                    text.innerText = 'Syncing...';
                    text.className = 'text-amber-300';
                    if (count) count.classList.add('hidden');
                    break;

                case 'PENDING':
                    dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
                    text.innerText = 'Unsynced';
                    text.className = 'text-amber-400';
                    if (count) {
                        count.innerText = `${info.unsyncedCount}`;
                        count.classList.remove('hidden');
                    }
                    break;

                case 'AUTH_REQUIRED':
                    dot.className = 'w-2 h-2 rounded-full bg-rose-500 animate-pulse';
                    text.innerText = 'Log In';
                    text.className = 'text-rose-400';
                    if (count) {
                        count.innerText = `${info.unsyncedCount}`;
                        count.classList.remove('hidden');
                    }
                    break;

                case 'OFFLINE':
                    dot.className = 'w-2 h-2 rounded-full bg-rose-500';
                    text.innerText = 'Offline';
                    text.className = 'text-rose-400';
                    if (count) {
                        count.innerText = `${info.unsyncedCount}`;
                        if (info.unsyncedCount > 0) count.classList.remove('hidden');
                        else count.classList.add('hidden');
                    }
                    break;
            }
        }

        async updateModalInfo(info = {}) {
            const statusBadge = document.getElementById('modal-sync-status-badge');
            const unsyncedEl = document.getElementById('modal-unsynced-count');
            const lastSyncEl = document.getElementById('modal-last-sync-time');
            const storageText = document.getElementById('modal-storage-text');
            const storageBar = document.getElementById('modal-storage-bar');

            if (statusBadge) {
                const s = info.status || this.sync?.status || 'SYNCED';
                if (s === 'SYNCED') statusBadge.innerHTML = '<span class="text-emerald-400 font-bold">🟢 Backed up to Atlas</span>';
                else if (s === 'SYNCING') statusBadge.innerHTML = '<span class="text-amber-400 font-bold">🟡 Synchronizing...</span>';
                else if (s === 'PENDING') statusBadge.innerHTML = '<span class="text-amber-400 font-bold">🟠 Pending Cloud Backup</span>';
                else if (s === 'AUTH_REQUIRED') statusBadge.innerHTML = '<span class="text-rose-400 font-bold">🔒 Session Expired (Saved Locally)</span>';
                else if (s === 'OFFLINE') statusBadge.innerHTML = '<span class="text-rose-400 font-bold">🔴 Offline (Saved in IndexedDB)</span>';
            }

            if (unsyncedEl) {
                const count = info.unsyncedCount !== undefined ? info.unsyncedCount : (this.sync?.unsyncedCount || 0);
                unsyncedEl.innerText = `${count} note${count === 1 ? '' : 's'}`;
            }

            if (lastSyncEl) {
                const lastTime = info.lastSyncTime || this.sync?.lastSyncTime;
                lastSyncEl.innerText = lastTime ? new Date(lastTime).toLocaleTimeString() : 'In Progress';
            }

            if (storageText && storageBar) {
                const estimate = await this.db.getStorageEstimate();
                if (estimate.supported) {
                    storageText.innerText = `${estimate.usedMB} MB used (${estimate.percentUsed}% of ${estimate.quotaMB} MB)`;
                    storageBar.style.width = `${Math.max(2, Math.min(100, estimate.percentUsed))}%`;
                    if (estimate.isNearFull) storageBar.className = 'bg-rose-500 h-2 rounded-full';
                    else storageBar.className = 'bg-indigo-500 h-2 rounded-full';
                } else {
                    storageText.innerText = 'Unlimited (IndexedDB Available)';
                    storageBar.style.width = '10%';
                }
            }
        }

        showAuthExpiredNotice() {
            this.showToast('🔒 Session Expired: Your changes are safely saved in local storage. Please log in to backup to cloud.', 'error');
        }

        toggleSyncModal(show = null) {
            if (!this.modalElement) return;
            const shouldOpen = show !== null ? show : this.modalElement.classList.contains('hidden');
            if (shouldOpen) {
                this.modalElement.classList.remove('hidden');
                this.modalElement.classList.add('flex');
                this.updateModalInfo();
                if (window.lucide) window.lucide.createIcons();
            } else {
                this.modalElement.classList.add('hidden');
                this.modalElement.classList.remove('flex');
            }
        }

        setupNetworkToasts() {
            window.addEventListener('online', () => {
                this.showToast('🌐 Internet connection restored. Synchronizing notes...', 'success');
            });

            window.addEventListener('offline', () => {
                this.showToast('🔌 You are offline. Notes are safely saved in local storage.', 'info');
            });
        }

        showToast(message, type = 'info') {
            const toast = document.getElementById('toast');
            if (!toast) return;
            const titleEl = document.getElementById('toast-title');
            const msgEl = document.getElementById('toast-message');
            const iconEl = document.getElementById('toast-icon');

            if (titleEl) titleEl.innerText = type === 'error' ? 'Notice' : (type === 'success' ? 'Online' : 'Network');
            if (msgEl) msgEl.innerText = message;
            if (iconEl) {
                iconEl.className = `w-10 h-10 rounded-full flex items-center justify-center ${type === 'error' ? 'bg-red-500/20 text-red-400' : (type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400')}`;
            }

            toast.classList.remove('translate-y-24', 'opacity-0');
            setTimeout(() => {
                toast.classList.add('translate-y-24', 'opacity-0');
            }, 4500);
        }
    }

    // Export singleton
    window.ZohoOfflineManager = new OfflineManager();
})(window);
