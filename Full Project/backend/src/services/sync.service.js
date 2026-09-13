const Note = require('../models/Note');

/**
 * Sanitize untrusted client timestamp
 */
function sanitizeTimestamp(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : new Date(value).getTime();
    if (!Number.isFinite(n)) return null;
    return n;
}

/**
 * Pure conflict resolution core for a single pushed item.
 * Evaluates Anti-Wipeout and Recency guards.
 */
function resolvePushItem(existing, incoming, options = {}) {
    const { action, note, noteId } = incoming;
    const SKEW_MS = options.skewMs !== undefined ? options.skewMs : 30000;

    if (action === 'DELETE') {
        return { outcome: 'delete', targetId: noteId || (note && note.id) };
    }

    if (!note || !note.id) return { outcome: 'ignored' };

    const clientCells = Array.isArray(note.cells)
        ? note.cells
        : (note.content && Array.isArray(note.content.cells) ? note.content.cells : []);

    const existingCells = existing && existing.content && Array.isArray(existing.content.cells)
        ? existing.content.cells
        : (existing && Array.isArray(existing.cells) ? existing.cells : []);

    // 🛡️ Guard 1: Anti-Wipeout Protection
    // Prevents an empty-cells stub from wiping out real cloud cells
    if (existing && !existing.isTrashed && existingCells.length > 0 && clientCells.length === 0) {
        return {
            outcome: 'conflict',
            reason: 'anti_wipeout_protection',
            serverNote: existing
        };
    }

    const clientTs = sanitizeTimestamp(note.updatedAt);
    const serverTs = existing ? sanitizeTimestamp(existing.updatedAt) : null;

    // 🛡️ Guard 2: Recency / Stale-Device Protection
    // Reject stale client updates if cloud version is significantly newer
    if (existing && !note.isTrashed && serverTs !== null && clientTs !== null &&
        (serverTs - clientTs) > SKEW_MS) {
        return {
            outcome: 'conflict',
            reason: 'server_newer',
            serverNote: existing,
            detail: { serverTs, clientTs }
        };
    }

    // Client is authoritative for legitimate updates
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

class SyncService {
    /**
     * Complete hydration of notes for client-side local database
     */
    async hydrate(userId) {
        const notes = await Note.find({
            $or: [
                { owner: userId },
                { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
            ]
        }).sort({ updatedAt: -1 }).lean();

        return {
            serverTime: Date.now(),
            count: notes.length,
            notes
        };
    }

    /**
     * Lightweight note manifest for fast diffing
     */
    async getManifest(userId) {
        return await Note.find({
            $or: [
                { owner: userId },
                { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
            ]
        }, 'id title folder isStarred isTrashed trashedAt updatedAt _version owner').sort({ updatedAt: -1 }).lean();
    }

    /**
     * Pull full content for requested note IDs
     */
    async pullNotes(userId, noteIds) {
        if (!Array.isArray(noteIds) || noteIds.length === 0) {
            const err = new Error('Invalid or empty noteIds array');
            err.statusCode = 400;
            throw err;
        }

        return await Note.find({
            id: { $in: noteIds },
            $or: [
                { owner: userId },
                { 'collaborators': { $elemMatch: { user: userId, status: 'accepted' } } }
            ]
        }).lean();
    }

    /**
     * Process batch push backups from client browser
     */
    async pushBatch(userId, batch) {
        if (!Array.isArray(batch)) {
            const err = new Error('Batch must be an array');
            err.statusCode = 400;
            throw err;
        }

        const processedQueueIds = [];
        const conflicts = [];

        for (const item of batch) {
            const { queueId, queueIds, note } = item;
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
                conflicts.push({
                    noteId: note.id,
                    serverNote: resolution.serverNote,
                    clientVersion: typeof note._version === 'number' ? note._version : 1,
                    reason: resolution.reason
                });
                if (allItemQueueIds.length > 0) processedQueueIds.push(...allItemQueueIds);
                continue;
            }

            // ID collision guard for foreign notes
            let targetNoteId = note.id;
            if (!existing && note && note.id) {
                const foreignNote = await Note.findOne({ id: note.id }).lean();
                if (foreignNote) {
                    targetNoteId = `ntbk-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
                    resolution.updateDoc.id = targetNoteId;
                    if (resolution.updateDoc.content) resolution.updateDoc.content.id = targetNoteId;
                }
            }

            await Note.findOneAndUpdate(
                {
                    id: targetNoteId,
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

        return {
            processedCount: processedQueueIds.length,
            processedQueueIds,
            conflicts
        };
    }

    /**
     * Diagnostic status telemetry
     */
    async getStatus(userId) {
        const totalNotes = await Note.countDocuments({ owner: userId });
        return {
            status: 'online',
            serverTime: new Date().toISOString(),
            userId: String(userId),
            totalNotes
        };
    }
}

const syncServiceInstance = new SyncService();
syncServiceInstance.resolvePushItem = resolvePushItem;
syncServiceInstance.sanitizeTimestamp = sanitizeTimestamp;

module.exports = syncServiceInstance;
