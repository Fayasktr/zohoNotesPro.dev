import { Cell, CellOutput } from '../types/note.types';
import { axiosClient } from '../api/axiosClient';
import { pyodideRunner } from './pyodideRunner';

export const cellRunner = {
  /**
   * Execute a single cell
   */
  async runCell(cell: Cell): Promise<CellOutput> {
    const startTime = performance.now();
    const lang = (cell.language || 'javascript').toLowerCase();

    // 1. Browser-side Safe Execution for JavaScript
    if (lang === 'javascript') {
      return await this._runInBrowser(cell.content, startTime);
    }

    // 2. Pyodide WASM In-Browser Execution for Python 3
    if (lang === 'python') {
      try {
        const output = await pyodideRunner.runPython(cell.content);
        return {
          stdout: output.stdout,
          stderr: output.stderr,
          executionTimeMs: output.executionTimeMs
        };
      } catch (pyodideErr) {
        console.warn('Pyodide WASM execution failed, falling back to backend:', pyodideErr);
        // Fallback continues to server-side execution below
      }
    }

    // 3. Server-side Execution for Polyglot Languages (C, C++, Java, or fallback)
    try {
      const res = await axiosClient.post<{ success: boolean; data?: { success: boolean; output: string } }>('/execute', {
        code: cell.content,
        lang: cell.language
      });

      const elapsed = Math.round(performance.now() - startTime);

      if (res.data && res.data.data) {
        const { success, output } = res.data.data;
        return {
          stdout: success ? output : undefined,
          stderr: !success ? output : undefined,
          executionTimeMs: elapsed
        };
      }

      return {
        stderr: 'Execution returned no response from backend',
        executionTimeMs: elapsed
      };
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - startTime);
      const error = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      return {
        stderr: error.response?.data?.error?.message || error.message || 'Execution failed',
        executionTimeMs: elapsed
      };
    }
  },

  /**
   * Safe in-browser sandbox runner with console capture
   */
  async _runInBrowser(code: string, startTime: number): Promise<CellOutput> {
    const logs: string[] = [];
    const errors: string[] = [];

    const customConsole = {
      log: (...args: unknown[]) => {
        logs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '));
      },
      error: (...args: unknown[]) => {
        errors.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '));
      },
      warn: (...args: unknown[]) => {
        logs.push('[WARN] ' + args.map(a => String(a)).join(' '));
      },
      info: (...args: unknown[]) => {
        logs.push(args.map(a => String(a)).join(' '));
      }
    };

    const activeTimers = new Set<ReturnType<typeof setTimeout>>();
    const activeIntervals = new Set<ReturnType<typeof setInterval>>();

    const wrappedSetTimeout = (fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
      let id: ReturnType<typeof setTimeout>;
      id = setTimeout(() => {
        activeTimers.delete(id);
        try {
          if (typeof fn === 'function') fn(...args);
        } catch (err) {
          errors.push(`Async Error (setTimeout): ${(err as Error).message || String(err)}`);
        }
      }, delay);
      activeTimers.add(id);
      return id;
    };

    const wrappedClearTimeout = (id: ReturnType<typeof setTimeout>) => {
      if (id !== undefined && id !== null) activeTimers.delete(id);
      return clearTimeout(id);
    };

    const wrappedSetInterval = (fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
      let id: ReturnType<typeof setInterval>;
      id = setInterval(() => {
        try {
          if (typeof fn === 'function') fn(...args);
        } catch (err) {
          errors.push(`Async Error (setInterval): ${(err as Error).message || String(err)}`);
        }
      }, delay);
      activeIntervals.add(id);
      return id;
    };

    const wrappedClearInterval = (id: ReturnType<typeof setInterval>) => {
      if (id !== undefined && id !== null) activeIntervals.delete(id);
      return clearInterval(id);
    };

    try {
      // Async Function sandbox passing custom console and timer functions
      const asyncFn = new Function('console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', `
        return (async () => {
          ${code}
        })();
      `);

      const result = await asyncFn(
        customConsole,
        wrappedSetTimeout,
        wrappedClearTimeout,
        wrappedSetInterval,
        wrappedClearInterval
      );

      // Wait for remaining async tasks (up to 5s safety limit)
      const startWait = Date.now();
      const maxWaitMs = 5000;
      while ((activeTimers.size > 0 || activeIntervals.size > 0) && (Date.now() - startWait) < (maxWaitMs - 200)) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }

      // Clean up remaining intervals/timers
      activeTimers.forEach(id => clearTimeout(id));
      activeIntervals.forEach(id => clearInterval(id));
      activeTimers.clear();
      activeIntervals.clear();

      if (result !== undefined && logs.length === 0) {
        logs.push(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
      }

      const elapsed = Math.round(performance.now() - startTime);

      return {
        stdout: logs.length > 0 ? logs.join('\n') : '[Finished with no output]',
        stderr: errors.length > 0 ? errors.join('\n') : undefined,
        executionTimeMs: elapsed
      };
    } catch (err: unknown) {
      activeTimers.forEach(id => clearTimeout(id));
      activeIntervals.forEach(id => clearInterval(id));
      activeTimers.clear();
      activeIntervals.clear();

      const elapsed = Math.round(performance.now() - startTime);
      const e = err as Error;
      return {
        stdout: logs.length > 0 ? logs.join('\n') : undefined,
        stderr: e.message || String(e),
        executionTimeMs: elapsed
      };
    }
  }
};
