import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Gift,
  Flame,
  CheckCircle2,
  Sparkles,
  Users,
  Copy,
  Check,
  Share2,
  Shield,
  ArrowRight,
  Pickaxe
} from 'lucide-react';
import { GradientIcon } from '../ui/GradientIcon';

export const EarnScreen: React.FC = () => {
  const { user, dailyRewards, dailyStreakRecord, earnTasks, claimDailyReward, claimTaskReward, addToast } = useApp();

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const isRealUser = Boolean(user && !user.isDemo);
  const todayUTC = new Date().toISOString().slice(0, 10);
  const hasClaimedToday = dailyStreakRecord?.lastClaimDate === todayUTC;

  const referralCode = user?.referralCode || 'NEXO-9842';
  const referralLink = `https://nexoramine.io/join?ref=${referralCode}`;

  const copyRefLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    addToast('Referral Link Copied', 'Share this link to earn 5% hashrate commission.', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyRefCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    addToast('Code Copied', 'Referral code copied to clipboard.', 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleClaim = async (day: number) => {
    if (claiming) return;
    setClaiming(true);
    try {
      await claimDailyReward(day);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 px-4 sm:px-6 pt-2 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#F4F7FC] tracking-tight flex items-center gap-2">
              Earn & Referral Center
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-[#F3B64B]/10 text-[#F3B64B] border border-[#F3B64B]/30">
                Tier Multipliers
              </span>
            </h1>
            {isRealUser ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
                <span className="w-2 h-2 rounded-full bg-[#00D6A3] animate-pulse" />
                Firestore Synced (UTC)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                <span className="w-2 h-2 rounded-full bg-[#F3B64B]" />
                Sandbox Demo
              </span>
            )}
          </div>
          <p className="text-xs text-[#98A6BA] mt-1">
            Claim daily login streak bonuses, community bounties, and invite mining partners
          </p>
        </div>

        {isRealUser && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-3 py-1.5 rounded-xl bg-[#121925] border border-[#253144] text-[#F4F7FC]">
              Streak: <strong className="text-[#00D6A3]">{dailyStreakRecord?.currentStreak || 0}/7d</strong>
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-[#121925] border border-[#253144] text-[#F4F7FC]">
              Total Claims: <strong className="text-[#25B9F3]">{dailyStreakRecord?.totalClaims || 0}</strong>
            </span>
          </div>
        )}
      </div>

      {/* 1. Daily Check-in Streak Banner */}
      <div className="rounded-3xl p-6 border border-[#00D6A3]/30 bg-gradient-to-br from-[#121925] via-[#102324] to-[#121925] shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={Flame} theme="flame" size="md" variant="solid" />
            <div>
              <h2 className="text-base font-bold text-[#F4F7FC]">7-Day Miner Check-in Streak</h2>
              <p className="text-xs text-[#98A6BA]">Log in daily to claim consecutive USDT mining credits</p>
            </div>
          </div>

          <div className="text-xs font-mono text-[#98A6BA]">
            {isRealUser ? (
              hasClaimedToday ? (
                <span className="px-2.5 py-1 rounded-xl bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
                  Claimed for Today • Next Reset: 00:00 UTC
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-xl bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                  Ready to Claim Today (UTC: {todayUTC})
                </span>
              )
            ) : (
              <span className="text-[#98A6BA]">Demo Check-in Simulation</span>
            )}
          </div>
        </div>

        {/* 7 Day Blocks */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {dailyRewards.map((reward) => {
            const isClickable = reward.isToday && !reward.isClaimed && !claiming;
            return (
              <button
                key={reward.day}
                type="button"
                onClick={() => isClickable && handleClaim(reward.day)}
                disabled={reward.isClaimed || !reward.isToday || claiming}
                className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-between min-h-[95px] relative ${
                  reward.isClaimed
                    ? 'border-[#00D6A3]/30 bg-[#00D6A3]/10 text-[#00D6A3] opacity-90'
                    : reward.isToday
                    ? 'border-[#00D6A3] bg-[#00D6A3]/20 text-[#F4F7FC] shadow-lg shadow-[#00D6A3]/20 scale-105 cursor-pointer'
                    : 'border-[#253144] bg-[#0D121C]/60 text-[#98A6BA]/60 opacity-60 cursor-not-allowed'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider">Day {reward.day}</span>
                <span className="text-sm font-extrabold font-mono text-[#F4F7FC] mt-1">
                  +${reward.rewardUSD.toFixed(2)}
                </span>
                <span className="text-[9px] font-semibold mt-1">
                  {reward.isClaimed ? (
                    <span className="flex items-center gap-0.5 text-[#00D6A3]">
                      <CheckCircle2 className="w-3 h-3" /> Done
                    </span>
                  ) : reward.isToday ? (
                    <span className="text-[#00D6A3] font-bold underline">
                      {claiming ? 'Saving...' : 'Claim'}
                    </span>
                  ) : (
                    'Locked'
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Verification and Security Notice */}
        <div className="mt-4 pt-3 border-t border-[#253144] text-[11px] text-[#98A6BA] flex items-center justify-between flex-wrap gap-2">
          <span>
            <strong className="text-[#F4F7FC]">Security Policy:</strong> Check-in claims are recorded in Firestore as PENDING_VERIFICATION. Direct client balance credits are blocked by Firestore security rules; claims remain pending until trusted verification is implemented.
          </span>
          <span className="font-mono text-[#98A6BA] text-[10px]">
            UTC Calendar Integrity Enforced
          </span>
        </div>
      </div>

      {/* 2. Referral Affiliate Program Card */}
      <div className="rounded-3xl p-6 border border-[#253144] bg-[#121925] shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <GradientIcon icon={Users} theme="cyan" size="md" variant="boxed" />
            <div>
              <h2 className="text-base font-bold text-[#F4F7FC]">Cloud Mining Referral Program</h2>
              <p className="text-xs text-[#98A6BA] mt-0.5">
                Earn passive USDT commissions whenever your invited friends activate cloud hash contracts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-[#0D121C] border border-[#253144] text-[#F4F7FC]">
              Code: <strong className="text-[#00D6A3]">{referralCode}</strong>
            </span>
            <button
              onClick={copyRefCode}
              className="p-2 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#98A6BA] hover:text-[#F4F7FC] transition-colors border border-[#253144]"
              title="Copy Referral Code"
            >
              {copiedCode ? <Check className="w-4 h-4 text-[#00D6A3]" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Share Link Box */}
        <div className="mt-4 p-3 rounded-2xl bg-[#0D121C] border border-[#253144] flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-[#F4F7FC] truncate pl-2">{referralLink}</span>
          <button
            onClick={copyRefLink}
            className="py-1.5 px-3.5 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] font-bold text-xs transition-colors shrink-0 flex items-center gap-1.5"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Copied' : 'Share Link'}</span>
          </button>
        </div>

        {/* Tier Commissions Breakdown */}
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-2xl bg-[#0D121C] border border-[#253144]">
            <span className="text-[10px] text-[#98A6BA] uppercase font-semibold block">Tier 1 Direct</span>
            <span className="text-lg font-extrabold text-[#00D6A3] font-mono mt-1 block">5.0%</span>
            <span className="text-[10px] text-[#98A6BA]">of contract value</span>
          </div>

          <div className="p-3 rounded-2xl bg-[#0D121C] border border-[#253144]">
            <span className="text-[10px] text-[#98A6BA] uppercase font-semibold block">Tier 2 Sub</span>
            <span className="text-lg font-extrabold text-[#25B9F3] font-mono mt-1 block">2.0%</span>
            <span className="text-[10px] text-[#98A6BA]">second-degree miners</span>
          </div>

          <div className="p-3 rounded-2xl bg-[#0D121C] border border-[#253144]">
            <span className="text-[10px] text-[#98A6BA] uppercase font-semibold block">Tier 3 Network</span>
            <span className="text-lg font-extrabold text-[#F3B64B] font-mono mt-1 block">1.0%</span>
            <span className="text-[10px] text-[#98A6BA]">extended network</span>
          </div>
        </div>
      </div>

      {/* 3. Community & Security Bounty Tasks */}
      <div>
        <h2 className="text-xs font-bold text-[#98A6BA] uppercase tracking-wider mb-3">
          Mining Tasks & Bounties
        </h2>
        <div className="space-y-3">
          {earnTasks.map((task) => {
            const isCompleted = task.status === 'COMPLETED';
            const isClaimed = task.status === 'CLAIMED';

            return (
              <div
                key={task.id}
                className="p-4 rounded-2xl bg-[#121925] border border-[#253144] hover:border-[#36465D] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  {task.category === 'Security' && <GradientIcon icon={Shield} theme="emerald" size="sm" variant="boxed" className="mt-0.5" />}
                  {task.category === 'Community' && <GradientIcon icon={Share2} theme="violet" size="sm" variant="boxed" className="mt-0.5" />}
                  {task.category === 'Mining' && <GradientIcon icon={Pickaxe} theme="gold" size="sm" variant="boxed" className="mt-0.5" />}
                  {task.category !== 'Security' && task.category !== 'Community' && task.category !== 'Mining' && (
                    <GradientIcon icon={Sparkles} theme="cyan" size="sm" variant="boxed" className="mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-[#F4F7FC] text-xs sm:text-sm">{task.title}</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#0D121C] border border-[#253144] text-[#98A6BA]">
                        {task.category}
                      </span>
                    </div>
                    <p className="text-xs text-[#98A6BA] mt-1">{task.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-[#00D6A3] block">
                      +${task.rewardUSD.toFixed(2)} {task.rewardAsset}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      if (isCompleted) {
                        claimTaskReward(task.id);
                      } else if (task.actionUrl) {
                        window.open(task.actionUrl, '_blank');
                      } else {
                        addToast('Task In Progress', 'Please complete the requirements in your profile settings.', 'info');
                      }
                    }}
                    disabled={isClaimed}
                    className={`py-1.5 px-3.5 rounded-xl text-xs font-bold transition-all ${
                      isClaimed
                        ? 'bg-[#182232] text-[#98A6BA]/60 border border-[#253144]'
                        : isCompleted
                        ? 'bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] shadow-md shadow-[#00D6A3]/20'
                        : 'bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] border border-[#253144]'
                    }`}
                  >
                    {isClaimed ? 'Claimed' : isCompleted ? 'Claim Reward' : 'Start Task'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
