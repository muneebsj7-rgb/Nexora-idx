import React, { useState } from 'react';
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
  const { walletAssets, submitDepositRequest, addToast } = useApp();

  const [selectedSymbol, setSelectedSymbol] = useState(defaultAsset);
  const currentAsset = walletAssets.find((a) => a.symbol === selectedSymbol) || walletAssets[0];
  const [selectedNetwork, setSelectedNetwork] = useState(currentAsset.networks[0]);
  const [copied, setCopied] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentAsset.depositAddress);
    setCopied(true);
    addToast('Address Copied', 'Deposit address copied to clipboard.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const amountNum = parseFloat(depositAmount);

    const result = submitDepositRequest(selectedSymbol, selectedNetwork, amountNum, txHash);
    setSubmitting(false);

    if (result.success) {
      setDepositAmount('');
      setTxHash('');
      onClose();
    } else {
      addToast('Validation Error', result.message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={ArrowDownToLine} theme="emerald" size="sm" variant="boxed" />
            <div>
              <h3 className="font-bold text-white text-base">Deposit Cryptocurrency</h3>
              <p className="text-xs text-slate-400">Fund your cloud mining account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Asset Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Select Deposit Asset</label>
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
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-sm shadow-emerald-500/20'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Choose Transfer Network</label>
            <select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              {currentAsset.networks.map((net) => (
                <option key={net} value={net}>
                  {net}
                </option>
              ))}
            </select>
          </div>

          {/* QR & Address */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col items-center">
            {/* Mock QR Code Pattern */}
            <div className="w-36 h-36 bg-white p-2 rounded-xl flex items-center justify-center shadow-lg relative group">
              <div className="w-full h-full border-4 border-slate-900 flex flex-col items-center justify-center p-2 text-slate-950 text-center">
                <QrCode className="w-16 h-16 text-slate-900" />
                <span className="text-[9px] font-mono font-bold mt-1 tracking-wider uppercase">
                  {selectedSymbol} - {selectedNetwork.split(' ')[0]}
                </span>
              </div>
            </div>

            <div className="mt-3 w-full">
              <span className="text-[11px] text-slate-400 font-medium block text-center mb-1">
                Your Dedicated {selectedSymbol} Address:
              </span>
              <div className="flex items-center gap-1.5 bg-slate-900 p-2 rounded-xl border border-slate-800">
                <p className="font-mono text-xs text-emerald-400 break-all select-all flex-1 px-1">
                  {currentAsset.depositAddress}
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors shrink-0"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Deposit Verification Notice */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex gap-2.5 items-start">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-200">Confirmation Requirement</p>
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                Send only {selectedSymbol} via <strong className="text-white">{selectedNetwork}</strong>. Minimum deposit:{' '}
                <strong className="text-white">
                  {currentAsset.minDeposit} {selectedSymbol}
                </strong>
                . Funds are credited after blockchain nodes reach 12 confirmations.
              </p>
            </div>
          </div>

          {/* Submit Deposit Proof Form */}
          <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Notify Automated Node of Deposit
            </h4>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Deposit Amount ({selectedSymbol})</label>
              <input
                type="number"
                step="any"
                required
                min={currentAsset.minDeposit}
                placeholder={`Min ${currentAsset.minDeposit} ${selectedSymbol}`}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Blockchain TxID / Hash</label>
              <input
                type="text"
                required
                placeholder="Paste transaction hash or TxID..."
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99] flex items-center justify-center gap-2"
            >
              {submitting ? 'Submitting to Pool...' : 'Submit Deposit for Verification'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
