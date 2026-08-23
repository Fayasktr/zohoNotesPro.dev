const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const TrashedCell = require('../models/TrashedCell');

/**
 * GET /api/sync/hydrate
 * Returns full hydration dataset (all notes with complete cells & metadata)
 * Ensures 100% offline availability of all notes on the client without empty stubs.
 */
router.get('/hydrate', async (req, res) => {
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const notes = await Note.find({
            $or: [
                { owner: userId },
                { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
            ]
        }).sort({ updatedAt: -1 }).lean();

        const formatted = notes.map(n => ({
            id: n.id,
            title: n.title || 'Untitled Notebook',
            folder: n.folder || 'root',
            isStarred: !!n.isStarred,
            isTrashed: !!n.isTrashed,
            trashedAt: n.trashedAt ? new Date(n.trashedAt).getTime() : null,
            cells: Array.isArray(n.content?.cells) ? n.content.cells : (Array.isArray(n.cells) ? n.cells : []),
            tags: Array.isArray(n.content?.tags) ? n.content.tags : (Array.isArray(n.tags) ? n.tags : []),
            updatedAt: n.updatedAt ? new Date(n.updatedAt).getTime() : Date.now(),
            _version: typeof n._version === 'number' ? n._version : 1,
            owner: String(n.owner)
        }));

        res.json({
            success: true,
            count: formatted.length,
            serverTime: Date.now(),
            notes: formatted
        });
    } catch (err) {
        console.error('[SyncRoute] Hydrate error:', err);
        res.status(500).json({ error: 'Failed to hydrate notes' });
    }
});

/**
 * GET /api/sync/manifest
 * Returns lightweight manifest of notes with versions & timestamps
 */
router.get('/manifest', async (req, res) => {
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // Retrieve notes owned by user or shared with user
        const notes = await Note.find({
            $or: [
                { owner: userId },
                { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
            ]
        }, 'id title folder isStarred isTrashed trashedAt updatedAt _version owner').sort({ updatedAt: -1 }).lean();

        const manifest = notes.map(n => ({
            id: n.id,
            title: n.title || 'Untitled Notebook',
            folder: n.folder || 'root',
            isStarred: !!n.isStarred,
            isTrashed: !!n.isTrashed,
            trashedAt: n.trashedAt ? new Date(n.trashedAt).getTime() : null,
            updatedAt: n.updatedAt ? new Date(n.updatedAt).getTime() : Date.now(),
            _version: typeof n._version === 'number' ? n._version : 1,
            owner: String(n.owner)
        }));

        res.json(manifest);
    } catch (err) {
        console.error('[SyncRoute] Manifest error:', err);
        res.status(500).json({ error: 'Failed to retrieve note manifest' });
    }
});

/**
 * POST /api/sync/pull
 * Pulls full note content on-demand for requested note IDs
 */
router.post('/pull', async (req, res) => {
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { noteIds } = req.body;
        if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
            return res.status(400).json({ error: 'Missing noteIds array' });
        }

        const notes = await Note.find({
            id: { $in: noteIds },
            $or: [
                { owner: userId },
                { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
            ]
        }).lean();

        const formatted = notes.map(n => ({
            id: n.id,
            title: n.title,
            folder: n.folder,
            isStarred: n.isStarred,
            isTrashed: n.isTrashed,
            trashedAt: n.trashedAt,
            content: n.content || {},
            cells: Array.isArray(n.content?.cells) ? n.content.cells : (Array.isArray(n.cells) ? n.cells : []),
            tags: Array.isArray(n.content?.tags) ? n.content.tags : (Array.isArray(n.tags) ? n.tags : []),
            updatedAt: n.updatedAt ? new Date(n.updatedAt).getTime() : Date.now(),
            _version: typeof n._version === 'number' ? n._version : 1,
            owner: String(n.owner)
        }));

        res.json({ notes: formatted });
    } catch (err) {
        console.error('[SyncRoute] Pull error:', err);
        res.status(500).json({ error: 'Failed to pull notes content' });
    }
});

/**
 * POST /api/sync/push
 * Receives batch of locally updated notes & cells from RxDB/IndexedDB and saves to MongoDB Atlas
 * Protected with Anti-Wipeout Guards and Monotonic Versioning
 */
