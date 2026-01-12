class SharingApp {
    constructor() {
        this.init();
        this.setupEventListeners();
    }

    async init() {
        await Promise.all([
            this.loadMyNotebooks(),
            this.loadPendingInvites(),
            this.loadMyShared()
        ]);
        lucide.createIcons();
    }

    setupEventListeners() {
        document.getElementById('btn-send-invite').addEventListener('click', () => this.sendInvite());
    }

    async safeFetch(url, options = {}) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        const method = (options.method || 'GET').toUpperCase();
        const nonMutating = ['GET', 'HEAD', 'OPTIONS'];

        if (csrfToken && !nonMutating.includes(method)) {
            options.headers = {
                ...options.headers,
                'X-CSRF-Token': csrfToken,
                'Content-Type': 'application/json'
            };
        }
        return window.fetch(url, options);
    }

    async loadMyNotebooks() {
        const select = document.getElementById('invite-notebook');
        try {
            const res = await this.safeFetch('/api/notebooks');
            const notebooks = await res.json();

            // Filter to only owned notebooks (not shared with me)
            const myNotebooks = notebooks.filter(nb => !nb.isShared);

            select.innerHTML = '<option value="" disabled selected>Choose a notebook...</option>' +
                myNotebooks.map(nb => `<option value="${nb.id}">${nb.title}</option>`).join('');
        } catch (err) {
            console.error('Failed to load notebooks', err);
        }
    }

    async loadPendingInvites() {
        const list = document.getElementById('pending-invites-list');
        try {
            const res = await this.safeFetch('/api/share/invites');
            const invites = await res.json();

            if (invites.length === 0) {
                list.innerHTML = '<p class="text-center py-10 opacity-30 italic">No pending invitations.</p>';
                return;
            }

            list.innerHTML = invites.map(inv => `
                <div class="bg-[#ffffff05] border border-[#ffffff1a] p-5 rounded-2xl">
                    <div class="font-bold mb-1">${inv.title}</div>
                    <div class="text-xs text-[#a0a0a5] mb-4">From: ${inv.ownerName} (${inv.ownerEmail})</div>
                    <div class="flex gap-2">
                        <button onclick="sharingApp.respond('${inv.notebookId}', 'accepted')" class="flex-1 bg-[#30ff6a] text-[#0a0a0c] py-2.5 rounded-xl font-bold text-sm hover:scale-[1.02] transition-all">Accept</button>
                        <button onclick="sharingApp.respond('${inv.notebookId}', 'declined')" class="flex-1 bg-[#ffffff1a] text-white py-2.5 rounded-xl font-bold text-sm hover:bg-[#ffffff2a] transition-all">Decline</button>
                    </div>
                </div>
            `).join('');
            lucide.createIcons();
        } catch (err) {
            list.innerHTML = '<p class="text-center py-10 text-red-500">Failed to load invites.</p>';
        }
    }

    async loadMyShared() {
        const list = document.getElementById('my-shared-list');
        try {
            const res = await this.safeFetch('/api/share/my-shared');
            const notebooks = await res.json();

            if (notebooks.length === 0) {
                list.innerHTML = '<p class="text-center py-10 opacity-30 italic">No notebooks shared yet.</p>';
                return;
            }

            list.innerHTML = notebooks.map(nb => `
                <div class="bg-[#ffffff05] border border-[#ffffff1a] p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <div class="font-bold text-lg mb-1">${nb.title}</div>
                        <div class="flex flex-wrap gap-2">
                            ${nb.collaborators.map(c => `
                                <span class="bg-[#6d5dfc1a] text-[#6d5dfc] text-[10px] px-2 py-1 rounded-full border border-[#6d5dfc33]">
                                    ${c.email} (${c.status})
                                </span>
                            `).join('')}
                        </div>
                    </div>
                    <i data-lucide="chevron-right" class="text-[#a0a0a5]"></i>
                </div>
            `).join('');
            lucide.createIcons();
        } catch (err) {
            list.innerHTML = '<p class="text-center py-10 text-red-500">Failed to load shared list.</p>';
        }
    }

    async sendInvite() {
        const email = document.getElementById('invite-email').value.trim();
        const notebookId = document.getElementById('invite-notebook').value;

        if (!email || !notebookId) {
            this.showToast('Error', 'Please fill all fields', 'error');
            return;
        }

        try {
            const res = await this.safeFetch('/api/share/invite', {
                method: 'POST',
                body: JSON.stringify({ email, notebookId })
            });
            const data = await res.json();

            if (data.success) {
                this.showToast('Success', data.message, 'success');
                document.getElementById('invite-email').value = '';
                this.loadMyShared();
            } else {
                this.showToast('Error', data.error, 'error');
            }
        } catch (err) {
            this.showToast('Error', 'Network request failed', 'error');
        }
    }

    async respond(notebookId, response) {
        try {
            const res = await this.safeFetch('/api/share/respond', {
                method: 'POST',
                body: JSON.stringify({ notebookId, response })
            });
            const data = await res.json();

            if (data.success) {
                this.showToast(response === 'accepted' ? 'Accepted!' : 'Declined',
                    response === 'accepted' ? 'Notebook is now in your list.' : 'Invite removed.',
                    'success');
                this.loadPendingInvites();
                if (response === 'accepted') {
                    setTimeout(() => window.location.href = '/', 1500);
                }
            } else {
                this.showToast('Error', data.error, 'error');
            }
        } catch (err) {
            this.showToast('Error', 'Action failed', 'error');
        }
    }

    showToast(title, message, type) {
        const toast = document.getElementById('toast');
        const tTitle = document.getElementById('toast-title');
        const tMsg = document.getElementById('toast-message');
        const tIcon = document.getElementById('toast-icon');

        tTitle.innerText = title;
        tMsg.innerText = message;

        if (type === 'success') {
            tIcon.className = 'w-10 h-10 rounded-full flex items-center justify-center bg-[#30ff6a1a] text-[#30ff6a]';
            tIcon.innerHTML = '<i data-lucide="check" class="w-5 h-5"></i>';
        } else {
            tIcon.className = 'w-10 h-10 rounded-full flex items-center justify-center bg-[#ff3b301a] text-[#ff3b30]';
            tIcon.innerHTML = '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
        }

        lucide.createIcons();
        toast.classList.replace('translate-y-24', 'translate-y-0');
        toast.classList.replace('opacity-0', 'opacity-100');

        setTimeout(() => {
            toast.classList.replace('translate-y-0', 'translate-y-24');
            toast.classList.replace('opacity-100', 'opacity-0');
        }, 4000);
    }
}

window.sharingApp = new SharingApp();
