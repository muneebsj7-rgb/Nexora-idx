import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AuthService } from '../../services/authService';
import { X, Mail, Lock, User, Shield, ArrowRight, CheckCircle } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { authModalOpen, authModalMode, closeAuthModal, openAuthModal, loginUser, registerUser, loginDemoUser, addToast } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [refCode, setRefCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  if (!authModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccessMsg(null);
    setLoading(true);

    try {
      if (authModalMode === 'login') {
        await loginUser(email, password);
      } else if (authModalMode === 'register') {
        await registerUser(email, password, displayName, refCode);
      } else if (authModalMode === 'forgot') {
        const msg = await AuthService.sendPasswordReset(email);
        setResetSuccessMsg(msg);
        addToast('Reset Dispatched', msg, 'info');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#121925] border border-[#253144] rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#00D6A3]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between pb-4 border-b border-[#253144]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00D6A3]/10 border border-[#00D6A3]/30 flex items-center justify-center text-[#00D6A3] font-bold">
              N
            </div>
            <div>
              <h3 className="font-bold text-[#F4F7FC] text-base">
                {authModalMode === 'login' && 'Sign In to Nexora Cloud Mining'}
                {authModalMode === 'register' && 'Create Miner Account'}
                {authModalMode === 'forgot' && 'Reset Your Password'}
              </h3>
              <p className="text-xs text-[#98A6BA]">Cloud Mining & Portfolio Terminal</p>
            </div>
          </div>
          <button
            onClick={closeAuthModal}
            className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-[#FF647C]/10 border border-[#FF647C]/30 text-[#FF647C] text-xs flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#FF647C] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {resetSuccessMsg && (
          <div className="mt-4 p-3 rounded-xl bg-[#19C784]/15 border border-[#19C784]/30 text-[#19C784] text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-[#19C784]" />
            <span>{resetSuccessMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {authModalMode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-[#98A6BA] mb-1">Display Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A6BA]" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Satoshi Miner"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2.5 pl-9 pr-3 text-sm text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#98A6BA] mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A6BA]" />
              <input
                type="email"
                required
                placeholder="miner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2.5 pl-9 pr-3 text-sm text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] transition-colors"
              />
            </div>
          </div>

          {authModalMode !== 'forgot' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-medium text-[#98A6BA]">Password</label>
                {authModalMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => openAuthModal('forgot')}
                    className="text-xs text-[#00D6A3] hover:underline transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A6BA]" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2.5 pl-9 pr-3 text-sm text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] transition-colors"
                />
              </div>
            </div>
          )}

          {authModalMode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-[#98A6BA] mb-1">
                Referral Code <span className="text-[#98A6BA]/70 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A6BA]" />
                <input
                  type="text"
                  placeholder="e.g. NEXO-8291"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value.toUpperCase())}
                  className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2.5 pl-9 pr-3 text-sm text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] font-mono transition-colors"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-[#00D6A3] hover:bg-[#19C784] disabled:opacity-50 text-[#080B12] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#00D6A3]/20 active:scale-[0.99]"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-[#080B12] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {authModalMode === 'login' && 'Sign In'}
                  {authModalMode === 'register' && 'Register Account'}
                  {authModalMode === 'forgot' && 'Send Reset Link'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-[#253144] text-center text-xs text-[#98A6BA] space-y-3">
          {authModalMode === 'login' && (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => openAuthModal('register')}
                className="font-semibold text-[#00D6A3] hover:underline"
              >
                Create one now
              </button>
            </p>
          )}

          {authModalMode === 'register' && (
            <p>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="font-semibold text-[#00D6A3] hover:underline"
              >
                Sign in here
              </button>
            </p>
          )}

          {authModalMode === 'forgot' && (
            <p>
              Remembered your credentials?{' '}
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="font-semibold text-[#00D6A3] hover:underline"
              >
                Back to Sign In
              </button>
            </p>
          )}

          {/* Explicit Sandbox Demo Access */}
          <div className="pt-2">
            <button
              type="button"
              onClick={loginDemoUser}
              className="w-full py-2 px-3 rounded-xl border border-[#253144] bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Explore in Sandbox Demo Mode</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#F3B64B]/15 text-[#F3B64B] font-mono">Offline</span>
            </button>
            <p className="text-[11px] text-[#98A6BA]/80 mt-1.5">
              Sandbox demo simulates all app features without creating a Firebase account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
