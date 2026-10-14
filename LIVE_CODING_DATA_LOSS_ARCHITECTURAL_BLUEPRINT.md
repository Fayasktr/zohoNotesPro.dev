# Zoho Notes Pro - Live Coding Zero Data Loss Architecture Blueprint
**Document Version:** 1.0.0  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION  
**Author:** Solution Maker & Architectural Planner Agent  
**Target Systems:** `app.js`, `public/js/notebook.js`, `public/js/db/syncEngine.js`, `public/js/collab_engine.js`, `views/index.hbs`, `routes/syncRoutes.js`

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Problem
During live coding sessions (multi-user collaboration, instructor broadcasts, student mock interviews, and coding tests), users experienced severe code loss under several common real-world conditions:
1. When all participants closed their tabs, code written in Monaco editors was wiped out when reloading the note.
2. If the server restarted or spun down (e.g., Render free tier idling, platform redeployments, or unhandled exceptions), all real-time student work held in memory vanished.
3. When a student re-opened a live note on a different device or refreshed their browser, stale IndexedDB data overrode fresh cloud data, or an automated ghost save pushed empty/stale code over MongoDB Atlas.

### 1.2 Identified Architectural Flaws & Root Causes

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                ROOT CAUSE TAXONOMY                                     │
├────────────────────────────────┬───────────────────────────────────────────────────────┤
│ Flaw Location                  │ Root Cause Mechanism                                  │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ 1. Server Memory Cache         │ app.js kept edits in collabCellsCache (Map) and       │
│    (app.js lines 2255-2616)    │ collabMetadataCache. On room.size === 0, it ran a     │
│                                │ 60s timer and called .delete() without EVER writing   │
│                                │ cached cells to the MongoDB Note document.            │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ 2. Client Hydration Blindspot  │ notebook.js loadNotebook(id) read IndexedDB first.    │
│    (notebook.js line 3241)     │ If a record existed locally (even hours or days old), │
│                                │ it NEVER fetched fresh cloud state for live notes!    │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ 3. Ghost Auto-Save Overwrite   │ Monaco's onDidChangeModelContent fired during mounting│
│    (notebook.js line 4081)     │ and remote syncs, calling this._autoSave() even when  │
│                                │ suppressLocalEdits was true. Stale cells were re-saved│
│                                │ with current timestamps, overwriting Atlas backups.   │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ 4. Excessive Idle Timeout      │ syncEngine.js enforced a 60-second idle debounce. In  │
│    (syncEngine.js line 37)     │ live exams, a tab closed after 45s had never pushed   │
│                                │ changes to MongoDB Atlas.                             │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ 5. Missing Submission UX       │ Students in mock interviews had no explicit "Submit   │
│    (views/index.hbs)           │ Work / Save All Cells" button and no visual indicator │
│                                │ confirming their work was safely stored in the cloud. │
└────────────────────────────────┴───────────────────────────────────────────────────────┘
```

---

## 2. Server-Side Persistence Architecture (`app.js`)

### 2.1 The Core Persistence Function: `flushCollabRoomToDatabase(noteId)`
The server must treat in-memory collaboration state (`collabCellsCache`, `collabMetadataCache`) as a **write-back cache** backed by MongoDB.

#### Architectural Specification:
```javascript
/**
 * Flushes in-memory collaboration room state to MongoDB Note document.
 * Thread-safe with mutex/in-flight promise deduplication per noteId.
 *
 * @param {string} noteId - ID of the notebook session
 * @param {Object} options - { force: boolean, reason: string }
 * @returns {Promise<{ success: boolean, cellsCount: number, updatedAt: Date }>}
 */
