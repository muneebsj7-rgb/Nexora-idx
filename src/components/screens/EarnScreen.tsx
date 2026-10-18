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
  const { user, dailyRewards, earnTasks, claimDailyReward, claimTaskReward, addToast } = useApp();

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

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

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 px-4 sm:px-6 pt-2 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          Earn & Referral Center
          <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            Tier Multipliers
          </span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Claim daily login streak bonuses, community bounties, and invite mining partners
        </p>
      </div>

      {/* 1. Daily Check-in Streak Banner */}
      <div className="rounded-3xl p-6 border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={Flame} theme="flame" size="md" variant="solid" />
            <div>
              <h2 className="text-base font-bold text-white">7-Day Miner Check-in Streak</h2>
              <p className="text-xs text-slate-400">Log in daily to claim consecutive USDT mining credits</p>
            </div>
          </div>
        </div>

        {/* 7 Day Blocks */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {dailyRewards.map((reward) => {
            const isClickable = reward.isToday && !reward.isClaimed;
            return (
              <button
                key={reward.day}
                type="button"
                onClick={() => isClickable && claimDailyReward(reward.day)}
                disabled={reward.isClaimed || !reward.isToday}
                className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-between min-h-[90px] relative ${
                  reward.isClaimed
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 opacity-90'
                    : reward.isToday
                    ? 'border-emerald-400 bg-emerald-500/20 text-white shadow-lg shadow-emerald-500/20 scale-105 animate-pulse'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 opacity-60'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider">Day {reward.day}</span>
                <span className="text-sm font-extrabold font-mono text-white mt-1">
                  +${reward.rewardUSD.toFixed(2)}
                </span>
                <span className="text-[9px] font-semibold mt-1">
                  {reward.isClaimed ? (
                    <span className="flex items-center gap-0.5 text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> Done
                    </span>
                  ) : reward.isToday ? (
                    <span className="text-emerald-300 font-bold underline">Claim</span>
                  ) : (
                    'Locked'
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Referral Affiliate Program Card */}
      <div className="rounded-3xl p-6 border border-slate-800 bg-slate-900/70 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <GradientIcon icon={Users} theme="cyan" size="md" variant="boxed" />
            <div>
              <h2 className="text-base font-bold text-white">Cloud Mining Referral Program</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Earn passive USDT commissions whenever your invited friends activate cloud hash contracts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
              Code: <strong className="text-emerald-400">{referralCode}</strong>
            </span>
            <button
              onClick={copyRefCode}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Copy Referral Code"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Share Link Box */}
        <div className="mt-4 p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-slate-300 truncate pl-2">{referralLink}</span>
          <button
            onClick={copyRefLink}
            className="py-1.5 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors shrink-0 flex items-center gap-1.5"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Copied' : 'Share Link'}</span>
          </button>
        </div>

        {/* Tier Commissions Breakdown */}
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Tier 1 Direct</span>
            <span className="text-lg font-extrabold text-emerald-400 font-mono mt-1 block">5.0%</span>
            <span className="text-[10px] text-slate-500">of contract value</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Tier 2 Sub</span>
            <span className="text-lg font-extrabold text-cyan-400 font-mono mt-1 block">2.0%</span>
            <span className="text-[10px] text-slate-500">second-degree miners</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800/60">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Tier 3 Network</span>
            <span className="text-lg font-extrabold text-amber-400 font-mono mt-1 block">1.0%</span>
            <span className="text-[10px] text-slate-500">extended network</span>
          </div>
        </div>
      </div>

      {/* 3. Community & Security Bounty Tasks */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Mining Tasks & Bounties
        </h2>
        <div className="space-y-3">
          {earnTasks.map((task) => {
            const isCompleted = task.status === 'COMPLETED';
            const isClaimed = task.status === 'CLAIMED';

            return (
              <div
                key={task.id}
                className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
                      <h3 className="font-bold text-white text-xs sm:text-sm">{task.title}</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                        {task.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{task.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-emerald-400 block">
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
                        ? 'bg-slate-800 text-slate-500'
                        : isCompleted
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
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
