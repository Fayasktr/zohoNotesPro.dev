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
            log: (...args) => logs.push(args.map(a => this._serialize(a)).join(' ')),
            error: (...args) => logs.push(`ERROR: ${args.map(a => this._serialize(a)).join(' ')}`),
            warn: (...args) => logs.push(`WARN: ${args.map(a => this._serialize(a)).join(' ')}`),
            info: (...args) => logs.push(`INFO: ${args.map(a => this._serialize(a)).join(' ')}`),
        };

        const sandbox = {
            console: customConsole,
            setTimeout, clearTimeout, setInterval, clearInterval,
            Buffer, URL, process: { env: {} },
            ...contextExtension,
        };

        const context = vm.createContext(sandbox);

        try {
            const script = new vm.Script(code);
            const result = script.runInContext(context, { timeout: this.timeout });
            const resolvedResult = result instanceof Promise ? await result : result;

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
        if (typeof obj === 'function') return `[Function: ${obj.name || 'anonymous'}]`;
        try {
            return typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj);
        } catch (e) {
            return String(obj);
        }
    }
}

module.exports = new AntigravityEngine();
