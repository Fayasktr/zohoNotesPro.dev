import React, { useEffect } from 'react';
import { X, MessageCircle, Linkedin } from 'lucide-react';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({ isOpen, onClose }) => {
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
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-dark-700 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 rounded-xl bg-[#25d366]/10 text-[#25d366] border border-[#25d366]/20">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Join Our Community</h3>
            <p className="text-[11px] text-slate-400">Scan QR or connect with fellow developers</p>
          </div>
        </div>

        <div className="my-5 flex flex-col items-center">
          <div className="bg-white p-4 rounded-2xl shadow-xl mb-4 border border-slate-200">
            <img 
              src="/images/Zoho notes by fayas kp.png" 
              alt="WhatsApp Community QR Code"
              className="w-52 h-52 object-contain"
              onError={(e) => {
                // Fallback placeholder if image load fails
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <div className="text-center px-2 space-y-1 mb-4">
            <p className="text-xs font-semibold text-white">Connect & Collaborate!</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Join the official Zoho Notes Pro community. Share workflows, get immediate assistance, and access early updates.
            </p>
          </div>

          <a
            href="https://www.linkedin.com/in/fayas-kp-ktr"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 rounded-xl border border-[#6d5dfc]/40 bg-[#6d5dfc]/10 hover:bg-[#6d5dfc]/20 text-[#818cf8] font-semibold text-xs flex items-center justify-center gap-2 transition-all"
          >
            <Linkedin className="w-4 h-4" />
            <span>Connect on LinkedIn</span>
          </a>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-dark-750 hover:bg-dark-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
