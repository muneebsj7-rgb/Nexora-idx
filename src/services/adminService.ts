import { UserProfile, Transaction } from '../types';
import { auth } from './firebase';
import type { ManualPaymentMethodConfig } from './paymentMethodService';
import type { ManualAdminDepositAttestation } from './settlementEngine';

export interface PendingRequestItem extends Transaction {
  userId: string;
  userEmail?: string;
}

export type PendingDepositItem = PendingRequestItem;

export interface PendingRequestsBundle {
  deposits: PendingRequestItem[];
  rewards: PendingRequestItem[];
  withdrawals: PendingRequestItem[];
}

export interface TronVerifierSetupInfo {
  tronNetwork: string;
  chainName: string;
  officialUsdtContract: string;
  officialUsdtContractHex41: string;
  requiredConfirmations: number;
  requireSolidified: boolean;
  mainnetEnabled: boolean;
  testnetCreditBlocked: boolean;
  hasTronGridApiKey: boolean;
}

export interface AdminSetupStatus {
  isConfigured: boolean;
  functionsDeployed: boolean;
  tronVerifier?: TronVerifierSetupInfo | null;
  notes: string[];
}

export interface Trc20VerificationResponse {
  success: boolean;
  verified: boolean;
  dryRun: boolean;
  alreadyVerified: boolean;
  userId: string;
  txId: string;
  paymentRefDocId: string;
  receipt: {
    tronNetwork: string;
    chainName: string;
    txHash: string;
    contractAddress: string;
    contractAddressHex41: string;
    senderAddress: string;
    recipientAddress: string;
    amount: number;
    rawAmountBaseUnits: string;
    blockNumber: number;
    confirmations: number;
    requiredConfirmations: number;
    solidified: boolean;
    verifiedAt: string;
  };
}

export interface TronContractAndEndpointProbeResponse {
  success: boolean;
  verified: boolean;
  readOnly: boolean;
  tronNetwork: string;
  chainName: string;
  apiBaseUrl: string;
  usedApiKeyHeader: boolean;
  contract: {
    base58: string;
    hex41: string;
    contractName: string;
    bytecodeLengthHexChars: number;
    hasTransferEventAbi: boolean;
    transferEventSignature: string;
    onChainSymbol: string;
    onChainName: string;
    onChainDecimals: number;
  };
  endpoints: {
    getContractOk: boolean;
    triggerConstantContractOk: boolean;
    getNowBlockOk: boolean;
    getSolidityNowBlockOk: boolean;
    latestBlockNumber: number;
    solidifiedBlockNumber: number;
    solidificationLagBlocks: number;
  };
  checkedAt: string;
}

