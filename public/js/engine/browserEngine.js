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

        self.onmessage = async function(e) {
            var code = e.data.code;
            try {
                var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                var fn = new AsyncFunction('console', '"use strict";\\n' + code);
                var result = await fn(customConsole);
                self.postMessage({
                    type: 'done',
                    success: true,
                    result: self.serialize(result),
                    error: null
                });
            } catch(err) {
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
            this.timeoutMs = 5000;
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
         * @param {object} contextExtension - Optional global context
         * @returns {Promise<{success: boolean, result: any, logs: string[], error: string|null, durationMs: number}>}
         */
        async execute(code, lang = 'javascript', contextExtension = {}) {
            const normalizedLang = (lang || 'javascript').toLowerCase().trim();
            const startTime = performance.now();

            let response;
            switch (normalizedLang) {
                case 'javascript':
                case 'js':
                    response = await this.executeJS(code, contextExtension);
                    break;

                case 'typescript':
                case 'ts':
                    response = await this.executeTS(code, contextExtension);
                    break;

                case 'python':
                case 'py':
                    response = await this.executePython(code);
                    break;

                case 'c':
                case 'cpp':
                case 'c++':
                case 'java':
                    response = await this.executeOnServer(code, normalizedLang);
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
            if (!trimmed || /\breturn\b/.test(trimmed)) return code;

            const lines = trimmed.split('\n');
            let lastIdx = lines.length - 1;
            while (lastIdx >= 0 && !lines[lastIdx].trim()) lastIdx--;
            if (lastIdx < 0) return code;

            let lastLine = lines[lastIdx].trim();
            if (lastLine.endsWith(';')) lastLine = lastLine.slice(0, -1).trim();

            const nonReturnableKeywords = [
                'const', 'let', 'var', 'function', 'class', 'if', 'else', 'for',
                'while', 'do', 'switch', 'case', 'try', 'catch', 'finally', 'throw',
                'import', 'export', 'debugger', 'break', 'continue'
            ];

            const firstWord = lastLine.split(/[\s\(\{]/)[0];
            if (nonReturnableKeywords.includes(firstWord) || lastLine.endsWith('}') || lastLine.endsWith('{')) {
                return code;
            }

            lines[lastIdx] = `return (${lastLine});`;
            return lines.join('\n');
        }

        async executeJS(code, contextExtension = {}) {
            const preparedCode = this.prepareCodeWithReturn(code);
            // Check if Web Workers are supported
            if (typeof Worker !== 'undefined' && this.getWorkerBlobUrl()) {
                try {
                    const res = await this.executeJSInWorker(preparedCode);
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
            return this.executeJSFallback(preparedCode, contextExtension);
        }

        executeJSInWorker(code) {
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

                    // Strict 5s Timeout Guard (terminates infinite loops without freezing the UI)
                    timeoutTimer = setTimeout(() => {
                        if (!isFinished) {
                            isFinished = true;
                            cleanup();
                            resolve({
                                success: false,
                                result: null,
                                logs,
                                error: 'Execution timed out (5s limit). Infinite loop terminated safely.'
                            });
                        }
                    }, this.timeoutMs);

                    worker.onmessage = (e) => {
                        const data = e.data;
                        if (!data) return;

                        if (data.type === 'log') {
                            logs.push(data.log);
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

                    worker.postMessage({ code });
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

        async executeJSFallback(code, contextExtension = {}) {
            const logs = [];
            const customConsole = {
                log: (...args) => logs.push(args.map(a => this.serialize(a)).join(' ')),
                error: (...args) => logs.push(`ERROR: ${args.map(a => this.serialize(a)).join(' ')}`),
                warn: (...args) => logs.push(`WARN: ${args.map(a => this.serialize(a)).join(' ')}`),
                info: (...args) => logs.push(`INFO: ${args.map(a => this.serialize(a)).join(' ')}`),
                dir: (arg) => logs.push(this.serialize(arg, 3)),
                table: (arg) => {
                    try {
                        logs.push(JSON.stringify(arg, null, 2));
                    } catch (e) {
                        logs.push(this.serialize(arg));
                    }
                }
            };

            try {
                const sandbox = {
                    console: customConsole,
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
                const userFunc = new AsyncFunction(...paramNames, `"use strict";\n${code}`);

                const execPromise = userFunc(...paramValues);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Execution timed out (5s limit)')), this.timeoutMs)
                );

                const result = await Promise.race([execPromise, timeoutPromise]);

                return {
                    success: true,
                    result: this.serialize(result),
                    logs,
                    error: null
                };
            } catch (err) {
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

        async executeTS(code, contextExtension = {}) {
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

                    return await this.executeJS(transpileResult.outputText, contextExtension);
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

        async executePython(code) {
            const logs = [];

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
                return this.executeOnServer(code, 'python');
            }

            return this.executeOnServer(code, 'python');
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

        async executeOnServer(code, lang) {
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
                    body: JSON.stringify({ code, lang })
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