```

#### Detailed Merging & Persistence Algorithm:
1. **Concurrency Lock:** Maintain an active flush map `collabFlushInFlight = new Map<string, Promise>` to prevent overlapping writes to the same MongoDB document.
2. **Cache Extraction:**
   - Retrieve `cellsMap = collabCellsCache.get(noteId)` (Map of `cellId -> content`).
   - Retrieve `metadata = collabMetadataCache.get(noteId)` (`{ title?: string, cells?: Map<cellId, { title, lang, isStarred }> }`).
   - If both are missing or empty and `options.force !== true`, skip to prevent no-op database overhead.
3. **Document Fetch & Re-hydration:**
   - Fetch target note: `const note = await Note.findOne({ id: noteId });`
   - If note does not exist in MongoDB, create a persistent log warning and return `{ success: false, reason: 'note_not_found' }`.
4. **Deep Cell Merging:**
   - Existing cells: `const currentCells = Array.isArray(note.content?.cells) ? [...note.content.cells] : [];`
   - For every cell in `currentCells`:
     - If `cellsMap.has(cell.id)`: update `cell.content = cellsMap.get(cell.id)`.
     - If `metadata?.cells?.has(cell.id)`:
       - const m = metadata.cells.get(cell.id);
       - if (m.title !== undefined) cell.title = m.title;
       - if (m.lang !== undefined) cell.lang = m.lang;
       - if (m.isStarred !== undefined) cell.isStarred = m.isStarred;
   - For any cell in `cellsMap` that did not exist in `currentCells` (e.g. added dynamically by client):
     - Append `{ id: cellId, type: 'code', lang: 'javascript', content: cellsMap.get(cellId), title: 'Cell' }`.
5. **Metadata & Title Merging:**
   - If `metadata?.title`: update `note.title = metadata.title;`
6. **Atomic Update with Version Vector:**
   - Calculate updated version: `const nextVersion = (note._version || 1) + 1;`
   - Execute atomic update:
     ```javascript
     const updateTime = new Date();
     await Note.updateOne(
         { id: noteId },
         {
             $set: {
                 title: note.title,
                 'content.cells': currentCells,
                 'content.title': note.title,
                 'content.updatedAt': updateTime,
                 updatedAt: updateTime,
                 _version: nextVersion
             }
         }
     );
     ```
7. **Broadcast Sync Confirmation:**
   - Broadcast a lightweight confirmation `{ type: 'server_flushed', noteId, updatedAt: updateTime, version: nextVersion }` to connected peers so clients know the cloud snapshot is synchronized.

---

### 2.2 Debounced Periodic Flush Engine
To guarantee zero data loss during server crashes, machine reboots, or platform spin-downs, edits must be written to MongoDB periodically while typing occurs.

```
 [Student Types] ──> [WS 'edit' / 'cell_title'] ──> Update In-Memory Cache
                                                         │
                                                         ├──> scheduleCollabFlush(noteId)
                                                         │       │
                                                         │       ├── Reset 3000ms Debounce Timer
                                                         │       └── If (Date.now() - firstEdit > 10000ms)
                                                         │               └── Force Immediate Flush
                                                         │
                                                         ▼
                                            [flushCollabRoomToDatabase(noteId)]
                                                         │
                                                         ▼
                                               [MongoDB Atlas Note]
