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

    try {
      // Async Function sandbox passing custom console
      const asyncFn = new Function('console', `
        return (async () => {
          ${code}
        })();
      `);

      const result = await asyncFn(customConsole);

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
