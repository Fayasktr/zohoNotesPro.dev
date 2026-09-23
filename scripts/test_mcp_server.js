const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

async function runMcpTest() {
    console.log('--- Starting MCP Server Integration Test ---');
    const serverPath = path.resolve(__dirname, '../mcp-server.js');

    const transport = new StdioClientTransport({
        command: 'node',
        args: [serverPath],
        env: {
            ...process.env,
            MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zoho'
        }
    });

    const client = new Client(
        { name: 'test-client', version: '1.0.0' },
        { capabilities: {} }
    );

    try {
        console.log('Connecting client to server...');
        await client.connect(transport);
        console.log('Connected!');

        // 1. List tools
        console.log('\nTesting: listTools()...');
        const toolsResult = await client.listTools();
        console.log(`Discovered ${toolsResult.tools.length} tools:`);
        toolsResult.tools.forEach(t => console.log(`  - ${t.name}: ${t.description.slice(0, 60)}...`));

        // 2. Call get_system_stats
        console.log('\nTesting tool: get_system_stats...');
        const stats = await client.callTool({ name: 'get_system_stats' });
        console.log('System Stats Output:\n', stats.content[0].text);

        // 3. Call list_notes
        console.log('\nTesting tool: list_notes (limit 2)...');
        const listNotes = await client.callTool({ name: 'list_notes', arguments: { limit: 2 } });
        console.log('List Notes Output:\n', listNotes.content[0].text);

        // 4. Call run_code_cell (JavaScript)
        console.log('\nTesting tool: run_code_cell (JavaScript)...');
        const jsRun = await client.callTool({
            name: 'run_code_cell',
            arguments: {
                language: 'javascript',
                code: 'const sum = [10, 20, 30].reduce((a, b) => a + b, 0); console.log("Calculated sum:", sum);'
            }
        });
        console.log('JS Run Result:\n', jsRun.content[0].text);

        // 5. Call run_code_cell (Python)
        console.log('\nTesting tool: run_code_cell (Python)...');
        const pyRun = await client.callTool({
            name: 'run_code_cell',
            arguments: {
                language: 'python',
                code: 'print("MCP Python execution test successful!")'
            }
        });
        console.log('Python Run Result:\n', pyRun.content[0].text);

        console.log('\n✅ ALL MCP TESTS PASSED SUCCESSFULLY!');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ MCP TEST FAILED:', err);
        process.exit(1);
    }
}

runMcpTest();
