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
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  XCircle,
  FileText,
  ExternalLink
} from 'lucide-react';
import { DepositModal } from '../modals/DepositModal';
import { WithdrawModal } from '../modals/WithdrawModal';
import { CoinIcon } from '../ui/CoinIcon';
import { GradientIcon } from '../ui/GradientIcon';
import { AdminService, PendingDepositItem, AdminSetupStatus } from '../../services/adminService';

export const WalletScreen: React.FC = () => {
  const { user, walletAssets, transactions, addToast } = useApp();

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState('USDT');
  const [txFilter, setTxFilter] = useState<'ALL' | 'PAYOUT' | 'DEPOSIT' | 'WITHDRAWAL' | 'REJECTED'>('ALL');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);

  // Admin state
  const isAuthorizedAdmin = AdminService.isAuthorizedAdmin(user);
  const [adminPanelOpen, setAdminPanelOpen] = useState(true);
  const [adminPendingDeposits, setAdminPendingDeposits] = useState<PendingDepositItem[]>([]);
  const [loadingPendingDeposits, setLoadingPendingDeposits] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [adminSetupStatus, setAdminSetupStatus] = useState<AdminSetupStatus | null>(null);
  const [showSetupDetails, setShowSetupDetails] = useState(false);

  const totalUSD = walletAssets.reduce((acc, a) => acc + a.balance * a.usdRate, 0);
  const totalLockedUSD = walletAssets.reduce((acc, a) => acc + a.lockedBalance * a.usdRate, 0);

  // Load pending deposits if authorized admin
  const loadAdminData = async () => {
    if (!isAuthorizedAdmin) return;
    setLoadingPendingDeposits(true);
    try {
      const [deposits, status] = await Promise.all([
        AdminService.fetchPendingDeposits().catch(() => []),
        AdminService.fetchSetupStatus().catch(() => null),
      ]);
      setAdminPendingDeposits(deposits);
      if (status) setAdminSetupStatus(status);
    } catch {
      // ignore
    } finally {
      setLoadingPendingDeposits(false);
    }
  };

  React.useEffect(() => {
    if (isAuthorizedAdmin) {
      loadAdminData();
    }
  }, [isAuthorizedAdmin]);

  const handleApproveDeposit = async (userId: string, txId: string) => {
    setActionInProgressId(txId);
    try {
      const res = await AdminService.approveDeposit(userId, txId);
      if (res.alreadyProcessed) {
        addToast('Already Credited', res.message, 'info');
      } else {
        addToast('Deposit Approved & Credited!', res.message, 'success');
      }
      setAdminPendingDeposits((prev) => prev.filter((d) => d.id !== txId));
      if (selectedTx && selectedTx.id === txId) {
        setSelectedTx((prev) => prev ? {
          ...prev,
          status: 'COMPLETED',
          walletCredited: true,
          creditedAmount: res.creditedAmount,
          creditedAsset: res.creditedAsset,
        } : null);
      }
    } catch (err: any) {
      addToast('Approval Error', err?.message || 'Failed to approve deposit.', 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleRejectDeposit = async (userId: string, txId: string, customReason?: string) => {
    setActionInProgressId(txId);
    try {
      const res = await AdminService.rejectDeposit(userId, txId, customReason || 'Transaction unconfirmed on blockchain network.');
      addToast('Deposit Request Rejected', res.message, 'warning');
      setAdminPendingDeposits((prev) => prev.filter((d) => d.id !== txId));
      if (selectedTx && selectedTx.id === txId) {
        setSelectedTx((prev) => prev ? {
          ...prev,
          status: 'REJECTED',
          rejectionReason: customReason || 'Transaction unconfirmed on blockchain network.',
        } : null);
      }
    } catch (err: any) {
      addToast('Rejection Error', err?.message || 'Failed to reject deposit.', 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (txFilter === 'PAYOUT') return tx.type === 'MINING_PAYOUT';
    if (txFilter === 'DEPOSIT') return tx.type === 'DEPOSIT';
    if (txFilter === 'WITHDRAWAL') return tx.type === 'WITHDRAWAL';
    if (txFilter === 'REJECTED') return tx.status === 'REJECTED' || tx.status === 'FAILED';
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

  const isRealUser = Boolean(user && !user.isDemo);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 px-4 sm:px-6 pt-2 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#F4F7FC] tracking-tight flex items-center gap-2">
            Mining Wallet & Custody
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
              Multi-Sig Vault
            </span>
          </h1>
          <p className="text-xs text-[#98A6BA] mt-1">
            Secure multi-chain asset balances, deposit addresses, and payout records
          </p>
        </div>

        <div>
          {isRealUser ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
              <span className="w-2 h-2 rounded-full bg-[#00D6A3] animate-pulse" />
              Firestore Synced
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-[#F3B64B]/10 text-[#F3B64B] border border-[#F3B64B]/30">
              <span className="w-2 h-2 rounded-full bg-[#F3B64B]" />
              Demo Sandbox (Simulated)
            </span>
          )}
        </div>
      </div>

      {/* Administrator Deposit Settlement Desk */}
      {isAuthorizedAdmin && (
        <div className="rounded-3xl p-5 border border-[#F3B64B]/40 bg-gradient-to-br from-[#1A1813] via-[#121925] to-[#121925] shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#253144]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#F3B64B]/15 border border-[#F3B64B]/30 flex items-center justify-center text-[#F3B64B]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-[#F4F7FC]">
                    Admin Deposit Verification & Settlement Desk
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-[#F3B64B]/20 text-[#F3B64B] border border-[#F3B64B]/40">
                    {user?.email || 'Admin'}
                  </span>
                </div>
                <p className="text-[11px] text-[#98A6BA] mt-0.5">
                  Authoritatively verify blockchain deposits and atomically credit users' available balances
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadAdminData}
                disabled={loadingPendingDeposits}
                className="py-1.5 px-3 rounded-xl bg-[#0D121C] hover:bg-[#182232] text-[#98A6BA] hover:text-[#F4F7FC] border border-[#253144] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Refresh pending deposits"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPendingDeposits ? 'animate-spin text-[#00D6A3]' : ''}`} />
                <span>Refresh Queue</span>
              </button>
              <button
                onClick={() => setAdminPanelOpen(!adminPanelOpen)}
                className="p-1.5 rounded-xl bg-[#0D121C] text-[#98A6BA] hover:text-[#F4F7FC] border border-[#253144]"
              >
                {adminPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {adminPanelOpen && (
            <div className="mt-4 space-y-3">
              {/* Architecture & Security Notice */}
              <div className="p-3 rounded-2xl bg-[#0D121C] border border-[#253144] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="text-[11px] text-[#98A6BA] leading-relaxed">
                  <span className="font-semibold text-[#00D6A3]">Security Invariant:</span> Client-side wallet balance writes are prohibited by Firestore security rules (<code className="font-mono text-[#00D6A3]">match /wallet/* &#123; allow write: if false; &#125;</code>). Clicking <strong>Approve & Credit Balance</strong> triggers a trusted backend transaction that verifies idempotency and credits the user's available balance in Firestore.
                </div>
                <button
                  onClick={() => setShowSetupDetails(!showSetupDetails)}
                  className="shrink-0 text-[11px] font-mono text-[#25B9F3] hover:underline flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{showSetupDetails ? 'Hide Setup' : 'Cloud Setup'}</span>
                </button>
              </div>

              {showSetupDetails && adminSetupStatus && (
                <div className="p-3.5 rounded-2xl bg-[#080B12] border border-[#253144] text-xs space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between text-[#98A6BA]">
                    <span>Admin Allowlist:</span>
                    <span className="text-[#00D6A3]">{adminSetupStatus.adminEmails.join(', ')}</span>
                  </div>
                  <div className="flex justify-between text-[#98A6BA]">
                    <span>Server Admin Ready:</span>
                    <span className={adminSetupStatus.isConfigured ? 'text-[#00D6A3]' : 'text-[#F3B64B]'}>
                      {adminSetupStatus.isConfigured ? 'Yes (Credentials Connected)' : 'Deferred / Requires Service Account'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#98A6BA]">
                    <span>Cloud Function Blueprint:</span>
                    <span className="text-[#25B9F3]">/functions/index.ts (Ready for Firebase CLI)</span>
                  </div>
                  <ul className="list-disc pl-4 text-[10px] text-[#98A6BA] space-y-0.5 pt-1 border-t border-[#253144]">
                    {adminSetupStatus.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pending Queue List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[#98A6BA] font-semibold px-1">
                  <span>Pending Deposit Queue ({adminPendingDeposits.length + transactions.filter(t => t.type === 'DEPOSIT' && t.status === 'PENDING_CONFIRMATION').length})</span>
                </div>

                {adminPendingDeposits.length === 0 && transactions.filter(t => t.type === 'DEPOSIT' && t.status === 'PENDING_CONFIRMATION').length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#98A6BA] bg-[#0D121C] rounded-2xl border border-[#253144]">
                    No pending deposits awaiting verification. All deposits are either completed or unsubmitted.
                  </div>
                ) : (
                  Array.from(new Map([
                    ...transactions.filter(t => t.type === 'DEPOSIT' && t.status === 'PENDING_CONFIRMATION').map(t => [t.id, { ...t, userId: t.userId || user?.id || '' }]),
                    ...adminPendingDeposits.map(d => [d.id, d]),
                  ]).values()).map((deposit) => (
                    <div
                      key={deposit.id}
                      className="p-3.5 rounded-2xl bg-[#0D121C] border border-[#253144] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-[#F4F7FC] text-sm">
                            +{deposit.amount} {deposit.asset}
                          </span>
                          <span className="text-[10px] px-2 py-0.2 rounded font-mono font-semibold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                            PENDING CONFIRMATION
                          </span>
                          {deposit.network && (
                            <span className="text-[10px] text-[#98A6BA] font-mono">
                              ({deposit.network})
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-[#98A6BA] flex items-center gap-2 flex-wrap">
                          <span>User: <strong className="text-[#F4F7FC]">{deposit.userId}</strong></span>
                          <span>•</span>
                          <span>TxID: <strong className="text-[#25B9F3]">{deposit.txHash || deposit.id}</strong></span>
                          {deposit.txHash && (
                            <button
                              onClick={() => copyTxHash(deposit.txHash)}
                              className="text-[#98A6BA] hover:text-[#F4F7FC]"
                              title="Copy Tx Hash"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRejectDeposit(deposit.userId, deposit.id)}
                          disabled={actionInProgressId === deposit.id}
                          className="py-1.5 px-3 rounded-xl bg-[#080B12] hover:bg-[#FF4D4D]/20 text-[#FF4D4D] border border-[#FF4D4D]/30 font-semibold text-xs transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                        <button
                          onClick={() => handleApproveDeposit(deposit.userId, deposit.id)}
                          disabled={actionInProgressId === deposit.id}
                          className="py-1.5 px-3.5 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] font-bold text-xs shadow-md shadow-[#00D6A3]/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {actionInProgressId === deposit.id ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Crediting...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5 stroke-[3px]" />
                              <span>Approve & Credit Balance</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Balance Overview Card */}
      <div className="rounded-3xl p-6 sm:p-7 border border-[#00D6A3]/30 bg-gradient-to-br from-[#121925] via-[#102324] to-[#121925] shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#00D6A3] uppercase tracking-wider block">
                Estimated Net Worth
              </span>
              {isRealUser ? (
                <span className="text-[10px] px-2 py-0.2 rounded bg-[#0D121C] text-[#98A6BA] font-mono border border-[#253144]">
                  Read-Only Client
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.2 rounded bg-[#F3B64B]/15 text-[#F3B64B] font-mono border border-[#F3B64B]/30">
                  Simulated Balance
                </span>
              )}
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-[#F4F7FC] font-mono mt-1 tracking-tight">
              ${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-[#98A6BA]">
              <span>
                Available:{' '}
                <strong className="text-[#00D6A3] font-mono">
                  ${(totalUSD - totalLockedUSD).toFixed(2)}
                </strong>
              </span>
              <span>
                Locked in Escrow / Withdrawal:{' '}
                <strong className="text-[#F3B64B] font-mono">
                  ${totalLockedUSD.toFixed(2)}
                </strong>
              </span>
            </div>

            {isRealUser && (
              <p className="mt-3 text-[11px] text-[#98A6BA] max-w-xl leading-relaxed">
                <span className="text-[#00D6A3] font-semibold">Financial Security:</span> Wallet balances are locked against client-side modification by Firestore security rules. Client transactions are stored as pending requests and require trusted backend or admin processing to adjust balances.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleOpenDeposit('USDT')}
              className="py-2.5 px-5 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] font-bold text-xs sm:text-sm transition-all shadow-lg shadow-[#00D6A3]/20 active:scale-95 flex items-center gap-2"
            >
              <ArrowDownLeft className="w-4 h-4 stroke-[2.5px]" />
              <span>Deposit Funds</span>
            </button>
            <button
              onClick={() => handleOpenWithdraw('USDT')}
              className="py-2.5 px-5 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] font-bold text-xs sm:text-sm border border-[#253144] transition-all active:scale-95 flex items-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4 text-[#00D6A3] stroke-[2.5px]" />
              <span>Withdraw</span>
            </button>
          </div>
        </div>
      </div>

      {/* Supported Assets List */}
      <div>
        <h2 className="text-xs font-bold text-[#98A6BA] uppercase tracking-wider mb-3">
          Asset Balances
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {walletAssets.map((asset) => (
            <div
              key={asset.symbol}
              className="p-4 rounded-2xl bg-[#121925] border border-[#253144] hover:border-[#36465D] transition-all flex flex-col justify-between shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CoinIcon symbol={asset.symbol} size="sm" />
                  <div>
                    <h3 className="font-bold text-[#F4F7FC] text-sm">{asset.symbol}</h3>
                    <span className="text-[10px] text-[#98A6BA] block">{asset.name}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono font-bold text-[#F4F7FC] text-sm block">
                    {asset.balance.toFixed(asset.symbol === 'BTC' ? 6 : 2)}
                  </span>
                  <span className="text-[10px] text-[#98A6BA] font-mono block">
                    ≈ ${(asset.balance * asset.usdRate).toFixed(2)}
                  </span>
                </div>
              </div>

              {asset.lockedBalance > 0 && (
                <div className="mt-2 text-[10px] text-[#F3B64B] font-mono">
                  Locked in review: {asset.lockedBalance} {asset.symbol}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-[#253144] flex gap-2">
                <button
                  onClick={() => handleOpenDeposit(asset.symbol)}
                  className="flex-1 py-1.5 rounded-lg bg-[#182232] hover:bg-[#00D6A3] hover:text-[#080B12] text-[#F4F7FC] font-semibold text-xs transition-colors flex items-center justify-center gap-1 border border-[#253144]"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Deposit</span>
                </button>
                <button
                  onClick={() => handleOpenWithdraw(asset.symbol)}
                  className="flex-1 py-1.5 rounded-lg bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] font-semibold text-xs transition-colors flex items-center justify-center gap-1 border border-[#253144]"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#00D6A3]" />
                  <span>Withdraw</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction Records with Filter Chips */}
      <div className="rounded-3xl border border-[#253144] bg-[#121925] p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xs font-bold text-[#98A6BA] uppercase tracking-wider">
              Comprehensive Audit Ledger
            </h2>
            <p className="text-xs text-[#98A6BA]">Every deposit, withdrawal, and cloud payout record</p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setTxFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                txFilter === 'ALL'
                  ? 'bg-[#00D6A3] text-[#080B12] font-bold'
                  : 'bg-[#0D121C] text-[#98A6BA] border border-[#253144] hover:text-[#F4F7FC]'
              }`}
            >
              All Records
            </button>
            <button
              onClick={() => setTxFilter('PAYOUT')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                txFilter === 'PAYOUT'
                  ? 'bg-[#00D6A3] text-[#080B12] font-bold'
                  : 'bg-[#0D121C] text-[#98A6BA] border border-[#253144] hover:text-[#F4F7FC]'
              }`}
            >
              Mining Payouts
            </button>
            <button
              onClick={() => setTxFilter('DEPOSIT')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                txFilter === 'DEPOSIT'
                  ? 'bg-[#00D6A3] text-[#080B12] font-bold'
                  : 'bg-[#0D121C] text-[#98A6BA] border border-[#253144] hover:text-[#F4F7FC]'
              }`}
            >
              Deposits
            </button>
            <button
              onClick={() => setTxFilter('WITHDRAWAL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                txFilter === 'WITHDRAWAL'
                  ? 'bg-[#00D6A3] text-[#080B12] font-bold'
                  : 'bg-[#0D121C] text-[#98A6BA] border border-[#253144] hover:text-[#F4F7FC]'
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
              const isPending = tx.status === 'PENDING_CONFIRMATION' || tx.status === 'PENDING_REVIEW';
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className="p-3.5 rounded-2xl bg-[#0D121C] border border-[#253144] hover:border-[#36465D] hover:bg-[#182232] cursor-pointer transition-all flex items-center justify-between gap-3 overflow-hidden shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {tx.type === 'MINING_PAYOUT' && <GradientIcon icon={Pickaxe} theme="gold" size="sm" variant="boxed" />}
                    {tx.type === 'DEPOSIT' && <GradientIcon icon={ArrowDownLeft} theme="emerald" size="sm" variant="boxed" />}
                    {tx.type === 'WITHDRAWAL' && <GradientIcon icon={ArrowUpRight} theme="rose" size="sm" variant="boxed" />}
                    {tx.type === 'REFERRAL_BONUS' && <GradientIcon icon={Gift} theme="violet" size="sm" variant="boxed" />}
                    {tx.type === 'TASK_REWARD' && <GradientIcon icon={Sparkles} theme="cyan" size="sm" variant="boxed" />}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[#F4F7FC] text-xs truncate">
                          {tx.note || tx.type.replace('_', ' ')}
                        </span>
                        {tx.isDemo && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                            DEMO
                          </span>
                        )}
                        {isPending && !tx.isDemo && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30">
                            FIRESTORE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#98A6BA] font-mono mt-0.5 truncate flex items-center gap-1.5">
                        <span>{new Date(tx.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        {tx.network && <span>• {tx.network}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`font-mono font-bold text-xs ${isPositive ? 'text-[#19C784]' : 'text-[#F4F7FC]'}`}>
                      {isPositive ? '+' : '-'}{tx.amount} {tx.asset}
                    </div>
                    <div className="mt-0.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold inline-block ${
                        tx.status === 'COMPLETED'
                          ? 'bg-[#19C784]/15 text-[#19C784] border border-[#19C784]/30'
                          : tx.status === 'PENDING_CONFIRMATION'
                          ? 'bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30'
                          : tx.status === 'PENDING_REVIEW'
                          ? 'bg-[#25B9F3]/15 text-[#25B9F3] border border-[#25B9F3]/30'
                          : 'bg-[#182232] text-[#98A6BA] border border-[#253144]'
                      }`}>
                        {tx.status === 'PENDING_CONFIRMATION'
                          ? 'Awaiting Confirmation'
                          : tx.status === 'PENDING_REVIEW'
                          ? 'Compliance Review'
                          : tx.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-[#98A6BA] space-y-1 bg-[#0D121C] rounded-2xl border border-[#253144]">
            <p className="font-semibold text-[#F4F7FC]">No transaction records found.</p>
            <p className="text-[11px] text-[#98A6BA]">
              {isRealUser
                ? 'Your submitted deposit and withdrawal requests will synchronize here in real time.'
                : 'Switch filters or submit a demo transaction above to view records.'}
            </p>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-[#121925] border border-[#253144] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#253144]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00D6A3]/10 border border-[#00D6A3]/30 flex items-center justify-center text-[#00D6A3]">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#F4F7FC] text-base">Transaction Details</h3>
                  <p className="text-[10px] text-[#98A6BA] font-mono">
                    {selectedTx.isDemo ? 'Sandbox Simulation' : 'Firestore Synced Record'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-4 rounded-xl bg-[#0D121C] border border-[#253144] text-center">
                <span className="text-[#98A6BA] block text-[11px]">Transaction Amount:</span>
                <span className="text-2xl font-black font-mono text-[#00D6A3] mt-1 block">
                  {selectedTx.amount} {selectedTx.asset}
                </span>
                <span className="text-[11px] text-[#98A6BA] font-mono">
                  ≈ ${selectedTx.amountUSD.toFixed(2)} USD
                </span>
              </div>

              {selectedTx.isDemo ? (
                <div className="p-2.5 rounded-xl bg-[#F3B64B]/15 border border-[#F3B64B]/30 text-[#F3B64B] text-[11px]">
                  <strong>Demo Mode:</strong> This is a sandbox simulation transaction. No real cryptocurrency has been transferred or credited.
                </div>
              ) : selectedTx.status === 'PENDING_CONFIRMATION' ? (
                <div className="p-2.5 rounded-xl bg-[#F3B64B]/15 border border-[#F3B64B]/30 text-[#F3B64B] text-[11px]">
                  <strong>Pending Node Confirmation:</strong> This deposit request is saved in Firestore. Client balance modification is blocked by Firestore rules; balances remain unchanged until confirmed and processed.
                </div>
              ) : selectedTx.status === 'PENDING_REVIEW' ? (
                <div className="p-2.5 rounded-xl bg-[#25B9F3]/15 border border-[#25B9F3]/30 text-[#25B9F3] text-[11px]">
                  <strong>Under Review:</strong> This request is saved in Firestore. Client cannot debit balances directly; trusted server-side logic is required to process requests and update balances.
                </div>
              ) : null}

              <div className="space-y-2 pt-1">
                <div className="flex justify-between py-1 border-b border-[#253144]">
                  <span className="text-[#98A6BA]">Transaction ID:</span>
                  <span className="font-mono text-[#F4F7FC] font-semibold truncate max-w-[220px]">{selectedTx.id}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#253144]">
                  <span className="text-[#98A6BA]">Type:</span>
                  <span className="font-mono text-[#F4F7FC]">{selectedTx.type.replace('_', ' ')}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#253144]">
                  <span className="text-[#98A6BA]">Status:</span>
                  <span className="font-mono text-[#00D6A3] font-bold">{selectedTx.status}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#253144]">
                  <span className="text-[#98A6BA]">Network:</span>
                  <span className="text-[#F4F7FC]">{selectedTx.network || 'Internal Stratum Ledger'}</span>
                </div>

                {selectedTx.toAddress && (
                  <div className="flex justify-between py-1 border-b border-[#253144]">
                    <span className="text-[#98A6BA]">Destination:</span>
                    <span className="font-mono text-[#98A6BA] truncate max-w-[200px]">{selectedTx.toAddress}</span>
                  </div>
                )}

                {selectedTx.txHash && (
                  <div className="flex items-center justify-between py-1 border-b border-[#253144]">
                    <span className="text-[#98A6BA]">Tx Hash:</span>
                    <div className="flex items-center gap-1 font-mono text-[#25B9F3]">
                      <span className="truncate max-w-[180px]">{selectedTx.txHash}</span>
                      <button
                        onClick={() => copyTxHash(selectedTx.txHash)}
                        className="p-1 hover:text-white"
                        title="Copy Tx Hash"
                      >
                        {copiedTx ? <Check className="w-3.5 h-3.5 text-[#19C784]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-between py-1">
                  <span className="text-[#98A6BA]">Timestamp:</span>
                  <span className="font-mono text-[#F4F7FC]">
                    {new Date(selectedTx.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedTx(null)}
                className="w-full mt-4 py-2.5 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] border border-[#253144] font-bold text-xs transition-colors"
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
