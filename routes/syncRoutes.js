const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const TrashedCell = require('../models/TrashedCell');

/**
 * Sanitize a timestamp coming from an untrusted client.
 * Returns a valid epoch-ms integer, or null when missing/invalid.
 */
function sanitizeTimestamp(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : new Date(value).getTime();
    if (!Number.isFinite(n)) return null;
    return n;
}

/**
 * Pure decision core for one pushed item. Exported for regression tests.
 *
 * Guards applied (in order):
 *   1. DELETE always wins (tombstone).
 *   2. Anti-Wipeout: never let an empty-cells stub destroy real cloud cells
 *      (unless the client is trashing the note).
 *   3. Recency Guard: never let a STALE device snapshot overwrite a NEWER
 *      cloud backup (this was the primary historical data-loss bug).
 *
 * Returns one of:
 *   { outcome: 'applied', updateDoc }        -> persist via findOneAndUpdate
 *   { outcome: 'conflict', reason, serverNote }
 *   { outcome: 'ignored' }                   -> malformed item
 */
function resolvePushItem(existing, incoming, options = {}) {
    const { action, note, noteId } = incoming;
    const SKEW_MS = options.skewMs || 5000;

    if (action === 'DELETE') {
        return { outcome: 'delete', targetId: noteId || (note && note.id) };
    }

    if (!note || !note.id) return { outcome: 'ignored' };

    const clientCells = Array.isArray(note.cells) ? note.cells : (note.content && Array.isArray(note.content.cells) ? note.content.cells : []);
    const existingCells = existing && existing.content && Array.isArray(existing.content.cells)
        ? existing.content.cells
        : (existing && Array.isArray(existing.cells) ? existing.cells : []);

    // 🛡️ Guard 1: Anti-Wipeout Protection
    if (existing && !existing.isTrashed && existingCells.length > 0 && clientCells.length === 0) {
        return {
            outcome: 'conflict',
            reason: 'anti_wipeout_protection',
            serverNote: formatServerNote(existing)
        };
    }

    const clientTs = sanitizeTimestamp(note.updatedAt);
    const serverTs = existing ? sanitizeTimestamp(existing.updatedAt) : null;

    // 🛡️ Guard 2: Recency / Stale-Device Protection
    // A trashing device is allowed through (soft delete must propagate), but a
    // plain content UPDATE from a device whose snapshot is older than the
    // cloud copy is rejected so newer cloud work is never destroyed.
    if (existing && !note.isTrashed && serverTs !== null && clientTs !== null &&
        (serverTs - clientTs) > SKEW_MS) {
        return {
            outcome: 'conflict',
            reason: 'server_newer',
            serverNote: formatServerNote(existing),
            detail: { serverTs, clientTs }
        };
    }

    // Client is authoritative for anything not caught by the guards above.
    const safeClientTs = clientTs !== null ? clientTs : Date.now();
    const serverVersion = existing && typeof existing._version === 'number' ? existing._version : 0;
    const clientVersion = typeof note._version === 'number' ? note._version : 1;
    const nextVersion = Math.max(serverVersion, clientVersion) + 1;

    return {
        outcome: 'applied',
        updateDoc: {
            id: note.id,
            title: note.title || 'Untitled Notebook',
            folder: note.folder || 'root',
            isStarred: !!note.isStarred,
            isTrashed: !!note.isTrashed,
            trashedAt: note.trashedAt ? new Date(sanitizeTimestamp(note.trashedAt) || Date.now()) : null,
            _version: nextVersion,
            content: {
                id: note.id,
                title: note.title || 'Untitled Notebook',
                folder: note.folder || 'root',
                isStarred: !!note.isStarred,
                cells: clientCells,
                tags: Array.isArray(note.tags) ? note.tags : (note.content && Array.isArray(note.content.tags) ? note.content.tags : [])
            },
            updatedAt: new Date(safeClientTs)
        }
    };
}

/** Shape a stored Note document exactly like /hydrate does, so clients can adopt it directly. */
function formatServerNote(n) {
    return {
        id: n.id,
        title: n.title || 'Untitled Notebook',
        folder: n.folder || 'root',
        isStarred: !!n.isStarred,
        isTrashed: !!n.isTrashed,
        trashedAt: n.trashedAt ? new Date(n.trashedAt).getTime() : null,
        cells: Array.isArray(n.content && n.content.cells) ? n.content.cells : (Array.isArray(n.cells) ? n.cells : []),
        tags: Array.isArray(n.content && n.content.tags) ? n.content.tags : (Array.isArray(n.tags) ? n.tags : []),
        updatedAt: n.updatedAt ? new Date(n.updatedAt).getTime() : Date.now(),
        _version: typeof n._version === 'number' ? n._version : 1,
        owner: String(n.owner)
    };
}

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
 * POST /api/sync/push (and POST /api/backup/push)
 * Receives batch of locally updated notes & cells from client and creates/updates backups in MongoDB Atlas
 * Protected with Anti-Wipeout + Recency Guards while ensuring client data is never overwritten by old server states.
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

            const existing = note && note.id ? await Note.findOne({
                id: note.id,
                $or: [
                    { owner: userId },
                    { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
                ]
            }) : null;

            const resolution = resolvePushItem(existing, item);

            if (resolution.outcome === 'delete') {
                if (resolution.targetId) {
                    await Note.deleteOne({ id: resolution.targetId, owner: userId });
                    if (allItemQueueIds.length > 0) processedQueueIds.push(...allItemQueueIds);
                }
                continue;
            }

            if (resolution.outcome === 'ignored') continue;

            if (resolution.outcome === 'conflict') {
                console.warn(`[SyncRoute] Push conflict (${resolution.reason}) for note ${note.id}: cloud copy preserved.`);
                conflicts.push({
                    noteId: note.id,
                    serverNote: resolution.serverNote,
                    clientVersion: typeof note._version === 'number' ? note._version : 1,
                    reason: resolution.reason
                });
                // Queue ids are reported as processed so clients do not retry the
                // same doomed push forever; the client adopts serverNote on receipt.
                if (allItemQueueIds.length > 0) processedQueueIds.push(...allItemQueueIds);
                continue;
            }

            await Note.findOneAndUpdate(
                {
                    id: note.id,
                    $or: [
                        { owner: userId },
                        { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
                    ]
                },
                {
                    $set: resolution.updateDoc,
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
        console.error('[SyncRoute] Push backup error:', err);
        res.status(500).json({ error: 'Push backup failed' });
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
module.exports.resolvePushItem = resolvePushItem;
module.exports.sanitizeTimestamp = sanitizeTimestamp;
module.exports.formatServerNote = formatServerNote;
