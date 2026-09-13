import React from 'react';
import { BookOpen } from 'lucide-react';

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export const AuthCard: React.FC<AuthCardProps> = ({ title, subtitle, children }) => {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 bg-radial from-dark-850 to-dark-900">
      {/* Brand Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-accent-primary to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
            Zoho Notes <span className="text-xs uppercase px-2 py-0.5 rounded-full bg-accent-dim text-accent-light font-bold border border-accent-light/20">Pro</span>
          </h1>
          <p className="text-xs text-slate-400">Interactive Polyglot Notebooks</p>
        </div>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-md bg-dark-800/80 backdrop-blur-xl border border-dark-600/60 rounded-2xl p-8 shadow-2xl shadow-black/40">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
          <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
        </div>

        {children}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} Zoho Notes Pro &bull; Advanced Agentic Coding
      </div>
    </div>
  );
};
