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
    if (mongoose.connection.readyState === 1) return; // Already connected
    const uri = customUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho';
    await mongoose.connect(uri);
}

/**
 * Factory to create and configure a Zoho Notes MCP Server
 */
function createZohoNotesMcpServer(config = {}) {
    const server = new Server(
        {
            name: config.name || 'zoho-notes',
            version: config.version || '1.0.0'
        },
        {
            capabilities: {
                tools: {},
                resources: {}
            }
        }
    );

    // ==========================================
    // 1. TOOL DEFINITIONS
    // ==========================================
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: 'list_notes',
                    description: 'List recent notes with ID, title, folder, starred status, live status, and update timestamp.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            limit: { type: 'number', description: 'Maximum number of notes to return (default: 20, max: 100)' },
                            folder: { type: 'string', description: 'Filter by folder name (e.g., "root", "work", "algorithms")' },
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
                    description: 'Search for notes matching a text query in their title or cell content.',
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
                    description: 'Create a new notebook note with markdown explanation and optional code cells.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'Title of the note' },
                            folder: { type: 'string', description: 'Folder name (default: "root")' },
                            markdown: { type: 'string', description: 'Initial markdown explanation content' },
                            codeCells: {
                                type: 'array',
                                description: 'Optional list of initial code cells',
                                items: {
                                    type: 'object',
                                    properties: {
                                        language: { type: 'string', enum: ['javascript', 'typescript', 'python', 'c', 'cpp', 'java'] },
                                        code: { type: 'string' }
                                    },
                                    required: ['language', 'code']
                                }
                            }
                        },
                        required: ['title']
                    }
                },
                {
                    name: 'update_note',
                    description: 'Update an existing note (modify title, folder, markdown, star status, or append a new cell).',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            noteId: { type: 'string', description: 'ID of the note to update' },
                            title: { type: 'string', description: 'New title' },
                            folder: { type: 'string', description: 'New folder' },
                            isStarred: { type: 'boolean', description: 'Set starred status' },
                            markdown: { type: 'string', description: 'Update main markdown content' },
                            appendCell: {
                                type: 'object',
                                description: 'Append a new cell to the notebook',
                                properties: {
                                    type: { type: 'string', enum: ['code', 'markdown'] },
                                    language: { type: 'string', enum: ['javascript', 'typescript', 'python', 'c', 'cpp', 'java'] },
                                    content: { type: 'string' }
                                },
                                required: ['type', 'content']
                            }
                        },
                        required: ['noteId']
                    }
                },
                {
                    name: 'delete_note',
                    description: 'Move a note to trash or permanently remove it.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            noteId: { type: 'string', description: 'ID of the note' },
                            permanent: { type: 'boolean', description: 'If true, permanently delete from database. If false (default), move to trash.' }
                        },
                        required: ['noteId']
                    }
                },
                {
                    name: 'run_code_cell',
                    description: 'Execute code in JavaScript, TypeScript, Python, Java, C, or C++ using the Zoho Notes Antigravity sandbox engine.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            language: {
                                type: 'string',
                                enum: ['javascript', 'typescript', 'python', 'c', 'cpp', 'java'],
                                description: 'Programming language'
                            },
                            code: { type: 'string', description: 'Source code to compile & execute' },
                            stdin: { type: 'string', description: 'Optional standard input provided to the process' }
                        },
                        required: ['language', 'code']
                    }
                },
                {
                    name: 'get_system_stats',
                    description: 'Get statistics on note counts, folders, trashed notes, and supported languages.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                }
            ]
        };
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

                    const limit = Math.min(Math.max(1, args.limit || 20), 100);
                    const notes = await Note.find(query)
                        .select('id title folder isStarred isTrashed isLive updatedAt shareCode authorName')
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
                    }).lean();

                    if (!note) {
                        return {
                            content: [{ type: 'text', text: `Note not found for ID/shareCode: "${args.noteId}"` }],
                            isError: true
                        };
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

                    const notes = await Note.find({
                        isTrashed: false,
                        $or: [
                            { title: regex },
                            { 'content.markdown': regex },
                            { 'content.text': regex },
                            { 'content.cells.content': regex }
                        ]
                    })
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
                    // Find default user/owner if exists
                    const defaultUser = await User.findOne().sort({ createdAt: 1 });
                    const ownerId = defaultUser ? defaultUser._id : new mongoose.Types.ObjectId();

                    const newId = 'ntbk-' + Date.now();
                    const cells = [];

                    if (args.markdown) {
                        cells.push({
                            id: 'cell-' + crypto.randomBytes(4).toString('hex'),
                            type: 'markdown',
                            title: 'Notes',
                            content: args.markdown,
                            language: 'markdown'
                        });
                    }

                    if (Array.isArray(args.codeCells)) {
                        for (const cell of args.codeCells) {
                            cells.push({
                                id: 'cell-' + crypto.randomBytes(4).toString('hex'),
                                type: 'code',
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
                        content: {
                            id: newId,
                            title: args.title || 'Untitled Note',
                            folder: args.folder || 'root',
                            isStarred: false,
                            cells: cells,
                            tags: [],
                            isLive: false
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
                                        cellCount: cells.length
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
                    const totalUsers = await User.countDocuments();
                    const totalNotes = await Note.countDocuments({ isTrashed: false });
                    const trashedNotes = await Note.countDocuments({ isTrashed: true });
                    const starredNotes = await Note.countDocuments({ isStarred: true, isTrashed: false });
                    const folders = await Note.distinct('folder', { isTrashed: false });

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        server: 'Zoho Notes MCP',
                                        version: '1.0.0',
                                        supportedLanguages: ['javascript', 'typescript', 'python', 'c', 'cpp', 'java'],
                                        database: {
                                            totalUsers: totalUsers,
                                            activeNotes: totalNotes,
                                            starredNotes: starredNotes,
                                            trashedNotes: trashedNotes,
                                            folders: folders
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
                    description: 'List of the 20 most recently updated active notes'
                }
            ]
        };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        await connectToDatabase(config.mongoUri);
        const { uri } = request.params;

        if (uri === 'zohonotes://notes/recent') {
            const notes = await Note.find({ isTrashed: false })
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

        // Support dynamic URI: zohonotes://note/{id}
        if (uri.startsWith('zohonotes://note/')) {
            const noteId = uri.replace('zohonotes://note/', '');
            const note = await Note.findOne({ id: noteId }).lean();
            if (!note) {
                throw new Error(`Note not found: ${noteId}`);
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
