import React from 'react';
import { useApp, NavTab } from '../context/AppContext';
import { Home, Pickaxe, TrendingUp, Wallet, Gift, User, Smartphone, Monitor } from 'lucide-react';

export const Navigation: React.FC = () => {
  const { activeTab, setActiveTab, user, openAuthModal, isMobileDeviceFrame, toggleMobileFrame, accentTheme } = useApp();

  const themeStyle = {
    emerald: {
      gradient: 'from-[#00D6A3] to-[#25B9F3]',
      text: 'text-[#00D6A3]',
      activeTabBg: 'bg-[#00D6A3] text-[#080B12] shadow-sm shadow-[#00D6A3]/20 font-bold',
      activeTabMobile: '#00D6A3',
      svgGrad: 'url(#icon-grad-emerald)',
      buttonBg: 'bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] shadow-sm shadow-[#00D6A3]/20 font-bold',
    },
    violet: {
      gradient: 'from-[#8B5CF6] to-[#25B9F3]',
      text: 'text-[#8B5CF6]',
      activeTabBg: 'bg-[#8B5CF6] text-white shadow-sm shadow-purple-500/20 font-bold',
      activeTabMobile: '#8B5CF6',
      svgGrad: 'url(#icon-grad-violet)',
      buttonBg: 'bg-[#8B5CF6] hover:bg-purple-600 text-white shadow-sm shadow-purple-500/20 font-bold',
    },
    blue: {
      gradient: 'from-[#25B9F3] to-[#00D6A3]',
      text: 'text-[#25B9F3]',
      activeTabBg: 'bg-[#25B9F3] text-[#080B12] shadow-sm shadow-cyan-500/20 font-bold',
      activeTabMobile: '#25B9F3',
      svgGrad: 'url(#icon-grad-blue)',
      buttonBg: 'bg-[#25B9F3] hover:bg-sky-400 text-[#080B12] shadow-sm shadow-cyan-500/20 font-bold',
    },
  }[accentTheme];

  const navItems: { id: NavTab; label: string; icon: React.ElementType }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'mining', label: 'Mining', icon: Pickaxe },
    { id: 'markets', label: 'Markets', icon: TrendingUp },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'earn', label: 'Earn', icon: Gift },
  ];

  return (
    <>
      {/* Top Header Bar for Desktop & Mobile in Premium Dark Theme */}
      <header className="sticky top-0 z-30 w-full bg-[#080B12]/90 backdrop-blur-md border-b border-[#253144] px-4 py-3 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.5)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2.5 text-left group transition-transform active:scale-95"
            >
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${themeStyle.gradient} p-0.5 shadow-sm`}>
                <div className="w-full h-full bg-[#0D121C] rounded-[10px] flex items-center justify-center">
                  <Pickaxe className={`w-5 h-5 ${themeStyle.text} group-hover:rotate-12 transition-transform`} />
                </div>
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-[#F4F7FC] flex items-center gap-1.5">
                  NEXORA <span className={themeStyle.text}>MINE</span>
                </span>
                <span className="text-[10px] text-[#98A6BA] block -mt-1 font-mono uppercase tracking-wider">
                  Cloud Pool Stratum
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-[#0D121C] p-1.5 rounded-2xl border border-[#253144]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                    isActive
                      ? themeStyle.activeTabBg
                      : 'text-[#98A6BA] hover:text-[#F4F7FC] hover:bg-[#182232]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
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
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-[#253144] bg-[#121925] text-[#98A6BA] hover:text-[#00D6A3] hover:border-[#00D6A3]/40 transition-all shadow-xs"
            >
              {isMobileDeviceFrame ? (
                <>
                  <Monitor className="w-3.5 h-3.5 text-[#00D6A3]" />
                  <span>Full Screen</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5 text-[#25B9F3]" />
                  <span>Mobile View</span>
                </>
              )}
            </button>

            {user ? (
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex items-center gap-2.5 p-1 pl-3 rounded-full border transition-all ${
                  activeTab === 'profile'
                    ? 'border-[#00D6A3] bg-[#00D6A3]/10'
                    : 'border-[#253144] bg-[#121925] hover:border-[#36465D] shadow-xs'
                }`}
              >
                <div className="hidden sm:block text-right">
                  <span className="text-xs font-bold text-[#F4F7FC] block leading-tight">
                    {user.displayName || user.email.split('@')[0]}
                  </span>
                  <span className={`text-[10px] font-mono ${user.isDemo ? 'text-[#F3B64B]' : themeStyle.text}`}>
                    {user.isDemo ? 'Demo Mode' : user.isEmailVerified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
                <div className="w-7 h-7 rounded-full bg-[#080B12] border border-[#253144] flex items-center justify-center text-xs font-bold overflow-hidden text-[#00D6A3]">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-[#00D6A3]" />
                  )}
                </div>
              </button>
            ) : (
              <button
                onClick={() => openAuthModal('login')}
                className={`px-4 py-2 rounded-xl text-xs transition-all ${themeStyle.buttonBg}`}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sleek Mobile Bottom Navigation Bar with Premium Dark Theme */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#080B12]/95 backdrop-blur-lg border-t border-[#253144] px-2 py-1.5 shadow-[0_-4px_30px_rgba(0,0,0,0.8)] safe-bottom">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[46px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl transition-all relative ${
                  isActive ? 'scale-105' : 'text-[#98A6BA] hover:text-[#F4F7FC]'
                }`}
              >
                {isActive && (
                  <span
                    className="absolute -top-1.5 w-6 h-0.5 rounded-full transition-all"
                    style={{
                      backgroundColor: themeStyle.activeTabMobile,
                      boxShadow: `0 2px 10px ${themeStyle.activeTabMobile}`,
                    }}
                  />
                )}
                <Icon
                  className={`w-5 h-5 transition-transform ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`}
                  style={isActive ? { color: themeStyle.activeTabMobile } : undefined}
                />
                <span
                  className="text-[10px] font-semibold tracking-tight transition-colors"
                  style={isActive ? { color: themeStyle.activeTabMobile } : undefined}
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
