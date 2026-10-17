import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Transaction } from '../../types';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Filter,
  X,
  Pickaxe,
  Gift,
  Sparkles
} from 'lucide-react';
import { DepositModal } from '../modals/DepositModal';
import { WithdrawModal } from '../modals/WithdrawModal';
import { CoinIcon } from '../ui/CoinIcon';
import { GradientIcon } from '../ui/GradientIcon';

export const WalletScreen: React.FC = () => {
  const { walletAssets, transactions, addToast } = useApp();

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState('USDT');
  const [txFilter, setTxFilter] = useState<'ALL' | 'PAYOUT' | 'DEPOSIT' | 'WITHDRAWAL'>('ALL');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);

  const totalUSD = walletAssets.reduce((acc, a) => acc + a.balance * a.usdRate, 0);
  const totalLockedUSD = walletAssets.reduce((acc, a) => acc + a.lockedBalance * a.usdRate, 0);

  const filteredTransactions = transactions.filter((tx) => {
    if (txFilter === 'PAYOUT') return tx.type === 'MINING_PAYOUT';
    if (txFilter === 'DEPOSIT') return tx.type === 'DEPOSIT';
    if (txFilter === 'WITHDRAWAL') return tx.type === 'WITHDRAWAL';
    return true;
  });

  const handleOpenDeposit = (symbol: string) => {
    setSelectedAssetSymbol(symbol);
    setDepositOpen(true);
  };

  const handleOpenWithdraw = (symbol: string) => {
    setSelectedAssetSymbol(symbol);
    setWithdrawOpen(true);
  };

  const copyTxHash = (hash?: string) => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopiedTx(true);
    addToast('TxID Copied', 'Transaction hash copied to clipboard.', 'success');
    setTimeout(() => setCopiedTx(false), 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 px-4 sm:px-6 pt-2 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          Mining Wallet & Custody
          <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Multi-Sig Vault
          </span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Secure multi-chain asset balances, deposit addresses, and payout records
        </p>
      </div>

      {/* Main Balance Overview Card */}
      <div className="rounded-3xl p-6 sm:p-7 border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
              Estimated Net Worth
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono mt-1 tracking-tight">
              ${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
              <span>
                Available:{' '}
                <strong className="text-emerald-400 font-mono">
                  ${(totalUSD - totalLockedUSD).toFixed(2)}
                </strong>
              </span>
              <span>
                Locked in Escrow / Withdrawal:{' '}
                <strong className="text-amber-400 font-mono">
                  ${totalLockedUSD.toFixed(2)}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleOpenDeposit('USDT')}
              className="py-2.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center gap-2"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Deposit Funds</span>
            </button>
            <button
              onClick={() => handleOpenWithdraw('USDT')}
              className="py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm border border-slate-700 transition-all active:scale-95 flex items-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              <span>Withdraw</span>
            </button>
          </div>
        </div>
      </div>

      {/* Supported Assets List */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Asset Balances
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {walletAssets.map((asset) => (
            <div
              key={asset.symbol}
              className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CoinIcon symbol={asset.symbol} size="sm" />
                  <div>
                    <h3 className="font-bold text-white text-sm">{asset.symbol}</h3>
                    <span className="text-[10px] text-slate-400 block">{asset.name}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono font-bold text-white text-sm block">
                    {asset.balance.toFixed(asset.symbol === 'BTC' ? 6 : 2)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    ≈ ${(asset.balance * asset.usdRate).toFixed(2)}
                  </span>
                </div>
              </div>

              {asset.lockedBalance > 0 && (
                <div className="mt-2 text-[10px] text-amber-400/90 font-mono">
                  Locked in review: {asset.lockedBalance} {asset.symbol}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex gap-2">
                <button
                  onClick={() => handleOpenDeposit(asset.symbol)}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Deposit</span>
                </button>
                <button
                  onClick={() => handleOpenWithdraw(asset.symbol)}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Withdraw</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction Records with Filter Chips */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Comprehensive Audit Ledger
            </h2>
            <p className="text-xs text-slate-500">Every deposit, withdrawal, and cloud payout record</p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setTxFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                txFilter === 'ALL'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-950/80 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              All Records
            </button>
            <button
              onClick={() => setTxFilter('PAYOUT')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                txFilter === 'PAYOUT'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-950/80 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              Mining Payouts
            </button>
            <button
              onClick={() => setTxFilter('DEPOSIT')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                txFilter === 'DEPOSIT'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-950/80 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              Deposits
            </button>
            <button
              onClick={() => setTxFilter('WITHDRAWAL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                txFilter === 'WITHDRAWAL'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-950/80 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              Withdrawals
            </button>
          </div>
        </div>

        {/* Transactions list */}
        {filteredTransactions.length > 0 ? (
          <div className="space-y-2.5">
            {filteredTransactions.map((tx) => {
              const isPositive = ['DEPOSIT', 'MINING_PAYOUT', 'REFERRAL_BONUS', 'TASK_REWARD'].includes(tx.type);
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {tx.type === 'MINING_PAYOUT' && <GradientIcon icon={Pickaxe} theme="gold" size="sm" variant="boxed" />}
                    {tx.type === 'DEPOSIT' && <GradientIcon icon={ArrowDownLeft} theme="emerald" size="sm" variant="boxed" />}
                    {tx.type === 'WITHDRAWAL' && <GradientIcon icon={ArrowUpRight} theme="rose" size="sm" variant="boxed" />}
                    {tx.type === 'REFERRAL_BONUS' && <GradientIcon icon={Gift} theme="violet" size="sm" variant="boxed" />}
                    {tx.type === 'TASK_REWARD' && <GradientIcon icon={Sparkles} theme="cyan" size="sm" variant="boxed" />}

                    <div>
                      <div className="font-bold text-white text-xs">
                        {tx.note || tx.type.replace('_', ' ')}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {new Date(tx.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`font-mono font-bold text-xs ${isPositive ? 'text-emerald-400' : 'text-slate-200'}`}>
                      {isPositive ? '+' : '-'}{tx.amount} {tx.asset}
                    </div>
                    <div className="mt-0.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                        tx.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : tx.status === 'PENDING_CONFIRMATION' || tx.status === 'PENDING_REVIEW'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {tx.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">
            No transaction records found matching the selected filter.
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-white text-base">Transaction Details</h3>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <span className="text-slate-400 block text-[11px]">Transaction Amount:</span>
                <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block">
                  {selectedTx.amount} {selectedTx.asset}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  ≈ ${selectedTx.amountUSD.toFixed(2)} USD
                </span>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Transaction ID:</span>
                  <span className="font-mono text-slate-200 font-semibold">{selectedTx.id}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-mono text-emerald-400 font-bold">{selectedTx.status}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Network:</span>
                  <span className="text-slate-200">{selectedTx.network || 'Internal Stratum Ledger'}</span>
                </div>

                {selectedTx.txHash && (
                  <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Tx Hash:</span>
                    <div className="flex items-center gap-1 font-mono text-cyan-400">
                      <span>{selectedTx.txHash}</span>
                      <button
                        onClick={() => copyTxHash(selectedTx.txHash)}
                        className="p-1 hover:text-white"
                      >
                        {copiedTx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Timestamp:</span>
                  <span className="font-mono text-slate-300">
                    {new Date(selectedTx.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedTx(null)}
                className="w-full mt-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <DepositModal
        isOpen={depositOpen}
        onClose={() => setDepositOpen(false)}
        defaultAsset={selectedAssetSymbol}
      />
      <WithdrawModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        defaultAsset={selectedAssetSymbol}
      />
    </div>
  );
};
