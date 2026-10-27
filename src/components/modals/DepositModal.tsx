import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Copy, Check, AlertTriangle, QrCode, ArrowDownToLine } from 'lucide-react';
import { GradientIcon } from '../ui/GradientIcon';
import { CoinIcon } from '../ui/CoinIcon';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAsset?: string;
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, defaultAsset = 'USDT' }) => {
  const { user, walletAssets, submitDepositRequest, addToast } = useApp();

  const [selectedSymbol, setSelectedSymbol] = useState(defaultAsset);
  const currentAsset = walletAssets.find((a) => a.symbol === selectedSymbol) || walletAssets[0];
  const [selectedNetwork, setSelectedNetwork] = useState(currentAsset.networks[0]);
  const [copied, setCopied] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasLiveDepositAddress = Boolean(currentAsset.depositAddress && currentAsset.depositAddress.trim().length > 0);
  const isDemoSession = Boolean(user?.isDemo);

  useEffect(() => {
    if (isOpen && defaultAsset) {
      setSelectedSymbol(defaultAsset);
      const target = walletAssets.find((a) => a.symbol === defaultAsset) || walletAssets[0];
      if (target) {
        setSelectedNetwork(target.networks[0]);
      }
    }
  }, [isOpen, defaultAsset, walletAssets]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!hasLiveDepositAddress) return;
    navigator.clipboard.writeText(currentAsset.depositAddress);
    setCopied(true);
    addToast('Address Copied', 'Sandbox deposit address copied to clipboard.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const amountNum = parseFloat(depositAmount);

    try {
      const result = await submitDepositRequest(selectedSymbol, selectedNetwork, amountNum, txHash);
      if (result.success) {
        setDepositAmount('');
        setTxHash('');
        onClose();
      } else {
        addToast('Deposit Request Error', result.message, 'error');
      }
    } catch (err: any) {
      addToast('Deposit Request Failed', err?.message || 'Failed to submit deposit request.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#121925] border border-[#253144] rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-[#253144]">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={ArrowDownToLine} theme="emerald" size="sm" variant="boxed" />
            <div>
              <h3 className="font-bold text-[#F4F7FC] text-base">Deposit Cryptocurrency</h3>
              <p className="text-xs text-[#98A6BA]">Fund your cloud mining account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Asset Selection */}
          <div>
            <label className="block text-xs font-medium text-[#98A6BA] mb-1.5">Select Deposit Asset</label>
            <div className="grid grid-cols-5 gap-2">
              {walletAssets.map((asset) => (
                <button
                  key={asset.symbol}
                  type="button"
                  onClick={() => {
                    setSelectedSymbol(asset.symbol);
                    setSelectedNetwork(asset.networks[0]);
                  }}
                  className={`py-2 px-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
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
            <label className="block text-xs font-medium text-[#98A6BA] mb-1.5">Choose Transfer Network</label>
            <select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2.5 px-3 text-sm text-[#F4F7FC] focus:outline-none focus:border-[#00D6A3]"
            >
              {currentAsset.networks.map((net) => (
                <option key={net} value={net}>
                  {net}
                </option>
              ))}
            </select>
          </div>

          {/* QR & Address vs. Custodial Gateway Unavailable Notice */}
          {hasLiveDepositAddress && isDemoSession ? (
            <div className="p-4 rounded-xl bg-[#0D121C] border border-[#253144] flex flex-col items-center">
              <div className="mb-2 px-2.5 py-0.5 rounded-md bg-[#F3B64B]/15 border border-[#F3B64B]/30 text-[10px] font-mono font-bold text-[#F3B64B] uppercase tracking-wider">
                Sandbox Demo Address — Do Not Send Real Funds
              </div>
              <div className="w-36 h-36 bg-white p-2 rounded-xl flex items-center justify-center shadow-lg relative group">
                <div className="w-full h-full border-4 border-slate-900 flex flex-col items-center justify-center p-2 text-slate-950 text-center">
                  <QrCode className="w-16 h-16 text-slate-900" />
                  <span className="text-[9px] font-mono font-bold mt-1 tracking-wider uppercase">
                    {selectedSymbol} - {selectedNetwork.split(' ')[0]}
                  </span>
                </div>
              </div>

              <div className="mt-3 w-full">
                <span className="text-[11px] text-[#98A6BA] font-medium block text-center mb-1">
                  Simulated {selectedSymbol} Sandbox Address:
                </span>
                <div className="flex items-center gap-1.5 bg-[#121925] p-2 rounded-xl border border-[#253144]">
                  <p className="font-mono text-xs text-[#00D6A3] break-all select-all flex-1 px-1">
                    {currentAsset.depositAddress}
                  </p>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1.5 rounded-lg bg-[#00D6A3]/10 hover:bg-[#00D6A3]/20 text-[#00D6A3] border border-[#00D6A3]/30 transition-colors shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4 text-[#00D6A3]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#0D121C] border border-[#F3B64B]/40 flex flex-col items-center text-center space-y-2">
              <div className="w-11 h-11 rounded-xl bg-[#F3B64B]/10 border border-[#F3B64B]/30 flex items-center justify-center text-[#F3B64B]">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-[#F4F7FC] uppercase tracking-wider">
                Automated Deposit Gateway Not Configured
              </h4>
              <p className="text-[11px] text-[#98A6BA] leading-relaxed">
                Dedicated per-user <strong className="text-[#F4F7FC]">{selectedSymbol}</strong> ({selectedNetwork}) deposit addresses require an active custodial payment gateway integration. Do not send funds to sample addresses. If you have completed an authorized treasury transfer, submit your blockchain TxID below for administrator verification.
              </p>
            </div>
          )}

          {/* Deposit Verification Notice */}
          <div className="p-3 rounded-xl bg-[#F3B64B]/10 border border-[#F3B64B]/30 text-[#F3B64B] text-xs flex gap-2.5 items-start">
            <AlertTriangle className="w-4 h-4 text-[#F3B64B] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-[#F4F7FC]">Confirmation Requirement</p>
              <p className="text-[11px] text-[#98A6BA] leading-relaxed">
                Send only {selectedSymbol} via <strong className="text-[#F4F7FC]">{selectedNetwork}</strong>. Minimum deposit:{' '}
                <strong className="text-[#00D6A3]">
                  {currentAsset.minDeposit} {selectedSymbol}
                </strong>
                . Deposit requests are saved in Firestore as pending confirmation until processed by a trusted backend.
              </p>
            </div>
          </div>

          {/* Submit Deposit Proof Form */}
          <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-[#253144]">
            <h4 className="text-xs font-semibold text-[#F4F7FC] uppercase tracking-wider">
              Submit Deposit Request Reference
            </h4>

            <div>
              <label className="block text-xs font-medium text-[#98A6BA] mb-1">Deposit Amount ({selectedSymbol})</label>
              <input
                type="number"
                step="any"
                required
                min={currentAsset.minDeposit}
                placeholder={`Min ${currentAsset.minDeposit} ${selectedSymbol}`}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2 px-3 text-sm text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#98A6BA] mb-1">Blockchain TxID / Hash</label>
              <input
                type="text"
                required
                placeholder="Paste transaction hash or TxID..."
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2 px-3 text-xs text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] font-bold text-sm transition-all shadow-lg shadow-[#00D6A3]/20 active:scale-[0.99] flex items-center justify-center gap-2"
            >
              {submitting ? 'Submitting to Pool...' : 'Submit Deposit for Verification'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
