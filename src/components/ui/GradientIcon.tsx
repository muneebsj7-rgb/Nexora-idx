import React from 'react';

export type IconGradTheme =
  | 'emerald'
  | 'cyan'
  | 'violet'
  | 'blue'
  | 'amber'
  | 'rose'
  | 'gold'
  | 'solana'
  | 'ethereum'
  | 'flame';

export interface GradientIconProps {
  icon: React.ElementType;
  theme?: IconGradTheme;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  variant?: 'boxed' | 'subtle' | 'solid' | 'glow';
  glow?: boolean;
  className?: string;
  iconClassName?: string;
}

export const GradientIcon: React.FC<GradientIconProps> = ({
  icon: Icon,
  theme = 'blue',
  size = 'md',
  variant = 'boxed',
  glow = true,
  className = '',
  iconClassName = '',
}) => {
  const themeStyles: Record<
    IconGradTheme,
    {
      borderGrad: string;
      subtleBg: string;
      solidBg: string;
      textColor: string;
      svgUrl: string;
      glowShadow: string;
      auraBg: string;
    }
  > = {
    blue: {
      borderGrad: 'from-[#246BFD] via-blue-500 to-[#16C7D9]',
      subtleBg: 'bg-blue-50/80 border-blue-200/70 text-[#246BFD]',
      solidBg: 'bg-gradient-to-tr from-[#246BFD] to-[#16C7D9] text-white',
      textColor: 'text-[#246BFD]',
      svgUrl: 'url(#icon-grad-blue)',
      glowShadow: 'shadow-blue-500/20',
      auraBg: 'bg-blue-500/15',
    },
    cyan: {
      borderGrad: 'from-[#16C7D9] via-cyan-400 to-[#246BFD]',
      subtleBg: 'bg-cyan-50/80 border-cyan-200/70 text-[#0891B2]',
      solidBg: 'bg-gradient-to-tr from-[#16C7D9] to-[#246BFD] text-white',
      textColor: 'text-[#0891B2]',
      svgUrl: 'url(#icon-grad-cyan)',
      glowShadow: 'shadow-cyan-500/20',
      auraBg: 'bg-cyan-500/15',
    },
    emerald: {
      borderGrad: 'from-[#16A673] via-emerald-400 to-[#16C7D9]',
      subtleBg: 'bg-emerald-50/80 border-emerald-200/70 text-[#16A673]',
      solidBg: 'bg-gradient-to-tr from-[#16A673] to-teal-500 text-white',
      textColor: 'text-[#16A673]',
      svgUrl: 'url(#icon-grad-emerald)',
      glowShadow: 'shadow-emerald-500/20',
      auraBg: 'bg-emerald-500/15',
    },
    violet: {
      borderGrad: 'from-[#7C3AED] via-purple-500 to-indigo-500',
      subtleBg: 'bg-purple-50/80 border-purple-200/70 text-[#7C3AED]',
      solidBg: 'bg-gradient-to-tr from-[#7C3AED] to-indigo-500 text-white',
      textColor: 'text-[#7C3AED]',
      svgUrl: 'url(#icon-grad-violet)',
      glowShadow: 'shadow-purple-500/20',
      auraBg: 'bg-purple-500/15',
    },
    amber: {
      borderGrad: 'from-[#E9A23B] via-amber-400 to-orange-500',
      subtleBg: 'bg-amber-50/80 border-amber-200/70 text-[#D97706]',
      solidBg: 'bg-gradient-to-tr from-[#E9A23B] to-orange-500 text-white',
      textColor: 'text-[#D97706]',
      svgUrl: 'url(#icon-grad-amber)',
      glowShadow: 'shadow-amber-500/20',
      auraBg: 'bg-amber-500/15',
    },
    rose: {
      borderGrad: 'from-[#E05260] via-rose-400 to-red-500',
      subtleBg: 'bg-rose-50/80 border-rose-200/70 text-[#E05260]',
      solidBg: 'bg-gradient-to-tr from-[#E05260] to-red-500 text-white',
      textColor: 'text-[#E05260]',
      svgUrl: 'url(#icon-grad-rose)',
      glowShadow: 'shadow-rose-500/20',
      auraBg: 'bg-rose-500/15',
    },
    gold: {
      borderGrad: 'from-amber-400 via-yellow-500 to-amber-600',
      subtleBg: 'bg-amber-50/80 border-amber-200/70 text-amber-700',
      solidBg: 'bg-gradient-to-tr from-amber-400 to-amber-600 text-white',
      textColor: 'text-amber-600',
      svgUrl: 'url(#icon-grad-gold)',
      glowShadow: 'shadow-amber-500/20',
      auraBg: 'bg-amber-500/15',
    },
    solana: {
      borderGrad: 'from-emerald-400 via-cyan-400 to-purple-500',
      subtleBg: 'bg-cyan-50/80 border-cyan-200/70 text-cyan-700',
      solidBg: 'bg-gradient-to-tr from-emerald-400 via-cyan-400 to-purple-500 text-white',
      textColor: 'text-cyan-700',
      svgUrl: 'url(#icon-grad-solana)',
      glowShadow: 'shadow-cyan-500/20',
      auraBg: 'bg-cyan-500/15',
    },
    ethereum: {
      borderGrad: 'from-purple-400 via-indigo-500 to-sky-400',
      subtleBg: 'bg-indigo-50/80 border-indigo-200/70 text-indigo-700',
      solidBg: 'bg-gradient-to-tr from-purple-400 via-indigo-500 to-sky-400 text-white',
      textColor: 'text-indigo-700',
      svgUrl: 'url(#icon-grad-ethereum)',
      glowShadow: 'shadow-indigo-500/20',
      auraBg: 'bg-indigo-500/15',
    },
    flame: {
      borderGrad: 'from-amber-400 via-orange-500 to-rose-500',
      subtleBg: 'bg-orange-50/80 border-orange-200/70 text-orange-600',
      solidBg: 'bg-gradient-to-tr from-amber-400 via-orange-500 to-rose-500 text-white',
      textColor: 'text-orange-600',
      svgUrl: 'url(#icon-grad-flame)',
      glowShadow: 'shadow-orange-500/20',
      auraBg: 'bg-orange-500/15',
    },
  };

  const currentTheme = themeStyles[theme] || themeStyles.blue;

  const sizeStyles = {
    xs: { box: 'w-7 h-7 rounded-lg', icon: 'w-3.5 h-3.5', inner: 'rounded-[6px]' },
    sm: { box: 'w-8 h-8 rounded-xl', icon: 'w-4 h-4', inner: 'rounded-[10px]' },
    md: { box: 'w-10 h-10 rounded-xl', icon: 'w-5 h-5', inner: 'rounded-[10px]' },
    lg: { box: 'w-12 h-12 rounded-2xl', icon: 'w-6 h-6', inner: 'rounded-[14px]' },
    xl: { box: 'w-14 h-14 rounded-2xl', icon: 'w-7 h-7', inner: 'rounded-[14px]' },
    '2xl': { box: 'w-16 h-16 rounded-3xl', icon: 'w-8 h-8', inner: 'rounded-[20px]' },
  }[size];

  if (variant === 'solid') {
    return (
      <div
        className={`${sizeStyles.box} ${currentTheme.solidBg} flex items-center justify-center shrink-0 ${
          glow ? `shadow-md ${currentTheme.glowShadow}` : ''
        } ${className}`}
      >
        <Icon className={`${sizeStyles.icon} ${iconClassName}`} />
      </div>
    );
  }

  if (variant === 'glow') {
    return (
      <div className={`relative flex items-center justify-center shrink-0 ${className}`}>
        {glow && (
          <div
            className={`absolute inset-0 rounded-full blur-md ${currentTheme.auraBg} scale-125 pointer-events-none`}
          />
        )}
        <Icon
          className={`${sizeStyles.icon} ${iconClassName} relative z-10 transition-transform`}
          style={{ stroke: currentTheme.svgUrl }}
        />
      </div>
    );
  }

  if (variant === 'subtle') {
    return (
      <div
        className={`${sizeStyles.box} ${currentTheme.subtleBg} border flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <Icon
          className={`${sizeStyles.icon} ${iconClassName}`}
          style={{ stroke: currentTheme.svgUrl }}
        />
      </div>
    );
  }

  // Dark theme boxed icon: outer gradient hairline with sleek dark charcoal center
  return (
    <div
      className={`${sizeStyles.box} bg-gradient-to-tr ${currentTheme.borderGrad} p-0.5 shrink-0 transition-transform shadow-xs ${
        glow ? currentTheme.glowShadow : ''
      } ${className}`}
    >
      <div className={`w-full h-full bg-[#121925] ${sizeStyles.inner} flex items-center justify-center border border-[#253144]/40`}>
        <Icon
          className={`${sizeStyles.icon} ${iconClassName}`}
          style={{ stroke: currentTheme.svgUrl }}
        />
      </div>
    </div>
  );
};