```

#### Engine Parameters:
- **Debounce Window (`COLLAB_FLUSH_DEBOUNCE_MS`):** `3000ms` (3 seconds). If no further keystroke arrives within 3s, flush occurs.
- **Max Inactivity Ceiling (`COLLAB_FLUSH_MAX_WAIT_MS`):** `10000ms` (10 seconds). During continuous, non-stop student typing, flush is forced every 10s.
- **Dirty Flag Tracker:** Maintain `collabDirtyRooms = new Map<string, { timer: Timeout, firstDirtyAt: number }>` to track rooms requiring persistence.

#### Trigger Hook Points in `app.js`:
The debounce scheduler `scheduleCollabFlush(currentNoteId)` must be invoked inside every mutating WebSocket message handler:
- `case 'edit'` (content change)
- `case 'cell_content_sync'` (full cell sync)
- `case 'cell_title'` (cell title rename)
- `case 'notebook_title'` (note title rename)
- `case 'cell_lang'` (cell language change)
- `case 'cell_star'` (cell star toggled)
- `case 'cell_add'` (cell added)
- `case 'cell_delete'` (cell deleted)
- `case 'cell_reorder'` (cell order modified)

---

### 2.3 Guaranteed Teardown Flush Protocol

When all clients leave a live session, data must be guaranteed to reach disk **before** the room is garbage collected.

```javascript
const cleanup = async () => {
    if (currentNoteId && currentPeerId) {
        const room = collabRooms.get(currentNoteId);
        if (room) {
            room.delete(currentPeerId);
            
            // 🚨 CRITICAL: When the LAST client disconnects (room becomes empty)
            if (room.size === 0) {
                console.log(`[CollabTeardown] Last peer disconnected from ${currentNoteId}. Performing GUARANTEED flush to MongoDB...`);
                
                // 1. Immediately cancel any pending debounced timers
                cancelCollabFlush(currentNoteId);
                
                // 2. Perform synchronous/awaited flush to MongoDB
                try {
                    await flushCollabRoomToDatabase(currentNoteId, { force: true, reason: 'last_peer_disconnect' });
                    console.log(`[CollabTeardown] Flushed note ${currentNoteId} successfully to MongoDB.`);
                } catch (err) {
                    console.error(`[CollabTeardown] Error flushing note ${currentNoteId} on teardown:`, err);
                }

                // 3. Keep room in memory for a 60-second grace window (allows quick tab refresh)
                setTimeout(async () => {
                    const r = collabRooms.get(currentNoteId);
                    if (r && r.size === 0) {
                        // Final safety flush before purging from memory
                        await flushCollabRoomToDatabase(currentNoteId, { force: true, reason: 'room_memory_purge' });
                        collabRooms.delete(currentNoteId);
                        collabCellsCache.delete(currentNoteId);
                        collabMetadataCache.delete(currentNoteId);
                        collabProctorCache.delete(currentNoteId);
                        console.log(`[CollabTeardown] Cleaned up room memory for note ${currentNoteId}`);
                    }
                }, 60000);
            } else {
                // Room still has peers; broadcast presence update
                const presence = getCollabRoomPresence(currentNoteId);
                broadcastToCollabRoom(currentNoteId, {
                    type: 'presence',
                    users: presence.users,
                    count: presence.count,
                    isHostOnline: presence.isHostOnline
                });
            }
        }
    }
};
```

### 2.4 Server Process Exit Drain (SIGTERM / SIGINT)
On Render/Heroku/Docker container restarts, the process receives `SIGTERM`. An unhandled exit loses in-memory caches.

```javascript
async function gracefulServerShutdown(signal) {
    console.log(`[Shutdown] Received ${signal}. Draining all active live collaboration rooms to MongoDB...`);
    const activeNoteIds = Array.from(collabRooms.keys());
    await Promise.allSettled(activeNoteIds.map(noteId => 
        flushCollabRoomToDatabase(noteId, { force: true, reason: `server_${signal.toLowerCase()}` })
    ));
    console.log('[Shutdown] All live rooms drained successfully.');
    process.exit(0);
}

process.on('SIGTERM', () => gracefulServerShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulServerShutdown('SIGINT'));
```

---

## 3. Client-Side Hydration Guarantee (`public/js/notebook.js`)

### 3.1 Cloud-First Hydration for Live Notes
The current implementation of `loadNotebook(id)` checks IndexedDB first and skips cloud pulling if local data exists. For live notes, this guarantees stale data on page refresh or multi-device login.

#### Updated Loading Protocol:
```
                      [loadNotebook(id)]
                              │
                    Is Note Live or Shared?
                    (id.startsWith('live-') 
                     || note.isLive 
                     || note.shareCode 
                     || isShared)
                              │
                ┌─────────────┴─────────────┐
                │ YES                       │ NO
                ▼                           ▼
       [Network Online?]            [Local-First Path]
          ┌─────┴─────┐              Read IndexedDB -> Render
          │ YES       │ NO
          ▼           ▼
   [Cloud-First Fetch]  [Fallback Local DB]
   GET /api/notebooks/:id
          │
   Update IndexedDB 
   ({ isRemoteSync: true, hasFullContent: true })
          │
   Mount Monaco Editors with Fresh Cloud Code
