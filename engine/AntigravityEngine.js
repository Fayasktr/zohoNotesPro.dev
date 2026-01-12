const vm = require('node:vm');
const { v4: uuidv4 } = require('uuid');

class AntigravityEngine {
    constructor() {
        this.timeout = 5000;
    }

    async execute(code, contextExtension = {}) {
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
            Buffer, URL, Promise, // Explicitly pass Promise to sandbox
            process: { env: {} },
            ...contextExtension,
        };

        const context = vm.createContext(sandbox);

        try {
            const script = new vm.Script(code);
            const result = script.runInContext(context, { timeout: this.timeout });

            // Duck-typing for Promises from different contexts
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

    _serialize(obj) {
        if (obj === undefined) return 'undefined';
        if (obj === null) return 'null';
        if (typeof obj === 'string') return obj;
        if (typeof obj === 'function') return `[Function: ${obj.name || 'anonymous'}]`;

        // Handle Errors (they are not enumerable, so JSON.stringify returns {})
        if (obj instanceof Error || (obj && obj.message && obj.stack)) {
            // Error.stack usually already contains the Name and Message
            return obj.stack || `${obj.name || 'Error'}: ${obj.message}`;
        }

        // Handle Promises
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
