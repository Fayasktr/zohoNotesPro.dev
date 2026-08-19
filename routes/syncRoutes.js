const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const TrashedCell = require('../models/TrashedCell');

/**
 * GET /api/sync/manifest
 * Returns lightweight manifest of notes for lazy-loading in browser RxDB/IndexedDB
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
        }, 'id title folder isStarred isTrashed trashedAt updatedAt owner').sort({ updatedAt: -1 }).lean();

        const manifest = notes.map(n => ({
            id: n.id,
            title: n.title || 'Untitled Notebook',
            folder: n.folder || 'root',
            isStarred: !!n.isStarred,
            isTrashed: !!n.isTrashed,
            trashedAt: n.trashedAt ? new Date(n.trashedAt).getTime() : null,
            updatedAt: n.updatedAt ? new Date(n.updatedAt).getTime() : Date.now(),
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
 * Pulls full note content on-demand for requested note IDs (Lazy Loading)
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
            cells: n.content?.cells || [],
            tags: n.content?.tags || [],
            updatedAt: n.updatedAt,
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

            const clientUpdated = new Date(note.updatedAt || Date.now());

            // Multi-device conflict check
            if (existing && existing.updatedAt && (existing.updatedAt.getTime() > clientUpdated.getTime() + 1000)) {
                // Remote note is strictly newer than client's edit base
                conflicts.push({
                    noteId: note.id,
                    serverNote: existing.toObject(),
                    clientVersion: note._version || 1
                });
                if (allItemQueueIds.length > 0) processedQueueIds.push(...allItemQueueIds);
                continue;
            }

            // Save / Upsert to MongoDB
            const updateDoc = {
                id: note.id,
                title: note.title || 'Untitled Notebook',
                folder: note.folder || 'root',
                isStarred: !!note.isStarred,
                isTrashed: !!note.isTrashed,
                trashedAt: note.trashedAt ? new Date(note.trashedAt) : null,
                content: {
                    id: note.id,
                    title: note.title || 'Untitled Notebook',
                    folder: note.folder || 'root',
                    isStarred: !!note.isStarred,
                    cells: Array.isArray(note.cells) ? note.cells : (note.content?.cells || []),
                    tags: Array.isArray(note.tags) ? note.tags : (note.content?.tags || [])
                },
                updatedAt: clientUpdated
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
