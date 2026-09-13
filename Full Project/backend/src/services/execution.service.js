const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const env = require('../config/env');

class ExecutionService {
    constructor() {
        this.timeout = env.LIMITS.EXECUTION_TIMEOUT_MS;
        this.tempDir = path.join(os.tmpdir(), 'zoho_notes_pro_exec');
        if (!fs.existsSync(this.tempDir)) {
            try {
                fs.mkdirSync(this.tempDir, { recursive: true });
            } catch (e) {
                console.warn('[ExecutionService] Temp directory warning:', e.message);
            }
        }
    }

    /**
     * Dispatcher for non-interactive execution
     */
    async execute(code, lang = 'javascript', options = {}) {
        const stdin = typeof options === 'string' ? options : (options?.stdin || '');
        const normalizedLang = (lang || '').toLowerCase().trim();

        switch (normalizedLang) {
            case 'javascript':
            case 'js':
                return this._executeNode(code, stdin);
            case 'typescript':
            case 'ts':
                return this._executeTS(code, stdin);
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
                return {
                    success: false,
                    output: `Unsupported language: ${lang}. Supported: js, ts, python, c, cpp, java.`
                };
        }
    }

    /**
     * Prepare process configuration for interactive WebSocket streaming
     */
    async prepareExecution(code, lang) {
        const id = crypto.randomUUID();
        const baseDir = path.join(this.tempDir, id);
        fs.mkdirSync(baseDir, { recursive: true });

        const normalizedLang = (lang || '').toLowerCase().trim();

        switch (normalizedLang) {
            case 'javascript':
            case 'js': {
                const srcPath = path.join(baseDir, 'index.js');
                fs.writeFileSync(srcPath, code, 'utf8');
                return { binaryPath: 'node', args: [srcPath], tempDir: baseDir };
            }
            case 'typescript':
            case 'ts': {
                const srcPath = path.join(baseDir, 'index.ts');
                fs.writeFileSync(srcPath, code, 'utf8');
                return { binaryPath: 'npx', args: ['ts-node', srcPath], tempDir: baseDir };
            }
            case 'python':
            case 'py': {
                const srcPath = path.join(baseDir, 'main.py');
                fs.writeFileSync(srcPath, code, 'utf8');
                const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
                return { binaryPath: pyCmd, args: [srcPath], tempDir: baseDir };
            }
            case 'c': {
                const srcPath = path.join(baseDir, 'main.c');
                const binPath = path.join(baseDir, process.platform === 'win32' ? 'main.exe' : 'main');
                fs.writeFileSync(srcPath, code, 'utf8');

                await new Promise((resolve, reject) => {
                    exec(`gcc "${srcPath}" -o "${binPath}"`, { timeout: 10000 }, (err, stdout, stderr) => {
                        if (err) return reject(new Error(stderr || err.message));
                        resolve();
                    });
                });

                return { binaryPath: binPath, args: [], tempDir: baseDir };
            }
            case 'cpp':
            case 'c++': {
                const srcPath = path.join(baseDir, 'main.cpp');
                const binPath = path.join(baseDir, process.platform === 'win32' ? 'main.exe' : 'main');
                fs.writeFileSync(srcPath, code, 'utf8');

                await new Promise((resolve, reject) => {
                    exec(`g++ "${srcPath}" -o "${binPath}"`, { timeout: 10000 }, (err, stdout, stderr) => {
                        if (err) return reject(new Error(stderr || err.message));
                        resolve();
                    });
                });

                return { binaryPath: binPath, args: [], tempDir: baseDir };
            }
            case 'java': {
                const srcPath = path.join(baseDir, 'Main.java');
                fs.writeFileSync(srcPath, code, 'utf8');

                await new Promise((resolve, reject) => {
                    exec(`javac "${srcPath}"`, { timeout: 10000 }, (err, stdout, stderr) => {
                        if (err) return reject(new Error(stderr || err.message));
                        resolve();
                    });
                });

                return { binaryPath: 'java', args: ['-cp', baseDir, 'Main'], tempDir: baseDir };
            }
            default:
                throw new Error(`Interactive execution not supported for ${lang}`);
        }
    }

