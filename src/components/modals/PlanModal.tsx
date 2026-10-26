import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { MINING_PLANS } from '../../services/miningService';
import { X, Pickaxe, Zap, CheckCircle2, ShieldCheck, AlertCircle, Wallet, Loader2 } from 'lucide-react';
import { GradientIcon } from '../ui/GradientIcon';

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlanId?: string | null;
  planId?: string | null;
  onOpenDeposit?: () => void;
}

export const PlanModal: React.FC<PlanModalProps> = ({
  isOpen,
  onClose,
  initialPlanId,
  planId,
  onOpenDeposit,
}) => {
  const { user, walletAssets, isOfflineCache, submitPlanOrder, setActiveTab, addToast } = useApp();
  const resolvedInitialId = planId || initialPlanId || MINING_PLANS[0].id;
  const [selectedPlanId, setSelectedPlanId] = useState(resolvedInitialId);
  const [ordering, setOrdering] = useState(false);
  const [orderStatus, setOrderStatus] = useState<'IDLE' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>('IDLE');
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const targetPlan = planId || initialPlanId || MINING_PLANS[0].id;
      setSelectedPlanId(targetPlan);
      setOrderStatus('IDLE');
      setOrderMessage(null);
      setIdempotencyKey(
        `ord_${(user?.id || 'guest').slice(0, 6)}_${targetPlan}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 7)}`
      );
    }
  }, [isOpen, initialPlanId, planId, user?.id]);

  const handleSelectPlan = (nextPlanId: string) => {
    if (ordering) return;
    setSelectedPlanId(nextPlanId);
    setOrderStatus('IDLE');
    setOrderMessage(null);
    setIdempotencyKey(
      `ord_${(user?.id || 'guest').slice(0, 6)}_${nextPlanId}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}`
    );
  };

  if (!isOpen) return null;

  const isRealUser = Boolean(user && !user.isDemo);
  const currentPlan = MINING_PLANS.find((p) => p.id === selectedPlanId) || MINING_PLANS[0];
  const usdtAsset = walletAssets.find((a) => a.symbol === 'USDT');
  const availableUSDT = usdtAsset?.balance ?? 0;
  const hasSufficientBalance = availableUSDT >= currentPlan.priceUSD;

  const handleOrder = async () => {
    if (ordering || !hasSufficientBalance || (isRealUser && isOfflineCache)) return;
    setOrdering(true);
    setOrderStatus('PROCESSING');
    setOrderMessage(null);

    const result = await submitPlanOrder(currentPlan.id, idempotencyKey);
    setOrdering(false);

    if (result.success) {
      setOrderStatus('COMPLETED');
      setOrderMessage(result.message);
      setTimeout(() => {
        onClose();
      }, 900);
    } else {
      setOrderStatus('FAILED');
      setOrderMessage(result.message);
      addToast('Contract Order Notice', result.message, 'warning');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0E1422] border border-[#253144] rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-[#1E293B]">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={Pickaxe} theme="amber" size="sm" variant="boxed" />
            <div>
              <h3 className="font-bold text-[#F4F7FC] text-base">BTC Cloud Mining Contracts</h3>
              <p className="text-xs text-[#98A6BA]">
                SHA-256 contract terms • Atomic server-side USDT settlement
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Available Balance Banner */}
        <div className="mt-4 p-3 rounded-xl bg-[#090D16] border border-[#1E293B] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#98A6BA]">
            <Wallet className="w-4 h-4 text-[#00D6A3]" />
            <span>Available USDT Balance:</span>
            {isRealUser && isOfflineCache && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                Cached View
              </span>
            )}
          </div>
          <span
            className={`font-mono font-bold ${
              hasSufficientBalance ? 'text-[#00D6A3]' : 'text-[#FF647C]'
            }`}
          >
            ${availableUSDT.toFixed(2)} USDT
          </span>
        </div>

        {/* 5 Plan Selector Cards */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MINING_PLANS.map((plan) => {
            const isSelected = plan.id === selectedPlanId;
            return (
              <div
                key={plan.id}
                onClick={() => handleSelectPlan(plan.id)}
                className={`cursor-pointer p-4 rounded-2xl border text-left transition-all relative ${
                  isSelected
                    ? 'border-[#F3B64B] bg-[#141D30] shadow-lg shadow-[#F3B64B]/10'
                    : 'border-[#1E293B] bg-[#090D16] hover:border-[#334155]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                    {plan.tier}
                  </span>
                  <span className="text-[10px] font-mono text-[#98A6BA]">
                    {plan.targetCoin} • {plan.algorithm}
                  </span>
                </div>

                <h4 className="font-extrabold text-[#F4F7FC] text-sm mt-2">{plan.name}</h4>
                <span className="text-[11px] text-[#98A6BA] block">Available contract</span>

                <div className="mt-2 text-lg font-extrabold text-[#F4F7FC] font-mono">
                  ${plan.priceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>

                <div className="mt-2.5 pt-2 border-t border-[#1E293B] text-[11px] text-[#98A6BA] space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span>Hashrate:</span>
                    <span className="text-[#00D6A3] font-bold">
                      {plan.hashrate} {plan.hashrateUnit}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span className="text-[#F4F7FC]">{plan.durationDays} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Displayed Return:</span>
                    <span className="text-[#F3B64B] font-bold">
                      {plan.displayedReturnPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Plan 3 Compact Info Cards */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-center">
            <span className="text-[10px] uppercase font-semibold text-[#98A6BA] block">Hashrate</span>
            <span className="text-xs font-extrabold font-mono text-[#F4F7FC] mt-1 block">
              {currentPlan.hashrate} {currentPlan.hashrateUnit}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-center">
            <span className="text-[10px] uppercase font-semibold text-[#98A6BA] block">Duration</span>
            <span className="text-xs font-extrabold font-mono text-[#F4F7FC] mt-1 block">
              {currentPlan.durationDays} days
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-center">
            <span className="text-[10px] uppercase font-semibold text-[#98A6BA] block">Return</span>
            <span className="text-xs font-extrabold font-mono text-[#F3B64B] mt-1 block">
              {currentPlan.displayedReturnPercent.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Order Status Banner */}
        {orderStatus === 'COMPLETED' && orderMessage && (
          <div className="mt-3 p-3 rounded-xl bg-[#00D6A3]/15 border border-[#00D6A3]/30 text-[#00D6A3] text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{orderMessage}</span>
          </div>
        )}

        {orderStatus === 'FAILED' && orderMessage && (
          <div className="mt-3 p-3 rounded-xl bg-[#FF647C]/15 border border-[#FF647C]/30 text-[#FF647C] text-xs flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{orderMessage}</span>
            </div>
            {!hasSufficientBalance && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenDeposit) {
                    onOpenDeposit();
                  } else {
                    setActiveTab('wallet');
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-[#FF647C]/20 hover:bg-[#FF647C]/30 text-[#F4F7FC] font-semibold text-[11px] shrink-0"
              >
                Deposit USDT
              </button>
            )}
          </div>
        )}

        {/* Disclosure */}
        <div className="mt-3 p-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-[#98A6BA] text-[11px] flex gap-2">
          <ShieldCheck className="w-4 h-4 text-[#F3B64B] shrink-0 mt-0.5" />
          <p>
            <strong className="text-[#F4F7FC]">Contract Terms &amp; Simulation Notice:</strong>{' '}
            Displayed returns represent configurable contract terms only, not guaranteed earnings. Purchases are settled atomically against your server-confirmed USDT balance.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={handleOrder}
          disabled={ordering || orderStatus === 'COMPLETED' || !hasSufficientBalance || (isRealUser && isOfflineCache)}
          className={`mt-4 w-full py-3 rounded-xl font-extrabold text-sm transition-all flex items-center justify-center gap-2 ${
            !hasSufficientBalance
              ? 'bg-[#161F30] text-[#98A6BA] border border-[#253144] cursor-not-allowed opacity-75'
              : 'bg-gradient-to-r from-[#F3B64B] to-[#E59A28] hover:from-[#F7C469] hover:to-[#F3B64B] text-[#080B12] shadow-lg'
          }`}
        >
          {ordering ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Settling Contract Order...</span>
            </>
          ) : orderStatus === 'COMPLETED' ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Contract Activated</span>
            </>
          ) : !hasSufficientBalance ? (
            <span>Insufficient balance</span>
          ) : (
            <>
              <Zap className="w-4 h-4 fill-current" />
              <span>
                Purchase {currentPlan.name} • $
                {currentPlan.priceUSD.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                USDT
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