router.post('/push', async (req, res) => {
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { batch } = req.body;
        if (!batch || !Array.isArray(batch)) {
            return res.status(400).json({ error: 'Invalid batch format' });
        }

        const processedQueueIds = [];
        const conflicts = [];

        for (const item of batch) {
            const { queueId, queueIds, action, note, noteId } = item;
            const allItemQueueIds = Array.isArray(queueIds) && queueIds.length > 0
                ? queueIds
                : (queueId ? [queueId] : []);

            if (action === 'DELETE') {
                const targetId = noteId || (note && note.id);
                if (targetId) {
                    await Note.deleteOne({ id: targetId, owner: userId });
                    if (allItemQueueIds.length > 0) processedQueueIds.push(...allItemQueueIds);
                }
                continue;
            }

            if (!note || !note.id) continue;

            const existing = await Note.findOne({
                id: note.id,
                $or: [
                    { owner: userId },
                    { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
                ]
            });

            const clientCells = Array.isArray(note.cells) ? note.cells : (note.content?.cells || []);
            const existingCells = existing && existing.content && Array.isArray(existing.content.cells)
                ? existing.content.cells
                : (existing && Array.isArray(existing.cells) ? existing.cells : []);

            // 🛡️ Guard 1: Anti-Wipeout Protection
            // Never allow an empty stub or unhydrated note from an offline client to destroy real cloud cells
            if (existing && existingCells.length > 0 && clientCells.length === 0 && action !== 'DELETE' && !note.isTrashed) {
                console.warn(`[SyncRoute] Anti-Wipeout Guard triggered for note ${note.id}: Rejected empty client update over existing ${existingCells.length} cells.`);
                conflicts.push({
                    noteId: note.id,
                    serverNote: {
                        id: existing.id,
                        title: existing.title,
                        folder: existing.folder,
                        isStarred: existing.isStarred,
                        isTrashed: existing.isTrashed,
                        trashedAt: existing.trashedAt,
                        cells: existingCells,
                        tags: existing.content?.tags || [],
                        updatedAt: existing.updatedAt ? new Date(existing.updatedAt).getTime() : Date.now(),
                        _version: existing._version || 1,
                        owner: String(existing.owner)
                    },
                    clientVersion: note._version || 1,
                    reason: 'anti_wipeout_protection'
                });
                if (allItemQueueIds.length > 0) processedQueueIds.push(...allItemQueueIds);
                continue;
            }

            const clientUpdated = new Date(note.updatedAt || Date.now()).getTime();
            const serverUpdated = existing && existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
            const clientVersion = typeof note._version === 'number' ? note._version : 1;
            const serverVersion = existing && typeof existing._version === 'number' ? existing._version : 0;

            // 🛡️ Guard 2: Bi-Directional Monotonic Version & Timestamp Check
            if (existing && (serverVersion > clientVersion || (serverVersion === clientVersion && serverUpdated > clientUpdated + 1000))) {
                // Cloud version is strictly newer than client version
                console.log(`[SyncRoute] Cloud version newer for note ${note.id} (Server v${serverVersion} @ ${serverUpdated} vs Client v${clientVersion} @ ${clientUpdated})`);
                conflicts.push({
                    noteId: note.id,
                    serverNote: {
                        id: existing.id,
                        title: existing.title,
                        folder: existing.folder,
                        isStarred: existing.isStarred,
                        isTrashed: existing.isTrashed,
                        trashedAt: existing.trashedAt,
                        cells: existingCells,
                        tags: existing.content?.tags || [],
                        updatedAt: serverUpdated,
                        _version: serverVersion || 1,
                        owner: String(existing.owner)
                    },
                    clientVersion: clientVersion,
                    reason: 'server_is_newer'
                });
                if (allItemQueueIds.length > 0) processedQueueIds.push(...allItemQueueIds);
                continue;
            }

            // Save / Upsert to MongoDB with next monotonic version
            const nextVersion = Math.max(serverVersion, clientVersion) + 1;
            const updateDoc = {
                id: note.id,
                title: note.title || 'Untitled Notebook',
                folder: note.folder || 'root',
                isStarred: !!note.isStarred,
                isTrashed: !!note.isTrashed,
                trashedAt: note.trashedAt ? new Date(note.trashedAt) : null,
                _version: nextVersion,
                content: {
                    id: note.id,
                    title: note.title || 'Untitled Notebook',
                    folder: note.folder || 'root',
                    isStarred: !!note.isStarred,
                    cells: clientCells,
                    tags: Array.isArray(note.tags) ? note.tags : (note.content?.tags || [])
                },
                updatedAt: new Date(clientUpdated)
            };

            await Note.findOneAndUpdate(
                {
                    id: note.id,
                    $or: [
                        { owner: userId },
                        { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
                    ]
                },
                {
                    $set: updateDoc,
                    $setOnInsert: { owner: userId }
                },
                { upsert: true, new: true }
            );

            if (allItemQueueIds.length > 0) processedQueueIds.push(...allItemQueueIds);
        }

        res.json({
            success: true,
            processedCount: processedQueueIds.length,
            processedQueueIds,
            conflicts
        });
    } catch (err) {
        console.error('[SyncRoute] Push error:', err);
        res.status(500).json({ error: 'Failed to push changes to Atlas' });
    }
});

/**
 * GET /api/sync/status
 * Telemetry endpoint for sync diagnostic
 */
router.get('/status', async (req, res) => {
    try {
        const userId = req.session.userId || (req.user ? req.user._id : null);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const count = await Note.countDocuments({ owner: userId });
        res.json({
            status: 'online',
            serverTime: new Date().toISOString(),
            userId: String(userId),
            totalNotes: count
        });
    } catch (err) {
        res.status(500).json({ error: 'Sync status check failed' });
    }
});

module.exports = router;
