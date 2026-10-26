import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Cpu,
  Zap,
  Thermometer,
  Clock,
  Play,
  Pause,
  Sliders,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Server,
  Layers,
  Activity,
  Info,
  XCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
  Calendar,
  Hash,
  FileText,
  X,
  ArrowUpRight,
  Lock,
} from 'lucide-react';
import { MINING_PLANS, resolveSessionHashrateGHs, convertGHsToMHs } from '../../services/miningService';
import { DepositModal } from '../modals/DepositModal';
import { PlanModal } from '../modals/PlanModal';
import { GradientIcon } from '../ui/GradientIcon';
import { MiningContract, MiningPlan } from '../../types';

export const MiningScreen: React.FC = () => {
  const {
    user,
    miningSession,
    userContracts,
    isOfflineCache,
    toggleMining,
    setHardwareProfile,
    markets,
    walletAssets,
    submitPlanOrder,
    openAuthModal,
  } = useApp();

  const [selectedPlanForModal, setSelectedPlanForModal] = useState<string | null>(null);
  const [inspectContract, setInspectContract] = useState<MiningContract | null>(null);
  const [depositModalOpen, setDepositModalOpen] = useState<boolean>(false);

  // Per-plan direct purchase states & idempotency keys
  const [purchasingPlanId, setPurchasingPlanId] = useState<string | null>(null);
  const [planIdempotencyKeys, setPlanIdempotencyKeys] = useState<Record<string, string>>({});
  const [purchaseFeedback, setPurchaseFeedback] = useState<{
    planId: string;
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Live session uptime counter derived from startedAt or uptimeSeconds
  const [liveUptimeSeconds, setLiveUptimeSeconds] = useState<number>(miningSession.uptimeSeconds || 0);

  useEffect(() => {
    setLiveUptimeSeconds(miningSession.uptimeSeconds || 0);
  }, [miningSession.uptimeSeconds]);

  useEffect(() => {
    if (miningSession.status !== 'ACTIVE') return;
    const interval = setInterval(() => {
      setLiveUptimeSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [miningSession.status]);

  // Available USDT balance (server-confirmed when online)
  const usdtAsset = walletAssets.find((a) => a.symbol === 'USDT');
  const availableUSDT = usdtAsset ? usdtAsset.balance : 0;

  // Active contracts & primary active contract
  const activeContracts = userContracts.filter((c) => c.status === 'ACTIVE');
  const primaryActiveContract =
    activeContracts.find((c) => c.id === miningSession.activeContractId) ||
    activeContracts[0] ||
    null;

  // Effective hashrate in GH/s and converted units (1 TH/s = 1,000 GH/s, 1 GH/s = 1,000 MH/s)
  const totalContractGHs = activeContracts.reduce(
    (sum, c) => sum + (typeof c.hashrateGHs === 'number' ? c.hashrateGHs : c.hashrate),
    0
  );
  const effectiveSessionGHs = resolveSessionHashrateGHs(miningSession, userContracts);
  const displayHashrateGHs =
    miningSession.status === 'ACTIVE'
      ? effectiveSessionGHs
      : totalContractGHs > 0
      ? totalContractGHs
      : effectiveSessionGHs;
  const displayHashrateTHs = Number((displayHashrateGHs / 1000).toFixed(4));
  const displayHashrateMHs = convertGHsToMHs(displayHashrateGHs);

  // Gauge progress (max scale 300 GH/s for visual analog dial, clamped 0..100%)
  const maxGaugeScaleGHs = Math.max(300, displayHashrateGHs * 1.15);
  const gaugeProgressPercent =
    miningSession.status === 'ACTIVE' && displayHashrateGHs > 0
      ? Math.min(100, Math.max(6, (displayHashrateGHs / maxGaugeScaleGHs) * 100))
      : 0;

  // Format uptime into HH:MM:SS
  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  // Status label mapping: Active, Paused, Idle, or Maintenance
  const formatSessionStatusLabel = (status: string): 'Active' | 'Paused' | 'Idle' | 'Maintenance' => {
    switch (status) {
      case 'ACTIVE':
        return 'Active';
      case 'PAUSED':
        return 'Paused';
      case 'MAINTENANCE':
        return 'Maintenance';
      default:
        return 'Idle';
    }
  };

  // Contract status label mapping: Pending, Active, Completed, Cancelled, or Failed
  const formatContractStatusBadge = (status: MiningContract['status'], expiresAt: string) => {
    const expMs = new Date(expiresAt).getTime();
    const isExpiredByTime = Number.isFinite(expMs) && expMs <= Date.now();
    const resolved =
      status === 'ACTIVE' && isExpiredByTime
        ? 'Completed'
        : status === 'PENDING'
        ? 'Pending'
        : status === 'ACTIVE'
        ? 'Active'
        : status === 'COMPLETED' || status === 'EXPIRED'
        ? 'Completed'
        : status === 'CANCELLED'
        ? 'Cancelled'
        : 'Failed';

    const styleMap: Record<string, string> = {
      Active: 'bg-[#00D6A3]/15 text-[#00D6A3] border-[#00D6A3]/30',
      Pending: 'bg-[#F3B64B]/15 text-[#F3B64B] border-[#F3B64B]/30',
      Completed: 'bg-[#25B9F3]/15 text-[#25B9F3] border-[#25B9F3]/30',
      Cancelled: 'bg-[#98A6BA]/15 text-[#98A6BA] border-[#98A6BA]/30',
      Failed: 'bg-[#FF647C]/15 text-[#FF647C] border-[#FF647C]/30',
    };

    return { label: resolved, className: styleMap[resolved] || styleMap.Active };
  };

  const calculateRemainingDays = (purchasedAt: string, expiresAt: string, durationDays: number) => {
    const now = Date.now();
    const exp = new Date(expiresAt).getTime();
    const start = new Date(purchasedAt).getTime();
    if (!Number.isFinite(exp)) return { remainingDays: durationDays, progressPercent: 0 };
    const diffMs = Math.max(0, exp - now);
    const remainingDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const totalMs = Math.max(1, exp - start);
    const elapsedMs = Math.min(totalMs, Math.max(0, now - start));
    const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
    return { remainingDays, progressPercent };
  };

  // Estimated daily yield calculation (never guaranteed or auto-credited)
  const btcPrice = markets.find((m) => m.symbol === 'BTC')?.price || 94250;
  const activeContractsDailyYieldUSD = activeContracts.reduce(
    (sum, c) => sum + (c.estimatedDailyYieldUSD || 0),
    0
  );
  const estimatedDailyYieldUSD =
    activeContractsDailyYieldUSD > 0
      ? activeContractsDailyYieldUSD
      : displayHashrateGHs > 0
      ? Number((displayHashrateGHs * 0.033).toFixed(2))
      : 0;
  const estimatedDailyYieldBTC =
    btcPrice > 0 && estimatedDailyYieldUSD > 0
      ? Number((estimatedDailyYieldUSD / btcPrice).toFixed(8))
      : 0;

  // Share efficiency
  const totalShares = miningSession.acceptedShares + miningSession.rejectedShares;
  const shareEfficiency =
    totalShares > 0 ? ((miningSession.acceptedShares / totalShares) * 100).toFixed(2) : '100.00';

  // Direct purchase handler with idempotency key protection
  const handleDirectPurchase = async (plan: MiningPlan) => {
    if (purchasingPlanId) return;

    if (!user) {
      openAuthModal('login');
      return;
    }

    if (isOfflineCache && !user.isDemo) {
      setPurchaseFeedback({
        planId: plan.id,
        type: 'error',
        message: 'Wallet balance is currently loaded from offline cache. Please reconnect before purchasing.',
      });
      return;
    }

    if (availableUSDT < plan.priceUSD) {
      setPurchaseFeedback({
        planId: plan.id,
        type: 'error',
        message: `Insufficient balance ($${availableUSDT.toFixed(2)} USDT available, $${plan.priceUSD.toFixed(
          2
        )} required).`,
      });
      return;
    }

    // Reuse or generate deterministic idempotency key for this purchase attempt
    const existingKey = planIdempotencyKeys[plan.id];
    const idemKey =
      existingKey ||
      `${(user.id || 'usr').slice(0, 8)}_${plan.id}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}`;

    if (!existingKey) {
      setPlanIdempotencyKeys((prev) => ({ ...prev, [plan.id]: idemKey }));
    }

    setPurchasingPlanId(plan.id);
    setPurchaseFeedback(null);

    try {
      const res = await submitPlanOrder(plan.id, idemKey);
      if (res.success) {
        setPurchaseFeedback({
          planId: plan.id,
          type: 'success',
          message: res.message,
        });
        // Rotate key after confirmed settlement so the user can buy another contract later if desired
        setPlanIdempotencyKeys((prev) => {
          const next = { ...prev };
          delete next[plan.id];
          return next;
        });
      } else {
        setPurchaseFeedback({
          planId: plan.id,
          type: 'error',
          message: res.message,
        });
      }
    } catch (err: any) {
      setPurchaseFeedback({
        planId: plan.id,
        type: 'error',
        message: err?.message || 'Contract purchase failed. Please try again.',
      });
    } finally {
      setPurchasingPlanId(null);
    }
  };

  // SVG Circular Meter Geometry
  const svgSize = 250;
  const strokeWidth = 14;
  const center = svgSize / 2;
  const radius = center - strokeWidth - 10;
  const circumference = 2 * Math.PI * radius;
  // 270-degree analog gauge arc (from 135 deg to 405 deg)
  const arcFraction = 0.75;
  const maxArcLength = circumference * arcFraction;
  const activeArcLength = (gaugeProgressPercent / 100) * maxArcLength;

  const statusLabel = formatSessionStatusLabel(miningSession.status);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 px-2 sm:px-4 pt-1 animate-in fade-in duration-300">
      {/* 1. TOP HEADER & SIMULATED TELEMETRY DISCLOSURE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#F4F7FC] tracking-tight">
              Cloud Mining Terminal
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
              <Info className="w-3 h-3" />
              <span>Simulated Mining</span>
            </span>
            {isOfflineCache && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#FF647C]/15 text-[#FF647C] border border-[#FF647C]/30">
                <AlertCircle className="w-3 h-3" />
                <span>Offline Cache</span>
              </span>
            )}
          </div>
          <p className="text-xs text-[#98A6BA] mt-1">
            SHA-256 Bitcoin Cloud Contracts • Pool Node:{' '}
            <span className="font-mono text-[#F4F7FC] font-semibold">{miningSession.poolName}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <div className="px-3.5 py-2 rounded-2xl bg-[#0D1320] border border-[#1E293B] flex items-center gap-2.5">
            <div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#98A6BA] block">
                Available Balance
              </span>
              <span className="text-sm font-extrabold font-mono text-[#00D6A3]">
                ${availableUSDT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </span>
            </div>
            <button
              onClick={() => {
                if (!user) {
                  openAuthModal('login');
                  return;
                }
                setDepositModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-[#00D6A3]/15 hover:bg-[#00D6A3]/25 text-[#00D6A3] border border-[#00D6A3]/30 text-xs font-bold transition-colors"
            >
              + Deposit
            </button>
          </div>
        </div>
      </div>

      {/* 2. CIRCULAR ANALOG/DIGITAL MINING METER & LIVE TELEMETRY */}
      <div className="rounded-3xl bg-gradient-to-b from-[#0E1525] via-[#0B101C] to-[#090D16] border border-[#1E293B] p-5 sm:p-7 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#00D6A3]/5 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-[#F3B64B]/5 blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left / Center: Circular Analog-Style Mining Gauge */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center" style={{ width: svgSize, height: svgSize }}>
              <svg width={svgSize} height={svgSize} className="overflow-visible">
                <defs>
                  <linearGradient id="nexoraGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00D6A3" />
                    <stop offset="55%" stopColor="#25B9F3" />
                    <stop offset="100%" stopColor="#F3B64B" />
                  </linearGradient>
                </defs>

                {/* Analog outer scale ticks */}
                {Array.from({ length: 25 }).map((_, idx) => {
                  const angleDeg = 135 + (idx / 24) * 270;
                  const angleRad = (angleDeg * Math.PI) / 180;
                  const innerR = radius + 12;
                  const outerR = idx % 4 === 0 ? radius + 20 : radius + 16;
                  const x1 = center + innerR * Math.cos(angleRad);
                  const y1 = center + innerR * Math.sin(angleRad);
                  const x2 = center + outerR * Math.cos(angleRad);
                  const y2 = center + outerR * Math.sin(angleRad);
                  const isLit = (idx / 24) * 100 <= gaugeProgressPercent && miningSession.status === 'ACTIVE';
                  return (
                    <line
                      key={idx}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isLit ? '#00D6A3' : '#253144'}
                      strokeWidth={idx % 4 === 0 ? 2.2 : 1.2}
                      strokeLinecap="round"
                    />
                  );
                })}

                {/* Background 270-degree track */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke="#162032"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${maxArcLength} ${circumference}`}
                  strokeLinecap="round"
                  transform={`rotate(135 ${center} ${center})`}
                />

                {/* Animated active hashrate progress arc */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke="url(#nexoraGaugeGrad)"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${activeArcLength} ${circumference}`}
                  strokeLinecap="round"
                  transform={`rotate(135 ${center} ${center})`}
                  className="transition-all duration-700 ease-out"
                />
              </svg>

              {/* Center Readout inside Analog Meter */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#131C2E] border border-[#253144] mb-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      miningSession.status === 'ACTIVE'
                        ? 'bg-[#00D6A3] animate-pulse shadow-[0_0_8px_#00D6A3]'
                        : miningSession.status === 'PAUSED'
                        ? 'bg-[#F3B64B]'
                        : miningSession.status === 'MAINTENANCE'
                        ? 'bg-[#FF647C]'
                        : 'bg-[#98A6BA]'
                    }`}
                  />
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#F4F7FC]">
                    {statusLabel}
                  </span>
                </div>

                <div className="text-3xl sm:text-4xl font-extrabold font-mono text-[#F4F7FC] tracking-tight">
                  {displayHashrateGHs.toLocaleString('en-US', {
                    minimumFractionDigits: displayHashrateGHs % 1 === 0 ? 0 : 2,
                    maximumFractionDigits: 2,
                  })}
                  <span className="text-sm font-bold text-[#00D6A3] ml-1">GH/s</span>
                </div>

                <div className="text-[11px] font-mono text-[#98A6BA] mt-0.5">
                  {displayHashrateTHs.toFixed(3)} TH/s • {displayHashrateMHs.toLocaleString()} MH/s
                </div>

                <div className="mt-2 px-2.5 py-0.5 rounded-md bg-[#F3B64B]/10 border border-[#F3B64B]/30 text-[10px] font-mono font-semibold text-[#F3B64B]">
                  Simulated Mining
                </div>
              </div>
            </div>

            {/* Start / Pause Session Control */}
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={toggleMining}
                className={`py-2.5 px-5 rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95 shadow-lg ${
                  miningSession.status === 'ACTIVE'
                    ? 'bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/40 hover:bg-[#F3B64B]/25'
                    : 'bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12]'
                }`}
              >
                {miningSession.status === 'ACTIVE' ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pause Session</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Mining Session</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right: Detailed Meter Telemetry Readouts */}
          <div className="lg:col-span-7 space-y-4">
            {/* Active Contract Banner inside Meter */}
            <div className="p-4 rounded-2xl bg-[#11192A] border border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <GradientIcon
                  icon={Layers}
                  theme={primaryActiveContract ? 'amber' : 'cyan'}
                  size="md"
                  variant="boxed"
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#98A6BA]">
                      Current Contract
                    </span>
                    {primaryActiveContract && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                        {primaryActiveContract.tier} Tier
                      </span>
                    )}
                  </div>
                  <div className="text-sm sm:text-base font-extrabold text-[#F4F7FC] mt-0.5">
                    {primaryActiveContract
                      ? primaryActiveContract.planName
                      : miningSession.activeContractName || 'No Active Contract'}
                  </div>
                  <div className="text-[11px] font-mono text-[#98A6BA] mt-0.5">
                    Contract ID:{' '}
                    <span className="text-[#F4F7FC]">
                      {primaryActiveContract
                        ? primaryActiveContract.id
                        : miningSession.activeContractId || 'None — Select a BTC plan below'}
                    </span>
                  </div>
                </div>
              </div>

              {primaryActiveContract && (
                <button
                  onClick={() => setInspectContract(primaryActiveContract)}
                  className="self-start sm:self-center px-3 py-1.5 rounded-xl bg-[#182235] hover:bg-[#223049] text-[#F4F7FC] border border-[#2A3A56] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <span>Contract Details</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#F3B64B]" />
                </button>
              )}
            </div>

            {/* 4 Telemetry Readout Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Session Uptime Timer */}
              <div className="p-3.5 rounded-2xl bg-[#11192A] border border-[#1E293B]">
                <div className="flex items-center gap-1.5 text-[11px] text-[#98A6BA]">
                  <Clock className="w-3.5 h-3.5 text-[#25B9F3]" />
                  <span>Session Uptime</span>
                </div>
                <div className="text-base sm:text-lg font-extrabold font-mono text-[#F4F7FC] mt-1.5">
                  {miningSession.status === 'ACTIVE' ? formatUptime(liveUptimeSeconds) : '00:00:00'}
                </div>
                <div className="text-[10px] font-mono text-[#98A6BA] mt-0.5">
                  Status: <span className="text-[#F4F7FC]">{statusLabel}</span>
                </div>
              </div>

              {/* Accepted & Rejected Shares */}
              <div className="p-3.5 rounded-2xl bg-[#11192A] border border-[#1E293B]">
                <div className="flex items-center gap-1.5 text-[11px] text-[#98A6BA]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#00D6A3]" />
                  <span>Stratum Shares</span>
                </div>
                <div className="text-base sm:text-lg font-extrabold font-mono text-[#F4F7FC] mt-1.5">
                  {miningSession.acceptedShares.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-[#FF647C]">
                    / {miningSession.rejectedShares} rej
                  </span>
                </div>
                <div className="text-[10px] font-mono text-[#00D6A3] mt-0.5">
                  {shareEfficiency}% Acceptance
                </div>
              </div>

              {/* Estimated Daily Yield (Clearly Labelled as Estimate) */}
              <div className="p-3.5 rounded-2xl bg-[#11192A] border border-[#1E293B]">
                <div className="flex items-center gap-1.5 text-[11px] text-[#98A6BA]">
                  <Sparkles className="w-3.5 h-3.5 text-[#F3B64B]" />
                  <span>Est. Daily Yield</span>
                </div>
                {estimatedDailyYieldUSD > 0 ? (
                  <>
                    <div className="text-base sm:text-lg font-extrabold font-mono text-[#00D6A3] mt-1.5">
                      ~${estimatedDailyYieldUSD.toFixed(2)}
                    </div>
                    <div className="text-[10px] font-mono text-[#98A6BA] mt-0.5">
                      ~{estimatedDailyYieldBTC.toFixed(7)} BTC (Est.)
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-bold font-mono text-[#98A6BA] mt-2">
                      Estimate unavailable
                    </div>
                    <div className="text-[10px] font-mono text-[#98A6BA] mt-0.5">
                      No active hashrate
                    </div>
                  </>
                )}
              </div>

              {/* Hardware Efficiency & Thermal */}
              <div className="p-3.5 rounded-2xl bg-[#11192A] border border-[#1E293B]">
                <div className="flex items-center gap-1.5 text-[11px] text-[#98A6BA]">
                  <Thermometer className="w-3.5 h-3.5 text-[#FF647C]" />
                  <span>Rig Core / Power</span>
                </div>
                <div className="text-base sm:text-lg font-extrabold font-mono text-[#F4F7FC] mt-1.5">
                  {miningSession.temperatureC}°C
                </div>
                <div className="text-[10px] font-mono text-[#98A6BA] mt-0.5">
                  {miningSession.efficiencyWTH} W/TH • {miningSession.hardwareProfile}
                </div>
              </div>
            </div>

            {/* Hardware Tuning Profile Bar */}
            <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-[#98A6BA]">
                <Sliders className="w-3.5 h-3.5 text-[#00D6A3]" />
                <span>Tuning Mode:</span>
                <div className="inline-flex items-center gap-1 ml-1 bg-[#11192A] p-1 rounded-xl border border-[#1E293B]">
                  {(['Eco', 'Balanced', 'Turbo Overclock'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setHardwareProfile(mode)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                        miningSession.hardwareProfile === mode
                          ? 'bg-[#00D6A3] text-[#080B12]'
                          : 'text-[#98A6BA] hover:text-[#F4F7FC]'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[11px] font-mono text-[#98A6BA]">
                1 TH/s = 1,000 GH/s • 1 GH/s = 1,000 MH/s
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. AVAILABLE MINING CONTRACTS (REFERENCE SCREENSHOT DARK/GOLD CARD REDESIGN) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#F3B64B]" />
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#F3B64B]">
                SHA-256 Bitcoin Hashpower Catalog
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#F4F7FC] mt-0.5">
              Available Mining Contracts
            </h2>
          </div>
          <p className="text-xs text-[#98A6BA]">
            Displayed returns represent configurable contract terms, not guaranteed earnings.
          </p>
        </div>

        {/* Responsive Mobile-First Contract Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MINING_PLANS.map((plan) => {
            const isActivePlan = activeContracts.some((c) => c.planId === plan.id);
            const hasSufficientBalance = availableUSDT >= plan.priceUSD && (!isOfflineCache || Boolean(user?.isDemo));
            const isPurchasingThis = purchasingPlanId === plan.id;
            const feedback = purchaseFeedback?.planId === plan.id ? purchaseFeedback : null;

            return (
              <div
                key={plan.id}
                className={`rounded-3xl p-5 bg-gradient-to-b from-[#111827] via-[#0C121E] to-[#090D16] border transition-all duration-300 flex flex-col justify-between relative overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.45)] ${
                  isActivePlan
                    ? 'border-[#F3B64B]/60 shadow-[0_0_25px_rgba(243,182,75,0.12)]'
                    : 'border-[#1E293B] hover:border-[#334155]'
                }`}
              >
                {/* Top subtle gold glow accent */}
                <div className="absolute -top-16 -right-16 w-36 h-36 rounded-full bg-[#F3B64B]/10 blur-2xl pointer-events-none" />

                <div>
                  {/* Card Top Row: Gold/Yellow Tier Badge & Status Indicator */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/40 shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F3B64B]" />
                      {plan.tier}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isActivePlan && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00D6A3]/15 text-[#00D6A3] border border-[#00D6A3]/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00D6A3] animate-pulse" />
                          Active
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#151F32] text-[#98A6BA] border border-[#253144]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00D6A3]" />
                        {plan.targetCoin} • {plan.algorithm}
                      </span>
                    </div>
                  </div>

                  {/* Contract Title & "Available contract" Subtitle + Large USD Price */}
                  <div className="mt-4 flex items-baseline justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-extrabold text-[#F4F7FC] tracking-tight">
                        {plan.name}
                      </h3>
                      <p className="text-xs font-medium text-[#98A6BA] mt-0.5">
                        Available contract
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl sm:text-[26px] font-extrabold font-mono text-[#F4F7FC] tracking-tight">
                        ${plan.priceUSD.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <span className="text-[10px] font-mono uppercase text-[#98A6BA] block">
                        USDT Settlement
                      </span>
                    </div>
                  </div>

                  {/* Three Compact Information Cards: Hashrate, Duration, Return */}
                  <div className="mt-5 grid grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-2xl bg-[#0D1322] border border-[#1E293B] text-center">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#98A6BA] block">
                        Hashrate
                      </span>
                      <span className="text-xs sm:text-sm font-extrabold font-mono text-[#F4F7FC] mt-1 block">
                        {plan.hashrate} {plan.hashrateUnit}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-[#0D1322] border border-[#1E293B] text-center">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#98A6BA] block">
                        Duration
                      </span>
                      <span className="text-xs sm:text-sm font-extrabold font-mono text-[#F4F7FC] mt-1 block">
                        {plan.durationDays} days
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-[#0D1322] border border-[#1E293B] text-center">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#98A6BA] block">
                        Return
                      </span>
                      <span className="text-xs sm:text-sm font-extrabold font-mono text-[#F3B64B] mt-1 block">
                        {plan.displayedReturnPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Secondary Contract Term Metadata */}
                  <div className="mt-3.5 pt-3 border-t border-[#1E293B]/80 flex items-center justify-between text-[11px] text-[#98A6BA] font-mono">
                    <span>Est. Daily: ~${plan.estimatedDailyYieldUSD.toFixed(2)}/d</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPlanForModal(plan.id)}
                      className="text-[#F3B64B] hover:underline font-sans font-semibold flex items-center gap-1"
                    >
                      <span>Terms</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Inline Feedback Banner (Success / Error) */}
                  {feedback && (
                    <div
                      className={`mt-3 p-2.5 rounded-xl border text-[11px] flex items-start gap-2 ${
                        feedback.type === 'success'
                          ? 'bg-[#00D6A3]/10 border-[#00D6A3]/30 text-[#00D6A3]'
                          : 'bg-[#FF647C]/10 border-[#FF647C]/30 text-[#FF647C]'
                      }`}
                    >
                      {feedback.type === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      )}
                      <span className="leading-snug">{feedback.message}</span>
                    </div>
                  )}
                </div>

                {/* Action Button: Disabled "Insufficient balance" or Active Purchase Button */}
                <div className="mt-4 pt-1">
                  {!user ? (
                    <button
                      type="button"
                      onClick={() => openAuthModal('login')}
                      className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-[#182235] hover:bg-[#223049] text-[#F4F7FC] border border-[#2A3A56] transition-all flex items-center justify-center gap-2"
                    >
                      <Lock className="w-3.5 h-3.5 text-[#F3B64B]" />
                      <span>Sign In to Purchase</span>
                    </button>
                  ) : isOfflineCache && !user.isDemo ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-[#161F30] text-[#98A6BA] border border-[#253144] opacity-75 cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-[#F3B64B]" />
                      <span>Offline — Sync Required</span>
                    </button>
                  ) : !hasSufficientBalance ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-[#161F30] text-[#98A6BA] border border-[#253144] opacity-75 cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <span>Insufficient balance</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isPurchasingThis || purchasingPlanId !== null}
                      onClick={() => handleDirectPurchase(plan)}
                      className="w-full py-3 px-4 rounded-2xl font-extrabold text-xs sm:text-sm bg-gradient-to-r from-[#F3B64B] to-[#E59A28] hover:from-[#F7C469] hover:to-[#F3B64B] text-[#080B12] shadow-md transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {isPurchasingThis ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Activating Contract...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 fill-current" />
                          <span>
                            Purchase Contract • $
                            {plan.priceUSD.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. ACTIVE CONTRACTS SECTION */}
      <div className="rounded-3xl p-5 sm:p-6 bg-[#0E1525] border border-[#1E293B] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={ShieldCheck} theme="emerald" size="md" variant="boxed" />
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-[#F4F7FC]">
                Active Contracts
              </h3>
              <p className="text-xs text-[#98A6BA]">
                Verified BTC cloud hashrate contracts linked to your account
              </p>
            </div>
          </div>

          <span className="self-start sm:self-center text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
            {activeContracts.length} Active / {userContracts.length} Total
          </span>
        </div>

        {userContracts.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#0A0F1A] border border-[#1E293B] text-center space-y-2">
            <Layers className="w-8 h-8 text-[#98A6BA] mx-auto opacity-60" />
            <div className="text-sm font-bold text-[#F4F7FC]">
              No Active Mining Contracts Yet
            </div>
            <p className="text-xs text-[#98A6BA] max-w-md mx-auto">
              Select one of the five SHA-256 BTC contracts above (`Genesis Shaft` starting at $10.00) to allocate cloud hashrate to your mining meter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {userContracts.map((contract) => {
              const badge = formatContractStatusBadge(contract.status, contract.expiresAt);
              const { remainingDays, progressPercent } = calculateRemainingDays(
                contract.purchasedAt,
                contract.expiresAt,
                contract.durationDays
              );
              const contractGHs =
                typeof contract.hashrateGHs === 'number'
                  ? contract.hashrateGHs
                  : contract.hashrate;
              const returnPct =
                typeof contract.displayedReturnPercent === 'number'
                  ? contract.displayedReturnPercent
                  : MINING_PLANS.find((p) => p.id === contract.planId)?.displayedReturnPercent || 150.0;

              return (
                <div
                  key={contract.id}
                  className="p-4 sm:p-5 rounded-2xl bg-[#0A0F1A] border border-[#1E293B] hover:border-[#334155] transition-all flex flex-col justify-between gap-4"
                >
                  <div>
                    {/* Header: Tier + Name + Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                            {contract.tier}
                          </span>
                          <span className="text-sm sm:text-base font-extrabold text-[#F4F7FC]">
                            {contract.planName}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[#98A6BA] mt-1">
                          ID: <span className="text-[#F4F7FC]">{contract.id}</span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {/* Key Figures Grid: Price, Hashrate, Duration/Remaining, Return */}
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-[#11192A] border border-[#1E293B]">
                        <span className="text-[10px] text-[#98A6BA] block">Purchase Price</span>
                        <span className="font-mono font-extrabold text-[#F4F7FC] mt-0.5 block">
                          ${contract.priceUSD.toFixed(2)}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#11192A] border border-[#1E293B]">
                        <span className="text-[10px] text-[#98A6BA] block">Hashrate</span>
                        <span className="font-mono font-extrabold text-[#00D6A3] mt-0.5 block">
                          {contractGHs} {contract.hashrateUnit}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#11192A] border border-[#1E293B]">
                        <span className="text-[10px] text-[#98A6BA] block">Duration / Left</span>
                        <span className="font-mono font-extrabold text-[#F4F7FC] mt-0.5 block">
                          {remainingDays}d / {contract.durationDays}d
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#11192A] border border-[#1E293B]">
                        <span className="text-[10px] text-[#98A6BA] block">Term Return</span>
                        <span className="font-mono font-extrabold text-[#F3B64B] mt-0.5 block">
                          {returnPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Progress bar for duration */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#98A6BA] mb-1">
                        <span>Start: {new Date(contract.purchasedAt).toLocaleDateString()}</span>
                        <span>End: {new Date(contract.expiresAt).toLocaleDateString()}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[#162032] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#00D6A3] to-[#F3B64B]"
                          style={{ width: `${ Math.max(4, progressPercent) }%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Footer: Associated Session & View Details Action */}
                  <div className="pt-2 border-t border-[#1E293B] flex items-center justify-between text-[11px]">
                    <span className="font-mono text-[#98A6BA]">
                      Session:{' '}
                      <span className="text-[#F4F7FC]">
                        {contract.sessionId || miningSession.id}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setInspectContract(contract)}
                      className="text-[#00D6A3] hover:text-[#25B9F3] font-bold flex items-center gap-1 transition-colors"
                    >
                      <span>View Details</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. CONTRACT DETAILS INSPECTION MODAL */}
      {inspectContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#080B12]/80 backdrop-blur-md"
            onClick={() => setInspectContract(null)}
          />
          <div className="relative w-full max-w-md rounded-3xl bg-[#111827] border border-[#253144] shadow-2xl p-6 z-10 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
              <div className="flex items-center gap-2.5">
                <GradientIcon icon={FileText} theme="amber" size="md" variant="boxed" />
                <div>
                  <h3 className="text-base font-extrabold text-[#F4F7FC]">
                    {inspectContract.planName}
                  </h3>
                  <span className="text-[11px] font-mono text-[#98A6BA]">
                    {inspectContract.tier} Tier • {inspectContract.targetCoin} ({inspectContract.algorithm})
                  </span>
                </div>
              </div>
              <button
                onClick={() => setInspectContract(null)}
                className="p-1.5 rounded-xl bg-[#182235] text-[#98A6BA] hover:text-[#F4F7FC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs bg-[#0B101B] p-4 rounded-2xl border border-[#1E293B]">
              <div className="flex justify-between">
                <span className="text-[#98A6BA]">Contract / Order ID</span>
                <span className="font-mono font-bold text-[#F4F7FC]">{inspectContract.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A6BA]">Settlement Reference</span>
                <span className="font-mono text-[#F4F7FC]">{inspectContract.settlementId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A6BA]">Associated Mining Session</span>
                <span className="font-mono text-[#00D6A3]">
                  {inspectContract.sessionId || miningSession.id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A6BA]">Purchase Price</span>
                <span className="font-mono font-bold text-[#F4F7FC]">
                  ${inspectContract.priceUSD.toFixed(2)} USDT
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A6BA]">Allocated Hashrate</span>
                <span className="font-mono font-bold text-[#00D6A3]">
                  {inspectContract.hashrate} {inspectContract.hashrateUnit} (
                  {inspectContract.hashrateTHs.toFixed(3)} TH/s)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A6BA]">Contract Duration</span>
                <span className="font-mono font-bold text-[#F4F7FC]">
                  {inspectContract.durationDays} Days
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A6BA]">Displayed Term Return</span>
                <span className="font-mono font-bold text-[#F3B64B]">
                  {(
                    inspectContract.displayedReturnPercent ||
                    MINING_PLANS.find((p) => p.id === inspectContract.planId)
                      ?.displayedReturnPercent ||
                    150.0
                  ).toFixed(1)}
                  % (Contract Term)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A6BA]">Start Date</span>
                <span className="font-mono text-[#F4F7FC]">
                  {new Date(inspectContract.purchasedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A6BA]">End Date</span>
                <span className="font-mono text-[#F4F7FC]">
                  {new Date(inspectContract.expiresAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#F3B64B]/10 border border-[#F3B64B]/30 text-[11px] text-[#98A6BA] leading-relaxed">
              <strong className="text-[#F3B64B]">Simulated Mining Notice:</strong> Displayed return percentages and daily yield figures are configurable contract terms and simulated estimates, not guaranteed payouts.
            </div>

            <button
              onClick={() => setInspectContract(null)}
              className="w-full py-2.5 rounded-xl bg-[#00D6A3] text-[#080B12] font-bold text-xs"
            >
              Close Details
            </button>
          </div>
        </div>
      )}

      {/* Plan Order Confirmation Modal (when clicking "Terms") */}
      <PlanModal
        isOpen={!!selectedPlanForModal}
        onClose={() => setSelectedPlanForModal(null)}
        planId={selectedPlanForModal}
        onOpenDeposit={() => setDepositModalOpen(true)}
      />

      {/* Deposit Modal */}
      <DepositModal isOpen={depositModalOpen} onClose={() => setDepositModalOpen(false)} />
    </div>
  );
};