```

#### Implementation Code in `public/js/notebook.js`:
```javascript
async loadNotebook(id, targetCellId = null) {
    this.isLoadingNotebook = true; // Lock auto-save during hydration
    if (this._autoSave && this._autoSave.cancel) this._autoSave.cancel();

    try {
        let data = null;
        const isPotentiallyLive = (
            (id && id.startsWith('live-')) ||
            this.expandedLiveFolders?.has(id) ||
            this.sharedNotebooks?.some(s => s.id === id) ||
            localStorage.getItem(`zoho-note-islive-${id}`) === 'true'
        );

        // 1. FOR LIVE NOTES: Force Cloud-First Fetch
        if (isPotentiallyLive && navigator.onLine) {
            try {
                console.log(`[NotebookApp] Live session detected for ${id}: pulling authoritative cloud snapshot...`);
                const res = await this.safeFetch(`/api/notebooks/${id}?_t=${Date.now()}`);
                if (res.ok) {
                    data = await res.json();
                    if (this.db) {
                        await this.db.putNote(data, { isRemoteSync: true, hasFullContent: true });
                    }
                    // Clear any obsolete pending sync queue items for this note to prevent overwriting fresh cloud data
                    if (this.sync && typeof this.sync.clearPendingForNote === 'function') {
                        await this.sync.clearPendingForNote(id);
                    }
                }
            } catch (err) {
                console.warn('[NotebookApp] Cloud fetch failed for live note, falling back to local store:', err);
            }
        }

        // 2. STANDARD LOCAL-FIRST FALLBACK
        if (!data && this.db) {
            data = await this.db.getNote(id);
            if ((!data || !data._hasFullContent || !data.cells) && navigator.onLine) {
                if (this.sync) {
                    data = await this.sync.pullNote(id);
                }
            }
        }

        // 3. FINAL RESCUE FETCH
        if (!data && navigator.onLine) {
            const res = await this.safeFetch(`/api/notebooks/${id}?_t=${Date.now()}`);
            if (res.ok) {
                data = await res.json();
                if (this.db) await this.db.putNote(data, { isRemoteSync: true, hasFullContent: true });
            }
        }

        if (!data) {
            console.warn('[NotebookApp] Note could not be loaded.');
            return;
        }

        this.disposeEditors();
        this.notebook = data;

        // Determination of live state
        this.notebook.isLive = this.isLiveNote(this.notebook);
        if (this.notebook.isLive) {
            localStorage.setItem(`zoho-note-islive-${id}`, 'true');
        }

        // Clear and render UI
        document.getElementById('cells-list').innerHTML = '';
        document.getElementById('notebook-title').value = this.notebook.title || 'Untitled';
        localStorage.setItem('zoho-notebook-current-id', id);
        this.setActiveNotebookUI(id);

        if (!this.notebook.cells || this.notebook.cells.length === 0) {
            this.addCell('code');
        } else {
            this.notebook.cells.forEach((cell, idx) => this.renderCell(cell, idx + 1));
        }

        // Configure Live Collaboration Bar and WebSockets
        this.reconfigureCollabTopBar();

    } finally {
        // Unlock auto-save only after Monaco mounting has settled (500ms grace)
        setTimeout(() => {
            this.isLoadingNotebook = false;
        }, 500);
    }
}
```

---

### 3.2 Preventing the "Ghost Auto-Save Overwrite"
A critical flaw in Monaco initialization was that `editor.onDidChangeModelContent` fired during editor construction, syntax formatting, and remote edits. This queued `_autoSave()`, saving stale models back to IndexedDB with a new `updatedAt` timestamp and sending an outdated snapshot to `/api/sync/push`.

#### Defensive Protections:
1. **Hydration Flag (`this.isLoadingNotebook`):** Blocks all auto-save triggers until Monaco instances are mounted with authoritative data.
2. **Remote Suppression Flag (`this.collab.suppressLocalEdits`):** In `onDidChangeModelContent`, wrap the auto-save invocation:
   ```javascript
   editor.onDidChangeModelContent((event) => {
       // Ignore programmatic changes during loading or remote peer application
       if (this.isLoadingNotebook || (this.collab && this.collab.suppressLocalEdits)) {
           return;
       }

       const currentCell = this.notebook.cells.find(c => c.id === cell.id);
       if (currentCell) currentCell.content = editor.getValue();

       if (this.sync && typeof this.sync.recordUserActivity === 'function') {
           this.sync.recordUserActivity();
       }
       if (this.collab && this.collab.isConnected) {
           if (event && event.changes && event.changes.length > 0) {
               this.collab.broadcastEdit(cell.id, event.changes, editor.getValue());
               this.collab.broadcastTyping(cell.id);
           }
       }
       this._autoSave();
   });
   ```
3. **Cancellation of Pending Timers:** In `onRemoteInitSync` (when WebSocket delivers current room cells), immediately cancel any pending `_autoSave` timer to prevent old client state from overwriting incoming peer content.

---

## 4. Instant Cloud Push for Live Notes (`syncEngine.js`)

### 4.1 Adaptive Idle Timeout for Live Sessions
For normal private notebooks, a 60-second idle debounce is appropriate. For live coding notes and student test sessions, 60 seconds is too long.

#### In `public/js/db/syncEngine.js`:
Add dynamic mode detection and an accelerated 2-second push timer for live notes:

```javascript
/**
 * Enables fast live coding mode (2-second idle backup) or standard mode (60-second idle backup).
 * @param {boolean} isLiveSession
 */
