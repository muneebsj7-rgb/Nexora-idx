import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, ArrowUpRight, AlertCircle, ShieldCheck } from 'lucide-react';
import { GradientIcon } from '../ui/GradientIcon';
import { CoinIcon } from '../ui/CoinIcon';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAsset?: string;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose, defaultAsset = 'USDT' }) => {
  const { user, walletAssets, submitWithdrawalRequest, addToast } = useApp();

  const [selectedSymbol, setSelectedSymbol] = useState(defaultAsset);
  const currentAsset = walletAssets.find((a) => a.symbol === selectedSymbol) || walletAssets[0];
  const [selectedNetwork, setSelectedNetwork] = useState(currentAsset.networks[0]);
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && defaultAsset) {
      setSelectedSymbol(defaultAsset);
      const target = walletAssets.find((a) => a.symbol === defaultAsset) || walletAssets[0];
      if (target) {
        setSelectedNetwork(target.networks[0]);
      }
    }
  }, [isOpen, defaultAsset]);

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const netReceive = Math.max(0, numAmount - currentAsset.withdrawFee);

  const handleMax = () => {
    setAmount(currentAsset.balance.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= currentAsset.withdrawFee) {
      addToast('Invalid Amount', `Withdrawal amount must exceed the network fee (${currentAsset.withdrawFee} ${selectedSymbol}).`, 'error');
      return;
    }
    if (user?.twoFactorEnabled && !/^\d{6}$/.test(twoFactorCode.trim())) {
      addToast('2FA Required', 'Please enter a valid 6-digit Two-Factor Authentication code.', 'error');
      return;
    }

    setSubmitting(true);

    try {
      const result = await submitWithdrawalRequest(selectedSymbol, selectedNetwork, numAmount, address);
      if (result.success) {
        setAmount('');
        setAddress('');
        setTwoFactorCode('');
        onClose();
      } else {
        addToast('Withdrawal Denied', result.message, 'error');
      }
    } catch (err: any) {
      addToast('Withdrawal Error', err?.message || 'Failed to submit withdrawal request.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#121925] border border-[#253144] rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-[#253144]">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={ArrowUpRight} theme="rose" size="sm" variant="boxed" />
            <div>
              <h3 className="font-bold text-[#F4F7FC] text-base">Withdraw Mining Payout</h3>
              <p className="text-xs text-[#98A6BA]">Transfer rewards to your external wallet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Asset Selection */}
          <div>
            <label className="block text-xs font-medium text-[#98A6BA] mb-1.5">Asset to Withdraw</label>
            <div className="grid grid-cols-4 gap-2">
              {walletAssets.map((asset) => (
                <button
                  key={asset.symbol}
                  type="button"
                  onClick={() => {
                    setSelectedSymbol(asset.symbol);
                    setSelectedNetwork(asset.networks[0]);
                  }}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                    selectedSymbol === asset.symbol
                      ? 'border-[#00D6A3] bg-[#00D6A3]/10 text-[#00D6A3] shadow-sm'
                      : 'border-[#253144] bg-[#0D121C] text-[#98A6BA] hover:border-[#36465D] hover:text-[#F4F7FC]'
                  }`}
                >
                  <CoinIcon symbol={asset.symbol} size="xs" glow={selectedSymbol === asset.symbol} />
                  <span className="font-mono text-xs">{asset.symbol}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Network Selection */}
          <div>
            <label className="block text-xs font-medium text-[#98A6BA] mb-1.5">Destination Network</label>
            <select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2 px-3 text-sm text-[#F4F7FC] focus:outline-none focus:border-[#00D6A3]"
            >
              {currentAsset.networks.map((net) => (
                <option key={net} value={net}>
                  {net}
                </option>
              ))}
            </select>
          </div>

          {/* Recipient Address */}
          <div>
            <label className="block text-xs font-medium text-[#98A6BA] mb-1">Recipient Destination Address</label>
            <input
              type="text"
              required
              placeholder={`Enter your ${selectedSymbol} address...`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2 px-3 text-xs text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] font-mono"
            />
          </div>

          {/* Amount */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-[#98A6BA]">Withdrawal Amount</label>
              <div className="text-xs text-[#98A6BA]">
                Avail:{' '}
                <span className="font-mono font-semibold text-[#F4F7FC]">
                  {currentAsset.balance} {selectedSymbol}
                </span>
              </div>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                required
                min={currentAsset.minWithdraw}
                max={currentAsset.balance}
                placeholder={`Min ${currentAsset.minWithdraw} ${selectedSymbol}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2.5 pl-3 pr-16 text-sm text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] font-mono"
              />
              <button
                type="button"
                onClick={handleMax}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-bold bg-[#00D6A3]/15 hover:bg-[#00D6A3]/25 text-[#00D6A3] rounded-lg transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Fee & Receive Breakdown */}
          <div className="p-3 rounded-xl bg-[#0D121C] border border-[#253144] text-xs space-y-1.5">
            <div className="flex justify-between text-[#98A6BA]">
              <span>Network Mining Fee:</span>
              <span className="font-mono text-[#F4F7FC]">
                {currentAsset.withdrawFee} {selectedSymbol}
              </span>
            </div>
            <div className="flex justify-between text-[#98A6BA]">
              <span>Estimated Processing:</span>
              <span className="text-[#98A6BA]">Queue Review (Pending)</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-[#253144] font-semibold">
              <span className="text-[#F4F7FC]">Net Receive Amount:</span>
              <span className="font-mono text-[#00D6A3] text-sm">
                {netReceive > 0 ? netReceive.toFixed(selectedSymbol === 'BTC' ? 6 : 2) : '0.00'}{' '}
                {selectedSymbol}
              </span>
            </div>
          </div>

          {/* Security 2FA Verification input */}
          <div>
            <label className="block text-xs font-medium text-[#98A6BA] mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00D6A3]" />
              <span>Security 2FA / Email Auth Code</span>
            </label>
            <input
              type="text"
              placeholder="Enter 6-digit verification code (e.g. 849201)"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2 px-3 text-xs text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] font-mono"
            />
          </div>

          <div className="p-2.5 rounded-xl bg-[#0D121C] border border-[#253144] text-[11px] text-[#98A6BA] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#25B9F3] shrink-0 mt-0.5" />
            <span>
              Withdrawal requests are submitted to Firestore with status PENDING_REVIEW. Direct client balance deductions are disabled.
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting || numAmount <= 0}
            className="w-full py-2.5 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] disabled:opacity-50 text-[#080B12] font-bold text-sm transition-all shadow-lg shadow-[#00D6A3]/20 active:scale-[0.99]"
          >
            {submitting ? 'Submitting to Queue...' : 'Confirm Withdrawal Request'}
          </button>
        </form>
      </div>
    </div>
  );
};
