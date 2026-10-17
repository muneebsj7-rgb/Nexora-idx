import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AuthService } from '../../services/authService';
import {
  User,
  Shield,
  Key,
  Mail,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Smartphone,
  Globe,
  Database,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Edit2,
  Palette,
  Check
} from 'lucide-react';
import { AccentTheme } from '../../context/AppContext';
import { GradientIcon } from '../ui/GradientIcon';

export const ProfileScreen: React.FC = () => {
  const { user, logoutUser, updateUser, openAuthModal, addToast, accentTheme, setAccentTheme } = useApp();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.displayName || '');
  const [sendingVerification, setSendingVerification] = useState(false);

  if (!user) {
    return (
      <div className="w-full max-w-md mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-emerald-400 mb-4">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">No Miner Account Active</h2>
        <p className="text-xs text-slate-400 mt-1 mb-6">
          Sign in or create an account to configure two-factor security, save withdrawal addresses, and track mining payouts.
        </p>
        <button
          onClick={() => openAuthModal('login')}
          className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
        >
          Sign In or Register
        </button>
      </div>
    );
  }

  const handleSaveName = () => {
    if (nameInput.trim()) {
      updateUser({ displayName: nameInput.trim() });
    }
    setEditingName(false);
  };

  const handleSendVerification = async () => {
    setSendingVerification(true);
    const msg = await AuthService.triggerEmailVerification(user.email);
    setSendingVerification(false);
    addToast('Verification Sent', msg, 'info');
  };

  const handleToggle2FA = () => {
    const newState = !user.twoFactorEnabled;
    updateUser({ twoFactorEnabled: newState });
    addToast(
      newState ? '2FA Enabled' : '2FA Disabled',
      newState ? 'Two-Factor Authentication is now active.' : 'Two-Factor Authentication was turned off.',
      newState ? 'success' : 'warning'
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-24 px-4 sm:px-6 pt-2 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          Profile & Security Settings
          <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            {user.kycTier}
          </span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage your account credentials, security layers, and platform connection
        </p>
      </div>

      {/* User Card */}
      <div className="rounded-3xl p-6 border border-slate-800 bg-slate-900/70 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-emerald-400 text-xl font-bold overflow-hidden shadow-inner">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8" />
              )}
            </div>

            <div>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleSaveName}
                    className="px-2 py-1 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{user.displayName}</h2>
                  <button
                    onClick={() => {
                      setNameInput(user.displayName);
                      setEditingName(true);
                    }}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-400 font-mono mt-0.5">{user.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-400">
                  ID: {user.id}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Joined: {new Date(user.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={logoutUser}
            className="py-2 px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 self-start sm:self-auto"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Email Verification Banner */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            user.isEmailVerified
              ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
              : 'border-amber-500/20 bg-amber-500/5 text-amber-300'
          }`}>
            <div className="flex items-start gap-3">
              {user.isEmailVerified ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="text-xs font-bold block">
                  {user.isEmailVerified ? 'Email Confirmed & Verified' : 'Email Verification Pending'}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {user.isEmailVerified
                    ? 'Your email is verified for higher daily withdrawal thresholds and multi-sig security.'
                    : 'Please verify your email address to enable maximum mining withdrawal limits.'}
                </span>
              </div>
            </div>

            {!user.isEmailVerified && (
              <button
                onClick={handleSendVerification}
                disabled={sendingVerification}
                className="py-1.5 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shrink-0"
              >
                {sendingVerification ? 'Sending...' : 'Resend Verification'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Accent Color Themes Section */}
      <div className="rounded-3xl p-6 border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <GradientIcon icon={Palette} theme="violet" size="xs" variant="glow" />
              <span>Accent Color Themes</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Customize accent glows and highlight colors while preserving the deep obsidian dark background.
            </p>
          </div>
          <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-300 self-start sm:self-auto">
            Active: <strong className="text-white capitalize">{accentTheme}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {[
            {
              id: 'emerald' as AccentTheme,
              name: 'Emerald Matrix',
              color: '#10b981',
              desc: 'Cryptocurrency terminal green',
              bgClass: 'bg-emerald-500',
              textClass: 'text-emerald-400',
              borderActive: 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10',
            },
            {
              id: 'violet' as AccentTheme,
              name: 'Neon Violet',
              color: '#8b5cf6',
              desc: 'Cyberpunk ultraviolet purple',
              bgClass: 'bg-violet-500',
              textClass: 'text-violet-400',
              borderActive: 'border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10',
            },
            {
              id: 'blue' as AccentTheme,
              name: 'Electric Blue',
              color: '#3b82f6',
              desc: 'Institutional azure blue',
              bgClass: 'bg-blue-500',
              textClass: 'text-blue-400',
              borderActive: 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10',
            },
          ].map((theme) => {
            const isSelected = accentTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => setAccentTheme(theme.id)}
                className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between group ${
                  isSelected
                    ? theme.borderActive
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-5 h-5 rounded-full shadow-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: theme.color, boxShadow: `0 0 12px ${theme.color}80` }}
                      >
                        {isSelected && <Check className="w-3 h-3 text-slate-950 stroke-[3]" />}
                      </span>
                      <span className="font-bold text-white text-sm">{theme.name}</span>
                    </div>

                    {isSelected && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-white/10 text-white uppercase tracking-wider">
                        Active
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {theme.desc}
                  </p>
                </div>

                {/* Preview sample pill */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-500">Live Preview:</span>
                  <span
                    className="px-2 py-0.5 rounded-md font-bold"
                    style={{
                      color: theme.color,
                      backgroundColor: `${theme.color}18`,
                      borderColor: `${theme.color}40`,
                      borderWidth: '1px',
                    }}
                  >
                    +124.8 TH/s
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/70 text-[11px] text-slate-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />
          <span>
            Theme preferences are saved to your account session and persist across app reloads.
          </span>
        </div>
      </div>

      {/* Security Settings Section with Color Graded Icons */}
      <div className="rounded-3xl p-6 border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <GradientIcon icon={Shield} theme="emerald" size="xs" variant="glow" />
          <span>Security & Authentication</span>
        </h2>

        {/* 2FA Toggle */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GradientIcon icon={ShieldCheck} theme="cyan" size="sm" variant="boxed" />
            <div>
              <span className="text-xs font-bold text-white block">Two-Factor Authentication (2FA)</span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Requires a one-time verification code on withdrawal requests and credential changes.
              </span>
            </div>
          </div>

          <button
            onClick={handleToggle2FA}
            className={`w-12 h-6 rounded-full transition-colors relative p-1 ${
              user.twoFactorEnabled ? 'bg-emerald-500' : 'bg-slate-800'
            }`}
          >
            <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${
              user.twoFactorEnabled ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {/* Change Password Prompt */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GradientIcon icon={Key} theme="gold" size="sm" variant="boxed" />
            <div>
              <span className="text-xs font-bold text-white block">Password Protection</span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Last modified recently. Regularly update your master passphrase.
              </span>
            </div>
          </div>

          <button
            onClick={async () => {
              const msg = await AuthService.sendPasswordReset(user.email);
              addToast('Password Reset', msg, 'info');
            }}
            className="py-1.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            Change Password
          </button>
        </div>
      </div>

      {/* Backend & Firebase Status Section */}
      <div className="rounded-3xl p-6 border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <GradientIcon icon={Database} theme="cyan" size="xs" variant="glow" />
          <span>Backend & Infrastructure Status</span>
        </h2>

        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Application Architecture:</span>
            <span className="font-mono text-emerald-400 font-bold">Web SPA & PWA Compliant</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Firebase Firestore & Auth:</span>
            <span className="font-mono text-cyan-400 font-bold">Ready for Provisioning</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Live Market Feed:</span>
            <span className="font-mono text-emerald-400 font-bold">Active (Binance Public Tickers)</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Stratum Mining Engine:</span>
            <span className="font-mono text-amber-400 font-bold">Sandbox Hashrate Telemetry</span>
          </div>
        </div>
      </div>
    </div>
  );
};
