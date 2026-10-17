import React from 'react';

interface CoinIconProps {
  symbol: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  glow?: boolean;
}

export const CoinIcon: React.FC<CoinIconProps> = ({
  symbol,
  size = 'md',
  className = '',
  glow = true,
}) => {
  const upper = symbol.toUpperCase();

  const coinConfigs: Record<
    string,
    {
      gradient: string;
      shadow: string;
      textClass: string;
      label: string;
      badgeText: string;
    }
  > = {
    BTC: {
      gradient: 'from-amber-400 via-yellow-500 to-orange-500',
      shadow: 'shadow-amber-500/30',
      textClass: 'text-amber-300 font-extrabold',
      label: 'Bitcoin',
      badgeText: '₿',
    },
    ETH: {
      gradient: 'from-violet-400 via-indigo-500 to-sky-400',
      shadow: 'shadow-indigo-500/30',
      textClass: 'text-indigo-200 font-extrabold',
      label: 'Ethereum',
      badgeText: 'Ξ',
    },
    SOL: {
      gradient: 'from-emerald-400 via-cyan-400 to-fuchsia-500',
      shadow: 'shadow-cyan-500/30',
      textClass: 'text-cyan-200 font-extrabold',
      label: 'Solana',
      badgeText: '◎',
    },
    USDT: {
      gradient: 'from-emerald-400 via-teal-400 to-cyan-500',
      shadow: 'shadow-emerald-500/30',
      textClass: 'text-emerald-300 font-black',
      label: 'Tether USD',
      badgeText: '₮',
    },
    LTC: {
      gradient: 'from-slate-300 via-sky-400 to-indigo-500',
      shadow: 'shadow-sky-500/30',
      textClass: 'text-sky-200 font-black',
      label: 'Litecoin',
      badgeText: 'Ł',
    },
    DOGE: {
      gradient: 'from-amber-300 via-yellow-400 to-orange-400',
      shadow: 'shadow-yellow-500/30',
      textClass: 'text-amber-200 font-black',
      label: 'Dogecoin',
      badgeText: 'Ð',
    },
    KAS: {
      gradient: 'from-teal-300 via-emerald-400 to-cyan-500',
      shadow: 'shadow-teal-500/30',
      textClass: 'text-teal-200 font-black',
      label: 'Kaspa',
      badgeText: 'K',
    },
  };

  const config = coinConfigs[upper] || {
    gradient: 'from-slate-400 to-slate-600',
    shadow: 'shadow-slate-500/20',
    textClass: 'text-slate-200 font-bold',
    label: upper,
    badgeText: upper.slice(0, 3),
  };

  const sizeClasses = {
    xs: { box: 'w-6 h-6 rounded-lg p-0.5', text: 'text-[10px]' },
    sm: { box: 'w-8 h-8 rounded-xl p-0.5', text: 'text-xs' },
    md: { box: 'w-10 h-10 rounded-xl p-0.5', text: 'text-sm' },
    lg: { box: 'w-12 h-12 rounded-2xl p-0.5', text: 'text-base' },
  }[size];

  return (
    <div
      className={`${sizeClasses.box} bg-gradient-to-tr ${config.gradient} shrink-0 transition-transform group-hover:scale-105 ${
        glow ? `shadow-md ${config.shadow}` : ''
      } ${className}`}
      title={config.label}
    >
      <div className="w-full h-full bg-slate-950/95 rounded-[inherit] flex items-center justify-center font-mono">
        <span className={`${sizeClasses.text} ${config.textClass}`}>
          {config.badgeText}
        </span>
      </div>
    </div>
  );
};
