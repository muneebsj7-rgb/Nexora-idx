import { UserProfile, Transaction } from '../types';
import { auth } from './firebase';

export interface PendingDepositItem extends Transaction {
  userId: string;
  userEmail?: string;
}

export interface AdminSetupStatus {
  isConfigured: boolean;
  adminEmails: string[];
  projectId?: string;
  hasServiceAccount: boolean;
  functionsDeployed: boolean;
  notes: string[];
}

export const KNOWN_ADMIN_EMAILS = [
  'muneebsj7@gmail.com',
];

export class AdminService {
  /**
   * Evaluates if a given user profile has verified administrative credentials.
   * Checks hardcoded authorized admin emails, profile flags, or custom claims.
   */
  static isAuthorizedAdmin(user: UserProfile | null): boolean {
    if (!user) return false;
    if (user.isAdmin) return true;
    if (user.email && KNOWN_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(user.email.toLowerCase())) {
      return true;
    }
    return false;
  }

  /**
   * Approves a verified pending deposit request via trusted backend API.
   * Atomically credits the user's wallet balance in Firestore and marks the transaction as COMPLETED.
   * Idempotent: retries will not credit duplicate amounts.
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

    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : '';

    const response = await fetch('/api/admin/approve-deposit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
   * Does NOT credit wallet balance and updates transaction status to REJECTED.
   */
  static async rejectDeposit(
    userId: string,
    txId: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    if (!userId || !txId) {
      throw new Error('Both userId and txId are required to reject a deposit.');
    }

    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : '';

    const response = await fetch('/api/admin/reject-deposit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ userId, txId, reason }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `Rejection failed with HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * Fetches pending deposits across users for administrative review.
   */
  static async fetchPendingDeposits(): Promise<PendingDepositItem[]> {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : '';

    const response = await fetch('/api/admin/pending-deposits', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
   */
  static async fetchSetupStatus(): Promise<AdminSetupStatus> {
    const response = await fetch('/api/admin/setup-status', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return {
        isConfigured: false,
        adminEmails: KNOWN_ADMIN_EMAILS,
        hasServiceAccount: false,
        functionsDeployed: false,
        notes: ['Could not query admin setup status endpoint.'],
      };
    }

    return await response.json();
  }
}
