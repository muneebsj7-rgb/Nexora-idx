import React, { useState } from 'react';
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
  const { walletAssets, submitWithdrawalRequest, addToast } = useApp();

  const [selectedSymbol, setSelectedSymbol] = useState(defaultAsset);
  const currentAsset = walletAssets.find((a) => a.symbol === selectedSymbol) || walletAssets[0];
  const [selectedNetwork, setSelectedNetwork] = useState(currentAsset.networks[0]);
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const netReceive = Math.max(0, numAmount - currentAsset.withdrawFee);

  const handleMax = () => {
    setAmount(currentAsset.balance.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={ArrowUpRight} theme="rose" size="sm" variant="boxed" />
            <div>
              <h3 className="font-bold text-white text-base">Withdraw Mining Payout</h3>
              <p className="text-xs text-slate-400">Transfer rewards to your external wallet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Asset Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Asset to Withdraw</label>
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
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400 shadow-sm shadow-cyan-500/20'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Destination Network</label>
            <select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-cyan-500"
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
            <label className="block text-xs font-medium text-slate-400 mb-1">Recipient Destination Address</label>
            <input
              type="text"
              required
              placeholder={`Enter your ${selectedSymbol} address...`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Amount */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-slate-400">Withdrawal Amount</label>
              <div className="text-xs text-slate-400">
                Avail:{' '}
                <span className="font-mono font-semibold text-white">
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
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-3 pr-16 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                type="button"
                onClick={handleMax}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Fee & Receive Breakdown */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Network Mining Fee:</span>
              <span className="font-mono text-slate-300">
                {currentAsset.withdrawFee} {selectedSymbol}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Estimated Processing:</span>
              <span className="text-slate-300">Automated Audit (~15-30 mins)</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-800 font-semibold">
              <span className="text-white">Net Receive Amount:</span>
              <span className="font-mono text-cyan-400 text-sm">
                {netReceive > 0 ? netReceive.toFixed(selectedSymbol === 'BTC' ? 6 : 2) : '0.00'}{' '}
                {selectedSymbol}
              </span>
            </div>
          </div>

          {/* Security 2FA Verification input */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Security 2FA / Email Auth Code</span>
            </label>
            <input
              type="text"
              placeholder="Enter 6-digit verification code (e.g. 849201)"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              All cloud mining withdrawals are checked by multi-sig safety routines to prevent unauthorized drain.
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting || numAmount <= 0}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-cyan-500/20 active:scale-[0.99]"
          >
            {submitting ? 'Submitting to Queue...' : 'Confirm Withdrawal Request'}
          </button>
        </form>
      </div>
    </div>
  );
};
