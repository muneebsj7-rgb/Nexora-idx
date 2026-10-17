import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { MINING_PLANS } from '../../services/miningService';
import { X, Pickaxe, Zap, CheckCircle2, ShieldAlert } from 'lucide-react';
import { GradientIcon } from '../ui/GradientIcon';

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlanId?: string;
}

export const PlanModal: React.FC<PlanModalProps> = ({ isOpen, onClose, initialPlanId }) => {
  const { submitPlanOrder, addToast } = useApp();
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId || MINING_PLANS[0].id);
  const [ordering, setOrdering] = useState(false);

  if (!isOpen) return null;

  const currentPlan = MINING_PLANS.find((p) => p.id === selectedPlanId) || MINING_PLANS[0];

  const handleOrder = () => {
    setOrdering(true);
    const result = submitPlanOrder(currentPlan.name, currentPlan.priceUSD);
    setOrdering(false);
    if (result.success) {
      onClose();
    } else {
      addToast('Order Notice', result.message, 'warning');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={Pickaxe} theme="cyan" size="sm" variant="boxed" />
            <div>
              <h3 className="font-bold text-white text-base">Cloud Hashrate Contracts</h3>
              <p className="text-xs text-slate-400">Upgrade dedicated ASIC cloud capacity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Plan Cards Grid */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MINING_PLANS.map((plan) => {
            const isSelected = plan.id === selectedPlanId;
            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`cursor-pointer p-4 rounded-xl border text-left transition-all relative ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                {plan.popular && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                    Popular
                  </span>
                )}
                <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider block">
                  {plan.tier} Tier
                </span>
                <h4 className="font-bold text-white text-sm mt-0.5">{plan.name}</h4>

                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-extrabold text-emerald-400 font-mono">
                    {plan.hashrate}
                  </span>
                  <span className="text-xs font-semibold text-slate-300 font-mono">
                    {plan.hashrateUnit}
                  </span>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-300 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Yield:</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      ~${plan.estimatedDailyYieldUSD.toFixed(2)}/day
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Duration:</span>
                    <span className="font-mono text-slate-200">{plan.durationDays} Days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Contract Price:</span>
                    <span className="font-mono font-bold text-white">${plan.priceUSD} USDT</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Plan Details & Summary */}
        <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Pool Power Consumption</span>
            </span>
            <span className="font-mono text-slate-200">{currentPlan.powerConsumptionW} Watts</span>
          </div>

          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Algorithm</span>
            </span>
            <span className="font-mono text-slate-200">{currentPlan.algorithm}</span>
          </div>

          <div className="flex items-center justify-between text-slate-300">
            <span>Maintenance Fee</span>
            <span className="font-mono text-slate-200">{currentPlan.maintenanceFeePercent}% included</span>
          </div>
        </div>

        {/* Clear Regulatory Disclosure */}
        <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p>
            Yield values are algorithmic estimates based on current network difficulty. Contract activation uses available USDT wallet balance.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={handleOrder}
          disabled={ordering}
          className="mt-4 w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99] flex items-center justify-center gap-2"
        >
          {ordering ? (
            'Processing Allocation...'
          ) : (
            `Activate ${currentPlan.name} ($${currentPlan.priceUSD} USDT)`
          )}
        </button>
      </div>
    </div>
  );
};
