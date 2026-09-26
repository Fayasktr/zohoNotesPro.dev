const mongoose = require('mongoose');
const crypto = require('crypto');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');

const Note = require('../models/Note');
const User = require('../models/User');
const engine = require('../engine/AntigravityEngine');

/**
 * Connect to MongoDB if not already connected
 */
async function connectToDatabase(customUri) {
    if (mongoose.connection.readyState === 1) return;
    const uri = customUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';
    await mongoose.connect(uri);
}

/**
 * Factory to create and configure a Scoped Zoho Notes MCP Server
 * @param {Object} config
 * @param {Object} config.user Authenticated user object ({ _id, username, email, role })
 * @param {string} config.mongoUri Optional custom MongoDB URI
 */
function createZohoNotesMcpServer(config = {}) {
    const currentUser = config.user || null;
    const isAdmin = currentUser ? currentUser.role === 'admin' : true; // Default to admin if unauthenticated internal call

    const server = new Server(
        {
            name: config.name || 'zoho-notes',
            version: config.version || '2.0.0'
        },
        {
            capabilities: {
                tools: {},
                resources: {}
            }
        }
    );

    // ==========================================
    // 1. TOOL DEFINITIONS (ROLE-BASED EXPOSURE)
    // ==========================================
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const tools = [
            {
                name: 'list_notes',
                description: isAdmin
                    ? 'List notes across the entire platform (Admin), with optional folder or starred filters.'
                    : 'List your personal notes with ID, title, folder, and update timestamp.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: { type: 'number', description: 'Maximum number of notes to return (default: 20, max: 100)' },
                        folder: { type: 'string', description: 'Filter by folder name (e.g., "root", "practice")' },
                        isStarred: { type: 'boolean', description: 'Filter by starred notes only' },
                        includeTrashed: { type: 'boolean', description: 'Include trashed notes (default: false)' }
                    }
                }
            },
            {
                name: 'get_note',
                description: 'Retrieve full content and cells of a specific note by ID or shareCode.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        noteId: { type: 'string', description: 'The unique ID or shareCode of the note' }
                    },
                    required: ['noteId']
                }
            },
            {
                name: 'search_notes',
                description: isAdmin
                    ? 'Search all notes in the database matching a text query in title or cell content.'
                    : 'Search through your own notes matching a text query in title or cell content.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search term or keyword' },
                        limit: { type: 'number', description: 'Maximum number of results to return (default: 10)' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'create_note',
                description: isAdmin
                    ? 'Create a new notebook note or live exam session, optionally assigning ownership to a candidate.'
                    : 'Create a new personal notebook note with markdown explanation and optional code cells.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Title of the note' },
                        folder: { type: 'string', description: 'Folder name (default: "root")' },
                        isLive: { type: 'boolean', description: 'If true, create as a live review / collaboration session' },
                        ownerEmail: { type: 'string', description: isAdmin ? 'Target owner email (Admin only)' : 'Ignored for non-admins' },
                        markdown: { type: 'string', description: 'Initial markdown explanation content' },
                        codeCells: {
                            type: 'array',
                            description: 'Optional list of initial code cells',
                            items: {
                                type: 'object',
                                properties: {
                                    title: { type: 'string', description: 'Title of the cell' },
                                    language: { type: 'string', description: 'Programming language (default: javascript)' },
                                    code: { type: 'string', description: 'Source code content' }
                                },
                                required: ['code']
                            }
                        }
                    },
                    required: ['title']
                }
            },
            {
                name: 'update_note',
                description: 'Update metadata or append new cells to an existing note.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        noteId: { type: 'string', description: 'ID of the note to update' },
                        title: { type: 'string', description: 'New title' },
                        folder: { type: 'string', description: 'New folder name' },
                        isStarred: { type: 'boolean', description: 'Star or unstar note' },
                        markdown: { type: 'string', description: 'Update or replace the markdown explanation' },
                        appendCell: {
                            type: 'object',
                            description: 'Append a new code cell to the note',
                            properties: {
                                type: { type: 'string', enum: ['code', 'markdown'], default: 'code' },
                                language: { type: 'string', default: 'javascript' },
                                content: { type: 'string' }
                            },
                            required: ['content']
                        }
                    },
                    required: ['noteId']
                }
            },
            {
                name: 'delete_note',
                description: 'Move a note to trash, or permanently delete it.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        noteId: { type: 'string', description: 'ID of the note to delete' },
                        permanent: { type: 'boolean', description: 'If true, permanently remove from DB (default: false)' }
                    },
                    required: ['noteId']
                }
            },
            {
                name: 'run_code_cell',
                description: 'Execute JavaScript/Python/C/Java code securely in AntigravityEngine and return the output.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        language: { type: 'string', description: 'Programming language: javascript, python, c, cpp, java' },
                        code: { type: 'string', description: 'Source code to run' },
                        stdin: { type: 'string', description: 'Optional standard input' }
                    },
                    required: ['language', 'code']
                }
            },
            {
                name: 'get_system_stats',
                description: 'Get platform health and note statistics.',
                inputSchema: { type: 'object', properties: {} }
            }
        ];

        // Only expose Admin Tools if the connected user is an Admin
        if (isAdmin) {
            tools.push(
                {
                    name: 'list_users',
                    description: 'List registered users with their username, email, and role (Admin only).',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            limit: { type: 'number', description: 'Maximum users to return (default 50)' },
                            query: { type: 'string', description: 'Optional search query for username or email' }
                        }
                    }
                },
                {
                    name: 'reassign_note',
                    description: 'Reassign ownership of a note to another user (Admin only).',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            noteId: { type: 'string', description: 'ID of the note to reassign' },
                            email: { type: 'string', description: 'Target user email' }
                        },
                        required: ['noteId', 'email']
                    }
                },
                {
                    name: 'set_user_role',
                    description: 'Grant or revoke admin privileges for a user (Fayas KP / Admin only).',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            email: { type: 'string', description: 'Target user email' },
                            role: { type: 'string', enum: ['admin', 'user'], description: 'Role to assign: "admin" or "user"' }
                        },
                        required: ['email', 'role']
                    }
                }
            );
        }

        return { tools };
    });

    // ==========================================
    // 2. TOOL EXECUTION HANDLER
    // ==========================================
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        await connectToDatabase(config.mongoUri);
        const { name, arguments: args = {} } = request.params;

        try {
            switch (name) {
                case 'list_notes': {
                    const query = {};
                    if (!args.includeTrashed) {
                        query.isTrashed = false;
                    }
                    if (args.folder) {
                        query.folder = args.folder;
                    }
                    if (typeof args.isStarred === 'boolean') {
                        query.isStarred = args.isStarred;
                    }

                    // Scoping: Non-admin users can ONLY see their own notes or shared notes
                    if (!isAdmin && currentUser) {
                        query.$or = [
                            { owner: currentUser._id },
                            { 'collaborators.user': currentUser._id },
                            { 'collaborators.email': currentUser.email?.toLowerCase() }
                        ];
                    }

                    const limit = Math.min(Math.max(1, args.limit || 20), 100);
                    const notes = await Note.find(query)
                        .select('id title folder isStarred isTrashed isLive updatedAt shareCode authorName owner')
                        .sort({ updatedAt: -1 })
                        .limit(limit)
                        .lean();

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        count: notes.length,
                                        scopedToUser: !isAdmin && currentUser ? currentUser.email : 'all (admin)',
                                        notes: notes.map(n => ({
                                            id: n.id,
                                            title: n.title,
                                            folder: n.folder || 'root',
                                            isStarred: !!n.isStarred,
                                            isTrashed: !!n.isTrashed,
                                            isLive: !!n.isLive,
                                            shareCode: n.shareCode || null,
                                            updatedAt: n.updatedAt
                                        }))
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    };
                }

                case 'get_note': {
                    const note = await Note.findOne({
                        $or: [{ id: args.noteId }, { shareCode: args.noteId }]
                    }).populate('owner', 'username email').lean();

                    if (!note) {
                        return {
                            content: [{ type: 'text', text: `Note not found for ID/shareCode: "${args.noteId}"` }],
                            isError: true
                        };
                    }

                    // Ownership Check: Non-admins cannot access other users' notes
                    if (!isAdmin && currentUser) {
                        const isOwner = note.owner && note.owner._id.toString() === currentUser._id.toString();
                        const isCollaborator = Array.isArray(note.collaborators) && note.collaborators.some(c =>
                            (c.user && c.user.toString() === currentUser._id.toString()) ||
                            (c.email && c.email.toLowerCase() === currentUser.email?.toLowerCase())
                        );

                        if (!isOwner && !isCollaborator) {
                            return {
                                content: [{ type: 'text', text: 'Forbidden: You do not have permission to access this note.' }],
                                isError: true
                            };
                        }
                    }

                    // Format cells cleanly
                    const cells = Array.isArray(note.content?.cells)
                        ? note.content.cells
                        : (Array.isArray(note.cells) ? note.cells : []);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        id: note.id,
                                        title: note.title,
                                        folder: note.folder || 'root',
                                        isStarred: !!note.isStarred,
                                        isTrashed: !!note.isTrashed,
                                        isLive: !!note.isLive,
                                        shareCode: note.shareCode || null,
                                        owner: note.owner ? {
                                            id: note.owner._id,
                                            username: note.owner.username,
                                            email: note.owner.email
                                        } : null,
                                        authorName: note.authorName || '',
                                        markdown: note.content?.markdown || note.content?.text || '',
                                        cells: cells,
                                        updatedAt: note.updatedAt,
                                        version: note._version || 1
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    };
                }

                case 'search_notes': {
                    const regex = new RegExp(args.query, 'i');
                    const limit = Math.min(Math.max(1, args.limit || 10), 50);

                    const matchConditions = [
                        { title: regex },
                        { 'content.markdown': regex },
                        { 'content.text': regex },
                        { 'content.cells.content': regex }
                    ];

                    const query = {
                        isTrashed: false,
                        $or: matchConditions
                    };

                    // Scope search to current user if not admin
                    if (!isAdmin && currentUser) {
                        query.owner = currentUser._id;
                    }

                    const notes = await Note.find(query)
                        .select('id title folder isStarred isLive updatedAt')
                        .sort({ updatedAt: -1 })
                        .limit(limit)
                        .lean();

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        query: args.query,
                                        matchCount: notes.length,
                                        results: notes
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    };
                }

                case 'create_note': {
                    let ownerId;
                    let authorName;

                    if (isAdmin) {
                        // Admins can create notes for other users if ownerEmail is specified
                        let targetUser = null;
                        if (args.ownerEmail) {
                            targetUser = await User.findOne({ email: args.ownerEmail });
                        }
                        if (!targetUser && currentUser) {
                            targetUser = currentUser;
                        }
                        if (!targetUser) {
                            targetUser = await User.findOne({ email: 'fayaskpktr@gmail.com' });
                        }
                        ownerId = targetUser ? targetUser._id : new mongoose.Types.ObjectId();
                        authorName = targetUser ? (targetUser.username || targetUser.email) : 'fayas kp';
                    } else {
                        // Non-admins strictly own the notes they create
                        ownerId = currentUser._id;
                        authorName = currentUser.username || currentUser.email;
                    }

                    const isLive = Boolean(args.isLive);
                    const newId = (isLive ? 'live-' : 'ntbk-') + Date.now() + (isLive ? '-' + crypto.randomBytes(2).toString('hex') : '');
                    const shareCode = isLive ? ('collab-' + crypto.randomBytes(6).toString('hex')) : undefined;
                    const cells = [];

                    if (args.markdown) {
                        cells.push({
                            id: 'cell-' + crypto.randomBytes(4).toString('hex'),
                            type: 'markdown',
                            title: 'Instructions',
                            content: args.markdown,
                            language: 'markdown'
                        });
                    }

                    if (Array.isArray(args.codeCells)) {
                        for (const cell of args.codeCells) {
                            cells.push({
                                id: 'cell-' + crypto.randomBytes(4).toString('hex'),
                                type: cell.type || 'code',
                                title: cell.title || '',
                                language: cell.language || 'javascript',
                                content: cell.code || '',
                                output: null
                            });
                        }
                    }

                    const note = new Note({
                        id: newId,
                        title: args.title || 'Untitled Note',
                        folder: args.folder || 'root',
                        owner: ownerId,
                        isLive: isLive,
                        shareCode: shareCode,
                        authorName: authorName,
                        content: {
                            id: newId,
                            title: args.title || 'Untitled Note',
                            folder: args.folder || 'root',
                            isStarred: false,
                            cells: cells,
                            tags: [],
                            isLive: isLive
                        },
                        _version: 1,
                        updatedAt: new Date()
                    });

                    await note.save();

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        success: true,
                                        message: `Note "${note.title}" created successfully`,
                                        id: note.id,
                                        folder: note.folder,
                                        cellCount: cells.length,
                                        shareCode: note.shareCode || null
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    };
                }

                case 'update_note': {
                    const note = await Note.findOne({ id: args.noteId });
                    if (!note) {
                        return {
                            content: [{ type: 'text', text: `Note not found for ID: ${args.noteId}` }],
                            isError: true
                        };
                    }

                    // Check ownership
                    if (!isAdmin && currentUser) {
                        if (!note.owner || note.owner.toString() !== currentUser._id.toString()) {
                            return {
                                content: [{ type: 'text', text: 'Forbidden: You do not have permission to edit this note.' }],
                                isError: true
                            };
                        }
                    }

                    if (args.title !== undefined) note.title = args.title;
                    if (args.folder !== undefined) note.folder = args.folder;
                    if (typeof args.isStarred === 'boolean') note.isStarred = args.isStarred;

                    if (!note.content) note.content = {};
                    if (!Array.isArray(note.content.cells)) note.content.cells = [];

                    if (args.markdown !== undefined) {
                        note.content.markdown = args.markdown;
                    }

                    if (args.appendCell) {
                        note.content.cells.push({
                            id: 'cell-' + crypto.randomUUID(),
                            type: args.appendCell.type || 'code',
                            language: args.appendCell.language || 'javascript',
                            content: args.appendCell.content || ''
                        });
                        note.markModified('content');
                    }

                    note._version = (note._version || 1) + 1;
                    note.updatedAt = new Date();
                    await note.save();

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        success: true,
                                        message: `Note "${note.title}" updated successfully`,
                                        id: note.id,
                                        version: note._version
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    };
                }

                case 'delete_note': {
                    const note = await Note.findOne({ id: args.noteId });
                    if (!note) {
                        return {
                            content: [{ type: 'text', text: `Note not found for ID: ${args.noteId}` }],
                            isError: true
                        };
                    }

                    // Check ownership
                    if (!isAdmin && currentUser) {
                        if (!note.owner || note.owner.toString() !== currentUser._id.toString()) {
                            return {
                                content: [{ type: 'text', text: 'Forbidden: You do not have permission to delete this note.' }],
                                isError: true
                            };
                        }
                    }

                    if (args.permanent) {
                        await Note.deleteOne({ id: args.noteId });
                        return {
                            content: [{ type: 'text', text: `Note "${note.title}" permanently deleted.` }]
                        };
                    } else {
                        note.isTrashed = true;
                        note.trashedAt = new Date();
                        note.updatedAt = new Date();
                        await note.save();
                        return {
                            content: [{ type: 'text', text: `Note "${note.title}" moved to trash.` }]
                        };
                    }
                }

                case 'run_code_cell': {
                    const executionResult = await engine.execute(args.code, args.language, {
                        stdin: args.stdin || ''
                    });

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        language: args.language,
                                        success: executionResult.success !== false,
                                        result: executionResult
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    };
                }

                case 'get_system_stats': {
                    if (isAdmin) {
                        const totalUsers = await User.countDocuments();
                        const totalNotes = await Note.countDocuments({ isTrashed: false });
                        const starredNotes = await Note.countDocuments({ isStarred: true, isTrashed: false });
                        const trashedNotes = await Note.countDocuments({ isTrashed: true });
                        const folders = await Note.distinct('folder', { isTrashed: false });

                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(
                                        {
                                            server: 'Zoho Notes MCP (Multi-Tenant Admin)',
                                            version: '2.0.0',
                                            database: {
                                                totalUsers,
                                                activeNotes: totalNotes,
                                                starredNotes,
                                                trashedNotes,
                                                folders
                                            }
                                        },
                                        null,
                                        2
                                    )
                                }
                            ]
                        };
                    } else {
                        // User-scoped stats
                        const userNotes = await Note.countDocuments({ owner: currentUser._id, isTrashed: false });
                        const starredNotes = await Note.countDocuments({ owner: currentUser._id, isStarred: true, isTrashed: false });
                        const userFolders = await Note.distinct('folder', { owner: currentUser._id, isTrashed: false });

                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(
                                        {
                                            server: 'Zoho Notes MCP (User Sandbox)',
                                            user: currentUser.username,
                                            email: currentUser.email,
                                            myNotesCount: userNotes,
                                            myStarredCount: starredNotes,
                                            myFolders: userFolders
                                        },
                                        null,
                                        2
                                    )
                                }
                            ]
                        };
                    }
                }

                case 'reassign_note': {
                    if (!isAdmin) {
                        return {
                            content: [{ type: 'text', text: 'Forbidden: Admin privileges required to reassign notes.' }],
                            isError: true
                        };
                    }

                    const note = await Note.findOne({
                        $or: [{ id: args.noteId }, { shareCode: args.noteId }]
                    });
                    if (!note) {
                        return {
                            content: [{ type: 'text', text: `Note not found for ID: ${args.noteId}` }],
                            isError: true
                        };
                    }

                    const targetUser = await User.findOne({ email: args.email });
                    if (!targetUser) {
                        return {
                            content: [{ type: 'text', text: `Target user with email "${args.email}" not found.` }],
                            isError: true
                        };
                    }

                    note.owner = targetUser._id;
                    note.authorName = targetUser.username || targetUser.email;
                    if (note.content) {
                        note.content.owner = targetUser._id;
                    }
                    note.markModified('content');
                    await note.save();

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        success: true,
                                        message: `Note "${note.title}" reassigned to ${targetUser.username} (${targetUser.email})`,
                                        noteId: note.id,
                                        newOwner: {
                                            id: targetUser._id,
                                            username: targetUser.username,
                                            email: targetUser.email
                                        }
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    };
                }

                case 'list_users': {
                    if (!isAdmin) {
                        return {
                            content: [{ type: 'text', text: 'Forbidden: Admin privileges required to list all users.' }],
                            isError: true
                        };
                    }

                    const limit = Math.min(Math.max(1, args.limit || 50), 100);
                    const filter = {};
                    if (args.query) {
                        const regex = new RegExp(args.query, 'i');
                        filter.$or = [{ username: regex }, { email: regex }];
                    }
                    const users = await User.find(filter)
                        .select('_id username email role isBlocked apiKey createdAt')
                        .sort({ createdAt: 1 })
                        .limit(limit)
                        .lean();

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        count: users.length,
                                        users: users.map(u => ({
                                            id: u._id,
                                            username: u.username,
                                            email: u.email,
                                            role: u.role || 'user',
                                            isBlocked: !!u.isBlocked,
                                            apiKey: u.apiKey || null,
                                            createdAt: u.createdAt
                                        }))
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    };
                }

                case 'set_user_role': {
                    if (!isAdmin) {
                        return {
                            content: [{ type: 'text', text: 'Forbidden: Admin privileges required to modify roles.' }],
                            isError: true
                        };
                    }

                    const targetUser = await User.findOne({ email: args.email.toLowerCase().trim() });
                    if (!targetUser) {
                        return {
                            content: [{ type: 'text', text: `User not found with email: ${args.email}` }],
                            isError: true
                        };
                    }

                    // Safety: Do not demote Superadmin Fayas KP
                    if (targetUser.email === 'fayaskpktr@gmail.com' && args.role !== 'admin') {
                        return {
                            content: [{ type: 'text', text: 'Cannot demote the primary Superadmin account (fayaskpktr@gmail.com).' }],
                            isError: true
                        };
                    }

                    targetUser.role = args.role;
                    await targetUser.save();

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        success: true,
                                        message: `Role for ${targetUser.username} (${targetUser.email}) updated to "${args.role}".`,
                                        user: {
                                            username: targetUser.username,
                                            email: targetUser.email,
                                            role: targetUser.role
                                        }
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    };
                }

                default:
                    return {
                        content: [{ type: 'text', text: `Unknown tool requested: ${name}` }],
                        isError: true
                    };
            }
        } catch (err) {
            return {
                content: [{ type: 'text', text: `Tool error: ${err.message}` }],
                isError: true
            };
        }
    });

    // ==========================================
    // 3. RESOURCE DEFINITIONS & HANDLERS
    // ==========================================
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
            resources: [
                {
                    uri: 'zohonotes://notes/recent',
                    name: 'Recent Zoho Notes',
                    mimeType: 'application/json',
                    description: isAdmin ? '20 most recently updated notes platform-wide' : 'Your 20 most recent personal notes'
                }
            ]
        };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        await connectToDatabase(config.mongoUri);
        const { uri } = request.params;

        if (uri === 'zohonotes://notes/recent') {
            const query = { isTrashed: false };
            if (!isAdmin && currentUser) {
                query.owner = currentUser._id;
            }

            const notes = await Note.find(query)
                .select('id title folder isStarred updatedAt')
                .sort({ updatedAt: -1 })
                .limit(20)
                .lean();

            return {
                contents: [
                    {
                        uri: uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(notes, null, 2)
                    }
                ]
            };
        }

        if (uri.startsWith('zohonotes://note/')) {
            const noteId = uri.replace('zohonotes://note/', '');
            const note = await Note.findOne({ id: noteId }).lean();
            if (!note) {
                throw new Error(`Note not found: ${noteId}`);
            }

            if (!isAdmin && currentUser && note.owner?.toString() !== currentUser._id.toString()) {
                throw new Error(`Forbidden: You do not have permission to view note ${noteId}`);
            }

            return {
                contents: [
                    {
                        uri: uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(note, null, 2)
                    }
                ]
            };
        }

        throw new Error(`Unsupported resource URI: ${uri}`);
    });

    return { server, connectToDatabase };
}

module.exports = {
    createZohoNotesMcpServer,
    connectToDatabase
};
