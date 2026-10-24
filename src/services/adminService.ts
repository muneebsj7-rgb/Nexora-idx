import { UserProfile, Transaction } from '../types';
import { auth } from './firebase';

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

export interface AdminSetupStatus {
  isConfigured: boolean;
  functionsDeployed: boolean;
  notes: string[];
}

export const KNOWN_ADMIN_EMAILS = [
  'muneebsj7@gmail.com',
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
   * Approves a verified pending deposit request via trusted backend API.
   * Atomically credits the user's wallet balance in Firestore and marks the transaction as COMPLETED.
   */
  static async approveDeposit(
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
      throw new Error('Both userId and txId are required to approve a deposit.');
    }

    const headers = await getAdminAuthHeaders();
    const response = await fetch('/api/admin/approve-deposit', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, txId, note }),
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
