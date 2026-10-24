import React, { useState, useEffect } from 'react';
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
  const { user, submitPlanOrder, addToast } = useApp();
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId || MINING_PLANS[0].id);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    if (isOpen && initialPlanId) {
      setSelectedPlanId(initialPlanId);
    }
  }, [isOpen, initialPlanId]);

  if (!isOpen) return null;

  const isRealUser = user && !user.isDemo;
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
      <div className="relative w-full max-w-lg bg-[#121925] border border-[#253144] rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-[#253144]">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={Pickaxe} theme="cyan" size="sm" variant="boxed" />
            <div>
              <h3 className="font-bold text-[#F4F7FC] text-base">Cloud Hashrate Contracts</h3>
              <p className="text-xs text-[#98A6BA]">Upgrade dedicated ASIC cloud capacity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
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
                    ? 'border-[#00D6A3] bg-[#00D6A3]/10 shadow-lg shadow-[#00D6A3]/10'
                    : 'border-[#253144] bg-[#0D121C] hover:border-[#36465D]'
                }`}
              >
                {plan.popular && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30 uppercase tracking-wider">
                    Popular
                  </span>
                )}
                <span className="text-[10px] font-mono font-semibold text-[#98A6BA] uppercase tracking-wider block">
                  {plan.tier} Tier
                </span>
                <h4 className="font-bold text-[#F4F7FC] text-sm mt-0.5">{plan.name}</h4>

                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-extrabold text-[#00D6A3] font-mono">
                    {plan.hashrate}
                  </span>
                  <span className="text-xs font-semibold text-[#98A6BA] font-mono">
                    {plan.hashrateUnit}
                  </span>
                </div>

                <div className="mt-2.5 pt-2 border-t border-[#253144] text-[11px] text-[#98A6BA] space-y-1">
                  <div className="flex justify-between">
                    <span>Yield:</span>
                    <span className="font-mono text-[#00D6A3] font-semibold">
                      ~${plan.estimatedDailyYieldUSD.toFixed(2)}/day
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span className="font-mono text-[#F4F7FC]">{plan.durationDays} Days</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Contract Price:</span>
                    <span className="font-mono font-bold text-[#F4F7FC]">${plan.priceUSD} USDT</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Plan Details & Summary */}
        <div className="mt-4 p-4 rounded-xl bg-[#0D121C] border border-[#253144] text-xs space-y-2">
          <div className="flex items-center justify-between text-[#98A6BA]">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#F3B64B]" />
              <span>Pool Power Consumption</span>
            </span>
            <span className="font-mono text-[#F4F7FC]">{currentPlan.powerConsumptionW} Watts</span>
          </div>

          <div className="flex items-center justify-between text-[#98A6BA]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00D6A3]" />
              <span>Algorithm</span>
            </span>
            <span className="font-mono text-[#F4F7FC]">{currentPlan.algorithm}</span>
          </div>

          <div className="flex items-center justify-between text-[#98A6BA]">
            <span>Maintenance Fee</span>
            <span className="font-mono text-[#F4F7FC]">{currentPlan.maintenanceFeePercent}% included</span>
          </div>
        </div>

        {/* Clear Regulatory & Security Disclosure */}
        {isRealUser ? (
          <div className="mt-3 p-3 rounded-xl bg-[#F3B64B]/10 border border-[#F3B64B]/30 text-[#F3B64B] text-[11px] flex gap-2">
            <ShieldAlert className="w-4 h-4 text-[#F3B64B] shrink-0 mt-0.5" />
            <p>
              <strong>Security Policy:</strong> Real account purchases are disabled until trusted server-side order processing and on-chain payment confirmations are connected. Client-side balance deductions and hashrate upgrades are blocked for security.
            </p>
          </div>
        ) : (
          <div className="mt-3 p-3 rounded-xl bg-[#F3B64B]/10 border border-[#F3B64B]/30 text-[#F3B64B] text-[11px] flex gap-2">
            <ShieldAlert className="w-4 h-4 text-[#F3B64B] shrink-0 mt-0.5" />
            <p>
              Yield values are algorithmic estimates based on current network difficulty. Contract activation uses available USDT demo balance.
            </p>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleOrder}
          disabled={ordering}
          className="mt-4 w-full py-3 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] font-bold text-sm transition-all shadow-lg shadow-[#00D6A3]/20 active:scale-[0.99] flex items-center justify-center gap-2"
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