export const KNOWN_ADMIN_EMAILS = [
  'muneebsj7@gmail.com',
  'procurement.initialsaudi@gmail.com',
];

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : '';
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export class AdminService {
  /**
   * Evaluates if a given user profile has verified administrative credentials.
   * Requires a real authenticated account with a verified email.
   */
  static isAuthorizedAdmin(user: UserProfile | null): boolean {
    if (!user || user.isDemo) return false;
    if (!user.isEmailVerified) return false;
    if (user.isAdmin) return true;
    if (user.email && KNOWN_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(user.email.toLowerCase())) {
      return true;
    }
    return false;
  }

  /**
   * Fetches enabled, owner-configured manual crypto payment methods for end-user deposits.
   */
  static async getPublicPaymentMethods(): Promise<ManualPaymentMethodConfig[]> {
    const response = await fetch('/api/payment-methods', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Failed to load payment methods (HTTP ${response.status})`);
    }
    return Array.isArray(data.paymentMethods) ? data.paymentMethods : [];
  }

  /**
   * Fetches all manual crypto payment methods (enabled and disabled) for the Admin Console.
   */
  static async getAdminPaymentMethods(): Promise<ManualPaymentMethodConfig[]> {
    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/payment-methods', {
      method: 'GET',
      headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Failed to load admin payment methods (HTTP ${response.status})`);
    }
    return Array.isArray(data.paymentMethods) ? data.paymentMethods : [];
  }

  /**
   * Updates an owner-configured manual crypto payment method via authenticated Admin API.
   */
  static async updateAdminPaymentMethod(
    methodId: string,
    payload: Partial<ManualPaymentMethodConfig> & { confirmSharedAddressAcrossNetworks?: boolean }
  ): Promise<{
    success: boolean;
    message: string;
    paymentMethod: ManualPaymentMethodConfig;
    paymentMethods: ManualPaymentMethodConfig[];
  }> {
    const headers = await getAdminAuthHeaders();
    const response = await fetch(`/api/admin/payment-methods/${encodeURIComponent(methodId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Failed to update payment method (HTTP ${response.status})`);
    }
    return data;
  }

  /**
   * Runs a strictly read-only on-chain contract and endpoint check against the configured TRON network.
   * Performs zero Firestore reads/writes and settles no deposits.
   */
  static async checkTronContractAndEndpoints(): Promise<TronContractAndEndpointProbeResponse> {
    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/tron-contract-check', {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `Contract check failed with HTTP ${response.status}`);
    }
    return data;
  }

  /**
   * Runs server-side TRON USDT (TRC20) verification via TronGrid.
   * - When `dryRun === true`: 100% read-only on-chain verification (zero Firestore writes, zero balance changes).
   * - When `dryRun === false` and `autoSettle === false`: records `verifiedPayments/txhash_<normalized>` without crediting the wallet.
   */
  static async verifyTrc20Deposit(
    userId: string,
    txId: string,
    options: { dryRun?: boolean; autoSettle?: boolean; note?: string } = {}
  ): Promise<Trc20VerificationResponse> {
    if (!userId || !txId) {
      throw new Error('Both userId and txId are required to verify a TRC20 deposit.');
    }

    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/verify-trc20-deposit', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId,
        txId,
        dryRun: Boolean(options.dryRun),
        autoSettle: options.dryRun ? false : Boolean(options.autoSettle),
        note: options.note,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `TRC20 verification failed with HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * Approves a verified pending deposit request via trusted backend API.
   * Atomically credits the user's wallet balance in Firestore and marks the transaction as COMPLETED.
   */
  static async approveDeposit(
    userId: string,
    txId: string,
    note?: string,
    manualVerification?: ManualAdminDepositAttestation
  ): Promise<{
    success: boolean;
    message: string;
    alreadyProcessed?: boolean;
    newBalance?: number;
    creditedAmount?: number;
    creditedAsset?: string;
  }> {
    if (!userId || !txId) {
      throw new Error('Both userId and txId are required to approve a deposit.');
    }

    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/approve-deposit', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId,
        txId,
        note,
        ...(manualVerification ? { manualVerification } : {}),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `Approval failed with HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * Rejects an unverified or fraudulent deposit request.
   */
  static async rejectDeposit(
    userId: string,
    txId: string,
    reason?: string
  ): Promise<{ success: boolean; message: string; alreadyProcessed?: boolean }> {
    if (!userId || !txId) {
      throw new Error('Both userId and txId are required to reject a deposit.');
    }

    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/reject-deposit', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, txId, reason }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `Rejection failed with HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * Approves a daily streak bonus or task bounty claim.
   * Atomically credits the user's available balance once and updates both the transaction
   * and the user's `dailyStreak` record.
   */
  static async approveReward(
    userId: string,
    txId: string,
    note?: string
  ): Promise<{
    success: boolean;
    message: string;
    alreadyProcessed?: boolean;
    newBalance?: number;
    creditedAmount?: number;
    creditedAsset?: string;
  }> {
    if (!userId || !txId) {
      throw new Error('Both userId and txId are required to approve a reward claim.');
    }

    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/approve-reward', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, txId, note }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `Reward approval failed with HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * Rejects a daily streak bonus or task bounty claim without crediting any balance.
   */
  static async rejectReward(
    userId: string,
    txId: string,
    reason?: string
  ): Promise<{ success: boolean; message: string; alreadyProcessed?: boolean }> {
    if (!userId || !txId) {
      throw new Error('Both userId and txId are required to reject a reward claim.');
    }

    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/reject-reward', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, txId, reason }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `Reward rejection failed with HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * Approves and settles a pending withdrawal request as PAID/COMPLETED without double-deducting funds.
   */
  static async approveWithdrawal(
    userId: string,
    txId: string,
    payoutTxHash?: string,
    note?: string
  ): Promise<{
    success: boolean;
    message: string;
    alreadyProcessed?: boolean;
    newBalance?: number;
    newLockedBalance?: number;
    netPayoutAmount?: number;
    fee?: number;
    amount?: number;
    asset?: string;
  }> {
    if (!userId || !txId) {
      throw new Error('Both userId and txId are required to settle a withdrawal.');
    }

    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/approve-withdrawal', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, txId, payoutTxHash, note }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `Withdrawal settlement failed with HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * Rejects a withdrawal request and atomically refunds reserved funds from lockedBalance back to available balance.
   */
  static async rejectWithdrawal(
    userId: string,
    txId: string,
    reason?: string
  ): Promise<{
    success: boolean;
    message: string;
    alreadyProcessed?: boolean;
    refunded?: boolean;
    newBalance?: number;
    newLockedBalance?: number;
  }> {
    if (!userId || !txId) {
      throw new Error('Both userId and txId are required to reject a withdrawal.');
    }

    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/reject-withdrawal', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, txId, reason }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `Withdrawal rejection failed with HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * Reconciles and settles any transactions manually marked COMPLETED or REJECTED in the Firebase Console
   * that have not yet updated the user's Available Balance or locked escrow.
   */
  static async reconcileSettlements(
    targetUserId?: string
  ): Promise<{
    success: boolean;
    reconciledCount: number;
    settledItems: Array<{ txId: string; userId: string; type: string; action: string; message: string }>;
    message: string;
  }> {
    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/reconcile-settlements', {
      method: 'POST',
      headers,
      body: JSON.stringify(targetUserId ? { targetUserId } : {}),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `Reconciliation failed with HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * Fetches all pending financial requests (deposits, rewards, withdrawals) across users.
   */
  static async fetchPendingRequests(): Promise<PendingRequestsBundle> {
    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/pending-requests', {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch pending requests (HTTP ${response.status})`);
    }

    const data = await response.json();
    return {
      deposits: data.deposits || [],
      rewards: data.rewards || [],
      withdrawals: data.withdrawals || [],
    };
  }

  /**
   * Fetches pending deposits across users for administrative review.
   */
  static async fetchPendingDeposits(): Promise<PendingDepositItem[]> {
    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/pending-deposits', {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch pending deposits (HTTP ${response.status})`);
    }

    const data = await response.json();
    return data.deposits || [];
  }

  /**
   * Checks server-side configuration status for Firebase Admin / Cloud Functions.
   * Requires an authenticated administrator Bearer token.
   */
  static async fetchSetupStatus(): Promise<AdminSetupStatus> {
    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/setup-status', {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      return {
        isConfigured: false,
        functionsDeployed: false,
        notes: ['Could not query admin setup status endpoint.'],
      };
    }

    return await response.json();
  }
}
