import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { 
  Terminal as TerminalIcon, 
  X, 
  RotateCcw, 
  Trash2, 
  Maximize2, 
  Minimize2, 
  Square,
  Radio
} from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { ConfirmModal } from '../modals/ConfirmModal';

export const TerminalDrawer: React.FC = () => {
  const { isTerminalOpen, setTerminalOpen, terminalHeight, setTerminalHeight } = useUIStore();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    action: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Confirm',
    action: () => {}
  });
  const [isMaximized, setIsMaximized] = useState(false);

  // Initialize and connect WebSocket
  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setConnectionStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      if (xtermInstance.current) {
        xtermInstance.current.writeln('\x1b[32m✔ Connected to Zoho Notes Pro Terminal Gateway\x1b[0m');
      }
      // Request general interactive shell
      ws.send(JSON.stringify({ type: 'shell' }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!xtermInstance.current) return;

        if (msg.type === 'stdout') {
          // Normalize CRLF
          xtermInstance.current.write(msg.data.replace(/\r?\n/g, '\r\n'));
        } else if (msg.type === 'stderr') {
          xtermInstance.current.write(`\x1b[31m${msg.data.replace(/\r?\n/g, '\r\n')}\x1b[0m`);
        } else if (msg.type === 'status') {
          xtermInstance.current.writeln(`\x1b[33m[${msg.data}]\x1b[0m`);
        } else if (msg.type === 'exit') {
          xtermInstance.current.writeln(`\r\n\x1b[36m[Session ended with code ${msg.code}]\x1b[0m`);
        } else if (msg.type === 'error') {
          xtermInstance.current.writeln(`\x1b[31m[Error: ${msg.data}]\x1b[0m`);
        }
      } catch (err) {
        // Fallback for raw text
        xtermInstance.current?.write(event.data);
      }
    };

    ws.onerror = () => {
      setConnectionStatus('error');
      xtermInstance.current?.writeln('\r\n\x1b[31m✘ Terminal WebSocket connection error. Backend at :5000 may be offline.\x1b[0m');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
    };
  }, []);

  // Initialize xterm.js instance when terminal drawer is mounted
  useEffect(() => {
    if (!isTerminalOpen || !terminalRef.current) return;

    if (!xtermInstance.current) {
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Consolas, "Fira Code", Monaco, monospace',
        theme: {
          background: '#0a0e17',
          foreground: '#cbd5e1',
          cursor: '#6366f1',
          black: '#1e293b',
          red: '#f87171',
          green: '#34d399',
          yellow: '#fbbf24',
          blue: '#818cf8',
          magenta: '#c084fc',
          cyan: '#38bdf8',
          white: '#f1f5f9',
          brightBlack: '#475569',
          brightRed: '#ef4444',
          brightGreen: '#10b981',
          brightYellow: '#f59e0b',
          brightBlue: '#6366f1',
          brightMagenta: '#a855f7',
          brightCyan: '#0ea5e9',
          brightWhite: '#ffffff'
        }
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);

      term.open(terminalRef.current);
      fitAddon.fit();

      // Handle user key input
      term.onData((data) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'data', data }));
        }
      });

      xtermInstance.current = term;
      fitAddonRef.current = fitAddon;

      // Connect WebSocket
      connect();
    } else {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 50);
    }

    const handleResize = () => {
      fitAddonRef.current?.fit();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isTerminalOpen, connect]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (xtermInstance.current) {
        xtermInstance.current.dispose();
      }
    };
  }, []);

  // Handle resizing/fitting when height or maximize toggles
  useEffect(() => {
    if (isTerminalOpen && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 50);
    }
  }, [terminalHeight, isMaximized, isTerminalOpen]);

  const handleClear = () => {
    xtermInstance.current?.clear();
  };

  const handleRestart = () => {
    setConfirmAction({
      isOpen: true,
      title: 'Restart Terminal Shell?',
      description: 'Are you sure you want to restart the shell session? Running processes will be terminated and terminal buffer reset.',
      confirmText: 'Restart Shell',
      action: () => {
        if (xtermInstance.current) {
          xtermInstance.current.clear();
          xtermInstance.current.writeln('\x1b[33m[Restarting terminal session...]\x1b[0m');
        }
        connect();
      }
    });
  };

  const handleKill = () => {
    setConfirmAction({
      isOpen: true,
      title: 'Kill Active Shell Process?',
      description: 'Are you sure you want to terminate the active shell/terminal process? Any executing task will be stopped immediately.',
      confirmText: 'Kill Process',
      action: () => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'kill' }));
        }
      }
    });
  };

  if (!isTerminalOpen) return null;

  const currentHeight = isMaximized ? 'calc(100vh - 120px)' : `${terminalHeight}px`;

  return (
    <div 
      style={{ height: currentHeight }}
      className="fixed bottom-0 left-0 right-0 z-40 bg-dark-900 border-t border-dark-600/80 shadow-2xl flex flex-col transition-all duration-150"
    >
      {/* Terminal Header Bar */}
      <div className="h-9 px-4 bg-dark-850 border-b border-dark-700/80 flex items-center justify-between select-none text-xs">
        <div className="flex items-center gap-2.5">
          <TerminalIcon className="w-4 h-4 text-accent-light" />
          <span className="font-semibold text-slate-200">Terminal</span>
          
          {/* Connection Status Pill */}
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-dark-800 border border-dark-700">
            {connectionStatus === 'connected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300">Live PTY</span>
              </>
            )}
            {connectionStatus === 'connecting' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-spin" />
                <span className="text-amber-300">Connecting...</span>
              </>
            )}
            {connectionStatus === 'disconnected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span className="text-slate-400">Disconnected</span>
              </>
            )}
            {connectionStatus === 'error' && (
              <>
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-red-300">Offline</span>
              </>
            )}
          </span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleRestart}
            title="Restart Shell Session"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-dark-750 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleKill}
            title="Kill Active Process"
            className="p-1.5 rounded text-slate-400 hover:text-amber-400 hover:bg-dark-750 transition-colors cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClear}
            title="Clear Terminal"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-dark-750 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-4 bg-dark-700 mx-1" />
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? "Restore Size" : "Maximize"}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-dark-750 transition-colors cursor-pointer"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setTerminalOpen(false)}
            title="Close Terminal"
            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* xterm.js Canvas Container */}
      <div 
        ref={terminalRef} 
        className="flex-1 w-full bg-[#0a0e17] overflow-hidden p-2"
      />

      {/* Confirmation Modal for Shell Actions */}
      <ConfirmModal
        isOpen={confirmAction.isOpen}
        title={confirmAction.title}
        description={confirmAction.description}
        confirmText={confirmAction.confirmText}
        isDanger={true}
        onClose={() => setConfirmAction(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmAction.action}
      />
    </div>
  );
};
