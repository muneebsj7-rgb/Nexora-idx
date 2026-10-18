import React from 'react';
import { useApp, NavTab } from '../context/AppContext';
import { Home, Pickaxe, TrendingUp, Wallet, Gift, User, Smartphone, Monitor } from 'lucide-react';

export const Navigation: React.FC = () => {
  const { activeTab, setActiveTab, user, openAuthModal, isMobileDeviceFrame, toggleMobileFrame, accentTheme } = useApp();

  const themeStyle = {
    emerald: {
      gradient: 'from-emerald-500 to-cyan-500 shadow-emerald-500/20',
      text: 'text-emerald-400',
      bgActive: 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20',
      indicatorColor: '#10b981',
      borderProfile: 'border-emerald-500 bg-emerald-500/10',
      buttonBg: 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20',
      svgGrad: 'url(#icon-grad-emerald)',
    },
    violet: {
      gradient: 'from-violet-500 to-fuchsia-500 shadow-violet-500/20',
      text: 'text-violet-400',
      bgActive: 'bg-violet-500 text-slate-950 shadow-md shadow-violet-500/20',
      indicatorColor: '#8b5cf6',
      borderProfile: 'border-violet-500 bg-violet-500/10',
      buttonBg: 'bg-violet-500 hover:bg-violet-400 shadow-violet-500/20',
      svgGrad: 'url(#icon-grad-violet)',
    },
    blue: {
      gradient: 'from-blue-500 to-cyan-500 shadow-blue-500/20',
      text: 'text-blue-400',
      bgActive: 'bg-blue-500 text-slate-950 shadow-md shadow-blue-500/20',
      indicatorColor: '#3b82f6',
      borderProfile: 'border-blue-500 bg-blue-500/10',
      buttonBg: 'bg-blue-500 hover:bg-blue-400 shadow-blue-500/20',
      svgGrad: 'url(#icon-grad-blue)',
    },
  }[accentTheme];

  const navItems: { id: NavTab; label: string; icon: React.ElementType; gradUrl: string; glowColor: string }[] = [
    { id: 'home', label: 'Home', icon: Home, gradUrl: themeStyle.svgGrad, glowColor: themeStyle.indicatorColor },
    { id: 'mining', label: 'Mining', icon: Pickaxe, gradUrl: 'url(#icon-grad-cyan)', glowColor: '#06b6d4' },
    { id: 'markets', label: 'Markets', icon: TrendingUp, gradUrl: 'url(#icon-grad-blue)', glowColor: '#3b82f6' },
    { id: 'wallet', label: 'Wallet', icon: Wallet, gradUrl: 'url(#icon-grad-gold)', glowColor: '#f59e0b' },
    { id: 'earn', label: 'Earn', icon: Gift, gradUrl: 'url(#icon-grad-flame)', glowColor: '#ea580c' },
  ];

  return (
    <>
      {/* Top Header Bar for Desktop & Mobile */}
      <header className="sticky top-0 z-30 w-full bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2.5 text-left group transition-transform active:scale-95"
            >
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${themeStyle.gradient} p-0.5 shadow-lg`}>
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Pickaxe className={`w-5 h-5 ${themeStyle.text} group-hover:rotate-12 transition-transform`} />
                </div>
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                  NEXORA <span className={themeStyle.text}>MINE</span>
                </span>
                <span className="text-[10px] text-slate-400 block -mt-1 font-mono uppercase tracking-wider">
                  Cloud Pool Stratum
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? themeStyle.bgActive
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon
                    className="w-4 h-4 transition-transform group-hover:scale-110"
                    style={isActive ? undefined : undefined}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Device Mode Toggle & Profile */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleMobileFrame}
              title={isMobileDeviceFrame ? 'Switch to Full Web Mode' : 'Switch to Mobile App Preview'}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
            >
              {isMobileDeviceFrame ? (
                <>
                  <Monitor className="w-3.5 h-3.5" style={{ stroke: 'url(#icon-grad-cyan)' }} />
                  <span>Full Screen</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5" style={{ stroke: 'url(#icon-grad-emerald)' }} />
                  <span>Mobile View</span>
                </>
              )}
            </button>

            {user ? (
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex items-center gap-2 p-1 pl-2.5 rounded-full border transition-all ${
                  activeTab === 'profile'
                    ? themeStyle.borderProfile
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="hidden sm:block text-right">
                  <span className="text-xs font-bold text-white block leading-tight">
                    {user.displayName || user.email.split('@')[0]}
                  </span>
                  <span className={`text-[10px] font-mono ${user.isDemo ? 'text-amber-400' : themeStyle.text}`}>
                    {user.isDemo ? 'Demo Mode' : user.isEmailVerified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
                <div className={`w-7 h-7 rounded-full bg-slate-900 border flex items-center justify-center text-xs font-bold overflow-hidden ${themeStyle.text}`}>
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-4 h-4" style={{ stroke: themeStyle.svgGrad }} />
                  )}
                </div>
              </button>
            ) : (
              <button
                onClick={() => openAuthModal('login')}
                className={`px-3 py-1.5 rounded-xl text-slate-950 font-bold text-xs transition-all ${themeStyle.buttonBg}`}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sleek Mobile Bottom Navigation Bar with Color-Graded Icons */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-2 safe-bottom">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all relative ${
                  isActive ? 'scale-105' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isActive && (
                  <span
                    className="absolute -top-1 w-6 h-0.5 rounded-full transition-all"
                    style={{
                      backgroundColor: item.glowColor,
                      boxShadow: `0 0 10px ${item.glowColor}`,
                    }}
                  />
                )}
                <Icon
                  className={`w-5 h-5 transition-transform ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`}
                  style={isActive ? { stroke: item.gradUrl, filter: `drop-shadow(0 0 4px ${item.glowColor}50)` } : undefined}
                />
                <span
                  className="text-[10px] font-semibold tracking-tight transition-colors"
                  style={isActive ? { color: item.glowColor } : undefined}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