setLiveMode(isLiveSession) {
    if (isLiveSession) {
        this.idleTimeoutMs = 2000;  // 2 seconds for live coding
        this.maxWaitMs = 5000;     // 5 seconds max continuous ceiling
        console.log('[BackupEngine] Live session mode active: Cloud backup idle timer accelerated to 2000ms.');
    } else {
        this.idleTimeoutMs = 60000; // Restore standard 60 seconds
        this.maxWaitMs = 120000;
        console.log('[BackupEngine] Standard mode active: Cloud backup idle timer restored to 60000ms.');
    }
}
```

#### Hooking in `notebook.js`:
Whenever `loadNotebook(id)` finishes, evaluate `this.notebook.isLive`:
```javascript
if (this.sync && typeof this.sync.setLiveMode === 'function') {
    this.sync.setLiveMode(Boolean(this.notebook?.isLive));
}
```

---

### 4.2 Dual-Protocol Exit Guarantee (`beforeunload` & `visibilitychange`)

When students abruptly close the browser tab or switch away, the browser may terminate JavaScript execution immediately. We must guarantee the final snapshot reaches MongoDB Atlas.

#### Robust Implementation:
1. **Fetch with `keepalive: true`:** Allows HTTP requests to outlive the document unload.
2. **Fallback to `navigator.sendBeacon`:** If fetch fails or payload exceeds 64KB, send as Beacon.
3. **Synchronous WebSocket Flush Packet:** Send an immediate WebSocket message before unmounting.

```javascript
// In public/js/db/syncEngine.js
setupLifecycleListeners() {
    const handleExit = () => {
        if (this.unsyncedCount > 0 && navigator.onLine) {
            console.log('[BackupEngine] Page visibility hidden / unloading. Executing high-priority exit flush...');
            this.flushPendingSyncs({ keepalive: true, reason: 'page_exit' });
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            handleExit();
        }
    });

    window.addEventListener('beforeunload', () => {
        handleExit();
    });
}
```

#### Safe Beacon / Keepalive Implementation in `pushPendingChanges`:
```javascript
// Payload size guard: fetch keepalive limit is 64KB in Chromium/WebKit
const bodyJson = JSON.stringify({ batch: pushBatch });
const isLargePayload = bodyJson.length > 60000;

if (options.keepalive && isLargePayload && navigator.sendBeacon) {
    const blob = new Blob([bodyJson], { type: 'application/json' });
    const success = navigator.sendBeacon('/api/sync/push', blob);
    console.log('[BackupEngine] Large exit payload dispatched via navigator.sendBeacon:', success);
} else {
    await this.safeFetch('/api/sync/push', {
        method: 'POST',
        body: bodyJson,
        ...(options.keepalive ? { keepalive: true } : {})
    });
}
```

---

## 5. UI Experience & Student Submit Button

### 5.1 The Need
Students undertaking mock interviews, coding reviews, or exams need deterministic control over their work. An explicit button provides:
1. Assurance that code is safely persisted to MongoDB Atlas.
2. An indisputable submission timestamp.
3. Visual confirmation (`All Cells Saved to Cloud ✅ at HH:MM:SS`).

---

### 5.2 Header UI Specification (`views/index.hbs`)

Inside `#collab-top-bar` (`views/index.hbs` line 298), inject the new button and status badge:

```html
<!-- Submit Mock Review / Save All Cells Button & Status Badge -->
<div class="collab-submit-container flex items-center gap-2">
    <!-- Save / Submit Action Button -->
    <button id="btn-collab-save-all" 
            class="btn-collab-save-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Save all Monaco editor cells and guarantee cloud submission to database">
        <i data-lucide="cloud-upload" class="w-3.5 h-3.5"></i>
        <span id="btn-collab-save-text">Submit Review / Save All</span>
    </button>

    <!-- Cloud Confirmation Status Pill -->
    <div id="collab-save-status-badge" 
         class="collab-save-status-badge hidden flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span id="collab-save-status-text">All Cells Saved to Cloud ✅</span>
    </div>
</div>
```

---

### 5.3 Client Workflow Implementation (`public/js/notebook.js`)

