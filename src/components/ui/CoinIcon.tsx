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
      shadow: 'shadow-amber-500/15',
      textClass: 'text-amber-600 font-extrabold',
      label: 'Bitcoin',
      badgeText: '₿',
    },
    ETH: {
      gradient: 'from-violet-500 via-indigo-500 to-blue-500',
      shadow: 'shadow-indigo-500/15',
      textClass: 'text-indigo-600 font-extrabold',
      label: 'Ethereum',
      badgeText: 'Ξ',
    },
    SOL: {
      gradient: 'from-emerald-400 via-cyan-500 to-purple-500',
      shadow: 'shadow-cyan-500/15',
      textClass: 'text-teal-700 font-extrabold',
      label: 'Solana',
      badgeText: '◎',
    },
    USDT: {
      gradient: 'from-emerald-400 via-teal-500 to-cyan-600',
      shadow: 'shadow-emerald-500/15',
      textClass: 'text-emerald-700 font-black',
      label: 'Tether USD',
      badgeText: '₮',
    },
    LTC: {
      gradient: 'from-slate-400 via-sky-500 to-indigo-500',
      shadow: 'shadow-sky-500/15',
      textClass: 'text-sky-700 font-black',
      label: 'Litecoin',
      badgeText: 'Ł',
    },
    DOGE: {
      gradient: 'from-amber-400 via-yellow-500 to-orange-500',
      shadow: 'shadow-yellow-500/15',
      textClass: 'text-amber-700 font-black',
      label: 'Dogecoin',
      badgeText: 'Ð',
    },
    KAS: {
      gradient: 'from-teal-400 via-emerald-500 to-cyan-500',
      shadow: 'shadow-teal-500/15',
      textClass: 'text-teal-700 font-black',
      label: 'Kaspa',
      badgeText: 'K',
    },
    BNB: {
      gradient: 'from-yellow-400 via-amber-500 to-orange-500',
      shadow: 'shadow-yellow-500/15',
      textClass: 'text-yellow-400 font-black',
      label: 'BNB',
      badgeText: 'BNB',
    },
    XRP: {
      gradient: 'from-slate-300 via-blue-400 to-cyan-500',
      shadow: 'shadow-cyan-500/15',
      textClass: 'text-cyan-400 font-black',
      label: 'XRP',
      badgeText: '✕',
    },
    ADA: {
      gradient: 'from-blue-400 via-indigo-500 to-cyan-500',
      shadow: 'shadow-blue-500/15',
      textClass: 'text-blue-400 font-black',
      label: 'Cardano',
      badgeText: '₳',
    },
    AVAX: {
      gradient: 'from-rose-500 via-red-500 to-orange-500',
      shadow: 'shadow-red-500/15',
      textClass: 'text-rose-400 font-black',
      label: 'Avalanche',
      badgeText: '▲',
    },
    LINK: {
      gradient: 'from-blue-500 via-indigo-500 to-sky-500',
      shadow: 'shadow-indigo-500/15',
      textClass: 'text-blue-400 font-black',
      label: 'Chainlink',
      badgeText: '⬡',
    },
    TRX: {
      gradient: 'from-red-500 via-rose-500 to-pink-600',
      shadow: 'shadow-rose-500/15',
      textClass: 'text-red-400 font-black',
      label: 'TRON',
      badgeText: 'T',
    },
    ETC: {
      gradient: 'from-emerald-400 via-green-500 to-teal-600',
      shadow: 'shadow-emerald-500/15',
      textClass: 'text-emerald-400 font-black',
      label: 'Ethereum Classic',
      badgeText: 'ξ',
    },
  };

  const config = coinConfigs[upper] || {
    gradient: 'from-slate-400 to-slate-600',
    shadow: 'shadow-slate-500/10',
    textClass: 'text-slate-700 font-bold',
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
      className={`${sizeClasses.box} bg-gradient-to-tr ${config.gradient} shrink-0 transition-transform group-hover:scale-105 shadow-xs ${
        glow ? config.shadow : ''
      } ${className}`}
      title={config.label}
    >
      <div className="w-full h-full bg-[#0D121C] rounded-[inherit] flex items-center justify-center font-mono border border-[#253144]/60">
        <span className={`${sizeClasses.text} ${config.textClass}`}>
          {config.badgeText}
        </span>
      </div>
    </div>
  );
};
