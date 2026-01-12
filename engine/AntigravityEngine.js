const vm = require('node:vm');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class AntigravityEngine {
    constructor() {
        this.timeout = 5000;
        this.tempDir = path.join(os.tmpdir(), 'antigravity_exec');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async execute(code, lang = 'javascript', contextExtension = {}) {
        const resultId = uuidv4();

        switch (lang.toLowerCase()) {
            case 'javascript':
            case 'js':
                return this._executeJS(code, contextExtension);
            case 'python':
            case 'py':
                return this._executeExternal(code, 'python3', 'py');
            case 'c':
                return this._executeC(code);
            case 'cpp':
            case 'c++':
                return this._executeCpp(code);
            case 'java':
                return this._executeJava(code);
            default:
                return { id: resultId, success: false, error: `Unsupported language: ${lang}` };
        }
    }

    async _executeJS(code, contextExtension = {}) {
        const logs = [];
        const resultId = uuidv4();
        const customConsole = {
            log: (...args) => { logs.push(args.map(a => this._serialize(a)).join(' ')); },
            error: (...args) => { logs.push(`ERROR: ${args.map(a => this._serialize(a)).join(' ')}`); },
            warn: (...args) => { logs.push(`WARN: ${args.map(a => this._serialize(a)).join(' ')}`); },
            info: (...args) => { logs.push(`INFO: ${args.map(a => this._serialize(a)).join(' ')}`); },
        };

        const sandbox = {
            console: customConsole,
            setTimeout, clearTimeout, setInterval, clearInterval,
            Buffer, URL, Promise,
            process: { env: {} },
            ...contextExtension,
        };

        const context = vm.createContext(sandbox);

        try {
            const script = new vm.Script(code);
            const result = script.runInContext(context, { timeout: this.timeout });
            const resolvedResult = (result && typeof result.then === 'function') ? await result : result;

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

    async _executeExternal(code, command, ext) {
        const id = uuidv4();
        const filePath = path.join(this.tempDir, `${id}.${ext}`);
        fs.writeFileSync(filePath, code);

        return new Promise((resolve) => {
            const cmd = `${command} "${filePath}"`;
            exec(cmd, { timeout: this.timeout }, (error, stdout, stderr) => {
                // Cleanup
                try { fs.unlinkSync(filePath); } catch (e) { }

                if (error && error.killed) {
                    return resolve({ id, success: false, error: 'Execution timed out' });
                }

                const logs = stdout ? stdout.trim().split('\n') : [];
                if (stderr) logs.push(`STDERR: ${stderr.trim()}`);

                resolve({
                    id,
                    success: !error,
                    result: null,
                    logs,
                    error: error ? error.message : null
                });
            });
        });
    }

    async _executeC(code) {
        const id = uuidv4();
        const srcPath = path.join(this.tempDir, `${id}.c`);
        const binPath = path.join(this.tempDir, `${id}.out`);
        fs.writeFileSync(srcPath, code);

        return new Promise((resolve) => {
            const compileCmd = `gcc "${srcPath}" -o "${binPath}"`;
            exec(compileCmd, (cError, cStdout, cStderr) => {
                if (cError) {
                    try { fs.unlinkSync(srcPath); } catch (e) { }
                    return resolve({ id, success: false, error: `Compilation Error: ${cStderr || cError.message}` });
                }

                exec(`"${binPath}"`, { timeout: this.timeout }, (rError, rStdout, rStderr) => {
                    // Cleanup
                    try { fs.unlinkSync(srcPath); fs.unlinkSync(binPath); } catch (e) { }

                    if (rError && rError.killed) {
                        return resolve({ id, success: false, error: 'Execution timed out' });
                    }

                    const logs = rStdout ? rStdout.trim().split('\n') : [];
                    if (rStderr) logs.push(`STDERR: ${rStderr.trim()}`);

                    resolve({
                        id,
                        success: !rError,
                        result: null,
                        logs,
                        error: rError ? rError.message : null
                    });
                });
            });
        });
    }

    async _executeCpp(code) {
        const id = uuidv4();
        const srcPath = path.join(this.tempDir, `${id}.cpp`);
        const binPath = path.join(this.tempDir, `${id}.out`);
        fs.writeFileSync(srcPath, code);

        return new Promise((resolve) => {
            const compileCmd = `g++ "${srcPath}" -o "${binPath}"`;
            exec(compileCmd, (cError, cStdout, cStderr) => {
                if (cError) {
                    try { fs.unlinkSync(srcPath); } catch (e) { }
                    return resolve({ id, success: false, error: `Compilation Error: ${cStderr || cError.message}` });
                }

                exec(`"${binPath}"`, { timeout: this.timeout }, (rError, rStdout, rStderr) => {
                    // Cleanup
                    try { fs.unlinkSync(srcPath); fs.unlinkSync(binPath); } catch (e) { }

                    if (rError && rError.killed) {
                        return resolve({ id, success: false, error: 'Execution timed out' });
                    }

                    const logs = rStdout ? rStdout.trim().split('\n') : [];
                    if (rStderr) logs.push(`STDERR: ${rStderr.trim()}`);

                    resolve({
                        id,
                        success: !rError,
                        result: null,
                        logs,
                        error: rError ? rError.message : null
                    });
                });
            });
        });
    }

    async _executeJava(code) {
        const id = uuidv4();
        // Java requires filename to match public class name
        const classNameMatch = code.match(/public\s+class\s+([A-Za-z0-9_$]+)/);
        const className = classNameMatch ? classNameMatch[1] : 'Main';

        // Use a unique subfolder for each java execution to avoid class file conflicts
        const execDir = path.join(this.tempDir, id);
        fs.mkdirSync(execDir, { recursive: true });

        const srcPath = path.join(execDir, `${className}.java`);
        fs.writeFileSync(srcPath, code);

        return new Promise((resolve) => {
            const compileCmd = `javac "${srcPath}"`;
            exec(compileCmd, (cError, cStdout, cStderr) => {
                if (cError) {
                    try { fs.rmSync(execDir, { recursive: true, force: true }); } catch (e) { }
                    return resolve({ id, success: false, error: `Compilation Error: ${cStderr || cError.message}` });
                }

                exec(`java -cp "${execDir}" ${className}`, { timeout: this.timeout }, (rError, rStdout, rStderr) => {
                    // Cleanup
                    try { fs.rmSync(execDir, { recursive: true, force: true }); } catch (e) { }

                    if (rError && rError.killed) {
                        return resolve({ id, success: false, error: 'Execution timed out' });
                    }

                    const logs = rStdout ? rStdout.trim().split('\n') : [];
                    if (rStderr) logs.push(`STDERR: ${rStderr.trim()}`);

                    resolve({
                        id,
                        success: !rError,
                        result: null,
                        logs,
                        error: rError ? rError.message : null
                    });
                });
            });
        });
    }

    _serialize(obj) {
        if (obj === undefined) return 'undefined';
        if (obj === null) return 'null';
        if (typeof obj === 'string') return obj;
        if (typeof obj === 'function') return `[Function: ${obj.name || 'anonymous'}]`;

        if (obj instanceof Error || (obj && obj.message && obj.stack)) {
            return obj.stack || `${obj.name || 'Error'}: ${obj.message}`;
        }

        if (obj && typeof obj.then === 'function') return '[Promise]';

        try {
            if (typeof obj === 'object') {
                return JSON.stringify(obj, (key, value) => {
                    if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
                    if (value instanceof Error) return `${value.name}: ${value.message}`;
                    return value;
                }, 2);
            }
            return String(obj);
        } catch (e) {
            return String(obj);
        }
    }
}

module.exports = new AntigravityEngine();