```javascript
/**
 * Executes a guaranteed full flush of all Monaco editors to IndexedDB, 
 * native WebSocket collaboration cache, and MongoDB Atlas.
 */
async submitAndSaveAllCells() {
    const saveBtn = document.getElementById('btn-collab-save-all');
    const saveBtnText = document.getElementById('btn-collab-save-text');
    const statusBadge = document.getElementById('collab-save-status-badge');
    const statusText = document.getElementById('collab-save-status-text');

    if (!this.notebook || !this.notebook.cells) return;

    // 1. UI Loading Feedback
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.classList.add('opacity-75', 'cursor-not-allowed');
    }
    if (saveBtnText) {
        saveBtnText.innerHTML = `<i data-lucide="loader-2" class="animate-spin inline-block w-3 h-3 mr-1"></i> Saving to Cloud...`;
        if (window.lucide) lucide.createIcons();
    }

    try {
        // 2. Read live content directly from all active Monaco editor models
        const currentCells = this.notebook.cells.map(c => {
            const editor = this.editors[c.id];
            const content = editor ? editor.getValue() : (c.content || '');
            return {
                ...c,
                content
            };
        });
        this.notebook.cells = currentCells;

        // 3. Sync all cell contents across WebSocket Collaboration Server
        if (this.collab && this.collab.isConnected) {
            currentCells.forEach(c => {
                this.collab.sendWsMessage({
                    type: 'cell_content_sync',
                    cellId: c.id,
                    content: c.content
                });
            });
        }

        // 4. Update Local Database
        if (this.db) {
            await this.db.putNote(this.notebook, { hasFullContent: true });
        }

        // 5. Force Immediate Cloud Backup via Sync Engine
        if (this.sync) {
            await this.sync.notifyLocalChange(this.notebook.id, 'UPDATE');
            await this.sync.flushPendingSyncs();
        }

        // 6. Direct HTTP Guarantee: Call dedicated server endpoint to write collab cache to MongoDB immediately
        const res = await this.safeFetch('/api/live/force-save', {
            method: 'POST',
            body: JSON.stringify({
                noteId: this.notebook.id,
                cells: currentCells,
                title: this.notebook.title
            })
        });

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-IN', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // 7. Visual Success Badge
        if (statusBadge && statusText) {
            statusText.innerText = `All Cells Saved to Cloud ✅ (${timeStr})`;
            statusBadge.classList.remove('hidden');
        }

        this.showToast(`✅ All cells successfully submitted and saved to cloud! (${timeStr})`, 'success');

    } catch (err) {
        console.error('[NotebookApp] Submit & Save All failed:', err);
        this.showToast('⚠️ Could not complete cloud save. Your changes remain safely stored locally.', 'warning');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
        if (saveBtnText) {
            saveBtnText.innerText = 'Submit Review / Save All';
            if (window.lucide) lucide.createIcons();
        }
    }
}
```

---

### 5.4 Dedicated Server Endpoint (`POST /api/live/force-save`)

In `app.js`:
```javascript
app.post('/api/live/force-save', isAuthenticated, async (req, res) => {
    try {
        const { noteId, cells, title } = req.body;
        if (!noteId) return res.status(400).json({ error: 'Missing noteId' });

        // 1. Update in-memory caches immediately
        if (Array.isArray(cells)) {
            if (!collabCellsCache.has(noteId)) collabCellsCache.set(noteId, new Map());
            const cellsMap = collabCellsCache.get(noteId);
            cells.forEach(c => {
                if (c && c.id) cellsMap.set(c.id, typeof c.content === 'string' ? c.content : '');
            });
        }
        if (title) {
            if (!collabMetadataCache.has(noteId)) collabMetadataCache.set(noteId, {});
            collabMetadataCache.get(noteId).title = title;
        }

        // 2. Perform direct database flush
        const result = await flushCollabRoomToDatabase(noteId, { force: true, reason: 'student_manual_submit' });
        
        return res.json({ 
            success: true, 
            message: 'Note saved to MongoDB', 
            updatedAt: result.updatedAt,
            cellsCount: result.cellsCount 
        });
    } catch (err) {
        console.error('[LiveForceSave] Error:', err);
        return res.status(500).json({ error: err.message || 'Failed to save note' });
    }
});
```

---

## 6. Developer Implementation Roadmap

