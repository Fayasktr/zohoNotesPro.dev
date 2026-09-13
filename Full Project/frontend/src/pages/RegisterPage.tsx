import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User as UserIcon, Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { AuthCard } from '../components/auth/AuthCard';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { useAuthStore } from '../store/useAuthStore';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, isLoading, error, clearError } = useAuthStore();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    const success = await register(username, email, password);
    if (success) {
      navigate('/');
    }
  };

  const activeError = localError || error;

  return (
    <AuthCard
      title="Create Account"
      subtitle="Start writing polyglot notebooks with instant browser execution"
    >
      {activeError && (
        <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-sm text-red-400 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{activeError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username"
          type="text"
          required
          autoComplete="name"
          placeholder="fayas_coder"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          icon={<UserIcon className="w-4 h-4" />}
        />

        <Input
          label="Email Address"
          type="email"
          required
          autoComplete="email"
          placeholder="developer@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Mail className="w-4 h-4" />}
        />

        <Input
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="w-4 h-4" />}
        />

        <Input
          label="Confirm Password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          icon={<Lock className="w-4 h-4" />}
        />

        <Button
          type="submit"
          className="w-full mt-3"
          size="lg"
          isLoading={isLoading}
          icon={<ArrowRight className="w-4 h-4" />}
        >
          Create Free Account
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-dark-600/60 text-center">
        <p className="text-sm text-slate-400">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-accent-light font-semibold hover:text-white transition-colors"
          >
            Sign in here
          </Link>
        </p>
      </div>
    </AuthCard>
  );
};
