import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Copy, Check, AlertTriangle, QrCode, ArrowDownToLine, ShieldCheck, RefreshCw } from 'lucide-react';
import { GradientIcon } from '../ui/GradientIcon';
import { CoinIcon } from '../ui/CoinIcon';
import { AddressQrCode } from '../ui/AddressQrCode';
import { AdminService } from '../../services/adminService';
import type { ManualPaymentMethodConfig } from '../../services/paymentMethodService';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAsset?: string;
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, defaultAsset = 'USDT' }) => {
  const { user, walletAssets, submitDepositRequest, addToast } = useApp();

  const isDemoSession = Boolean(user?.isDemo);

  // Real-user manual payment methods configured by the project owner
  const [enabledMethods, setEnabledMethods] = useState<ManualPaymentMethodConfig[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');

  // Demo-mode fallback selectors
  const [selectedSymbol, setSelectedSymbol] = useState(defaultAsset);
  const currentAsset = walletAssets.find((a) => a.symbol === selectedSymbol) || walletAssets[0];
  const [selectedNetwork, setSelectedNetwork] = useState(currentAsset.networks[0]);

  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [memoUsed, setMemoUsed] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadPaymentMethods = async () => {
    if (isDemoSession) return;
    setLoadingMethods(true);
    try {
      const methods = await AdminService.getPublicPaymentMethods();
      setEnabledMethods(methods);
      if (methods.length > 0) {
        const preferred =
          methods.find((m) => m.symbol.toUpperCase() === defaultAsset.toUpperCase()) || methods[0];
        setSelectedMethodId((prev) =>
          methods.some((m) => m.id === prev) ? prev : preferred.id
        );
      } else {
        setSelectedMethodId('');
      }
    } catch {
      setEnabledMethods([]);
    } finally {
      setLoadingMethods(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (isDemoSession) {
        setSelectedSymbol(defaultAsset);
        const target = walletAssets.find((a) => a.symbol === defaultAsset) || walletAssets[0];
        if (target) {
          setSelectedNetwork(target.networks[0]);
        }
      } else {
        loadPaymentMethods();
      }
    }
  }, [isOpen, defaultAsset, isDemoSession]);

  if (!isOpen) return null;

  const selectedMethod =
    enabledMethods.find((m) => m.id === selectedMethodId) || enabledMethods[0] || null;

  const activeSymbol = isDemoSession
    ? selectedSymbol
    : selectedMethod?.symbol || defaultAsset;
  const activeNetwork = isDemoSession
    ? selectedNetwork
    : selectedMethod?.network || '';
  const activeMinDeposit = isDemoSession
    ? currentAsset.minDeposit
    : selectedMethod?.minDeposit || 10;
  const activeAssetRate =
    walletAssets.find((a) => a.symbol === activeSymbol)?.usdRate || 1;

  const parsedAmount = parseFloat(depositAmount);
  const estimatedUsdtCredit =
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? activeSymbol === 'USDT'
        ? parsedAmount
        : Number((parsedAmount * activeAssetRate).toFixed(2))
      : 0;

  const handleCopyAddress = (addr: string, isDemo = false) => {
    if (!addr) return;
    navigator.clipboard.writeText(addr);
    setCopiedAddress(true);
    addToast(
      'Address Copied',
      isDemo
        ? 'Sandbox deposit address copied to clipboard.'
        : `${activeSymbol} (${activeNetwork}) receiving address copied to clipboard.`,
      'success'
    );
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const handleCopyMemo = (memo: string) => {
    if (!memo) return;
    navigator.clipboard.writeText(memo);
    setCopiedMemo(true);
    addToast('Memo / Tag Copied', 'Destination Tag / Memo copied to clipboard.', 'success');
    setTimeout(() => setCopiedMemo(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDemoSession && !selectedMethod) {
      addToast('Deposit Unavailable', 'Payment method is not configured yet.', 'error');
      return;
    }

    const amountNum = parseFloat(depositAmount);
    if (!Number.isFinite(amountNum) || amountNum < activeMinDeposit) {
      addToast(
        'Minimum Deposit Required',
        `Minimum deposit for ${activeSymbol} (${activeNetwork}) is ${activeMinDeposit} ${activeSymbol}.`,
        'error'
      );
      return;
    }

    if (!isDemoSession && selectedMethod?.memoRequired && !memoUsed.trim()) {
      addToast(
        'Memo / Tag Required',
        `Please enter the ${selectedMethod.memoLabel || 'Memo / Destination Tag'} included with your transfer.`,
        'error'
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitDepositRequest(
        activeSymbol,
        activeNetwork,
        amountNum,
        txHash,
        isDemoSession
          ? undefined
          : {
              paymentMethodId: selectedMethod?.id,
              recipientAddress: selectedMethod?.receivingAddress,
              senderAddress: senderAddress.trim() || undefined,
              memoUsed: memoUsed.trim() || undefined,
              note:
                note.trim() ||
                `Manual Deposit (${activeSymbol} via ${activeNetwork}) — Pending Admin Verification`,
            }
      );
      if (result.success) {
        setDepositAmount('');
        setTxHash('');
        setSenderAddress('');
        setMemoUsed('');
        setNote('');
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
      <div className="relative w-full max-w-lg bg-[#121925] border border-[#253144] rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-[#253144]">
          <div className="flex items-center gap-2.5">
            <GradientIcon icon={ArrowDownToLine} theme="emerald" size="sm" variant="boxed" />
            <div>
              <h3 className="font-bold text-[#F4F7FC] text-base">Deposit Cryptocurrency</h3>
              <p className="text-xs text-[#98A6BA]">
                {isDemoSession
                  ? 'Sandbox Demo Deposit Simulation'
                  : 'Manual Crypto Deposit — Verified Owner Receiving Addresses'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!isDemoSession && (
              <button
                type="button"
                onClick={loadPaymentMethods}
                title="Refresh configured payment methods"
                className="p-1.5 text-[#98A6BA] hover:text-[#00D6A3] rounded-lg hover:bg-[#182232] transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loadingMethods ? 'animate-spin text-[#00D6A3]' : ''}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isDemoSession ? (
          /* SANDBOX DEMO MODE VIEW */
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#98A6BA] mb-1.5">Select Demo Asset</label>
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

            <div className="p-4 rounded-xl bg-[#0D121C] border border-[#253144] flex flex-col items-center">
              <div className="mb-2 px-2.5 py-0.5 rounded-md bg-[#F3B64B]/15 border border-[#F3B64B]/30 text-[10px] font-mono font-bold text-[#F3B64B] uppercase tracking-wider">
                Sandbox Demo Address — Do Not Send Real Funds
              </div>
              <div className="w-36 h-36 bg-white p-2 rounded-xl flex items-center justify-center shadow-lg">
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
                    onClick={() => handleCopyAddress(currentAsset.depositAddress, true)}
                    className="p-1.5 rounded-lg bg-[#00D6A3]/10 hover:bg-[#00D6A3]/20 text-[#00D6A3] border border-[#00D6A3]/30 transition-colors shrink-0"
                  >
                    {copiedAddress ? <Check className="w-4 h-4 text-[#00D6A3]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-[#253144]">
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
                <label className="block text-xs font-medium text-[#98A6BA] mb-1">Simulated TxID / Hash</label>
                <input
                  type="text"
                  required
                  placeholder="Enter any sample TxID (min 8 chars)..."
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2 px-3 text-xs text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] font-bold text-sm transition-all shadow-lg shadow-[#00D6A3]/20 flex items-center justify-center gap-2"
              >
                {submitting ? 'Simulating Deposit...' : 'Simulate Sandbox Deposit'}
              </button>
            </form>
          </div>
        ) : loadingMethods ? (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="w-7 h-7 text-[#00D6A3] animate-spin mx-auto" />
            <p className="text-xs text-[#98A6BA]">Loading verified deposit methods...</p>
          </div>
        ) : enabledMethods.length === 0 || !selectedMethod ? (
          /* NO OWNER PAYMENT METHODS CONFIGURED YET */
          <div className="mt-5 space-y-4">
            <div className="p-5 rounded-2xl bg-[#0D121C] border border-[#F3B64B]/40 flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#F3B64B]/10 border border-[#F3B64B]/30 flex items-center justify-center text-[#F3B64B]">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[#F4F7FC] uppercase tracking-wider">
                  Payment Method Not Configured Yet
                </h4>
                <p className="text-xs text-[#98A6BA] leading-relaxed">
                  No cryptocurrency deposit addresses are currently enabled. For your financial safety, deposits remain disabled until the platform administrator configures and activates official receiving wallet addresses in the Admin Console.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] text-xs font-semibold transition-colors border border-[#253144]"
            >
              Close Window
            </button>
          </div>
        ) : (
          /* REAL USER MANUAL DEPOSIT FLOW WITH OWNER-CONFIGURED ADDRESSES */
          <div className="mt-4 space-y-4">
            {/* 1. Payment Method Selection */}
            <div>
              <label className="block text-xs font-medium text-[#98A6BA] mb-1.5">
                Select Supported Cryptocurrency & Network
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {enabledMethods.map((method) => {
                  const isSelected = method.id === selectedMethod.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedMethodId(method.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? 'border-[#00D6A3] bg-[#00D6A3]/10 text-[#F4F7FC] shadow-sm'
                          : 'border-[#253144] bg-[#0D121C] text-[#98A6BA] hover:border-[#36465D] hover:text-[#F4F7FC]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CoinIcon symbol={method.symbol} size="xs" glow={isSelected} />
                        <div className="truncate">
                          <span className="text-xs font-bold block text-[#F4F7FC]">{method.symbol}</span>
                          <span className="text-[10px] font-mono text-[#98A6BA] block truncate">
                            {method.network}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md border shrink-0 ${
                          isSelected
                            ? 'border-[#00D6A3]/40 bg-[#00D6A3]/20 text-[#00D6A3] font-bold'
                            : 'border-[#253144] bg-[#121925] text-[#98A6BA]'
                        }`}
                      >
                        {method.networkCode}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Owner Receiving Wallet Address & Authentic SVG QR Code */}
            <div className="p-4 rounded-2xl bg-[#0D121C] border border-[#253144] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#98A6BA] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00D6A3]" />
                  Official {selectedMethod.symbol} ({selectedMethod.networkCode}) Deposit Address
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
                  Min: {selectedMethod.minDeposit} {selectedMethod.symbol}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
                <AddressQrCode address={selectedMethod.receivingAddress} size={132} />

                <div className="flex-1 w-full space-y-2.5">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-mono text-[#98A6BA] block mb-1">
                      Receiving Wallet Address ({selectedMethod.network}):
                    </span>
                    <div className="flex items-center gap-1.5 bg-[#121925] p-2.5 rounded-xl border border-[#253144]">
                      <p
                        data-testid="manual-deposit-receiving-address"
                        className="font-mono text-xs text-[#00D6A3] break-all select-all flex-1"
                      >
                        {selectedMethod.receivingAddress}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleCopyAddress(selectedMethod.receivingAddress, false)}
                        title="Copy receiving address"
                        className="p-2 rounded-lg bg-[#00D6A3]/10 hover:bg-[#00D6A3]/20 text-[#00D6A3] border border-[#00D6A3]/30 transition-colors shrink-0"
                      >
                        {copiedAddress ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {(selectedMethod.memoRequired || selectedMethod.memoValue) && (
                    <div className="p-2.5 rounded-xl bg-[#F3B64B]/10 border border-[#F3B64B]/40">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#F3B64B] block mb-1">
                        {selectedMethod.memoLabel || 'Required Memo / Destination Tag'}:
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[#F4F7FC] select-all break-all">
                          {selectedMethod.memoValue || 'Include required Memo/Tag'}
                        </span>
                        {selectedMethod.memoValue && (
                          <button
                            type="button"
                            onClick={() => handleCopyMemo(selectedMethod.memoValue!)}
                            className="p-1.5 rounded-lg bg-[#F3B64B]/20 hover:bg-[#F3B64B]/30 text-[#F3B64B] transition-colors shrink-0"
                          >
                            {copiedMemo ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {selectedMethod.instructions && (
                <p className="text-[11px] text-[#98A6BA] bg-[#121925] p-2.5 rounded-xl border border-[#253144]">
                  {selectedMethod.instructions}
                </p>
              )}
            </div>

            {/* 3. Mandatory 5 Safety Warnings */}
            <div className="p-3.5 rounded-2xl bg-[#F3B64B]/10 border border-[#F3B64B]/30 text-xs space-y-1.5">
              <div className="flex items-center gap-2 text-[#F3B64B] font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Important Deposit Safety Warnings</span>
              </div>
              <ul className="text-[11px] text-[#98A6BA] space-y-1 pl-5 list-disc leading-relaxed">
                <li>
                  Send only <strong className="text-[#F4F7FC]">{selectedMethod.symbol}</strong> via the{' '}
                  <strong className="text-[#F4F7FC]">{selectedMethod.network}</strong> network to this address.
                </li>
                <li>
                  Sending any other coin or using the wrong blockchain network may result in permanent loss of funds.
                </li>
                <li>
                  Minimum deposit amount is{' '}
                  <strong className="text-[#00D6A3]">
                    {selectedMethod.minDeposit} {selectedMethod.symbol}
                  </strong>
                  . Transfers below the minimum cannot be credited.
                </li>
                <li>
                  {selectedMethod.memoRequired
                    ? `You MUST include the ${selectedMethod.memoLabel || 'Memo / Destination Tag'} shown above.`
                    : 'No Destination Tag or Memo is required for this network unless specified above.'}
                </li>
                <li>
                  After sending funds from your external wallet, submit the exact Amount and Blockchain Transaction Hash (TxID) below. Your primary <strong className="text-[#00D6A3]">USDT</strong> wallet balance is credited after administrator verification.
                </li>
              </ul>
            </div>

            {/* 4. Submit Manual Deposit Reference Form */}
            <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-[#253144]">
              <h4 className="text-xs font-semibold text-[#F4F7FC] uppercase tracking-wider">
                Submit Transfer Details for Verification
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#98A6BA] mb-1">
                    Amount Sent ({selectedMethod.symbol}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min={selectedMethod.minDeposit}
                    placeholder={`Min ${selectedMethod.minDeposit} ${selectedMethod.symbol}`}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2 px-3 text-sm text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] font-mono"
                  />
                  {estimatedUsdtCredit > 0 && selectedMethod.symbol !== 'USDT' && (
                    <span className="text-[10px] font-mono text-[#00D6A3] block mt-1">
                      Est. Credit: ~${estimatedUsdtCredit.toLocaleString()} USDT (@ ${activeAssetRate.toLocaleString()})
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#98A6BA] mb-1">
                    Sender Wallet Address (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Your sending wallet address..."
                    value={senderAddress}
                    onChange={(e) => setSenderAddress(e.target.value)}
                    className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2 px-3 text-xs text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#98A6BA] mb-1">
                  Blockchain Transaction Hash (TxID) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Paste blockchain transaction hash / TxID..."
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2 px-3 text-xs text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] font-mono"
                />
              </div>

              {selectedMethod.memoRequired && (
                <div>
                  <label className="block text-xs font-medium text-[#F3B64B] mb-1">
                    {selectedMethod.memoLabel || 'Destination Tag / Memo'} Included *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter the Memo / Tag you included..."
                    value={memoUsed}
                    onChange={(e) => setMemoUsed(e.target.value)}
                    className="w-full bg-[#0D121C] border border-[#F3B64B]/40 rounded-xl py-2 px-3 text-xs text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#F3B64B] font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#98A6BA] mb-1">
                  Reference Note (Optional)
                </label>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="Optional note for administrator review..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-[#0D121C] border border-[#253144] rounded-xl py-2 px-3 text-xs text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] font-bold text-sm transition-all shadow-lg shadow-[#00D6A3]/20 active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {submitting ? 'Submitting Deposit Request...' : 'Submit Deposit for Admin Verification'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