    /**
     * Clean up prepared files after execution terminates
     */
    cleanupExecution(prepared) {
        if (prepared && prepared.tempDir && fs.existsSync(prepared.tempDir)) {
            try {
                fs.rmSync(prepared.tempDir, { recursive: true, force: true });
            } catch (e) {
                // Ignore cleanup errors on busy files
            }
        }
    }

    // --- Internal batch executors ---

    _runProcess(command, args, stdin = '', timeoutMs = 8000) {
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let killed = false;

            const child = spawn(command, args, { windowsHide: true });

            const timer = setTimeout(() => {
                killed = true;
                try { child.kill('SIGKILL'); } catch (e) { }
                resolve({
                    success: false,
                    output: `Execution timed out after ${timeoutMs / 1000}s`
                });
            }, timeoutMs);

            if (stdin) {
                try {
                    child.stdin.write(stdin);
                    child.stdin.end();
                } catch (e) { }
            }

            child.stdout?.on('data', d => { stdout += d.toString(); });
            child.stderr?.on('data', d => { stderr += d.toString(); });

            child.on('error', err => {
                clearTimeout(timer);
                resolve({ success: false, output: `Process error: ${err.message}` });
            });

            child.on('close', code => {
                clearTimeout(timer);
                if (killed) return;
                resolve({
                    success: code === 0,
                    output: stdout || stderr || (code === 0 ? '[Program finished with no output]' : `Exited with code ${code}`)
                });
            });
        });
    }

    async _executeNode(code, stdin) {
        const id = crypto.randomUUID();
        const file = path.join(this.tempDir, `${id}.js`);
        fs.writeFileSync(file, code, 'utf8');
        const res = await this._runProcess('node', [file], stdin, this.timeout);
        try { fs.unlinkSync(file); } catch (e) { }
        return res;
    }

    async _executeTS(code, stdin) {
        const id = crypto.randomUUID();
        const file = path.join(this.tempDir, `${id}.ts`);
        fs.writeFileSync(file, code, 'utf8');
        const res = await this._runProcess('npx', ['ts-node', file], stdin, this.timeout);
        try { fs.unlinkSync(file); } catch (e) { }
        return res;
    }

    async _executePython(code, stdin) {
        const id = crypto.randomUUID();
        const file = path.join(this.tempDir, `${id}.py`);
        fs.writeFileSync(file, code, 'utf8');
        const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
        const res = await this._runProcess(pyCmd, [file], stdin, this.timeout);
        try { fs.unlinkSync(file); } catch (e) { }
        return res;
    }

    async _executeC(code, stdin) {
        let prepared;
        try {
            prepared = await this.prepareExecution(code, 'c');
            const res = await this._runProcess(prepared.binaryPath, prepared.args, stdin, this.timeout);
            this.cleanupExecution(prepared);
            return res;
        } catch (err) {
            if (prepared) this.cleanupExecution(prepared);
            return { success: false, output: `Compilation error:\n${err.message}` };
        }
    }

    async _executeCpp(code, stdin) {
        let prepared;
        try {
            prepared = await this.prepareExecution(code, 'cpp');
            const res = await this._runProcess(prepared.binaryPath, prepared.args, stdin, this.timeout);
            this.cleanupExecution(prepared);
            return res;
        } catch (err) {
            if (prepared) this.cleanupExecution(prepared);
            return { success: false, output: `Compilation error:\n${err.message}` };
        }
    }

    async _executeJava(code, stdin) {
        let prepared;
        try {
            prepared = await this.prepareExecution(code, 'java');
            const res = await this._runProcess(prepared.binaryPath, prepared.args, stdin, this.timeout);
            this.cleanupExecution(prepared);
            return res;
        } catch (err) {
            if (prepared) this.cleanupExecution(prepared);
            return { success: false, output: `Compilation error:\n${err.message}` };
        }
    }
}

module.exports = new ExecutionService();