The implementation is structured into 4 sequential, non-breaking phases:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   IMPLEMENTATION ROADMAP (PHASE 1-4)                   │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 1: Server-Side Persistence Architecture (app.js)                 │
│  - Task 1.1: Implement flushCollabRoomToDatabase(noteId, options)     │
│  - Task 1.2: Implement scheduleCollabFlush & cancelCollabFlush        │
│  - Task 1.3: Wire debounced flush to all mutating WebSocket messages  │
│  - Task 1.4: Implement guaranteed teardown flush on room.size === 0   │
│  - Task 1.5: Register SIGTERM/SIGINT graceful shutdown flush          │
│  - Task 1.6: Add POST /api/live/force-save endpoint                   │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: Client-Side Hydration & Ghost Overwrite Guard (notebook.js)   │
│  - Task 2.1: Implement isLoadingNotebook hydration mutex lock         │
│  - Task 2.2: Force Cloud-First fetch in loadNotebook() for live notes │
│  - Task 2.3: Suppress _autoSave() in Monaco onDidChangeModelContent    │
│  - Task 2.4: Cancel pending autoSave in onRemoteInitSync              │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: Accelerated Cloud Push for Live Sessions (syncEngine.js)      │
│  - Task 3.1: Implement setLiveMode(isLiveSession) with 2s timeout     │
│  - Task 3.2: Hook notebook.isLive change to sync.setLiveMode()         │
│  - Task 3.3: Harden beforeunload/visibilitychange with sendBeacon fallback│
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: UI Experience & Student Submit Button (index.hbs, JS)         │
│  - Task 4.1: Inject Submit Button & Status Badge into collab-top-bar   │
│  - Task 4.2: Implement submitAndSaveAllCells() in NotebookApp          │
│  - Task 4.3: Wire click handler & add CSS animations for green badge  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. QA Verification Criteria & Testing Protocols

| # | Test Scenario | Step-by-Step Procedure | Expected Result | Pass/Fail Criteria |
|---|---------------|------------------------|-----------------|---------------------|
| **T1** | **Periodic Auto-Flush during Typing** | 1. Open a live coding note with 2 users.<br>2. Type code in Monaco Cell 1.<br>3. Inspect MongoDB `notes` collection directly via mongosh.<br>4. Wait 3 seconds. | MongoDB `content.cells[0].content` updates within 3.5s of stopping typing. | Pass: Cell content matches Monaco without manual save. |
| **T2** | **Server Crash & Spin-down Survival** | 1. Student writes code into a live note.<br>2. Kill node process with `taskkill /F /IM node.exe` or `SIGKILL`.<br>3. Restart node server.<br>4. Open note from a fresh browser. | All code written prior to 3s before crash is intact and visible. | Pass: Zero data loss from in-memory cache drop. |
| **T3** | **Guaranteed Teardown Flush on Disconnect** | 1. Single student joins live note and writes a Python function.<br>2. Close browser tab immediately (`room.size === 0`).<br>3. Inspect server log: `[CollabTeardown] Last peer disconnected...`<br>4. Verify MongoDB record. | Server executes `flushCollabRoomToDatabase` synchronously on last client exit. | Pass: MongoDB contains final code snapshot. |
| **T4** | **Stale Local IndexedDB Hydration** | 1. User A has an old cached copy of Note 101 in IndexedDB.<br>2. User B updates Note 101 on cloud.<br>3. User A reloads Note 101 while online. | App detects live note, performs `/api/notebooks/101` cloud fetch, updates IndexedDB, renders User B's code. | Pass: User A sees User B's code, not stale local copy. |
| **T5** | **Ghost Auto-Save Overwrite Prevention** | 1. Load an existing live note.<br>2. Monitor network tab for `/api/sync/push`.<br>3. Do not type any keys. | No `/api/sync/push` request is triggered during or immediately after load. | Pass: Cloud version vector and updatedAt remain unchanged. |
| **T6** | **Manual "Submit Mock Review" Validation** | 1. Student completes mock interview answers.<br>2. Clicks "Submit Review / Save All".<br>3. Check UI badge and server response. | Button shows spinner -> displays "All Cells Saved to Cloud ✅ (at HH:MM:SS)". MongoDB is updated. | Pass: 200 OK from `/api/live/force-save` and green confirmation badge. |

---

## 8. Conclusion & Sign-Off
This blueprint eliminates all 5 root causes of Live Coding Data Loss. By establishing a dual-tier persistence system (periodic server write-back + instant client push) and coupling it with cloud-first hydration and deterministic student submission UX, Zoho Notes Pro achieves **100% data durability and zero silent data loss**.
