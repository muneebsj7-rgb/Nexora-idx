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
  Check,
  Sparkles,
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
        <div className="w-16 h-16 rounded-3xl bg-[#121925] border border-[#253144] flex items-center justify-center mx-auto text-[#00D6A3] mb-4">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#F4F7FC]">No Miner Account Active</h2>
        <p className="text-xs text-[#98A6BA] mt-1 mb-6">
          Sign in or register an account to configure two-factor security, save withdrawal addresses, and sync your cloud mining operations.
        </p>
        <button
          onClick={() => openAuthModal('login')}
          className="w-full py-3 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] font-bold text-sm transition-all shadow-lg shadow-[#00D6A3]/20"
        >
          Sign In or Register
        </button>
      </div>
    );
  }

  const handleSaveName = async () => {
    if (nameInput.trim()) {
      try {
        await updateUser({ displayName: nameInput.trim() });
      } catch {
        // error already toasted
      }
    }
    setEditingName(false);
  };

  const handleSendVerification = async () => {
    if (user.isDemo) {
      addToast('Sandbox Mode', 'Demo accounts cannot receive real Firebase verification emails.', 'warning');
      return;
    }

    try {
      setSendingVerification(true);
      const msg = await AuthService.triggerEmailVerification(user.email);
      addToast('Verification Sent', msg, 'info');
    } catch (err: any) {
      addToast('Verification Failed', err?.message || 'Could not send verification email.', 'error');
    } finally {
      setSendingVerification(false);
    }
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
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#F4F7FC] tracking-tight">
            Profile & Security Settings
          </h1>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
            {user.kycTier}
          </span>
          {user.isDemo ? (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/40 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F3B64B] animate-pulse" />
              Sandbox Demo Session
            </span>
          ) : (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-[#25B9F3]/15 text-[#25B9F3] border border-[#25B9F3]/40 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#25B9F3]" />
              Firebase Account
            </span>
          )}
        </div>
        <p className="text-xs text-[#98A6BA] mt-1">
          Manage your account credentials, security layers, and platform connection
        </p>
      </div>

      {/* Demo Warning Banner if active */}
      {user.isDemo && (
        <div className="p-4 rounded-2xl bg-[#F3B64B]/10 border border-[#F3B64B]/30 text-[#F3B64B] text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-[#F3B64B] shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="font-bold text-[#F4F7FC] text-sm">You are in Sandbox Demo Mode</p>
              <p className="text-[#98A6BA] text-xs mt-0.5">
                This session runs locally in browser memory and is <strong>not</strong> an authenticated Firebase user.
                Cloud Firestore synchronization and cross-device persistence require a real Firebase account.
              </p>
            </div>
          </div>
          <button
            onClick={() => openAuthModal('register')}
            className="shrink-0 px-3.5 py-2 rounded-xl bg-[#F3B64B] hover:bg-amber-400 text-[#080B12] font-bold text-xs transition-colors shadow-md"
          >
            Create Firebase Account
          </button>
        </div>
      )}

      {/* User Card */}
      <div className="rounded-3xl p-6 border border-[#253144] bg-[#121925] shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#0D121C] border border-[#253144] flex items-center justify-center text-[#00D6A3] text-xl font-bold overflow-hidden shadow-inner">
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
                    className="bg-[#0D121C] border border-[#253144] rounded-lg px-2 py-1 text-sm text-[#F4F7FC] focus:outline-none focus:border-[#00D6A3]"
                  />
                  <button
                    onClick={handleSaveName}
                    className="px-2.5 py-1 rounded-lg bg-[#00D6A3] text-[#080B12] text-xs font-bold hover:bg-[#19C784]"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-[#F4F7FC]">{user.displayName}</h2>
                  <button
                    onClick={() => {
                      setNameInput(user.displayName);
                      setEditingName(true);
                    }}
                    className="p-1 text-[#98A6BA] hover:text-[#F4F7FC]"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-[#98A6BA] font-mono mt-0.5">{user.email}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#0D121C] border border-[#253144] text-[#98A6BA]">
                  UID: {user.id}
                </span>
                <span className="text-[10px] text-[#98A6BA] font-mono">
                  Joined: {new Date(user.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md font-mono font-semibold bg-[#0D121C] border border-[#253144] text-[#F4F7FC]">
                  Ref Code: {user.referralCode}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={logoutUser}
            className="py-2 px-4 rounded-xl border border-[#FF647C]/30 bg-[#FF647C]/10 hover:bg-[#FF647C]/20 text-[#FF647C] text-xs font-bold transition-all flex items-center justify-center gap-1.5 self-start sm:self-auto"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Email Verification Banner */}
        <div className="mt-6 pt-5 border-t border-[#253144]">
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            user.isEmailVerified
              ? 'border-[#00D6A3]/25 bg-[#00D6A3]/5 text-[#00D6A3]'
              : 'border-[#F3B64B]/25 bg-[#F3B64B]/5 text-[#F3B64B]'
          }`}>
            <div className="flex items-start gap-3">
              {user.isEmailVerified ? (
                <CheckCircle2 className="w-5 h-5 text-[#00D6A3] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-[#F3B64B] shrink-0 mt-0.5" />
              )}
              <div>
                <span className="text-xs font-bold block text-[#F4F7FC]">
                  {user.isEmailVerified ? 'Email Confirmed & Verified' : 'Email Verification Pending'}
                </span>
                <span className="text-[11px] text-[#98A6BA] block mt-0.5">
                  {user.isDemo
                    ? 'In Sandbox Demo Mode, email verification is simulated. Connect Firebase to verify real email addresses.'
                    : user.isEmailVerified
                    ? 'Your email is verified with Firebase Auth for higher daily withdrawal thresholds.'
                    : 'Please verify your email address via Firebase link to enable maximum mining withdrawal limits.'}
                </span>
              </div>
            </div>

            {!user.isEmailVerified && (
              <button
                onClick={handleSendVerification}
                disabled={sendingVerification}
                className="py-1.5 px-3.5 rounded-xl bg-[#F3B64B] hover:bg-amber-400 text-[#080B12] font-bold text-xs transition-colors shrink-0"
              >
                {sendingVerification ? 'Sending...' : 'Resend Verification'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Accent Color Themes Section */}
      <div className="rounded-3xl p-6 border border-[#253144] bg-[#121925] space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold text-[#98A6BA] uppercase tracking-wider flex items-center gap-2">
              <GradientIcon icon={Palette} theme="emerald" size="xs" variant="glow" />
              <span>Accent Color Themes</span>
            </h2>
            <p className="text-xs text-[#98A6BA] mt-0.5">
              Customize the visual palette of your Nexora Cloud Mining terminal
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { id: 'emerald', label: 'Emerald Matrix', color: 'from-[#00D6A3] to-[#25B9F3]', bg: 'bg-[#00D6A3]/10 border-[#00D6A3]' },
            { id: 'violet', label: 'Neon Violet', color: 'from-[#8B5CF6] to-[#C084FC]', bg: 'bg-[#8B5CF6]/10 border-[#8B5CF6]' },
            { id: 'blue', label: 'Electric Cyan', color: 'from-[#25B9F3] to-[#60A5FA]', bg: 'bg-[#25B9F3]/10 border-[#25B9F3]' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setAccentTheme(t.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                accentTheme === t.id
                  ? `${t.bg} border-2`
                  : 'bg-[#0D121C] border-[#253144] hover:border-[#36465D]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full bg-gradient-to-tr ${t.color}`} />
                <span className="text-xs font-bold text-[#F4F7FC]">{t.label}</span>
              </div>
              {accentTheme === t.id && <Check className="w-4 h-4 text-[#00D6A3]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Security Layers */}
      <div className="rounded-3xl p-6 border border-[#253144] bg-[#121925] space-y-4 shadow-xl">
        <h2 className="text-xs font-bold text-[#98A6BA] uppercase tracking-wider flex items-center gap-2">
          <GradientIcon icon={Shield} theme="emerald" size="xs" variant="glow" />
          <span>Security & Authentication Safeguards</span>
        </h2>

        {/* 2FA Toggle */}
        <div className="p-4 rounded-2xl bg-[#0D121C] border border-[#253144] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GradientIcon icon={Smartphone} theme="emerald" size="sm" variant="boxed" />
            <div>
              <span className="text-xs font-bold text-[#F4F7FC] block">Two-Factor Authentication (2FA)</span>
              <span className="text-[11px] text-[#98A6BA] block mt-0.5">
                Require TOTP authentication token on withdrawal requests
              </span>
            </div>
          </div>

          <button
            onClick={handleToggle2FA}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              user.twoFactorEnabled ? 'bg-[#00D6A3]' : 'bg-[#182232]'
            }`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
              user.twoFactorEnabled ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>

        {/* Change Password Prompt */}
        <div className="p-4 rounded-2xl bg-[#0D121C] border border-[#253144] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GradientIcon icon={Key} theme="gold" size="sm" variant="boxed" />
            <div>
              <span className="text-xs font-bold text-[#F4F7FC] block">Password Protection</span>
              <span className="text-[11px] text-[#98A6BA] block mt-0.5">
                {user.isDemo
                  ? 'Demo session accounts use localized placeholder credentials.'
                  : 'Send secure reset instructions to your registered Firebase email.'}
              </span>
            </div>
          </div>

          <button
            onClick={async () => {
              if (user.isDemo) {
                addToast('Sandbox Mode', 'Password reset emails cannot be sent for sandbox demo accounts.', 'warning');
                return;
              }
              try {
                const msg = await AuthService.sendPasswordReset(user.email);
                addToast('Password Reset', msg, 'info');
              } catch (err: any) {
                addToast('Reset Failed', err?.message || 'Could not send reset email.', 'error');
              }
            }}
            className="py-1.5 px-3.5 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] text-xs font-semibold border border-[#253144] transition-colors"
          >
            Change Password
          </button>
        </div>
      </div>

      {/* Backend & Firebase Status Section */}
      <div className="rounded-3xl p-6 border border-[#253144] bg-[#121925] space-y-3 shadow-xl">
        <h2 className="text-xs font-bold text-[#98A6BA] uppercase tracking-wider flex items-center gap-2">
          <GradientIcon icon={Database} theme="cyan" size="xs" variant="glow" />
          <span>Backend & Infrastructure Status</span>
        </h2>

        <div className="p-4 rounded-2xl bg-[#0D121C] border border-[#253144] space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[#98A6BA]">Application Architecture:</span>
            <span className="font-mono text-[#00D6A3] font-bold">Web SPA & PWA Compliant</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#98A6BA]">Firebase Firestore & Auth:</span>
            <span className={`font-mono font-bold ${AuthService.isFirebaseEnabled() ? 'text-[#00D6A3]' : 'text-[#F3B64B]'}`}>
              {AuthService.isFirebaseEnabled() ? 'Connected & Active (Firebase SDK)' : 'SDK Ready (Awaiting Env Keys)'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#98A6BA]">Active Session Authority:</span>
            <span className={`font-mono font-bold ${user.isDemo ? 'text-[#F3B64B]' : 'text-[#25B9F3]'}`}>
              {user.isDemo ? 'Sandbox Demo Mode (Local Storage)' : 'Cloud Firestore (/users/' + user.id + ')'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#98A6BA]">Firestore Security Rules:</span>
            <span className="font-mono text-[#00D6A3] font-bold">rules_version 2 (Role & Field Locked)</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#98A6BA]">Live Market Feed:</span>
            <span className="font-mono text-[#00D6A3] font-bold">Active (Real-Time Market Stream)</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#98A6BA]">Cloud Contract Engine:</span>
            <span className="font-mono text-[#00D6A3] font-bold">Active Contract Allocation</span>
          </div>
        </div>
      </div>
    </div>
  );
};
