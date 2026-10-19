import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { MINING_PLANS } from '../../services/miningService';
import {
  Pickaxe,
  Zap,
  Play,
  Pause,
  Sliders,
  Server,
  Activity,
  Flame,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { PlanModal } from '../modals/PlanModal';
import { GradientIcon } from '../ui/GradientIcon';

export const MiningScreen: React.FC = () => {
  const { user, miningSession, toggleMining, setHardwareProfile, markets } = useApp();
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>(undefined);

  const btcPrice = markets.find((m) => m.symbol === 'BTC')?.price || 94250;
  const isRealUser = Boolean(user && !user.isDemo);

  const handleOpenPlan = (planId: string) => {
    setSelectedPlanId(planId);
    setPlanModalOpen(true);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 px-4 sm:px-6 pt-2 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#F4F7FC] tracking-tight flex items-center gap-2">
              Cloud Mining Terminal
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
                Stratum v2
              </span>
            </h1>
            {isRealUser ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
                <span className="w-2 h-2 rounded-full bg-[#00D6A3] animate-pulse" />
                Firestore Session Synced
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                <span className="w-2 h-2 rounded-full bg-[#F3B64B]" />
                Sandbox Simulation
              </span>
            )}
          </div>
          <p className="text-xs text-[#98A6BA] mt-1">
            Real-time ASIC telemetry, hash allocation & pool reward contracts
          </p>
        </div>

        <button
          onClick={toggleMining}
          className={`py-2.5 px-5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg active:scale-95 ${
            miningSession.status === 'ACTIVE'
              ? 'bg-[#F3B64B]/20 text-[#F3B64B] border border-[#F3B64B]/30 hover:bg-[#F3B64B]/30'
              : 'bg-[#00D6A3] text-[#080B12] hover:bg-[#19C784] shadow-[#00D6A3]/25'
          }`}
        >
          {miningSession.status === 'ACTIVE' ? (
            <>
              <Pause className="w-4 h-4" />
              <span>Pause Mining Session</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Start Cloud Miner</span>
            </>
          )}
        </button>
      </div>

      {/* Simulation Transparency Notice */}
      <div className="p-3.5 rounded-2xl bg-[#121925] border border-[#253144] text-xs flex items-start gap-2.5 text-[#98A6BA]">
        <AlertCircle className="w-4 h-4 text-[#00D6A3] shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed">
          <strong className="text-[#F4F7FC]">Stratum Simulation Protocol:</strong> Mining status, hashrate telemetry, and estimated yields are simulated non-financial session preferences saved to <code className="text-[#00D6A3] font-mono">users/{'{uid}'}/mining/session</code>. Real cloud mining hardware and server-side session control are not connected; client telemetry is not proof of real mining and does not award spendable cryptocurrency.
        </p>
      </div>

      {/* Main Hashrate & Rig Telemetry Monitor */}
      <div className="rounded-3xl p-6 border border-[#00D6A3]/30 bg-gradient-to-br from-[#121925] via-[#102324] to-[#121925] shadow-xl relative overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          {/* Circular Hashrate Meter Simulation */}
          <div className="flex flex-col items-center justify-center p-4 bg-[#0D121C]/90 rounded-2xl border border-[#253144] text-center relative">
            <div className="w-36 h-36 rounded-full border-4 border-[#253144] border-t-[#00D6A3] border-r-[#00D6A3]/60 flex flex-col items-center justify-center relative">
              <GradientIcon
                icon={Pickaxe}
                theme={miningSession.status === 'ACTIVE' ? 'emerald' : 'amber'}
                size="md"
                variant="glow"
                glow={true}
                className="mb-1"
              />
              <span className="text-2xl font-black text-[#F4F7FC] font-mono">
                {miningSession.status === 'ACTIVE' ? miningSession.hashrateTHs : '0.0'}
              </span>
              <span className="text-[10px] font-mono text-[#98A6BA] uppercase font-semibold">
                TH/s Hashrate
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className="relative flex h-3 w-3 items-center justify-center">
                {miningSession.status === 'ACTIVE' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00D6A3] opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  miningSession.status === 'ACTIVE'
                    ? 'bg-[#00D6A3] shadow-[0_0_8px_#00D6A3]'
                    : 'bg-[#F3B64B] shadow-[0_0_8px_#F3B64B]'
                }`} />
              </span>
              <span className="text-xs font-semibold text-[#F4F7FC]">
                {miningSession.status === 'ACTIVE' ? 'Stratum Connected' : 'Miner Standby'}
              </span>
            </div>
          </div>

          {/* Key Rig Metrics */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-[#0D121C] border border-[#253144] hover:border-[#00D6A3]/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <GradientIcon icon={Zap} theme="emerald" size="xs" variant="glow" glow={false} />
                  <span className="text-[10px] text-[#98A6BA] uppercase font-semibold block">Efficiency</span>
                </div>
                <span className="text-sm font-bold text-[#00D6A3] font-mono block">
                  {miningSession.efficiencyWTH} J/TH
                </span>
                <span className="text-[10px] text-[#98A6BA]/80">Hydro-cooled</span>
              </div>

              <div className="p-3 rounded-xl bg-[#0D121C] border border-[#253144] hover:border-amber-500/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <GradientIcon icon={Flame} theme="flame" size="xs" variant="glow" glow={false} />
                  <span className="text-[10px] text-[#98A6BA] uppercase font-semibold block">ASIC Temp</span>
                </div>
                <span className="text-sm font-bold text-[#F3B64B] font-mono block">
                  {miningSession.temperatureC}°C
                </span>
                <span className="text-[10px] text-[#98A6BA]/80">Target &lt; 75°C</span>
              </div>

              <div className="p-3 rounded-xl bg-[#0D121C] border border-[#253144] hover:border-cyan-500/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <GradientIcon icon={Activity} theme="cyan" size="xs" variant="glow" glow={false} />
                  <span className="text-[10px] text-[#98A6BA] uppercase font-semibold block">Accepted</span>
                </div>
                <span className="text-sm font-bold text-[#F4F7FC] font-mono block">
                  {miningSession.acceptedShares} <span className="text-[#00D6A3] text-xs">({((miningSession.acceptedShares / (miningSession.acceptedShares + miningSession.rejectedShares)) * 100).toFixed(1)}%)</span>
                </span>
                <span className="text-[10px] text-[#98A6BA]/80">{miningSession.rejectedShares} rejected</span>
              </div>
            </div>

            {/* Hardware Profile Selector */}
            <div className="p-4 rounded-2xl bg-[#0D121C] border border-[#253144]">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-[#F4F7FC] flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#25B9F3]" />
                  <span>Hardware Tuning Profile</span>
                </span>
                <span className="text-[10px] text-[#98A6BA] font-mono">
                  Current: <strong className="text-[#00D6A3]">{miningSession.hardwareProfile}</strong>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['Eco', 'Balanced', 'Turbo Overclock'] as const).map((prof) => {
                  const isSelected = miningSession.hardwareProfile === prof;
                  const profTheme = prof === 'Eco' ? 'emerald' : prof === 'Balanced' ? 'cyan' : 'flame';
                  const ProfIcon = prof === 'Eco' ? Server : prof === 'Balanced' ? Activity : Flame;

                  return (
                    <button
                      key={prof}
                      onClick={() => setHardwareProfile(prof)}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                        isSelected
                          ? 'border-[#00D6A3] bg-[#00D6A3]/10 text-[#00D6A3] shadow-sm'
                          : 'border-[#253144] bg-[#121925] text-[#98A6BA] hover:text-[#F4F7FC] hover:border-[#36465D]'
                      }`}
                    >
                      <GradientIcon icon={ProfIcon} theme={profTheme} size="xs" variant="glow" glow={isSelected} />
                      <span>{prof}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Reward Projections Banner */}
        <div className="mt-5 pt-4 border-t border-[#253144] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#0D121C] border border-[#253144]">
            <span className="text-[#98A6BA]">Estimated 24h Output:</span>
            <span className="font-mono font-bold text-[#00D6A3]">
              {miningSession.todayEstimatedRewardCoin.toFixed(6)} BTC (~${miningSession.todayEstimatedRewardUSD.toFixed(2)})
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-[#0D121C] border border-[#253144]">
            <span className="text-[#98A6BA]">Confirmed Settled Yield:</span>
            <span className="font-mono font-bold text-[#F4F7FC]">
              {miningSession.confirmedRewardCoin.toFixed(6)} BTC (~${(miningSession.confirmedRewardCoin * btcPrice).toFixed(2)})
            </span>
          </div>
        </div>
      </div>

      {/* Cloud Mining Plans Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-[#F4F7FC] uppercase tracking-wider">
              Available Hashrate Plans
            </h2>
            <p className="text-xs text-[#98A6BA]">Lease enterprise-grade ASIC power with zero hardware maintenance</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MINING_PLANS.map((plan) => (
            <div
              key={plan.id}
              className="p-5 rounded-2xl bg-[#121925] border border-[#253144] hover:border-[#00D6A3]/40 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold text-[#00D6A3] uppercase tracking-wider">
                    {plan.tier} Plan
                  </span>
                  {plan.popular && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30 uppercase">
                      Recommended
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-2">
                  <GradientIcon
                    icon={plan.tier === 'Enterprise' ? Server : plan.tier === 'Pro' ? Zap : Server}
                    theme={plan.tier === 'Enterprise' ? 'violet' : plan.tier === 'Pro' ? 'cyan' : plan.tier === 'Custom' ? 'gold' : 'emerald'}
                    size="sm"
                    variant="boxed"
                  />
                  <div>
                    <h3 className="text-base font-bold text-[#F4F7FC]">{plan.name}</h3>
                    <p className="text-xs text-[#98A6BA]">Algorithm: {plan.algorithm}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-[#F4F7FC] font-mono">{plan.hashrate}</span>
                  <span className="text-sm font-bold text-[#00D6A3] font-mono">{plan.hashrateUnit}</span>
                  <span className="text-xs text-[#98A6BA] ml-auto font-mono">
                    ${plan.priceUSD} USDT / {plan.durationDays}d
                  </span>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-[#98A6BA] border-t border-[#253144] pt-3">
                  <div className="flex justify-between">
                    <span>Est. Daily Output:</span>
                    <span className="font-mono text-[#00D6A3] font-semibold">
                      ~${plan.estimatedDailyYieldUSD.toFixed(2)}/day
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Power Rating:</span>
                    <span className="font-mono text-[#F4F7FC]">{plan.powerConsumptionW} Watts</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pool Maintenance:</span>
                    <span className="font-mono text-[#F4F7FC]">{plan.maintenanceFeePercent}% included</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleOpenPlan(plan.id)}
                className="mt-5 w-full py-2.5 rounded-xl bg-[#182232] hover:bg-[#00D6A3] hover:text-[#080B12] text-[#F4F7FC] font-bold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <span>Select {plan.name}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Cloud Pool Details & Transparency */}
      <div className="p-4 rounded-2xl bg-[#121925] border border-[#253144] text-xs text-[#98A6BA] flex items-start gap-3">
        <Server className="w-5 h-5 text-[#00D6A3] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-[#F4F7FC]">Stratum Server Connection</p>
          <p className="text-[11px] text-[#98A6BA] leading-relaxed">
            Connected to Stratum Endpoint <code className="text-[#00D6A3] font-mono">stratum+tcp://fra01.nexoramine.io:3333</code>.
            Real-time shares are validated by the Nexora consensus validator before daily pool settlement at 00:00 UTC.
          </p>
        </div>
      </div>

      <PlanModal
        isOpen={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        initialPlanId={selectedPlanId}
      />
    </div>
  );
};
