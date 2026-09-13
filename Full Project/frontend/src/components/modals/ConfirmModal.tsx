import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  isDanger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  isDanger = true,
  onClose,
  onConfirm
}) => {
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

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150 cursor-pointer"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-dark-850 border border-dark-600/80 rounded-2xl p-6 shadow-2xl cursor-default"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-dark-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ${
          isDanger 
            ? 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-red-500/20' 
            : 'bg-[#6d5dfc]/10 text-[#6d5dfc] border border-[#6d5dfc]/20 shadow-[#6d5dfc]/20'
        }`}>
          <AlertTriangle className="w-8 h-8" />
        </div>

        <h2 className="text-lg font-bold text-white text-center mb-1">{title}</h2>
        <p className="text-xs text-slate-400 text-center mb-6">{description}</p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-dark-600 text-xs font-semibold text-slate-300 hover:bg-dark-750 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold text-white transition-all shadow-lg cursor-pointer ${
              isDanger
                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30'
                : 'bg-[#6d5dfc] hover:bg-[#5b4cf0] shadow-[#6d5dfc]/30'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
