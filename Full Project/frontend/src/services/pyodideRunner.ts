/**
 * Pyodide WebAssembly Runner Service
 * Executes Python 3 entirely in-browser with zero server round-trips.
 */

import { CellOutput } from '../types/note.types';

// Types for Pyodide window object
declare global {
  interface Window {
    loadPyodide?: (options?: {
      indexURL?: string;
      stdout?: (text: string) => void;
      stderr?: (text: string) => void;
    }) => Promise<any>;
  }
}

export type PyodideStatus = 'idle' | 'loading' | 'ready' | 'error';

class PyodideRunner {
  private pyodideInstance: any = null;
  private status: PyodideStatus = 'idle';
  private loadingPromise: Promise<any> | null = null;
  private loadError: string | null = null;
  private listeners: Set<(status: PyodideStatus) => void> = new Set();

  public getStatus(): PyodideStatus {
    return this.status;
  }

  public subscribeStatus(listener: (status: PyodideStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(newStatus: PyodideStatus) {
    this.status = newStatus;
    this.listeners.forEach(fn => fn(newStatus));
  }

  /**
   * Lazily loads the Pyodide runtime script from CDN and initialises WASM.
   */
  public async init(): Promise<any> {
    if (this.pyodideInstance) {
      return this.pyodideInstance;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.setStatus('loading');

    this.loadingPromise = (async () => {
      try {
        // 1. Inject Pyodide script if not present
        if (!window.loadPyodide) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Pyodide WASM bootstrap script from CDN.'));
            document.head.appendChild(script);
          });
        }

        if (!window.loadPyodide) {
          throw new Error('window.loadPyodide not found after script injection.');
        }

        // 2. Initialise the Pyodide runtime
        const pyodide = await window.loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
        });

        this.pyodideInstance = pyodide;
        this.setStatus('ready');
        return pyodide;
      } catch (err: any) {
        console.error('Pyodide initialization failed:', err);
        this.loadError = err.message || 'Unknown Pyodide load error';
        this.setStatus('error');
        throw err;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Executes Python code inside the Pyodide WebAssembly sandbox.
   */
  public async runPython(code: string): Promise<CellOutput> {
    const startTime = performance.now();
    const stdoutParts: string[] = [];
    const stderrParts: string[] = [];

    try {
      const pyodide = await this.init();

      // Configure stdout / stderr capture
      pyodide.setStdout({
        batched: (msg: string) => {
          stdoutParts.push(msg);
        }
      });

      pyodide.setStderr({
        batched: (msg: string) => {
          stderrParts.push(msg);
        }
      });

      // Execute code asynchronously
      const result = await pyodide.runPythonAsync(code);

      // If expression returned a value and stdout is empty, capture the repr
      if (result !== undefined && stdoutParts.length === 0) {
        try {
          stdoutParts.push(String(result));
        } catch {
          // ignore formatting error
        }
      }

      const executionTimeMs = Math.round(performance.now() - startTime);

      return {
        stdout: stdoutParts.join('\n'),
        stderr: stderrParts.length > 0 ? stderrParts.join('\n') : undefined,
        executionTimeMs
      };
    } catch (err: any) {
      const executionTimeMs = Math.round(performance.now() - startTime);
      return {
        stdout: stdoutParts.length > 0 ? stdoutParts.join('\n') : undefined,
        stderr: err.message || String(err),
        executionTimeMs
      };
    }
  }

  /**
   * Loads a Python package (e.g. numpy, pandas, matplotlib)
   */
  public async loadPackage(pkgName: string): Promise<void> {
    const pyodide = await this.init();
    await pyodide.loadPackage(pkgName);
  }
}

export const pyodideRunner = new PyodideRunner();
