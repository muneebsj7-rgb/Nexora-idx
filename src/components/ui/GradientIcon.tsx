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
  theme = 'emerald',
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
    emerald: {
      borderGrad: 'from-emerald-400 via-teal-400 to-cyan-500',
      subtleBg: 'bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-slate-900 border-emerald-500/30',
      solidBg: 'bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 text-slate-950',
      textColor: 'text-emerald-400',
      svgUrl: 'url(#icon-grad-emerald)',
      glowShadow: 'shadow-emerald-500/30',
      auraBg: 'bg-emerald-500/20',
    },
    cyan: {
      borderGrad: 'from-cyan-400 via-sky-400 to-blue-500',
      subtleBg: 'bg-gradient-to-br from-cyan-500/20 via-sky-500/10 to-slate-900 border-cyan-500/30',
      solidBg: 'bg-gradient-to-tr from-cyan-400 via-sky-500 to-blue-500 text-slate-950',
      textColor: 'text-cyan-400',
      svgUrl: 'url(#icon-grad-cyan)',
      glowShadow: 'shadow-cyan-500/30',
      auraBg: 'bg-cyan-500/20',
    },
    violet: {
      borderGrad: 'from-violet-400 via-purple-400 to-fuchsia-500',
      subtleBg: 'bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-slate-900 border-violet-500/30',
      solidBg: 'bg-gradient-to-tr from-violet-400 via-purple-500 to-fuchsia-500 text-slate-950',
      textColor: 'text-violet-400',
      svgUrl: 'url(#icon-grad-violet)',
      glowShadow: 'shadow-violet-500/30',
      auraBg: 'bg-violet-500/20',
    },
    blue: {
      borderGrad: 'from-blue-400 via-indigo-400 to-cyan-500',
      subtleBg: 'bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-slate-900 border-blue-500/30',
      solidBg: 'bg-gradient-to-tr from-blue-400 via-indigo-500 to-cyan-500 text-slate-950',
      textColor: 'text-blue-400',
      svgUrl: 'url(#icon-grad-blue)',
      glowShadow: 'shadow-blue-500/30',
      auraBg: 'bg-blue-500/20',
    },
    amber: {
      borderGrad: 'from-amber-400 via-yellow-400 to-orange-500',
      subtleBg: 'bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-slate-900 border-amber-500/30',
      solidBg: 'bg-gradient-to-tr from-amber-400 via-yellow-500 to-orange-500 text-slate-950',
      textColor: 'text-amber-400',
      svgUrl: 'url(#icon-grad-amber)',
      glowShadow: 'shadow-amber-500/30',
      auraBg: 'bg-amber-500/20',
    },
    rose: {
      borderGrad: 'from-rose-400 via-pink-400 to-red-500',
      subtleBg: 'bg-gradient-to-br from-rose-500/20 via-pink-500/10 to-slate-900 border-rose-500/30',
      solidBg: 'bg-gradient-to-tr from-rose-400 via-pink-500 to-red-500 text-slate-950',
      textColor: 'text-rose-400',
      svgUrl: 'url(#icon-grad-rose)',
      glowShadow: 'shadow-rose-500/30',
      auraBg: 'bg-rose-500/20',
    },
    gold: {
      borderGrad: 'from-yellow-300 via-amber-400 to-amber-600',
      subtleBg: 'bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-slate-900 border-yellow-500/30',
      solidBg: 'bg-gradient-to-tr from-yellow-300 via-amber-500 to-amber-600 text-slate-950',
      textColor: 'text-yellow-400',
      svgUrl: 'url(#icon-grad-gold)',
      glowShadow: 'shadow-amber-500/35',
      auraBg: 'bg-yellow-500/20',
    },
    solana: {
      borderGrad: 'from-emerald-400 via-cyan-400 to-fuchsia-500',
      subtleBg: 'bg-gradient-to-br from-cyan-500/20 via-fuchsia-500/15 to-slate-900 border-cyan-500/40',
      solidBg: 'bg-gradient-to-tr from-emerald-400 via-cyan-400 to-fuchsia-500 text-slate-950',
      textColor: 'text-cyan-300',
      svgUrl: 'url(#icon-grad-solana)',
      glowShadow: 'shadow-cyan-500/30',
      auraBg: 'bg-cyan-500/20',
    },
    ethereum: {
      borderGrad: 'from-purple-400 via-indigo-400 to-sky-400',
      subtleBg: 'bg-gradient-to-br from-purple-500/20 via-indigo-500/10 to-slate-900 border-purple-500/30',
      solidBg: 'bg-gradient-to-tr from-purple-400 via-indigo-500 to-sky-400 text-slate-950',
      textColor: 'text-purple-300',
      svgUrl: 'url(#icon-grad-ethereum)',
      glowShadow: 'shadow-purple-500/30',
      auraBg: 'bg-purple-500/20',
    },
    flame: {
      borderGrad: 'from-yellow-400 via-orange-500 to-red-600',
      subtleBg: 'bg-gradient-to-br from-orange-500/25 via-red-500/15 to-slate-900 border-orange-500/40',
      solidBg: 'bg-gradient-to-tr from-yellow-400 via-orange-500 to-red-600 text-slate-950',
      textColor: 'text-orange-400',
      svgUrl: 'url(#icon-grad-flame)',
      glowShadow: 'shadow-orange-500/35',
      auraBg: 'bg-orange-500/25',
    },
  };

  const currentTheme = themeStyles[theme];

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
          glow ? `shadow-lg ${currentTheme.glowShadow}` : ''
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
        className={`${sizeStyles.box} ${currentTheme.subtleBg} border flex items-center justify-center shrink-0 ${
          glow ? `shadow-sm ${currentTheme.glowShadow}` : ''
        } ${className}`}
      >
        <Icon
          className={`${sizeStyles.icon} ${iconClassName}`}
          style={{ stroke: currentTheme.svgUrl }}
        />
      </div>
    );
  }

  // Default 'boxed': outer gradient ring with dark high-tech inner center and gradient stroke icon
  return (
    <div
      className={`${sizeStyles.box} bg-gradient-to-tr ${currentTheme.borderGrad} p-0.5 shrink-0 transition-transform ${
        glow ? `shadow-lg ${currentTheme.glowShadow}` : ''
      } ${className}`}
    >
      <div className={`w-full h-full bg-slate-950/90 ${sizeStyles.inner} flex items-center justify-center backdrop-blur-sm`}>
        <Icon
          className={`${sizeStyles.icon} ${iconClassName}`}
          style={{ stroke: currentTheme.svgUrl }}
        />
      </div>
    </div>
  );
};
