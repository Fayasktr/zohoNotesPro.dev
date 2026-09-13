import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Send, HelpCircle, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { axiosClient } from '../../api/axiosClient';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useUIStore();
  const [defaultLang, setDefaultLang] = useState('javascript');
  const [feedback, setFeedback] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSendFeedback = async () => {
    if (!feedback.trim()) return;
    setIsSending(true);
    try {
      await axiosClient.post('/feedback', { message: feedback });
      setFeedbackSent(true);
      setFeedback('');
      setTimeout(() => setFeedbackSent(false), 3000);
    } catch {
      // Fallback
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150 cursor-pointer"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-dark-850 border border-dark-600/80 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto cursor-default"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-dark-700 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* User Avatar Circle */}
        <div className="w-16 h-16 rounded-full bg-[#6d5dfc] text-white flex items-center justify-center text-xl font-bold mx-auto mb-3 shadow-lg shadow-[#6d5dfc]/30 uppercase">
          {user?.username ? user.username.charAt(0) : 'U'}
        </div>

        <h2 className="text-xl font-bold text-white text-center mb-0.5">Settings</h2>
        <p className="text-xs text-slate-400 text-center mb-6">Manage your workspace preferences and account</p>

        <div className="space-y-5">
          {/* User Information */}
          <div className="p-3.5 rounded-xl bg-dark-900/80 border border-dark-700/60 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-white">{user?.username}</p>
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#6d5dfc]/20 text-[#818cf8] border border-[#6d5dfc]/30 uppercase">
              {user?.role || 'User'}
            </span>
          </div>

          {/* Appearance */}
          <div className="p-3.5 rounded-xl bg-dark-900/80 border border-dark-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {theme === 'light' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-[#818cf8]" />
              )}
              <div>
                <span className="text-xs font-semibold text-white block">
                  {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
                </span>
                <span className="text-[11px] text-slate-400 block">
                  {theme === 'light' ? 'Crisp light workspace' : 'Dark theme optimized for coding'}
                </span>
              </div>
            </div>

            {/* Interactive Toggle Switch */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                theme === 'light' ? 'bg-[#6d5dfc]' : 'bg-dark-600'
              }`}
              role="switch"
              aria-checked={theme === 'light'}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out flex items-center justify-center text-[10px] ${
                  theme === 'light' ? 'translate-x-6' : 'translate-x-0'
                }`}
              >
                {theme === 'light' ? '☀️' : '🌙'}
              </span>
            </button>
          </div>

          {/* Default Programming Language */}
          <div className="p-3.5 rounded-xl bg-dark-900/80 border border-dark-700/60 space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
              Default Programming Language
            </label>
            <select
              value={defaultLang}
              onChange={(e) => setDefaultLang(e.target.value)}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-[#6d5dfc] cursor-pointer"
            >
              <option value="javascript">JavaScript (Node.js & In-Browser)</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python (Pyodide WASM & Server)</option>
              <option value="c">C (GCC Compiler)</option>
              <option value="cpp">C++ (G++ Compiler)</option>
              <option value="java">Java (OpenJDK)</option>
            </select>
            <span className="text-[10px] text-slate-500 block">
              New code cells will use this language by default.
            </span>
          </div>

          {/* Send Feedback */}
          <div className="p-3.5 rounded-xl bg-dark-900/80 border border-dark-700/60 space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
              Send Feedback to Admin
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Found a bug or have an idea? Share it directly..."
              rows={3}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#6d5dfc] resize-none"
            />
            <button
              onClick={handleSendFeedback}
              disabled={isSending || !feedback.trim()}
              className="w-full py-2 bg-[#6d5dfc] hover:bg-[#5b4cf0] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md shadow-[#6d5dfc]/20 disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{feedbackSent ? 'Sent Successfully!' : isSending ? 'Sending...' : 'Send Feedback'}</span>
            </button>
          </div>

          {/* User Manual & Actions */}
          <div className="pt-2 border-t border-dark-700/60 flex items-center justify-between text-xs">
            <a 
              href="https://github.com/fayasktr/zohoNotesPro.dev" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[#818cf8] hover:underline"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Documentation</span>
            </a>

            <button
              onClick={() => {
                onClose();
                logout();
              }}
              className="flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
