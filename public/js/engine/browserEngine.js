/**
 * Zoho Notes Pro - Client-Side Polyglot Browser Execution Engine
 * 
 * Execution Matrix:
 * - JavaScript  -> 100% Local (True Web Worker Sandbox + Infinite Loop Killer + Async Serializer)
 * - TypeScript  -> 100% Local (In-Browser TS Transpiler -> Web Worker Sandbox)
 * - Python      -> 100% Local (Pyodide WebAssembly ~11MB, Lazy-Loaded & Cached)
 * - C, C++, Java -> Secure Cloud Execution (Render.com via /api/execute)
 */

(function (window) {
    'use strict';

    // Inline Web Worker Sandbox Code Template
    const WORKER_SANDBOX_SOURCE = `
        self.serialize = function(obj, depth, seen) {
            depth = depth !== undefined ? depth : 5;
            seen = seen || new WeakSet();
            if (obj === undefined) return 'undefined';
            if (obj === null) return 'null';
            if (typeof obj === 'string') return obj;
            if (typeof obj === 'boolean' || typeof obj === 'number' || typeof obj === 'bigint') return String(obj);
            if (depth < 0) return '[...]';
            if (typeof obj === 'object' && obj !== null) {
                if (seen.has(obj)) return '[Circular]';
                seen.add(obj);
            }
            if (typeof obj === 'function') return '[Function: ' + (obj.name || 'anonymous') + ']';
            if (obj instanceof Error || (obj && obj.message && obj.stack)) {
                return obj.stack || (obj.name || 'Error') + ': ' + obj.message;
            }
            if (Array.isArray(obj)) {
                var parts = [];
                for (var i = 0; i < obj.length; i++) {
                    parts.push(self.serialize(obj[i], depth - 1, seen));
                }
                return '[' + parts.join(', ') + ']';
            }
            try {
                if (typeof obj === 'object') {
                    var entries = Object.entries(obj);
                    if (entries.length === 0) return '{}';
                    var content = entries.map(function(pair) {
                        return pair[0] + ': ' + self.serialize(pair[1], depth - 1, seen);
                    }).join(', ');
                    return '{ ' + content + ' }';
                }
                return String(obj);
            } catch(e) {
                return String(obj);
            }
        };

        const customConsole = {
            log: function() {
                var args = Array.prototype.slice.call(arguments);
                self.postMessage({ type: 'log', log: args.map(function(a){ return self.serialize(a); }).join(' ') });
            },
            error: function() {
                var args = Array.prototype.slice.call(arguments);
                self.postMessage({ type: 'log', log: 'ERROR: ' + args.map(function(a){ return self.serialize(a); }).join(' ') });
            },
            warn: function() {
                var args = Array.prototype.slice.call(arguments);
                self.postMessage({ type: 'log', log: 'WARN: ' + args.map(function(a){ return self.serialize(a); }).join(' ') });
            },
            info: function() {
                var args = Array.prototype.slice.call(arguments);
                self.postMessage({ type: 'log', log: 'INFO: ' + args.map(function(a){ return self.serialize(a); }).join(' ') });
            },
            dir: function(arg) {
                self.postMessage({ type: 'log', log: self.serialize(arg, 3) });
            },
            table: function(arg) {
                try {
                    self.postMessage({ type: 'log', log: JSON.stringify(arg, null, 2) });
                } catch(e) {
                    self.postMessage({ type: 'log', log: self.serialize(arg) });
                }
            }
        };

        self.console = customConsole;

        var activeTimers = new Set();
        var activeIntervals = new Set();
        var originalSetTimeout = self.setTimeout.bind(self);
        var originalClearTimeout = self.clearTimeout.bind(self);
        var originalSetInterval = self.setInterval.bind(self);
        var originalClearInterval = self.clearInterval.bind(self);

        var wrappedSetTimeout = function(fn, delay) {
            var args = Array.prototype.slice.call(arguments, 2);
            var id;
            id = originalSetTimeout(function() {
                activeTimers.delete(id);
                try {
                    if (typeof fn === 'function') {
                        fn.apply(null, args);
                    }
                } catch(err) {
                    customConsole.error('Async Error (setTimeout): ' + (err.message || String(err)));
                }
            }, delay);
            activeTimers.add(id);
            return id;
        };

        var wrappedClearTimeout = function(id) {
            if (id !== undefined && id !== null) {
                activeTimers.delete(id);
            }
            return originalClearTimeout(id);
        };

        var wrappedSetInterval = function(fn, delay) {
            var args = Array.prototype.slice.call(arguments, 2);
            var id;
            id = originalSetInterval(function() {
                try {
                    if (typeof fn === 'function') {
                        fn.apply(null, args);
                    }
                } catch(err) {
                    customConsole.error('Async Error (setInterval): ' + (err.message || String(err)));
                }
            }, delay);
            activeIntervals.add(id);
            return id;
        };

        var wrappedClearInterval = function(id) {
            if (id !== undefined && id !== null) {
                activeIntervals.delete(id);
            }
            return originalClearInterval(id);
        };

        self.setTimeout = wrappedSetTimeout;
        self.clearTimeout = wrappedClearTimeout;
        self.setInterval = wrappedSetInterval;
        self.clearInterval = wrappedClearInterval;

        self.onmessage = async function(e) {
            var code = e.data.code;
            var rawCode = e.data.rawCode;
            var timeoutMs = e.data.timeoutMs || 5000;
            try {
                var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                var fn;
                try {
                    fn = new AsyncFunction('console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', '"use strict";\\n' + code);
                } catch(compileErr) {
                    if (rawCode && rawCode !== code && (compileErr instanceof SyntaxError)) {
                        fn = new AsyncFunction('console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', '"use strict";\\n' + rawCode);
                    } else {
                        throw compileErr;
                    }
                }
                var result = await fn(customConsole, wrappedSetTimeout, wrappedClearTimeout, wrappedSetInterval, wrappedClearInterval);

                // Wait for any remaining async tasks (timers & intervals) up to timeoutMs limit
                var startWait = Date.now();
                var timerSafetyLimit = Math.max(100, timeoutMs - 200);
                while ((activeTimers.size > 0 || activeIntervals.size > 0) && (Date.now() - startWait) < timerSafetyLimit) {
                    await new Promise(function(resolve) { originalSetTimeout(resolve, 30); });
                }

                // Clean up any remaining intervals/timers
                activeTimers.forEach(function(id) { originalClearTimeout(id); });
                activeIntervals.forEach(function(id) { originalClearInterval(id); });
                activeTimers.clear();
                activeIntervals.clear();

                self.postMessage({
                    type: 'done',
                    success: true,
                    result: self.serialize(result),
                    error: null
                });
            } catch(err) {
                activeTimers.forEach(function(id) { originalClearTimeout(id); });
                activeIntervals.forEach(function(id) { originalClearInterval(id); });
                activeTimers.clear();
                activeIntervals.clear();

                self.postMessage({
                    type: 'done',
                    success: false,
                    result: null,
                    error: err.message || String(err)
                });
            }
        };
    `;

    class BrowserExecutionEngine {
        constructor() {
            this.timeoutMs = 15000;
            this.pyodide = null;
            this.isPyodideLoading = false;
            this.pyodideLoadPromise = null;
            this.tsLoaded = false;
            this.workerBlobUrl = null;
        }

        /**
         * Main Execution Entry Point
         * @param {string} code - Source code to execute
         * @param {string} lang - Language (javascript, typescript, python, c, cpp, java)
         * @param {object} options - Optional execution settings (e.g. stdin)
         * @returns {Promise<{success: boolean, result: any, logs: string[], error: string|null, durationMs: number}>}
         */
        async execute(code, lang = 'javascript', options = {}) {
            const startTime = performance.now();
            const normalizedLang = (lang || 'javascript').toLowerCase();
            let response;

            switch (normalizedLang) {
                case 'javascript':
                case 'js':
                    response = await this.executeJS(code, options);
                    break;

                case 'typescript':
                case 'ts':
                    response = await this.executeTS(code, options);
                    break;

                case 'python':
                case 'py':
                    response = await this.executePython(code, options);
                    break;

                case 'c':
                case 'cpp':
                case 'c++':
                case 'java':
                    response = await this.executeOnServer(code, normalizedLang, options);
                    break;

                default:
                    response = {
                        success: false,
                        result: null,
                        logs: [],
                        error: `Unsupported language runtime: ${lang}`
                    };
            }

            const endTime = performance.now();
            response.durationMs = Math.round(endTime - startTime);
            return response;
        }

        // =========================================================================
        // 1. JAVASCRIPT RUNNER (Web Worker Sandbox + Infinite Loop Protection)
        // =========================================================================

        getWorkerBlobUrl() {
            if (!this.workerBlobUrl && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
                const blob = new Blob([WORKER_SANDBOX_SOURCE], { type: 'application/javascript' });
                this.workerBlobUrl = URL.createObjectURL(blob);
            }
            return this.workerBlobUrl;
        }

        prepareCodeWithReturn(code) {
            if (!code || typeof code !== 'string') return code || '';
            const trimmed = code.trim();
            if (!trimmed) return code;

            const lines = trimmed.split('\n');
            let lastIdx = lines.length - 1;
            while (lastIdx >= 0 && !lines[lastIdx].trim()) lastIdx--;
            if (lastIdx < 0) return code;

            let lastLine = lines[lastIdx].trim();
            if (lastLine.endsWith(';')) lastLine = lastLine.slice(0, -1).trim();

            // Skip wrapping if the line ends with or starts with closing delimiters of a block/callback:
            // e.g. "}", "})", "});", "}, 1000", "}]"
            if (/\}[\s\)\],;]*$/.test(lastLine) || /^[\}\]\)]/.test(lastLine)) {
                return code;
            }

            const nonReturnableKeywords = [
                'return', 'const', 'let', 'var', 'function', 'class', 'if', 'else', 'for',
                'while', 'do', 'switch', 'case', 'try', 'catch', 'finally', 'throw',
                'import', 'export', 'debugger', 'break', 'continue'
            ];

            const firstWord = lastLine.split(/[\s\(\{]/)[0];
            if (nonReturnableKeywords.includes(firstWord) || lastLine.endsWith('}') || lastLine.endsWith('{')) {
                return code;
            }

            // Check bracket balance on lastLine:
            // If lastLine has more closing brackets/parens/braces than opening ones,
            // it cannot be wrapped as a standalone expression.
            let parenBalance = 0, braceBalance = 0, bracketBalance = 0;
            for (const char of lastLine) {
                if (char === '(') parenBalance++;
                else if (char === ')') parenBalance--;
                else if (char === '{') braceBalance++;
                else if (char === '}') braceBalance--;
                else if (char === '[') bracketBalance++;
                else if (char === ']') bracketBalance--;
            }
            if (parenBalance < 0 || braceBalance < 0 || bracketBalance < 0) {
                return code;
            }

            // Try wrapping candidate
            const candidateLines = [...lines];
            candidateLines[lastIdx] = `return (${lastLine});`;
            const candidateCode = candidateLines.join('\n');

            // Pre-compile validation: ensure candidate does NOT introduce a SyntaxError
            try {
                const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
                new AsyncFunction('console', '"use strict";\n' + candidateCode);
                return candidateCode;
            } catch (syntaxErr) {
                // Discard candidate if invalid syntax, fallback safely to original code
                return code;
            }
        }

        async executeJS(code, options = {}) {
            let contextExtension = {};
            if (options && typeof options === 'object') {
                if (options.contextExtension) {
                    contextExtension = options.contextExtension;
                }
            }
            const preparedCode = this.prepareCodeWithReturn(code);
            // Check if Web Workers are supported
            if (typeof Worker !== 'undefined' && this.getWorkerBlobUrl()) {
                try {
                    const res = await this.executeJSInWorker(preparedCode, code, options);
                    if (res && res.success) {
                        return res;
                    }
                    if (res && res.error && !res.error.includes('Worker') && !res.error.includes('blob:')) {
                        return res;
                    }
                } catch (workerErr) {
                    console.warn('[BrowserEngine] Worker initialization failed, falling back to main-thread sandbox:', workerErr);
                }
            }
            // Fallback for environments without Worker support or where Blob Worker fails (e.g. CSP restrictions)
            return this.executeJSFallback(preparedCode, code, contextExtension, options);
        }

        executeJSInWorker(code, rawCode = null, options = {}) {
            return new Promise((resolve) => {
                const logs = [];
                let worker = null;
                let timeoutTimer = null;
                let isFinished = false;

                try {
                    worker = new Worker(this.getWorkerBlobUrl());

                    const cleanup = () => {
                        if (timeoutTimer) {
                            clearTimeout(timeoutTimer);
                            timeoutTimer = null;
                        }
                        if (worker) {
                            worker.terminate();
                            worker = null;
                        }
                    };

                    // Strict Timeout Guard (terminates infinite loops without freezing the UI)
                    const executionTimeout = (options && options.timeoutMs) ? options.timeoutMs : this.timeoutMs;
                    timeoutTimer = setTimeout(() => {
                        if (!isFinished) {
                            isFinished = true;
                            cleanup();
                            resolve({
                                success: false,
                                result: null,
                                logs,
                                error: `Execution timed out (${Math.round(executionTimeout / 1000)}s limit). Infinite loop terminated safely.`
                            });
                        }
                    }, executionTimeout);

                    worker.onmessage = (e) => {
                        const data = e.data;
                        if (!data) return;

                        if (data.type === 'log') {
                            logs.push(data.log);
                            if (typeof options.onLog === 'function') {
                                try { options.onLog(data.log); } catch (e) { }
                            }
                        } else if (data.type === 'done') {
                            if (!isFinished) {
                                isFinished = true;
                                cleanup();
                                resolve({
                                    success: data.success,
                                    result: data.result,
                                    logs,
                                    error: data.error
                                });
                            }
                        }
                    };

                    worker.onerror = (err) => {
                        if (!isFinished) {
                            isFinished = true;
                            cleanup();
                            resolve({
                                success: false,
                                result: null,
                                logs,
                                error: err.message || 'Worker runtime error'
                            });
                        }
                    };

                    worker.postMessage({ code, rawCode, timeoutMs: executionTimeout });
                } catch (err) {
                    if (timeoutTimer) clearTimeout(timeoutTimer);
                    if (worker) worker.terminate();
                    resolve({
                        success: false,
                        result: null,
                        logs,
                        error: err.message || String(err)
                    });
                }
            });
        }

        async executeJSFallback(code, rawCode = null, contextExtension = {}, options = {}) {
            if (typeof rawCode === 'object' && rawCode !== null && (!contextExtension || Object.keys(contextExtension).length === 0)) {
                contextExtension = rawCode;
                rawCode = null;
            }

            const logs = [];
            const customConsole = {
                log: (...args) => {
                    const line = args.map(a => this.serialize(a)).join(' ');
                    logs.push(line);
                    if (typeof options.onLog === 'function') options.onLog(line);
                },
                error: (...args) => {
                    const line = `ERROR: ${args.map(a => this.serialize(a)).join(' ')}`;
                    logs.push(line);
                    if (typeof options.onLog === 'function') options.onLog(line);
                },
                warn: (...args) => {
                    const line = `WARN: ${args.map(a => this.serialize(a)).join(' ')}`;
                    logs.push(line);
                    if (typeof options.onLog === 'function') options.onLog(line);
                },
                info: (...args) => {
                    const line = `INFO: ${args.map(a => this.serialize(a)).join(' ')}`;
                    logs.push(line);
                    if (typeof options.onLog === 'function') options.onLog(line);
                },
                dir: (arg) => {
                    const line = this.serialize(arg, 3);
                    logs.push(line);
                    if (typeof options.onLog === 'function') options.onLog(line);
                },
                table: (arg) => {
                    try {
                        const line = JSON.stringify(arg, null, 2);
                        logs.push(line);
                        if (typeof options.onLog === 'function') options.onLog(line);
                    } catch (e) {
                        const line = this.serialize(arg);
                        logs.push(line);
                        if (typeof options.onLog === 'function') options.onLog(line);
                    }
                }
            };

            const activeTimers = new Set();
            const activeIntervals = new Set();

            const wrappedSetTimeout = (fn, delay, ...args) => {
                let id;
                id = setTimeout(() => {
                    activeTimers.delete(id);
                    try {
                        if (typeof fn === 'function') fn(...args);
                    } catch (err) {
                        customConsole.error(`Async Error (setTimeout): ${err.message || String(err)}`);
                    }
                }, delay);
                activeTimers.add(id);
                return id;
            };

            const wrappedClearTimeout = (id) => {
                if (id !== undefined && id !== null) activeTimers.delete(id);
                return clearTimeout(id);
            };

            const wrappedSetInterval = (fn, delay, ...args) => {
                let id;
                id = setInterval(() => {
                    try {
                        if (typeof fn === 'function') fn(...args);
                    } catch (err) {
                        customConsole.error(`Async Error (setInterval): ${err.message || String(err)}`);
                    }
                }, delay);
                activeIntervals.add(id);
                return id;
            };

            const wrappedClearInterval = (id) => {
                if (id !== undefined && id !== null) activeIntervals.delete(id);
                return clearInterval(id);
            };

            try {
                const sandbox = {
                    console: customConsole,
                    setTimeout: wrappedSetTimeout,
                    clearTimeout: wrappedClearTimeout,
                    setInterval: wrappedSetInterval,
                    clearInterval: wrappedClearInterval,
                    Math: window.Math,
                    Date: window.Date,
                    JSON: window.JSON,
                    Array: window.Array,
                    Object: window.Object,
                    String: window.String,
                    Number: window.Number,
                    Boolean: window.Boolean,
                    RegExp: window.RegExp,
                    Map: window.Map,
                    Set: window.Set,
                    ...contextExtension
                };

                const paramNames = Object.keys(sandbox);
                const paramValues = Object.values(sandbox);

                const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
                let userFunc;
                try {
                    userFunc = new AsyncFunction(...paramNames, `"use strict";\n${code}`);
                } catch (compileErr) {
                    if (rawCode && rawCode !== code && (compileErr instanceof SyntaxError)) {
                        userFunc = new AsyncFunction(...paramNames, `"use strict";\n${rawCode}`);
                    } else {
                        throw compileErr;
                    }
                }

                const execPromise = userFunc(...paramValues);
                const executionTimeout = (options && options.timeoutMs) ? options.timeoutMs : this.timeoutMs;
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Execution timed out (${Math.round(executionTimeout / 1000)}s limit)`)), executionTimeout)
                );

                const result = await Promise.race([execPromise, timeoutPromise]);

                // Wait for any remaining async timers & intervals up to safety limit
                const startWait = Date.now();
                const timerSafetyLimit = Math.max(100, executionTimeout - 200);
                while ((activeTimers.size > 0 || activeIntervals.size > 0) && (Date.now() - startWait) < timerSafetyLimit) {
                    await new Promise(res => setTimeout(res, 30));
                }

                // Clean up remaining intervals/timers
                activeTimers.forEach(id => clearTimeout(id));
                activeIntervals.forEach(id => clearInterval(id));
                activeTimers.clear();
                activeIntervals.clear();

                return {
                    success: true,
                    result: this.serialize(result),
                    logs,
                    error: null
                };
            } catch (err) {
                activeTimers.forEach(id => clearTimeout(id));
                activeIntervals.forEach(id => clearInterval(id));
                activeTimers.clear();
                activeIntervals.clear();

                return {
                    success: false,
                    result: null,
                    logs,
                    error: err.message || String(err)
                };
            }
        }

        // =========================================================================
        // 2. TYPESCRIPT RUNNER (In-Browser Transpile -> Web Worker Sandbox -> Cloud Fallback)
        // =========================================================================

        async executeTS(code, options = {}) {
            const tsCdnMirrors = [
                'https://cdnjs.cloudflare.com/ajax/libs/typescript/5.3.3/typescript.min.js',
                'https://cdn.jsdelivr.net/npm/typescript@5.3.3/lib/typescript.min.js',
                'https://unpkg.com/typescript@5.3.3/lib/typescript.js'
            ];

            try {
                if (!this.tsLoaded && (typeof window.ts === 'undefined' || !window.ts.transpileModule)) {
                    for (const mirror of tsCdnMirrors) {
                        try {
                            await this.loadScript(mirror);
                            if (typeof window.ts !== 'undefined' && window.ts.transpileModule) {
                                this.tsLoaded = true;
                                break;
                            }
                        } catch (e) {
                            console.warn('[BrowserEngine] TS CDN mirror failed:', mirror);
                        }
                    }
                }

                if (typeof window.ts !== 'undefined' && window.ts.transpileModule) {
                    const transpileResult = window.ts.transpileModule(code, {
                        compilerOptions: {
                            module: (window.ts.ModuleKind && window.ts.ModuleKind.ESNext) || 99,
                            target: (window.ts.ScriptTarget && window.ts.ScriptTarget.ES2022) || 9,
                            jsx: (window.ts.JsxEmit && window.ts.JsxEmit.None) || 0,
                            removeComments: false,
                            alwaysStrict: false
                        }
                    });

                    return await this.executeJS(transpileResult.outputText, options);
                }
            } catch (tsErr) {
                console.warn('[BrowserEngine] Local TS transpilation failed, falling back to Cloud Runner:', tsErr.message);
                return this.executeOnServer(code, 'typescript');
            }

            // Fallback to Cloud Runner if local TS compiler is unavailable
            return this.executeOnServer(code, 'typescript');
        }

        // =========================================================================
        // 3. PYTHON RUNNER (Pyodide WebAssembly + Multi-CDN + Cloud Fallback)
        // =========================================================================

        async executePython(code, options = {}) {
            const logs = [];
            const stdin = options?.stdin || '';

            try {
                if (!this.pyodide) {
                    this.showToast('⚡ Loading Python WASM runtime (~11MB, cached after first load)...', 'info');
                    await this.loadPyodide();
                }

                if (this.pyodide) {
                    this.pyodide.setStdout({
                        batched: (text) => {
                            if (text && text.trim()) logs.push(text);
                        }
                    });

                    this.pyodide.setStderr({
                        batched: (text) => {
                            if (text && text.trim()) logs.push(`STDERR: ${text}`);
                        }
                    });

                    if (typeof this.pyodide.setStdin === 'function') {
                        let lines = (stdin ? stdin.split('\n') : []);
                        let idx = 0;
                        this.pyodide.setStdin({
                            read: () => {
                                if (idx < lines.length) {
                                    return lines[idx++] + '\n';
                                }
                                return null;
                            }
                        });
                    }

                    const result = await this.pyodide.runPythonAsync(code);

                    return {
                        success: true,
                        result: result !== undefined && result !== null ? String(result) : null,
                        logs,
                        error: null
                    };
                }
            } catch (wasmErr) {
                console.warn('[BrowserEngine] Local Pyodide execution failed, routing to Cloud Runner fallback:', wasmErr.message);
                this.showToast('⚡ Executing Python via Cloud Runner (WASM fallback)...', 'info');
                return this.executeOnServer(code, 'python', options);
            }

            return this.executeOnServer(code, 'python', options);
        }

        async loadPyodide() {
            if (this.pyodide) return this.pyodide;
            if (this.pyodideLoadPromise) return this.pyodideLoadPromise;

            const cdnMirrors = [
                {
                    script: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js',
                    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
                },
                {
                    script: 'https://cdnjs.cloudflare.com/ajax/libs/pyodide/0.25.0/full/pyodide.js',
                    indexURL: 'https://cdnjs.cloudflare.com/ajax/libs/pyodide/0.25.0/full/'
                },
                {
                    script: 'https://unpkg.com/pyodide@0.25.0/full/pyodide.js',
                    indexURL: 'https://unpkg.com/pyodide@0.25.0/full/'
                }
            ];

            this.pyodideLoadPromise = (async () => {
                let lastErr = null;
                for (const mirror of cdnMirrors) {
                    try {
                        console.log(`[BrowserEngine] Attempting to load Pyodide from ${mirror.indexURL}...`);
                        if (typeof window.loadPyodide !== 'function') {
                            await this.loadScript(mirror.script);
                        }
                        if (typeof window.loadPyodide === 'function') {
                            this.pyodide = await window.loadPyodide({ indexURL: mirror.indexURL });
                            console.log('[BrowserEngine] Pyodide WASM initialized successfully from', mirror.indexURL);
                            this.showToast('✅ Python WASM runtime is ready!', 'success');
                            return this.pyodide;
                        }
                    } catch (err) {
                        console.warn(`[BrowserEngine] Pyodide mirror failed (${mirror.indexURL}):`, err.message);
                        lastErr = err;
                    }
                }
                this.pyodideLoadPromise = null;
                throw lastErr || new Error('All Pyodide CDN mirrors failed to load.');
            })();

            return this.pyodideLoadPromise;
        }

        // =========================================================================
        // 4. SERVER RUNNER (C, C++, Java & WASM Fallback via Cloud Runner)
        // =========================================================================

        async executeOnServer(code, lang, options = {}) {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

            try {
                const res = await window.fetch('/api/execute', {
                    method: 'POST',
                    headers,
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        code,
                        lang,
                        stdin: options?.stdin || '',
                        args: options?.args || []
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || `Server execution failed (${res.status})`);
                }

                return {
                    success: data.success !== false,
                    result: data.result || null,
                    logs: data.logs || [],
                    error: data.error || null
                };
            } catch (err) {
                return {
                    success: false,
                    result: null,
                    logs: [],
                    error: `Cloud Execution Error: ${err.message}`
                };
            }
        }

        // =========================================================================
        // 5. PRE-WARM OFFLINE RUNTIMES (Pyodide WASM + TypeScript)
        // =========================================================================

        async prewarm() {
            this.showToast('⚡ Pre-warming offline runtimes (TS + Python WASM)...', 'info');
            try {
                // Preload TS
                if (typeof window.ts === 'undefined') {
                    await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/typescript/5.3.3/typescript.min.js');
                    this.tsLoaded = true;
                }
                // Preload Pyodide WASM
                if (!this.pyodide) {
                    await this.loadPyodide();
                }
                this.showToast('🎉 All offline runtimes (JS, TS, Python WASM) are cached & ready!', 'success');
                return true;
            } catch (err) {
                this.showToast(`Pre-warm notice: ${err.message}`, 'error');
                return false;
            }
        }

        // =========================================================================
        // 6. INTERACTIVE TERMINAL DETECTION & EXECUTION (WebSocket Streaming)
        // =========================================================================

        /**
         * Determines if code in the given language needs an interactive terminal.
         * Returns true only for server-executed languages (C, C++, Java, Python)
         * that contain stdin-reading patterns (scanf, cin, input(), Scanner, etc.)
         * @param {string} code - Source code to analyze
         * @param {string} lang - Language identifier
         * @returns {boolean}
         */
        needsInteractiveTerminal(code, lang) {
            const normalizedLang = (lang || '').toLowerCase();

            // Only server-executed languages can be interactive
            const interactiveLangs = ['c', 'cpp', 'c++', 'java', 'python', 'py'];
            if (!interactiveLangs.includes(normalizedLang)) return false;

            // Strip comments to avoid false positives
            const stripped = code
                .replace(/\/\/.*$/gm, '')         // C-style line comments
                .replace(/\/\*[\s\S]*?\*\//g, '')  // C-style block comments
                .replace(/#.*$/gm, normalizedLang === 'python' || normalizedLang === 'py' ? '' : '$&'); // Python comments

            switch (normalizedLang) {
                case 'c':
                    return /\b(scanf|gets|getchar|getline)\b|fgets\s*\([^)]*stdin/.test(stripped);

                case 'cpp':
                case 'c++':
                    return /\b(scanf|gets|getchar|getline)\b|cin\s*>>|getline\s*\(\s*cin/.test(stripped);

                case 'java':
                    return /\b(Scanner|BufferedReader)\b|System\.in/.test(stripped);

                case 'python':
                case 'py':
                    return /\binput\s*\(|sys\.stdin/.test(stripped);

                default:
                    return false;
            }
        }

        /**
         * Execute code interactively via WebSocket streaming.
         * Returns a handle object with sendStdin(text) and kill() methods.
         * @param {string} code - Source code
         * @param {string} lang - Language
         * @param {object} callbacks - { onStdout, onStderr, onExit, onError, onStatus }
         * @returns {{ sendStdin: Function, kill: Function }}
         */
        executeInteractive(code, lang, callbacks = {}) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;

            let ws;
            try {
                ws = new WebSocket(wsUrl);
            } catch (err) {
                if (callbacks.onError) callbacks.onError(`WebSocket connection failed: ${err.message}`);
                return { sendStdin: () => {}, kill: () => {} };
            }

            const handle = {
                sendStdin: (text) => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'stdin', data: text }));
                    }
                },
                kill: () => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'kill' }));
                    }
                    try { ws.close(); } catch (e) { }
                }
            };

            ws.onopen = () => {
                ws.send(JSON.stringify({ type: 'start', code, lang }));
            };

            ws.onmessage = (event) => {
                let msg;
                try {
                    msg = JSON.parse(event.data);
                } catch (e) {
                    return;
                }

                switch (msg.type) {
                    case 'stdout':
                        if (callbacks.onStdout) callbacks.onStdout(msg.data);
                        break;
                    case 'stderr':
                        if (callbacks.onStderr) callbacks.onStderr(msg.data);
                        break;
                    case 'exit':
                        if (callbacks.onExit) callbacks.onExit(msg.code);
                        try { ws.close(); } catch (e) { }
                        break;
                    case 'error':
                        if (callbacks.onError) callbacks.onError(msg.data);
                        try { ws.close(); } catch (e) { }
                        break;
                    case 'status':
                        if (callbacks.onStatus) callbacks.onStatus(msg.data);
                        break;
                }
            };

            ws.onerror = () => {
                if (callbacks.onError) callbacks.onError('WebSocket connection lost. Falling back to batch mode may be required.');
            };

            ws.onclose = () => {
                // Ensure exit is called if not already
            };

            return handle;
        }

        // =========================================================================
        // UTILITIES: Object Serializer & Loader
        // =========================================================================

        serialize(obj, depth = 5, seen = new WeakSet()) {
            if (obj === undefined) return 'undefined';
            if (obj === null) return 'null';
            if (typeof obj === 'string') return obj;
            if (typeof obj === 'boolean' || typeof obj === 'number' || typeof obj === 'bigint') return String(obj);

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
                for (let i = 0; i < obj.length; i++) {
                    parts.push(this.serialize(obj[i], depth - 1, seen));
                }
                return `[${parts.join(', ')}]`;
            }

            try {
                if (typeof obj === 'object') {
                    const entries = Object.entries(obj);
                    if (entries.length === 0) return '{}';
                    const content = entries
                        .map(([k, v]) => `${k}: ${this.serialize(v, depth - 1, seen)}`)
                        .join(', ');
                    return `{ ${content} }`;
                }
                return String(obj);
            } catch (e) {
                return String(obj);
            }
        }

        loadScript(src) {
            return new Promise((resolve, reject) => {
                const existing = document.querySelector(`script[src="${src}"]`);
                if (existing) {
                    if (existing.getAttribute('data-loaded') === 'true') {
                        return resolve();
                    }
                    existing.addEventListener('load', () => resolve());
                    existing.addEventListener('error', (e) => reject(new Error(`Failed to load external script: ${src}`)));
                    return;
                }
                const script = document.createElement('script');
                script.src = src;
                script.crossOrigin = 'anonymous';
                script.onload = () => {
                    script.setAttribute('data-loaded', 'true');
                    resolve();
                };
                script.onerror = (e) => reject(new Error(`Failed to load external script: ${src}`));
                document.head.appendChild(script);
            });
        }

        showToast(message, type = 'info') {
            const toast = document.getElementById('toast');
            if (!toast) return;
            const titleEl = document.getElementById('toast-title');
            const msgEl = document.getElementById('toast-message');
            const iconEl = document.getElementById('toast-icon');

            if (titleEl) titleEl.innerText = type === 'error' ? 'Error' : (type === 'success' ? 'Ready' : 'Runtime');
            if (msgEl) msgEl.innerText = message;
            if (iconEl) {
                iconEl.className = `w-10 h-10 rounded-full flex items-center justify-center ${type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'}`;
            }

            toast.classList.remove('translate-y-24', 'opacity-0');
            setTimeout(() => {
                toast.classList.add('translate-y-24', 'opacity-0');
            }, 3500);
        }
    }

    // Export singleton
    window.ZohoBrowserEngine = new BrowserExecutionEngine();
})(window);
