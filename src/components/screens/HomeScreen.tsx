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
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { Transaction } from '../../types';
import { NotificationDrawer } from '../modals/NotificationDrawer';
import { DepositModal } from '../modals/DepositModal';
import { WithdrawModal } from '../modals/WithdrawModal';
import { PlanModal } from '../modals/PlanModal';
import { GradientIcon } from '../ui/GradientIcon';
import { CoinIcon } from '../ui/CoinIcon';
import { CandlestickChart } from '../ui/CandlestickChart';
import { formatCryptoPrice, formatCompactVolume } from '../../services/marketService';

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
    marketConnectionStatus,
    marketError,
    refreshMarkets,
    openAuthModal,
    addToast,
    dailyStreakRecord,
    dailyRewards,
    claimDailyReward,
  } = useApp();

  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [notificationOpen, setNotificationOpen] = useState<boolean>(false);
  const [depositModalOpen, setDepositModalOpen] = useState<boolean>(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState<boolean>(false);
  const [planModalOpen, setPlanModalOpen] = useState<boolean>(false);
  const [refreshingMarkets, setRefreshingMarkets] = useState<boolean>(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);
  const [selectedChartAsset, setSelectedChartAsset] = useState<string>('BTC');
  const [claimingDaily, setClaimingDaily] = useState(false);

  // Calculate available, locked, and total portfolio balance in USD from wallet assets
  const availableBalanceUSD = walletAssets.reduce((acc, curr) => {
    return acc + curr.balance * curr.usdRate;
  }, 0);

  const totalLockedUSD = walletAssets.reduce((acc, curr) => {
    return acc + curr.lockedBalance * curr.usdRate;
  }, 0);

  const totalBalanceUSD = availableBalanceUSD + totalLockedUSD;

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

  const handleQuickDailyClaim = async () => {
    const todayReward = dailyRewards.find((r) => r.isToday && !r.isClaimed);
    if (!todayReward) {
      addToast('Daily Streak Status', 'Today’s check-in has already been recorded.', 'info');
      return;
    }

    setClaimingDaily(true);
    try {
      await claimDailyReward(todayReward.day);
    } finally {
      setClaimingDaily(false);
    }
  };

  // Filter snapshot markets (BTC, ETH, BNB, SOL)
  const snapshotMarkets = markets.filter((m) => ['BTC', 'ETH', 'BNB', 'SOL'].includes(m.symbol));
  const todayRewardItem = dailyRewards.find((r) => r.isToday);
  const isClaimedToday = dailyStreakRecord?.lastClaimDate === new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 px-2 sm:px-4 pt-1 animate-in fade-in duration-300">
      {/* 1. HEADER SECTION */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (user ? setActiveTab('profile') : openAuthModal('login'))}
            className="relative group transition-transform active:scale-95"
            aria-label="User Profile"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#00D6A3] to-[#25B9F3] p-0.5 shadow-sm">
              <div className="w-full h-full bg-[#0D121C] rounded-[14px] flex items-center justify-center overflow-hidden">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <Pickaxe className="w-6 h-6 text-[#00D6A3]" />
                )}
              </div>
            </div>
            {user?.isEmailVerified && (
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[#080B12] bg-[#00D6A3] flex items-center justify-center">
                <ShieldCheck className="w-2.5 h-2.5 text-[#080B12] stroke-[3]" />
              </span>
            )}
          </button>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-[#98A6BA]">
                {getGreeting()},
              </span>
              <span className="text-xs font-bold text-[#F4F7FC]">
                {user ? (user.displayName || user.email.split('@')[0]) : 'Miner Guest'}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#F4F7FC] tracking-tight flex items-center gap-2">
              NEXORA <span className="text-[#00D6A3]">MINE</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
                PRO POOL
              </span>
            </h1>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNotificationOpen(true)}
            className="relative p-2.5 rounded-xl bg-[#121925] border border-[#253144] hover:border-[#36465D] text-[#98A6BA] hover:text-[#F4F7FC] transition-all active:scale-95 shadow-xs"
            aria-label="Open Notifications"
          >
            <Bell className="w-5 h-5 text-[#F4F7FC]" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#00D6A3]" />
          </button>
        </div>
      </div>

      {/* 2. TOTAL MINING BALANCE CARD (Premium Dark Charcoal & Emerald Glow Hero) */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-[#121925] via-[#102324] to-[#121925] border border-[#00D6A3]/30 text-[#F4F7FC] shadow-2xl glow-card">
        {/* Subtle decorative mesh background */}
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-[#00D6A3]/10 blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-[#25B9F3]/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#98A6BA]">
                Total Mining Portfolio
              </span>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="text-[#98A6BA] hover:text-[#F4F7FC] p-1 rounded-lg transition-colors"
                title={showBalance ? 'Hide balance' : 'Show balance'}
              >
                {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#182232] border border-[#253144] text-[11px] text-[#00D6A3] font-mono">
              <span className="w-2 h-2 rounded-full bg-[#00D6A3] animate-pulse inline-block" />
              <span>Pool: Frankfurt 01</span>
            </div>
          </div>

          {/* Primary Balance Figures */}
          <div className="mt-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
            <div className="text-3xl sm:text-4xl font-extrabold text-[#F4F7FC] tracking-tight font-mono">
              {showBalance ? `$${totalBalanceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '••••••••'}
            </div>
            <div className="text-sm font-semibold text-[#98A6BA] font-mono">
              {showBalance ? `≈ ${totalBtcEquivalent.toFixed(6)} BTC` : '•••••• BTC'}
            </div>
          </div>

          {/* Separate Labels for Available, Pending/Locked, and Simulated Earnings */}
          <div className="mt-4 pt-4 border-t border-[#253144] grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            <div className="bg-[#0D121C]/80 p-3 rounded-2xl border border-[#253144]">
              <span className="text-[10px] text-[#98A6BA] uppercase font-semibold block">Available Funds</span>
              <span className="text-xs sm:text-sm font-bold text-[#F4F7FC] font-mono mt-0.5 block">
                {showBalance ? `$${availableBalanceUSD.toFixed(2)}` : '••••'}
              </span>
              <span className="text-[10px] text-[#98A6BA] block">Ready for transfer</span>
            </div>

            <div className="bg-[#0D121C]/80 p-3 rounded-2xl border border-[#253144]">
              <span className="text-[10px] text-[#98A6BA] uppercase font-semibold block">Pending / In Review</span>
              <span className="text-xs sm:text-sm font-bold text-[#F3B64B] font-mono mt-0.5 block">
                {showBalance ? `$${totalLockedUSD.toFixed(2)}` : '••••'}
              </span>
              <span className="text-[10px] text-[#98A6BA] block">Escrow & verification</span>
            </div>

            <div className="bg-[#0D121C]/80 p-3 rounded-2xl border border-[#253144]">
              <span className="text-[10px] text-[#98A6BA] uppercase font-semibold block">Today's Simulated Yield</span>
              <span className="text-xs sm:text-sm font-bold text-[#00D6A3] font-mono mt-0.5 block">
                {showBalance ? `+$${miningSession.todayEstimatedRewardUSD.toFixed(2)}` : '••••'}
              </span>
              <span className="text-[10px] text-[#98A6BA] block">Simulated telemetry</span>
            </div>
          </div>

          {/* Balance Action Buttons */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => {
                if (!user) {
                  openAuthModal('login');
                  addToast('Sign In Required', 'Please sign in or enter Sandbox Demo Mode to deposit funds.', 'warning');
                  return;
                }
                setDepositModalOpen(true);
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#00D6A3] text-[#080B12] hover:bg-[#19C784] font-bold text-xs sm:text-sm transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 group"
            >
              <ArrowDownLeft className="w-4 h-4 stroke-[2.5px] group-hover:-translate-y-0.5 transition-transform" />
              <span>Deposit Funds</span>
            </button>
            <button
              onClick={() => {
                if (!user) {
                  openAuthModal('login');
                  addToast('Sign In Required', 'Please sign in or enter Sandbox Demo Mode to withdraw funds.', 'warning');
                  return;
                }
                setWithdrawModalOpen(true);
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] font-bold text-xs sm:text-sm border border-[#253144] transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
            >
              <ArrowUpRight className="w-4 h-4 text-[#00D6A3] stroke-[2.5px] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              <span>Withdraw</span>
            </button>
          </div>

          {/* Honest Simulation Disclosure */}
          <div className="mt-4 flex items-center gap-1.5 text-[10px] text-[#98A6BA]">
            <Info className="w-3.5 h-3.5 text-[#00D6A3] shrink-0" />
            <span>
              Simulated cloud pool environment. Confirmed balances require backend node verification.
            </span>
          </div>
        </div>
      </div>

      {/* 3. MINING STATUS & DAILY REWARD CARDS (2-Column Grid on Tablet/Desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Mining Status Card (Spans 2 cols on lg) */}
        <div className="lg:col-span-2 rounded-3xl p-5 sm:p-6 bg-[#121925] border border-[#253144] shadow-xl relative overflow-hidden transition-all duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <GradientIcon
                icon={Cpu}
                theme={miningSession.status === 'ACTIVE' ? 'emerald' : 'amber'}
                size="lg"
                variant="boxed"
                glow={false}
              />

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Subtle Radar Pulse Indicator */}
                  <span className="relative flex h-3 w-3 items-center justify-center">
                    {miningSession.status === 'ACTIVE' && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00D6A3] opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 transition-all ${
                      miningSession.status === 'ACTIVE'
                        ? 'bg-[#00D6A3] shadow-[0_0_8px_#00D6A3]'
                        : 'bg-[#F3B64B] shadow-[0_0_8px_#F3B64B]'
                    }`} />
                  </span>

                  <span className="font-bold text-[#F4F7FC] text-sm">
                    {miningSession.status === 'ACTIVE' ? 'Cloud Rig Active' : 'Mining Standby'}
                  </span>

                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#0D121C] border border-[#253144] text-[#98A6BA]">
                    {miningSession.algorithm}
                  </span>

                  {miningSession.status === 'ACTIVE' && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00D6A3] animate-pulse" />
                      <span>LIVE HASHING</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#98A6BA] mt-1">
                  Stratum Pool: <span className="font-mono text-[#F4F7FC] font-semibold">{miningSession.poolName}</span>
                </p>
              </div>
            </div>

            {/* Start / Pause Toggle Button */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMining}
                className={`py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-sm ${
                  miningSession.status === 'ACTIVE'
                    ? 'bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30 hover:bg-[#F3B64B]/25'
                    : 'bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12]'
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
                className="py-2 px-3 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] text-xs font-semibold border border-[#253144] transition-colors flex items-center gap-1"
              >
                <span>Rig Telemetry</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Live Rig Telemetry Bar */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#253144]">
            <div className="p-2.5 rounded-2xl bg-[#0D121C] border border-[#253144]">
              <div className="flex items-center gap-1.5 text-[#98A6BA] text-[11px]">
                <Zap className="w-3.5 h-3.5 text-[#00D6A3]" />
                <span>Mining Speed</span>
              </div>
              <div className="text-base font-extrabold text-[#F4F7FC] font-mono mt-1 flex items-center gap-1.5">
                <span>
                  {miningSession.status === 'ACTIVE'
                    ? `${
                        typeof miningSession.hashrateGHs === 'number' && miningSession.hashrateGHs > 0
                          ? miningSession.hashrateGHs
                          : Number((miningSession.hashrateTHs * 1000).toFixed(2))
                      } GH/s`
                    : '0.0 GH/s'}
                </span>
                {miningSession.status === 'ACTIVE' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D6A3] animate-pulse" />
                )}
              </div>
            </div>

            <div className="p-2.5 rounded-2xl bg-[#0D121C] border border-[#253144]">
              <div className="flex items-center gap-1.5 text-[#98A6BA] text-[11px]">
                <Clock className="w-3.5 h-3.5 text-[#25B9F3]" />
                <span>Active Duration</span>
              </div>
              <div className="text-base font-extrabold text-[#F4F7FC] font-mono mt-1">
                {miningSession.status === 'ACTIVE' ? formatDuration(miningSession.uptimeSeconds) : 'Idle'}
              </div>
            </div>

            <div className="p-2.5 rounded-2xl bg-[#0D121C] border border-[#253144]">
              <div className="flex items-center gap-1.5 text-[#98A6BA] text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-[#00D6A3]" />
                <span>Est. Daily Yield</span>
              </div>
              <div className="text-base font-extrabold text-[#00D6A3] font-mono mt-1">
                ~${miningSession.todayEstimatedRewardUSD.toFixed(2)}
              </div>
            </div>

            <div className="p-2.5 rounded-2xl bg-[#0D121C] border border-[#253144]">
              <div className="flex items-center gap-1.5 text-[#98A6BA] text-[11px]">
                <Cpu className="w-3.5 h-3.5 text-[#FF647C]" />
                <span>Shares / Health</span>
              </div>
              <div className="text-base font-extrabold text-[#F4F7FC] font-mono mt-1">
                {miningSession.acceptedShares} / {miningSession.temperatureC}°C
              </div>
            </div>
          </div>
        </div>

        {/* Daily Streak Check-in Quick Card (1 col on lg) */}
        <div className="rounded-3xl p-5 bg-[#121925] border border-[#253144] shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#253144]">
              <div className="flex items-center gap-2">
                <GradientIcon icon={Calendar} theme="amber" size="sm" variant="boxed" />
                <div>
                  <h3 className="text-xs font-bold text-[#F4F7FC]">Daily Check-in</h3>
                  <span className="text-[10px] text-[#98A6BA]">7-Day Streak Bonus</span>
                </div>
              </div>

              <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
                {dailyStreakRecord?.currentStreak || 0}/7 Days
              </span>
            </div>

            <div className="mt-3">
              <p className="text-xs text-[#98A6BA] leading-relaxed">
                Log in daily to claim cloud hash power credits and boost your stratum shares.
              </p>

              <div className="mt-3 p-3 rounded-2xl bg-[#0D121C] border border-[#253144] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[#98A6BA] uppercase font-semibold block">Today's Reward</span>
                  <span className="text-sm font-extrabold text-[#00D6A3] font-mono mt-0.5 block">
                    +${(todayRewardItem?.rewardUSD || 1.0).toFixed(2)} USDT
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isClaimedToday
                      ? dailyStreakRecord?.claimStatus === 'PENDING_VERIFICATION'
                        ? 'bg-[#F3B64B]/10 text-[#F3B64B] border border-[#F3B64B]/30'
                        : 'bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30'
                      : 'bg-[#F3B64B]/10 text-[#F3B64B] border border-[#F3B64B]/30'
                  }`}>
                    {isClaimedToday
                      ? dailyStreakRecord?.claimStatus === 'PENDING_VERIFICATION'
                        ? 'Pending Verification'
                        : 'Approved & Credited'
                      : 'Ready to Claim'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-2">
            <button
              onClick={isClaimedToday ? () => setActiveTab('earn') : handleQuickDailyClaim}
              disabled={claimingDaily}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 ${
                isClaimedToday
                  ? 'bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] border border-[#253144]'
                  : 'bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12]'
              }`}
            >
              {isClaimedToday ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#00D6A3]" />
                  <span>View Streak Calendar</span>
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4" />
                  <span>{claimingDaily ? 'Recording Claim...' : 'Claim Today’s Bonus'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 4. QUICK ACTIONS RESPONSIVE GRID (4 Distinct Shortcuts) */}
      <div>
        <h2 className="text-xs font-bold text-[#98A6BA] uppercase tracking-wider mb-3">
          Quick Access
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Action 1: Wallet */}
          <button
            onClick={() => setActiveTab('wallet')}
            className="group p-4 rounded-2xl bg-[#121925] border border-[#253144] hover:border-[#00D6A3]/50 hover:bg-[#182232] transition-all text-left shadow-lg active:scale-[0.98]"
          >
            <GradientIcon
              icon={Wallet}
              theme="emerald"
              size="md"
              variant="boxed"
              className="mb-3 group-hover:scale-110 transition-transform"
            />
            <span className="font-bold text-[#F4F7FC] text-sm block group-hover:text-[#00D6A3] transition-colors">
              Wallet
            </span>
            <span className="text-[11px] text-[#98A6BA] block mt-0.5">
              Balances & transfers
            </span>
          </button>

          {/* Action 2: Mining */}
          <button
            onClick={() => setActiveTab('mining')}
            className="group p-4 rounded-2xl bg-[#121925] border border-[#253144] hover:border-[#25B9F3]/50 hover:bg-[#182232] transition-all text-left shadow-lg active:scale-[0.98]"
          >
            <GradientIcon
              icon={Pickaxe}
              theme="cyan"
              size="md"
              variant="boxed"
              className="mb-3 group-hover:scale-110 transition-transform"
            />
            <span className="font-bold text-[#F4F7FC] text-sm block group-hover:text-[#25B9F3] transition-colors">
              Mining
            </span>
            <span className="text-[11px] text-[#98A6BA] block mt-0.5">
              Hashrate & contracts
            </span>
          </button>

          {/* Action 3: Markets */}
          <button
            onClick={() => setActiveTab('markets')}
            className="group p-4 rounded-2xl bg-[#121925] border border-[#253144] hover:border-indigo-400/50 hover:bg-[#182232] transition-all text-left shadow-lg active:scale-[0.98]"
          >
            <GradientIcon
              icon={TrendingUp}
              theme="violet"
              size="md"
              variant="boxed"
              className="mb-3 group-hover:scale-110 transition-transform"
            />
            <span className="font-bold text-[#F4F7FC] text-sm block group-hover:text-[#8B5CF6] transition-colors">
              Markets
            </span>
            <span className="text-[11px] text-[#98A6BA] block mt-0.5">
              Live crypto quotes
            </span>
          </button>

          {/* Action 4: Earn */}
          <button
            onClick={() => setActiveTab('earn')}
            className="group p-4 rounded-2xl bg-[#121925] border border-[#253144] hover:border-amber-400/50 hover:bg-[#182232] transition-all text-left shadow-lg active:scale-[0.98]"
          >
            <GradientIcon
              icon={Gift}
              theme="amber"
              size="md"
              variant="boxed"
              className="mb-3 group-hover:scale-110 transition-transform"
            />
            <span className="font-bold text-[#F4F7FC] text-sm block group-hover:text-[#F3B64B] transition-colors">
              Earn
            </span>
            <span className="text-[11px] text-[#98A6BA] block mt-0.5">
              Streaks & bounties
            </span>
          </button>
        </div>
      </div>

      {/* 5. LIVE MARKET SNAPSHOT (Real-Time Binance Spot Tickers + Candlestick Chart) */}
      <div className="rounded-3xl p-5 border border-[#253144] bg-[#121925] shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-[#98A6BA] uppercase tracking-wider">
              Binance Spot Market Snapshot
            </h2>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
                marketConnectionStatus === 'CONNECTED'
                  ? 'bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30'
                  : isMarketsLive
                  ? 'bg-[#25B9F3]/10 text-[#25B9F3] border border-[#25B9F3]/30'
                  : 'bg-[#FF647C]/10 text-[#FF647C] border border-[#FF647C]/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  marketConnectionStatus === 'CONNECTED'
                    ? 'bg-[#00D6A3] animate-pulse'
                    : isMarketsLive
                    ? 'bg-[#25B9F3]'
                    : 'bg-[#FF647C]'
                }`}
              />
              {marketConnectionStatus === 'CONNECTED'
                ? 'WS Live'
                : isMarketsLive
                ? 'REST Live'
                : 'Reconnecting'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
              title="Refresh Quotes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingMarkets ? 'animate-spin text-[#00D6A3]' : ''}`} />
            </button>
            <button
              onClick={() => setActiveTab('markets')}
              className="text-xs font-semibold text-[#00D6A3] hover:underline flex items-center gap-0.5"
            >
              <span>Full Terminal</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4 Asset Selection Cards with Real-Time Binance 24h Range & Volume */}
        {snapshotMarkets.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {snapshotMarkets.map((coin) => {
                const isPositive = coin.change24h >= 0;
                const isSelected = selectedChartAsset === coin.symbol;

                return (
                  <div
                    key={coin.pair}
                    onClick={() => setSelectedChartAsset(coin.symbol)}
                    className={`cursor-pointer p-3.5 rounded-2xl border transition-all flex items-center justify-between group ${
                      isSelected
                        ? 'bg-[#182232] border-[#00D6A3] shadow-md'
                        : 'bg-[#0D121C] border-[#253144] hover:border-[#36465D]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CoinIcon symbol={coin.symbol} size="sm" glow={isSelected} />
                      <div>
                        <div className="font-bold text-[#F4F7FC] text-xs">{coin.displayPair}</div>
                        <div className="text-[10px] text-[#98A6BA] font-mono">
                          Vol {formatCompactVolume(coin.volume24h, '$')}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-mono font-bold text-xs transition-colors ${
                          coin.tickDirection === 'up'
                            ? 'text-[#19C784]'
                            : coin.tickDirection === 'down'
                            ? 'text-[#FF647C]'
                            : 'text-[#F4F7FC]'
                        }`}
                      >
                        ${formatCryptoPrice(coin.price)}
                      </div>
                      <div
                        className={`text-[10px] font-mono font-semibold ${
                          isPositive ? 'text-[#19C784]' : 'text-[#FF647C]'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {coin.change24h.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Interactive Real-Time Candlestick Chart for Selected Snapshot Coin */}
            {(() => {
              const activeCoin =
                snapshotMarkets.find((m) => m.symbol === selectedChartAsset) || snapshotMarkets[0];
              if (!activeCoin) return null;

              return (
                <CandlestickChart
                  pair={activeCoin.pair}
                  symbol={activeCoin.symbol}
                  defaultInterval="1h"
                  height={280}
                  compact={true}
                  onExpandClick={() => setActiveTab('markets')}
                />
              );
            })()}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-[#98A6BA] space-y-2">
            <p>
              {marketError
                ? `Binance market feed error: ${marketError}`
                : 'Connecting to Binance Spot market stream...'}
            </p>
            {marketError && (
              <button
                onClick={handleManualRefresh}
                className="px-3 py-1.5 rounded-xl bg-[#00D6A3] text-[#080B12] font-bold text-xs inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 6. RECENT TRANSACTIONS */}
      <div className="rounded-3xl p-5 border border-[#253144] bg-[#121925] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-bold text-[#98A6BA] uppercase tracking-wider">
              Recent Transactions
            </h2>
            <p className="text-[11px] text-[#98A6BA]">Latest pool payouts and wallet activity</p>
          </div>
          <button
            onClick={() => setActiveTab('wallet')}
            className="text-xs font-semibold text-[#00D6A3] hover:underline flex items-center gap-0.5"
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
                  className="p-3.5 rounded-2xl bg-[#0D121C] border border-[#253144] hover:border-[#00D6A3]/40 hover:bg-[#182232] cursor-pointer flex items-center justify-between gap-3 transition-all active:scale-[0.99] group overflow-hidden shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {tx.type === 'MINING_PAYOUT' && <GradientIcon icon={Pickaxe} theme="gold" size="sm" variant="boxed" />}
                    {tx.type === 'DEPOSIT' && <GradientIcon icon={ArrowDownLeft} theme="emerald" size="sm" variant="boxed" />}
                    {tx.type === 'WITHDRAWAL' && <GradientIcon icon={ArrowUpRight} theme="rose" size="sm" variant="boxed" />}
                    {tx.type === 'REFERRAL_BONUS' && <GradientIcon icon={Gift} theme="violet" size="sm" variant="boxed" />}
                    {tx.type === 'TASK_REWARD' && <GradientIcon icon={Sparkles} theme="cyan" size="sm" variant="boxed" />}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#F4F7FC] truncate group-hover:text-[#00D6A3] transition-colors">
                          {tx.note || tx.type.replace('_', ' ')}
                        </span>
                        {tx.isDemo && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                            DEMO
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#98A6BA] font-mono mt-0.5 truncate">
                        {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(tx.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`font-mono font-bold text-xs ${isPositive ? 'text-[#19C784]' : 'text-[#F4F7FC]'}`}>
                      {isPositive ? '+' : '-'}{tx.amount} {tx.asset}
                    </div>
                    <div className="text-[10px] mt-0.5">
                      <span className={`px-2 py-0.5 rounded-full font-mono font-semibold inline-block ${
                        tx.status === 'COMPLETED'
                          ? 'bg-[#19C784]/15 text-[#19C784] border border-[#19C784]/30'
                          : tx.status === 'PENDING_CONFIRMATION' || tx.status === 'PENDING_REVIEW'
                          ? 'bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30'
                          : tx.status === 'REJECTED' || tx.status === 'FAILED'
                          ? 'bg-[#FF647C]/15 text-[#FF647C] border border-[#FF647C]/30'
                          : 'bg-[#182232] text-[#98A6BA] border border-[#253144]'
                      }`}>
                        {tx.status === 'COMPLETED'
                          ? tx.type === 'WITHDRAWAL'
                            ? 'Paid & Settled'
                            : 'Approved & Credited'
                          : tx.status === 'REJECTED'
                          ? tx.type === 'WITHDRAWAL' && tx.refunded
                            ? 'Rejected • Refunded'
                            : 'Rejected'
                          : tx.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-[#98A6BA] bg-[#0D121C] rounded-2xl border border-[#253144]">
            No recent activity recorded yet. Start cloud mining to begin earning share rewards.
          </div>
        )}
      </div>

      {/* Transaction Details Modal in Dark Theme */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-[#121925] border border-[#253144] rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#253144]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00D6A3]/10 border border-[#00D6A3]/30 flex items-center justify-center text-[#00D6A3]">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-[#F4F7FC] text-base">Transaction Receipt</h3>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-4 rounded-2xl bg-[#0D121C] border border-[#253144] text-center">
                <span className="text-[#98A6BA] block text-[11px]">Recorded Amount</span>
                <span className="text-2xl font-black font-mono text-[#F4F7FC] mt-1 block">
                  {selectedTx.amount} {selectedTx.asset}
                </span>
                <span className="text-[11px] text-[#98A6BA] font-mono">
                  ≈ ${selectedTx.amountUSD.toFixed(2)} USD
                </span>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex justify-between py-1.5 border-b border-[#253144]">
                  <span className="text-[#98A6BA]">Transaction ID:</span>
                  <span className="font-mono text-[#F4F7FC] font-semibold">{selectedTx.id}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-[#253144]">
                  <span className="text-[#98A6BA]">Status:</span>
                  <span className="font-mono text-[#00D6A3] font-bold">{selectedTx.status}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-[#253144]">
                  <span className="text-[#98A6BA]">Category:</span>
                  <span className="text-[#F4F7FC]">{selectedTx.type.replace('_', ' ')}</span>
                </div>

                {selectedTx.note && (
                  <div className="flex justify-between py-1.5 border-b border-[#253144]">
                    <span className="text-[#98A6BA]">Description:</span>
                    <span className="text-[#F4F7FC] text-right">{selectedTx.note}</span>
                  </div>
                )}

                {selectedTx.txHash && (
                  <div className="flex items-center justify-between py-1.5 border-b border-[#253144]">
                    <span className="text-[#98A6BA]">Tx Hash:</span>
                    <div className="flex items-center gap-1 font-mono text-[#00D6A3]">
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
                        {copiedTx ? <Check className="w-3.5 h-3.5 text-[#19C784]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-between py-1.5">
                  <span className="text-[#98A6BA]">Recorded Time:</span>
                  <span className="font-mono text-[#F4F7FC]">
                    {new Date(selectedTx.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedTx(null)}
                className="w-full mt-4 py-2.5 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] border border-[#253144] font-bold text-xs transition-colors"
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
