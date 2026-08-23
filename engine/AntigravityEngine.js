const vm = require('node:vm');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class AntigravityEngine {
    constructor() {
        this.timeout = 8000; // 8 seconds timeout for compilation + execution
        this.tempDir = path.join(os.tmpdir(), 'antigravity_exec');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Main execution dispatcher supporting interactive stdin
     * @param {string} code 
     * @param {string} lang 
     * @param {Object} options { stdin: string, args: Array, contextExtension: Object }
     */
    async execute(code, lang = 'javascript', options = {}) {
        const resultId = crypto.randomUUID();
        const stdin = typeof options === 'string' ? options : (options?.stdin || '');
        const contextExtension = options?.contextExtension || {};

        switch (lang.toLowerCase()) {
            case 'javascript':
            case 'js':
                return this._executeJS(code, contextExtension);
            case 'typescript':
            case 'ts':
                return this._executeTS(code, contextExtension);
            case 'python':
            case 'py':
                return this._executePython(code, stdin);
            case 'c':
                return this._executeC(code, stdin);
            case 'cpp':
            case 'c++':
                return this._executeCpp(code, stdin);
            case 'java':
                return this._executeJava(code, stdin);
            default:
                return { id: resultId, success: false, error: `Unsupported language: ${lang}` };
        }
    }

    async _executeJS(code, contextExtension = {}) {
        const logs = [];
        const resultId = crypto.randomUUID();
        const customConsole = {
            log: (...args) => { logs.push(args.map(a => this._serialize(a)).join(' ')); },
            error: (...args) => { logs.push(`ERROR: ${args.map(a => this._serialize(a)).join(' ')}`); },
            warn: (...args) => { logs.push(`WARN: ${args.map(a => this._serialize(a)).join(' ')}`); },
            info: (...args) => { logs.push(`INFO: ${args.map(a => this._serialize(a)).join(' ')}`); },
        };

        // Activity tracking for async tasks
        let activeTasks = 0;
        const taskFinished = () => { activeTasks = Math.max(0, activeTasks - 1); };

        const wrappedSetTimeout = (fn, delay, ...args) => {
            activeTasks++;
            return setTimeout(() => {
                try {
                    if (typeof fn === 'function') {
                        fn(...args);
                    }
                } catch (err) {
                    customConsole.error(`Async Error (setTimeout): ${err.message}`);
                } finally {
                    taskFinished();
                }
            }, delay);
        };

        const wrappedSetInterval = (fn, delay, ...args) => {
            return setInterval(() => {
                try {
                    if (typeof fn === 'function') {
                        fn(...args);
                    }
                } catch (err) {
                    customConsole.error(`Async Error (setInterval): ${err.message}`);
                }
            }, delay, ...args);
        };

        const sandbox = {
            console: customConsole,
            setTimeout: wrappedSetTimeout,
            clearTimeout: (id) => {
                if (id) {
                    clearTimeout(id);
                    taskFinished();
                }
            },
            setInterval: wrappedSetInterval,
            clearInterval,
            Buffer, URL, Promise,
            process: { env: {} },
            ...contextExtension,
        };

        const context = vm.createContext(sandbox);

        try {
            const script = new vm.Script(code);
            const result = script.runInContext(context, { timeout: this.timeout });
            let resolvedResult = (result && typeof result.then === 'function') ? await result : result;

            // Wait for remaining async tasks (timers)
            const startWait = Date.now();
            while (activeTasks > 0 && (Date.now() - startWait) < this.timeout) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            return {
                id: resultId,
                success: true,
                result: this._serialize(resolvedResult),
                logs,
            };
        } catch (err) {
            return {
                id: resultId,
                success: false,
                result: null,
                logs,
                error: err.message,
            };
        }
    }

    async _executeTS(code, contextExtension = {}) {
        try {
            const ts = require('typescript');
            const compiled = ts.transpileModule(code, {
                compilerOptions: { module: ts.ModuleKind.CommonJS }
            });
            return this._executeJS(compiled.outputText, contextExtension);
        } catch (err) {
            return {
                id: require('crypto').randomUUID(),
                success: false,
                result: null,
                logs: [],
                error: `TypeScript Compilation Error: ${err.message}`
            };
        }
    }

    /**
     * Helper to spawn a process and pipe standard input (stdin)
     */
    _runBinaryWithStdin(binaryPath, args = [], stdin = '', timeoutMs = 6000) {
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let isKilled = false;

            const child = spawn(binaryPath, args, {
                windowsHide: true
            });

            const timer = setTimeout(() => {
                isKilled = true;
                try { child.kill('SIGKILL'); } catch (e) { }
            }, timeoutMs);

            if (child.stdin) {
                if (typeof stdin === 'string' && stdin.length > 0) {
                    child.stdin.write(stdin + (stdin.endsWith('\n') ? '' : '\n'));
                }
                child.stdin.end();
            }

            if (child.stdout) {
                child.stdout.on('data', (d) => { stdout += d.toString(); });
            }

            if (child.stderr) {
                child.stderr.on('data', (d) => { stderr += d.toString(); });
            }

            child.on('error', (err) => {
                clearTimeout(timer);
                resolve({
                    success: false,
                    logs: [],
                    error: err.message
                });
            });

            child.on('close', (code) => {
                clearTimeout(timer);
                if (isKilled) {
                    return resolve({
                        success: false,
                        logs: stdout ? stdout.trim().split('\n') : [],
                        error: 'Execution timed out. Make sure all required input values for scanf/cin/input are provided in Terminal Input.'
                    });
                }

                const logs = stdout ? stdout.trim().split('\n') : [];
                if (stderr) logs.push(`STDERR: ${stderr.trim()}`);

                resolve({
                    success: code === 0,
                    result: null,
                    logs,
                    error: code !== 0 ? (stderr ? stderr.trim() : `Process exited with code ${code}`) : null
                });
            });
        });
    }

    async _executePython(code, stdin = '') {
        const id = crypto.randomUUID();
        const filePath = path.join(this.tempDir, `${id}.py`);
        fs.writeFileSync(filePath, code);

        const pythonCommands = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
        let lastResult = null;

        try {
            for (const cmd of pythonCommands) {
                const result = await this._runBinaryWithStdin(cmd, [filePath], stdin, this.timeout);
                if (result.success || (result.error && !result.error.includes('not found') && !result.error.includes('is not recognized') && !result.error.includes('App execution aliases') && !result.error.includes('Microsoft Store'))) {
                    return { id, ...result };
                }
                lastResult = result;
            }
            return {
                id,
                success: false,
                logs: [],
                error: lastResult?.error || 'Python runtime not found'
            };
        } finally {
            try { fs.unlinkSync(filePath); } catch (e) { }
        }
    }

    async _executeC(code, stdin = '') {
        const id = crypto.randomUUID();
        const isWindows = process.platform === 'win32';
        const srcPath = path.join(this.tempDir, `${id}.c`);
        const binPath = path.join(this.tempDir, isWindows ? `${id}.exe` : `${id}.out`);
        fs.writeFileSync(srcPath, code);

        return new Promise((resolve) => {
            const compileCmd = `gcc "${srcPath}" -o "${binPath}"`;
            exec(compileCmd, async (cError, cStdout, cStderr) => {
                if (cError) {
                    try { fs.unlinkSync(srcPath); } catch (e) { }
                    return resolve({
                        id,
                        success: false,
                        logs: [],
                        error: `C Compilation Error:\n${cStderr || cError.message}`
                    });
                }

                try {
                    const execResult = await this._runBinaryWithStdin(binPath, [], stdin, this.timeout);
                    resolve({
                        id,
                        ...execResult
                    });
                } finally {
                    try { fs.unlinkSync(srcPath); } catch (e) { }
                    try { fs.unlinkSync(binPath); } catch (e) { }
                }
            });
        });
    }

    async _executeCpp(code, stdin = '') {
        const id = crypto.randomUUID();
        const isWindows = process.platform === 'win32';
        const srcPath = path.join(this.tempDir, `${id}.cpp`);
        const binPath = path.join(this.tempDir, isWindows ? `${id}.exe` : `${id}.out`);
        fs.writeFileSync(srcPath, code);

        return new Promise((resolve) => {
            const compileCmd = `g++ "${srcPath}" -o "${binPath}"`;
            exec(compileCmd, async (cError, cStdout, cStderr) => {
                if (cError) {
                    try { fs.unlinkSync(srcPath); } catch (e) { }
                    return resolve({
                        id,
                        success: false,
                        logs: [],
                        error: `C++ Compilation Error:\n${cStderr || cError.message}`
                    });
                }

                try {
                    const execResult = await this._runBinaryWithStdin(binPath, [], stdin, this.timeout);
                    resolve({
                        id,
                        ...execResult
                    });
                } finally {
                    try { fs.unlinkSync(srcPath); } catch (e) { }
                    try { fs.unlinkSync(binPath); } catch (e) { }
                }
            });
        });
    }

    async _executeJava(code, stdin = '') {
        const id = crypto.randomUUID();
        const classNameMatch = code.match(/public\s+class\s+([A-Za-z0-9_$]+)/);
        const className = classNameMatch ? classNameMatch[1] : 'Main';

        const execDir = path.join(this.tempDir, id);
        fs.mkdirSync(execDir, { recursive: true });

        const srcPath = path.join(execDir, `${className}.java`);
        fs.writeFileSync(srcPath, code);

        return new Promise((resolve) => {
            const compileCmd = `javac "${srcPath}"`;
            exec(compileCmd, async (cError, cStdout, cStderr) => {
                if (cError) {
                    try { fs.rmSync(execDir, { recursive: true, force: true }); } catch (e) { }
                    return resolve({
                        id,
                        success: false,
                        logs: [],
                        error: `Java Compilation Error:\n${cStderr || cError.message}`
                    });
                }

                try {
                    const execResult = await this._runBinaryWithStdin('java', ['-cp', execDir, className], stdin, this.timeout);
                    resolve({
                        id,
                        ...execResult
                    });
                } finally {
                    try { fs.rmSync(execDir, { recursive: true, force: true }); } catch (e) { }
                }
            });
        });
    }

    _serialize(obj, depth = 5, seen = new WeakSet()) {
        if (obj === undefined) return 'undefined';
        if (obj === null) return 'null';
        if (typeof obj === 'string') return obj;
        if (typeof obj === 'boolean' || typeof obj === 'number') return String(obj);

        if (depth < 0) return '[...]';
        if (typeof obj === 'object' && obj !== null) {
            if (seen.has(obj)) return '[Circular]';
            seen.add(obj);
        }

        if (typeof obj === 'function') return `[Function: ${obj.name || 'anonymous'}]`;

        if (obj instanceof Error || (obj && obj.message && obj.stack)) {
            return obj.stack || `${obj.name || 'Error'}: ${obj.message}`;
        }

        if (obj && typeof obj.then === 'function') return '[Promise]';

        if (Array.isArray(obj)) {
            let parts = [];
            let emptyCount = 0;
            for (let i = 0; i < obj.length; i++) {
                if (i in obj) {
                    if (emptyCount > 0) {
                        parts.push(`<${emptyCount} empty items>`);
                        emptyCount = 0;
                    }
                    parts.push(this._serialize(obj[i], depth - 1, seen));
                } else {
                    emptyCount++;
                }
            }
            if (emptyCount > 0) {
                parts.push(`<${emptyCount} empty items>`);
            }
            return `[${parts.join(', ')}]`;
        }

        try {
            if (typeof obj === 'object') {
                const entries = Object.entries(obj);
                if (entries.length === 0) return '{}';
                const content = entries
                    .map(([k, v]) => `${k}: ${this._serialize(v, depth - 1, seen)}`)
                    .join(', ');
                return `{ ${content} }`;
            }
            return String(obj);
        } catch (e) {
            return String(obj);
        }
    }
}

module.exports = new AntigravityEngine();
