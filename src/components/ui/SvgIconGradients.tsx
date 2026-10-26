import React from 'react';

/**
 * Universal SVG gradient definitions for icon color grading across Nexora Cloud Mining.
 * Allows icons to use stroke="url(#icon-grad-...)" or fill="url(#icon-grad-...)"
 */
export const SvgIconGradients: React.FC = () => {
  return (
    <svg width="0" height="0" className="absolute w-0 h-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <defs>
        {/* Emerald to Teal Gradient (Mining, Confirmed Yields, Active Rig) */}
        <linearGradient id="icon-grad-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>

        {/* Cyan to Ocean Gradient (Stratum Pool, Telemetry, Connectivity) */}
        <linearGradient id="icon-grad-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        {/* Violet to Fuchsia Gradient (Overclocking, Advanced Tuning, Cyberpunk) */}
        <linearGradient id="icon-grad-violet" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>

        {/* Electric Blue Gradient (Institutional, Markets, Spot Trading) */}
        <linearGradient id="icon-grad-blue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        {/* Amber to Orange Gradient (Daily Streaks, Hash Power, Bounties) */}
        <linearGradient id="icon-grad-amber" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>

        {/* Rose to Crimson Gradient (Withdrawals, Network Alerts, Temp Warning) */}
        <linearGradient id="icon-grad-rose" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="50%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#be123c" />
        </linearGradient>

        {/* Bitcoin Gold Luxury Gradient */}
        <linearGradient id="icon-grad-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="40%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>

        {/* Ethereum Tri-Gradient (Purple -> Indigo -> Blue) */}
        <linearGradient id="icon-grad-ethereum" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>

        {/* Solana Neon High-Tech Gradient */}
        <linearGradient id="icon-grad-solana" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00ffa3" />
          <stop offset="50%" stopColor="#03e1ff" />
          <stop offset="100%" stopColor="#dc1fff" />
        </linearGradient>

        {/* Fiery Streak / Hot Turbo Gradient */}
        <linearGradient id="icon-grad-flame" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="45%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
    </svg>
  );
};
