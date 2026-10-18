import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Pickaxe,
  Wallet,
  TrendingUp,
  Gift,
  ArrowUpRight,
  ArrowDownLeft,
  Eye,
  EyeOff,
  Bell,
  Cpu,
  RefreshCw,
  Play,
  Pause,
  ChevronRight,
  ShieldCheck,
  Zap,
  Clock,
  Sparkles,
  Info,
  Copy,
  Check,
  X,
  CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { Transaction } from '../../types';
import { NotificationDrawer } from '../modals/NotificationDrawer';
import { DepositModal } from '../modals/DepositModal';
import { WithdrawModal } from '../modals/WithdrawModal';
import { PlanModal } from '../modals/PlanModal';
import { GradientIcon } from '../ui/GradientIcon';
import { CoinIcon } from '../ui/CoinIcon';

export const HomeScreen: React.FC = () => {
  const {
    user,
    setActiveTab,
    walletAssets,
    miningSession,
    toggleMining,
    transactions,
    markets,
    isMarketsLive,
    lastMarketUpdate,
    refreshMarkets,
    openAuthModal,
    addToast,
    accentTheme,
  } = useApp();

  const themeAccent = {
    emerald: {
      primary: '#10b981',
      light: '#34d399',
      borderCard: 'border-emerald-500/30',
      glowCard: 'glow-emerald',
      textAccent: 'text-emerald-400',
      bgSubtle: 'bg-emerald-500/10',
      borderSubtle: 'border-emerald-500/30',
      btnPrimary: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20',
      badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      pulseShadow: '#10b981',
      gradientAvatar: 'from-emerald-500 to-cyan-500',
    },
    violet: {
      primary: '#8b5cf6',
      light: '#a78bfa',
      borderCard: 'border-violet-500/30',
      glowCard: 'glow-violet',
      textAccent: 'text-violet-400',
      bgSubtle: 'bg-violet-500/10',
      borderSubtle: 'border-violet-500/30',
      btnPrimary: 'bg-violet-500 hover:bg-violet-400 text-slate-950 shadow-violet-500/20',
      badgeBg: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
      pulseShadow: '#8b5cf6',
      gradientAvatar: 'from-violet-500 to-fuchsia-500',
    },
    blue: {
      primary: '#3b82f6',
      light: '#60a5fa',
      borderCard: 'border-blue-500/30',
      glowCard: 'glow-blue',
      textAccent: 'text-blue-400',
      bgSubtle: 'bg-blue-500/10',
      borderSubtle: 'border-blue-500/30',
      btnPrimary: 'bg-blue-500 hover:bg-blue-400 text-slate-950 shadow-blue-500/20',
      badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      pulseShadow: '#3b82f6',
      gradientAvatar: 'from-blue-500 to-cyan-500',
    },
  }[accentTheme];

  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [notificationOpen, setNotificationOpen] = useState<boolean>(false);
  const [depositModalOpen, setDepositModalOpen] = useState<boolean>(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState<boolean>(false);
  const [planModalOpen, setPlanModalOpen] = useState<boolean>(false);
  const [refreshingMarkets, setRefreshingMarkets] = useState<boolean>(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);
  const [selectedChartAsset, setSelectedChartAsset] = useState<string>('BTC');

  // Calculate total balance in USD from wallet assets
  const totalBalanceUSD = walletAssets.reduce((acc, curr) => {
    return acc + curr.balance * curr.usdRate;
  }, 0);

  const btcRate = markets.find((m) => m.symbol === 'BTC')?.price || 94250;
  const totalBtcEquivalent = btcRate > 0 ? totalBalanceUSD / btcRate : 0;

  // Format greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Format duration into readable hours and minutes
  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const handleManualRefresh = async () => {
    setRefreshingMarkets(true);
    await refreshMarkets();
    setTimeout(() => setRefreshingMarkets(false), 600);
  };

  // Filter snapshot markets (BTC, ETH, SOL)
  const snapshotMarkets = markets.filter((m) => ['BTC', 'ETH', 'SOL'].includes(m.symbol));

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 px-4 sm:px-6 pt-2 animate-in fade-in duration-300">
      {/* 1. HEADER SECTION */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (user ? setActiveTab('profile') : openAuthModal('login'))}
            className="relative group transition-transform active:scale-95"
            aria-label="User Profile"
          >
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${themeAccent.gradientAvatar} p-0.5 shadow-lg`}>
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center overflow-hidden">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <Pickaxe className={`w-6 h-6 ${themeAccent.textAccent}`} />
                )}
              </div>
            </div>
            {user?.isEmailVerified && (
              <span
                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-slate-950 flex items-center justify-center"
                style={{ backgroundColor: themeAccent.primary }}
              >
                <ShieldCheck className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />
              </span>
            )}
          </button>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-400">
                {getGreeting()},
              </span>
              <span className="text-xs font-bold text-white">
                {user ? (user.displayName || user.email.split('@')[0]) : 'Miner Guest'}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              NEXORA <span className={themeAccent.textAccent}>MINE</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${themeAccent.badgeBg}`}>
                PRO POOL
              </span>
            </h1>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNotificationOpen(true)}
            className="relative p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-all active:scale-95 shadow-sm"
            aria-label="Open Notifications"
          >
            <Bell className="w-5 h-5 text-slate-300" />
            <span
              className="absolute top-2 right-2 w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: themeAccent.primary }}
            />
          </button>
        </div>
      </div>

      {/* 2. TOTAL MINING BALANCE CARD */}
      <div className={`relative overflow-hidden rounded-3xl p-6 sm:p-7 border ${themeAccent.borderCard} bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 shadow-2xl ${themeAccent.glowCard}`}>
        {/* Subtle decorative mesh background */}
        <div
          className="absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20 opacity-20"
          style={{ backgroundColor: themeAccent.primary }}
        />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${themeAccent.textAccent}`}>
                Total Mining Portfolio
              </span>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                title={showBalance ? 'Hide balance' : 'Show balance'}
              >
                {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300 font-mono">
              <span
                className="w-2 h-2 rounded-full animate-ping inline-block"
                style={{ backgroundColor: themeAccent.primary }}
              />
              <span>Pool: Frankfurt 01</span>
            </div>
          </div>

          {/* Primary Balance Figures */}
          <div className="mt-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
            <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-mono">
              {showBalance ? `$${totalBalanceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '••••••••'}
            </div>
            <div className={`text-sm font-semibold ${themeAccent.textAccent} font-mono`}>
              {showBalance ? `≈ ${totalBtcEquivalent.toFixed(6)} BTC` : '•••••• BTC'}
            </div>
          </div>

          {/* Secondary Stats Grid with Color-Graded Micro-Badges */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 sm:gap-4 text-center sm:text-left">
            <div className="bg-slate-900/50 p-2.5 sm:p-3 rounded-2xl border border-slate-800/50 group hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                <GradientIcon icon={Sparkles} theme="emerald" size="xs" variant="glow" glow={false} />
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Today's Yield</span>
              </div>
              <span className={`text-xs sm:text-sm font-bold ${themeAccent.textAccent} font-mono mt-1 block`}>
                {showBalance ? `+$${miningSession.todayEstimatedRewardUSD.toFixed(2)}` : '••••'}
              </span>
              <span className="text-[10px] text-slate-500 font-mono block">
                {showBalance ? `${miningSession.todayEstimatedRewardCoin.toFixed(6)} BTC` : '••••'}
              </span>
            </div>

            <div className="bg-slate-900/50 p-2.5 sm:p-3 rounded-2xl border border-slate-800/50 group hover:border-amber-500/30 transition-colors">
              <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                <GradientIcon icon={Pickaxe} theme="gold" size="xs" variant="glow" glow={false} />
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Earnings</span>
              </div>
              <span className="text-xs sm:text-sm font-bold text-white font-mono mt-1 block">
                {showBalance ? `$${(miningSession.confirmedRewardCoin * btcRate).toFixed(2)}` : '••••'}
              </span>
              <span className="text-[10px] text-slate-500 font-mono block">
                {showBalance ? `${miningSession.confirmedRewardCoin.toFixed(6)} BTC` : '••••'}
              </span>
            </div>

            <div className="bg-slate-900/50 p-2.5 sm:p-3 rounded-2xl border border-slate-800/50 group hover:border-cyan-500/30 transition-colors">
              <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                <GradientIcon icon={TrendingUp} theme="cyan" size="xs" variant="glow" glow={false} />
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Weekly Run-Rate</span>
              </div>
              <span className="text-xs sm:text-sm font-bold text-cyan-400 font-mono mt-1 block">
                {showBalance ? `~$${(miningSession.todayEstimatedRewardUSD * 7).toFixed(2)}` : '••••'}
              </span>
              <span className="text-[10px] text-slate-500 font-mono block">7-day projection</span>
            </div>
          </div>

          {/* Balance Action Buttons with Color-Graded Icons */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => setDepositModalOpen(true)}
              className={`flex-1 py-2.5 px-4 rounded-xl ${themeAccent.btnPrimary} font-bold text-xs sm:text-sm transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 group`}
            >
              <ArrowDownLeft className="w-4 h-4 stroke-[2.5px] group-hover:-translate-y-0.5 transition-transform" />
              <span>Deposit Funds</span>
            </button>
            <button
              onClick={() => setWithdrawModalOpen(true)}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm border border-slate-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
            >
              <ArrowUpRight className="w-4 h-4 text-rose-400 stroke-[2.5px] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              <span>Withdraw</span>
            </button>
          </div>

          {/* Honest Demo Disclosure notice */}
          <div className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
            <span>
              Simulated cloud pool environment. Confirmed balances require backend node verification.
            </span>
          </div>
        </div>
      </div>

      {/* 3. MINING STATUS CARD */}
      <div className={`rounded-3xl p-5 sm:p-6 backdrop-blur-md relative overflow-hidden transition-all duration-300 ${
        miningSession.status === 'ACTIVE'
          ? 'border border-emerald-500/40 bg-slate-900/90 shadow-xl shadow-emerald-500/5'
          : 'border border-slate-800 bg-slate-900/80'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <GradientIcon
              icon={Cpu}
              theme={miningSession.status === 'ACTIVE' ? 'emerald' : 'amber'}
              size="lg"
              variant="boxed"
              glow={true}
              iconClassName={miningSession.status === 'ACTIVE' ? 'animate-pulse' : ''}
            />

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Subtle Radar Pulse Indicator */}
                <span className="relative flex h-3 w-3 items-center justify-center">
                  {miningSession.status === 'ACTIVE' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 transition-all ${
                    miningSession.status === 'ACTIVE'
                      ? 'bg-emerald-400 shadow-[0_0_10px_#10b981]'
                      : 'bg-amber-400 shadow-[0_0_8px_#f59e0b]'
                  }`} />
                </span>

                <span className="font-bold text-white text-sm">
                  {miningSession.status === 'ACTIVE' ? 'Cloud Rig Active' : 'Mining Standby'}
                </span>

                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                  {miningSession.algorithm}
                </span>

                {miningSession.status === 'ACTIVE' && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>LIVE HASHING</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Stratum: <span className="font-mono text-slate-200">{miningSession.poolName}</span>
              </p>
            </div>
          </div>

          {/* Start / Stop Toggle Button & View Mining Details */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMining}
              className={`py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95 ${
                miningSession.status === 'ACTIVE'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/25'
              }`}
            >
              {miningSession.status === 'ACTIVE' ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Mining</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Mining</span>
                </>
              )}
            </button>

            <button
              onClick={() => setActiveTab('mining')}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1"
            >
              <span>Rig Details</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Rig Telemetry Bar with Color-Graded Micro-Icons */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-800/80">
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 hover:border-amber-500/30 transition-colors">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <GradientIcon icon={Zap} theme="gold" size="xs" variant="glow" glow={false} />
              <span>Mining Speed</span>
            </div>
            <div className="text-base font-extrabold text-white font-mono mt-1 flex items-center gap-1.5">
              <span>{miningSession.status === 'ACTIVE' ? `${miningSession.hashrateTHs} TH/s` : '0.0 TH/s'}</span>
              {miningSession.status === 'ACTIVE' && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 hover:border-cyan-500/30 transition-colors">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <GradientIcon icon={Clock} theme="cyan" size="xs" variant="glow" glow={false} />
              <span>Active Duration</span>
            </div>
            <div className="text-base font-extrabold text-white font-mono mt-1">
              {miningSession.status === 'ACTIVE' ? formatDuration(miningSession.uptimeSeconds) : 'Idle'}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 hover:border-emerald-500/30 transition-colors">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <GradientIcon icon={Sparkles} theme="emerald" size="xs" variant="glow" glow={false} />
              <span>Est. Daily Yield</span>
            </div>
            <div className="text-base font-extrabold text-emerald-400 font-mono mt-1">
              ~${miningSession.todayEstimatedRewardUSD.toFixed(2)}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 hover:border-rose-500/30 transition-colors">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <GradientIcon icon={Cpu} theme="rose" size="xs" variant="glow" glow={false} />
              <span>Shares / Health</span>
            </div>
            <div className="text-base font-extrabold text-slate-200 font-mono mt-1">
              {miningSession.acceptedShares} / {miningSession.temperatureC}°C
            </div>
          </div>
        </div>
      </div>

      {/* 4. QUICK ACTIONS RESPONSIVE GRID (4 Distinct Shortcuts with Color Graded Icons) */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Quick Access
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Action 1: Wallet */}
          <button
            onClick={() => setActiveTab('wallet')}
            className="group p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-emerald-500/50 transition-all text-left shadow-lg active:scale-[0.98]"
          >
            <GradientIcon
              icon={Wallet}
              theme="emerald"
              size="md"
              variant="boxed"
              className="mb-3 group-hover:scale-110 transition-transform"
            />
            <span className="font-bold text-white text-sm block group-hover:text-emerald-400 transition-colors">
              Wallet
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Balances & transfers
            </span>
          </button>

          {/* Action 2: Mining */}
          <button
            onClick={() => setActiveTab('mining')}
            className="group p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-cyan-500/50 transition-all text-left shadow-lg active:scale-[0.98]"
          >
            <GradientIcon
              icon={Pickaxe}
              theme="cyan"
              size="md"
              variant="boxed"
              className="mb-3 group-hover:scale-110 transition-transform"
            />
            <span className="font-bold text-white text-sm block group-hover:text-cyan-400 transition-colors">
              Mining
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Hashrate & contracts
            </span>
          </button>

          {/* Action 3: Markets */}
          <button
            onClick={() => setActiveTab('markets')}
            className="group p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-blue-500/50 transition-all text-left shadow-lg active:scale-[0.98]"
          >
            <GradientIcon
              icon={TrendingUp}
              theme="blue"
              size="md"
              variant="boxed"
              className="mb-3 group-hover:scale-110 transition-transform"
            />
            <span className="font-bold text-white text-sm block group-hover:text-blue-400 transition-colors">
              Markets
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Live crypto quotes
            </span>
          </button>

          {/* Action 4: Earn */}
          <button
            onClick={() => setActiveTab('earn')}
            className="group p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-amber-500/50 transition-all text-left shadow-lg active:scale-[0.98]"
          >
            <GradientIcon
              icon={Gift}
              theme="flame"
              size="md"
              variant="boxed"
              className="mb-3 group-hover:scale-110 transition-transform"
            />
            <span className="font-bold text-white text-sm block group-hover:text-amber-400 transition-colors">
              Earn
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Streaks & bounties
            </span>
          </button>
        </div>
      </div>

      {/* 5. LIVE MARKET SNAPSHOT */}
      <div className="rounded-3xl p-5 border border-slate-800 bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Live Market Snapshot
            </h2>
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
              isMarketsLive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isMarketsLive ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
              {isMarketsLive ? 'Live Exchange Feed' : 'Cached Feed'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Refresh Quotes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingMarkets ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              onClick={() => setActiveTab('markets')}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3 Asset Selection Cards with Inline Sparklines */}
        {snapshotMarkets.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {snapshotMarkets.map((coin) => {
                const isPositive = coin.change24h >= 0;
                const isSelected = selectedChartAsset === coin.symbol;
                const sparklineData = coin.sparkline.map((val, i) => ({ price: val, idx: i }));

                return (
                  <div
                    key={coin.symbol}
                    onClick={() => setSelectedChartAsset(coin.symbol)}
                    className={`cursor-pointer p-3.5 rounded-2xl border transition-all flex items-center justify-between group ${
                      isSelected
                        ? `bg-slate-950 ${themeAccent.borderCard} shadow-md`
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CoinIcon symbol={coin.symbol} size="sm" glow={isSelected} />
                      <div>
                        <div className="font-bold text-white text-xs">{coin.symbol}/USDT</div>
                        <div className="text-[10px] text-slate-400">{coin.name}</div>
                      </div>
                    </div>

                    {/* Inline Mini Sparkline */}
                    <div className="w-16 h-8 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparklineData}>
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke={isPositive ? themeAccent.primary : '#f43f5e'}
                            strokeWidth={1.8}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-xs text-white">
                        ${coin.price.toLocaleString('en-US', { minimumFractionDigits: coin.price < 10 ? 4 : 2 })}
                      </div>
                      <div className={`text-[10px] font-mono font-semibold ${isPositive ? themeAccent.textAccent : 'text-rose-400'}`}>
                        {isPositive ? '+' : ''}{coin.change24h.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 7-Day Historical Trend Line Chart using Recharts */}
            {(() => {
              const activeCoin = snapshotMarkets.find((m) => m.symbol === selectedChartAsset) || snapshotMarkets[0];
              if (!activeCoin) return null;

              const days = ['7d ago', '6d ago', '5d ago', '4d ago', '3d ago', 'Yesterday', 'Today'];
              const chartData = activeCoin.sparkline.map((val, idx) => ({
                day: days[idx] || `D${idx + 1}`,
                price: val,
                formatted: `$${val.toLocaleString('en-US', { minimumFractionDigits: val < 10 ? 4 : 2 })}`,
              }));

              const firstPrice = activeCoin.sparkline[0] || activeCoin.price;
              const lastPrice = activeCoin.price;
              const change7dPercent = Number((((lastPrice - firstPrice) / firstPrice) * 100).toFixed(2));
              const is7dPositive = change7dPercent >= 0;
              const high7d = Math.max(...activeCoin.sparkline);
              const low7d = Math.min(...activeCoin.sparkline);
              const strokeColor = is7dPositive ? themeAccent.primary : '#f43f5e';
              const gradientId = `gradient-${activeCoin.symbol}-${accentTheme}`;

              return (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: themeAccent.primary }} />
                      <h3 className="text-xs font-bold text-white">
                        {activeCoin.name} ({activeCoin.symbol}/USDT) • 7-Day Price Trend
                      </h3>
                      <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                        is7dPositive
                          ? themeAccent.badgeBg
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {is7dPositive ? '+' : ''}{change7dPercent}% 7D
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
                      <span>7D High: <strong className="text-slate-200">${high7d.toLocaleString()}</strong></span>
                      <span>7D Low: <strong className="text-slate-200">${low7d.toLocaleString()}</strong></span>
                    </div>
                  </div>

                  <div className="w-full h-32 pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="day"
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                          axisLine={{ stroke: '#1e293b' }}
                        />
                        <YAxis domain={['auto', 'auto']} hide={true} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const dataPoint = payload[0].payload;
                              return (
                                <div className="p-2 rounded-xl bg-slate-900 border border-slate-700 shadow-xl text-xs backdrop-blur-md">
                                  <p className="text-[10px] text-slate-400 font-mono">{dataPoint.day}</p>
                                  <p className="font-mono font-bold text-white mt-0.5">{dataPoint.formatted}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke={strokeColor}
                          strokeWidth={2}
                          fillOpacity={1}
                          fill={`url(#${gradientId})`}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-500">
            Loading cryptocurrency market quotes...
          </div>
        )}
      </div>

      {/* 6. RECENT TRANSACTIONS */}
      <div className="rounded-3xl p-5 border border-slate-800 bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Recent Transactions
            </h2>
            <p className="text-[11px] text-slate-500">Latest pool payouts and wallet activity</p>
          </div>
          <button
            onClick={() => setActiveTab('wallet')}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
          >
            <span>History</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {transactions.length > 0 ? (
          <div className="space-y-2.5">
            {transactions.slice(0, 4).map((tx) => {
              const isPositive = ['DEPOSIT', 'MINING_PAYOUT', 'REFERRAL_BONUS', 'TASK_REWARD'].includes(tx.type);
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-emerald-500/40 hover:bg-slate-950 cursor-pointer flex items-center justify-between gap-3 transition-all active:scale-[0.99] group overflow-hidden"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {tx.type === 'MINING_PAYOUT' && <GradientIcon icon={Pickaxe} theme="gold" size="sm" variant="boxed" />}
                    {tx.type === 'DEPOSIT' && <GradientIcon icon={ArrowDownLeft} theme="emerald" size="sm" variant="boxed" />}
                    {tx.type === 'WITHDRAWAL' && <GradientIcon icon={ArrowUpRight} theme="rose" size="sm" variant="boxed" />}
                    {tx.type === 'REFERRAL_BONUS' && <GradientIcon icon={Gift} theme="violet" size="sm" variant="boxed" />}
                    {tx.type === 'TASK_REWARD' && <GradientIcon icon={Sparkles} theme="cyan" size="sm" variant="boxed" />}

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate group-hover:text-emerald-300 transition-colors">
                        {tx.note || tx.type.replace('_', ' ')}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                        {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(tx.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`font-mono font-bold text-xs ${isPositive ? 'text-emerald-400' : 'text-slate-200'}`}>
                      {isPositive ? '+' : '-'}{tx.amount} {tx.asset}
                    </div>
                    <div className="text-[10px] mt-0.5">
                      <span className={`px-2 py-0.5 rounded-full font-mono font-semibold inline-block ${
                        tx.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : tx.status === 'PENDING_CONFIRMATION' || tx.status === 'PENDING_REVIEW'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {tx.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800/50">
            No recent activity recorded yet. Start cloud mining to begin earning share rewards.
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-white text-base">Transaction Receipt</h3>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-slate-400 block text-[11px]">Recorded Amount</span>
                <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block">
                  {selectedTx.amount} {selectedTx.asset}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  ≈ ${selectedTx.amountUSD.toFixed(2)} USD
                </span>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Transaction ID:</span>
                  <span className="font-mono text-slate-200 font-semibold">{selectedTx.id}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-mono text-emerald-400 font-bold">{selectedTx.status}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Category:</span>
                  <span className="text-slate-200">{selectedTx.type.replace('_', ' ')}</span>
                </div>

                {selectedTx.note && (
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Description:</span>
                    <span className="text-slate-300 text-right">{selectedTx.note}</span>
                  </div>
                )}

                {selectedTx.txHash && (
                  <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Tx Hash:</span>
                    <div className="flex items-center gap-1 font-mono text-cyan-400">
                      <span className="truncate max-w-[150px]">{selectedTx.txHash}</span>
                      <button
                        onClick={() => {
                          if (selectedTx.txHash) {
                            navigator.clipboard.writeText(selectedTx.txHash);
                            setCopiedTx(true);
                            addToast('TxID Copied', 'Transaction hash copied to clipboard.', 'success');
                            setTimeout(() => setCopiedTx(false), 2000);
                          }
                        }}
                        className="p-1 hover:text-white"
                        title="Copy Tx Hash"
                      >
                        {copiedTx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Recorded Time:</span>
                  <span className="font-mono text-slate-300">
                    {new Date(selectedTx.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedTx(null)}
                className="w-full mt-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Modals */}
      <NotificationDrawer isOpen={notificationOpen} onClose={() => setNotificationOpen(false)} />
      <DepositModal isOpen={depositModalOpen} onClose={() => setDepositModalOpen(false)} />
      <WithdrawModal isOpen={withdrawModalOpen} onClose={() => setWithdrawModalOpen(false)} />
      <PlanModal isOpen={planModalOpen} onClose={() => setPlanModalOpen(false)} />
    </div>
  );
};
