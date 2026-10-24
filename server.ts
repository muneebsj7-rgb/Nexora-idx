import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import {
  AUTHORITATIVE_ASSET_CONFIG,
  settleDepositApproval,
  settleDepositRejection,
  settleRewardApproval,
  settleRewardRejection,
  reserveWithdrawalRequest,
  settleWithdrawalApproval,
  settleWithdrawalRejection,
} from './src/services/settlementEngine.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeEnv(val?: string): string {
  if (!val) return '';
  return val.trim().replace(/^["']+|["']+$/g, '').trim();
}

// In development, the dev server must run strictly on port 3000.
// In production (Cloud Run), bind to process.env.PORT if specified.
const PORT = process.env.NODE_ENV === 'production' && process.env.PORT
  ? Number(process.env.PORT)
  : 3000;

const ADMIN_EMAILS = Array.from(
  new Set([
    'muneebsj7@gmail.com',
    ...(process.env.ADMIN_EMAILS
      ? sanitizeEnv(process.env.ADMIN_EMAILS)
          .split(',')
          .map((e) => sanitizeEnv(e).toLowerCase())
          .filter(Boolean)
      : []),
  ])
);

// Initialize Firebase Admin SDK
let isFirebaseAdminInitialized = false;
let adminInitError: string | null = null;

function setupFirebaseAdmin() {
  if (getApps().length > 0) {
    isFirebaseAdminInitialized = true;
    return;
  }

  const serviceAccountKey = sanitizeEnv(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const credentialsPath = sanitizeEnv(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const projectId =
    sanitizeEnv(process.env.VITE_FIREBASE_PROJECT_ID) ||
    sanitizeEnv(process.env.FIREBASE_PROJECT_ID);

  try {
    if (serviceAccountKey) {
      let parsed = JSON.parse(serviceAccountKey);
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id || projectId,
      });
      isFirebaseAdminInitialized = true;
      console.log('Firebase Admin SDK initialized.');
      return;
    }

    if (credentialsPath) {
      initializeApp({
        credential: applicationDefault(),
        projectId,
      });
      isFirebaseAdminInitialized = true;
      console.log('Firebase Admin SDK initialized using application default credentials.');
      return;
    }

    // Try default credential initialization (e.g. inside GCP environment)
    if (projectId && !projectId.includes('default') && !projectId.includes('your-project-id')) {
      initializeApp({
        projectId,
      });
      isFirebaseAdminInitialized = true;
      console.log('Firebase Admin initialized with project configuration.');
      return;
    }
  } catch (err: any) {
    adminInitError = err?.message || String(err);
    console.warn('Firebase Admin SDK initialization notice: credentials not active.');
  }
}

setupFirebaseAdmin();

export const app = express();
app.use(express.json());

// Interface for authenticated callers
export interface AuthenticatedCaller {
  uid: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

type TokenVerifierFn = (token: string) => Promise<AuthenticatedCaller | null>;
let customTokenVerifierForTesting: TokenVerifierFn | null = null;
let customFirestoreProviderForTesting: (() => any) | null = null;

export function setTokenVerifierForTesting(fn: TokenVerifierFn | null) {
  customTokenVerifierForTesting = fn;
}

export function setFirestoreProviderForTesting(fn: (() => any) | null) {
  customFirestoreProviderForTesting = fn;
}

export function resetServerTestHooks() {
  customTokenVerifierForTesting = null;
  customFirestoreProviderForTesting = null;
}

function hasActiveFirestoreBackend(): boolean {
  return Boolean(customFirestoreProviderForTesting) || getApps().length > 0;
}

function getActiveFirestore(): any {
  if (customFirestoreProviderForTesting) {
    return customFirestoreProviderForTesting();
  }
  return getFirestore();
}

/**
 * Helper: Verifies a Firebase Bearer ID token via Firebase Admin SDK (primary)
 * or Google Identity Toolkit REST lookup (fallback when service account is not attached).
 */
async function verifyFirebaseBearerToken(token: string): Promise<AuthenticatedCaller | null> {
  if (customTokenVerifierForTesting) {
    return customTokenVerifierForTesting(token);
  }

  // 1. Primary verification via Firebase Admin SDK when initialized with credentials
  if (getApps().length > 0) {
    try {
      const decoded = await getAuth().verifyIdToken(token, true);
      const email = (decoded.email || '').toLowerCase();
      const emailVerified = decoded.email_verified === true;
      const hasCustomAdminClaim = decoded.admin === true;
      const isAllowlistedAdmin = Boolean(email) && ADMIN_EMAILS.includes(email);
      const isAdmin = emailVerified && (hasCustomAdminClaim || isAllowlistedAdmin);

      return {
        uid: decoded.uid,
        email: decoded.email || decoded.uid,
        emailVerified,
        isAdmin,
      };
    } catch {
      // Fall through to Identity Toolkit lookup if Admin SDK lacks ADC in preview container
    }
  }

  // 2. Fallback token verification using Google Identity Toolkit REST API
  const apiKey = sanitizeEnv(process.env.VITE_FIREBASE_API_KEY);
  if (apiKey && !apiKey.toLowerCase().includes('placeholder')) {
    const restResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }
    );

    if (restResp.ok) {
      const data = await restResp.json();
      const userObj = data.users?.[0];
      if (userObj && userObj.localId) {
        const email = (userObj.email || '').toLowerCase();
        const emailVerified = userObj.emailVerified === true;
        const isAdmin = Boolean(email) && ADMIN_EMAILS.includes(email) && emailVerified;

        return {
          uid: userObj.localId,
          email: userObj.email || userObj.localId,
          emailVerified,
          isAdmin,
        };
      }
    }
  }

  return null;
}

/**
 * Middleware: Verify caller is an authenticated Firebase user.
 */
async function requireUserAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Missing Bearer token.',
    });
    return;
  }

  try {
    const caller = await verifyFirebaseBearerToken(token);
    if (!caller) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired Firebase ID token.',
      });
      return;
    }

    (req as any).userCaller = caller;
    next();
  } catch {
    res.status(500).json({
      success: false,
      error: 'Failed to authenticate user request.',
    });
  }
}

/**
 * Middleware: Verify caller is an authenticated administrator.
 * Never trusts client-supplied flags or static demo tokens.
 */
async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Missing Bearer token.',
    });
    return;
  }

  try {
    const caller = await verifyFirebaseBearerToken(token);
    if (!caller) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired Firebase ID token.',
      });
      return;
    }

    if (!caller.isAdmin) {
      res.status(403).json({
        success: false,
        error: !caller.emailVerified
          ? 'Verified email address is required for administrative access.'
          : 'Caller does not have administrative privileges.',
      });
      return;
    }

    (req as any).adminCaller = caller;
    next();
  } catch {
    res.status(500).json({
      success: false,
      error: 'Failed to authenticate administrative request.',
    });
  }
}

function mapTransactionDoc(docSnap: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = docSnap.data() || {};
  const parentUserPath = docSnap.ref.parent.parent;
  const inferredUserId = data.userId || parentUserPath?.id || '';

  return {
    id: docSnap.id,
    userId: inferredUserId,
    type: data.type,
    asset: data.asset,
    amount: data.amount,
    amountUSD: data.amountUSD,
    fee: data.fee || 0,
    netPayoutAmount: data.netPayoutAmount,
    status: data.status,
    timestamp: data.timestamp,
    txHash: data.txHash,
    payoutTxHash: data.payoutTxHash,
    toAddress: data.toAddress,
    fromAddress: data.fromAddress,
    network: data.network,
    note: data.note,
    walletCredited: Boolean(data.walletCredited),
    walletSettled: Boolean(data.walletSettled),
    reservedFromBalance: Boolean(data.reservedFromBalance),
    refunded: Boolean(data.refunded),
    settlementStatus: data.settlementStatus,
    claimDate: data.claimDate,
    rewardDay: data.rewardDay,
    streakDay: data.streakDay,
    taskId: data.taskId,
    rewardSource: data.rewardSource,
    metadataBackfilledFrom: data.metadataBackfilledFrom,
    createdAt: data.createdAt,
  };
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    firebaseAdminReady: isFirebaseAdminInitialized,
  });
});

app.get('/api/admin/setup-status', requireAdminAuth, (_req, res) => {
  res.json({
    isConfigured: hasActiveFirestoreBackend(),
    functionsDeployed: false,
    notes: [
      hasActiveFirestoreBackend()
        ? 'Firebase Admin SDK is initialized for server-side settlement.'
        : 'Firebase Admin SDK is not initialized on this server instance.',
      'Cloud Functions blueprint available at /functions/index.ts.',
    ],
  });
});

/**
 * POST /api/wallet/withdraw
 * Authenticated user endpoint: Atomically validates available balance, reserves `amount` into
 * `lockedBalance`, and creates a `PENDING_REVIEW` withdrawal record so concurrent withdrawal
 * requests cannot spend the same funds twice.
 */
app.post('/api/wallet/withdraw', requireUserAuth, async (req, res) => {
  const caller = (req as any).userCaller as AuthenticatedCaller;
  const { assetSymbol, network, amount, address } = req.body;

  if (!hasActiveFirestoreBackend()) {
    res.status(503).json({
      success: false,
      error: 'Firebase Admin SDK is not initialized on this server instance.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  const cleanAssetSymbol = String(assetSymbol || '').trim().toUpperCase();
  const assetRule = AUTHORITATIVE_ASSET_CONFIG[cleanAssetSymbol];
  if (!assetRule) {
    res.status(400).json({
      success: false,
      error: `Unsupported withdrawal asset: ${cleanAssetSymbol || 'UNKNOWN'}`,
    });
    return;
  }

  try {
    const db = getActiveFirestore();
    const result = await reserveWithdrawalRequest(db as any, {
      userId: caller.uid,
      assetSymbol: cleanAssetSymbol,
      network: String(network || ''),
      amount: Number(amount),
      fee: assetRule.withdrawFee,
      toAddress: String(address || ''),
      usdRate: assetRule.defaultUsdRate,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    const msg = err?.message || 'Failed to reserve withdrawal request.';
    const isMissingCredentials =
      msg.includes('Could not load the default credentials') ||
      msg.includes('UNAUTHENTICATED') ||
      msg.includes('PERMISSION_DENIED');

    if (isMissingCredentials) {
      res.status(503).json({
        success: false,
        error: 'Server Admin credentials are not configured for direct Firestore escrow writes.',
        code: 'MISSING_ADMIN_CREDENTIALS',
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: msg,
    });
  }
});

/**
 * GET /api/admin/pending-deposits
 * Lists pending deposits for administrative review
 */
app.get('/api/admin/pending-deposits', requireAdminAuth, async (_req, res) => {
  try {
    if (!hasActiveFirestoreBackend()) {
      res.json({
        deposits: [],
        notice: 'Firebase Admin not connected to Firestore database.',
      });
      return;
    }

    const db = getActiveFirestore();
    const txGroupSnap = await db
      .collectionGroup('transactions')
      .where('type', '==', 'DEPOSIT')
      .where('status', '==', 'PENDING_CONFIRMATION')
      .limit(50)
      .get();

    const deposits = txGroupSnap.docs.map(mapTransactionDoc);
    res.json({ deposits });
  } catch (err: any) {
    console.error('Error listing pending deposits:', err);
    res.status(500).json({
      error: err?.message || 'Failed to list pending deposits.',
    });
  }
});

/**
 * GET /api/admin/pending-requests
 * Lists all pending financial requests across users:
 * - Deposits (`type == 'DEPOSIT'`, `status == 'PENDING_CONFIRMATION'`)
 * - Daily Bonus / Task Reward Claims (`type == 'TASK_REWARD'`, `status == 'PENDING_REVIEW'`)
 * - Withdrawals (`type == 'WITHDRAWAL'`, `status == 'PENDING_REVIEW'`)
 */
app.get('/api/admin/pending-requests', requireAdminAuth, async (_req, res) => {
  try {
    if (!hasActiveFirestoreBackend()) {
      res.json({
        deposits: [],
        rewards: [],
        withdrawals: [],
        notice: 'Firebase Admin not connected to Firestore database.',
      });
      return;
    }

    const db = getActiveFirestore();
    const [depositsSnap, rewardsSnap, withdrawalsSnap] = await Promise.all([
      db
        .collectionGroup('transactions')
        .where('type', '==', 'DEPOSIT')
        .where('status', '==', 'PENDING_CONFIRMATION')
        .limit(50)
        .get(),
      db
        .collectionGroup('transactions')
        .where('type', '==', 'TASK_REWARD')
        .where('status', '==', 'PENDING_REVIEW')
        .limit(50)
        .get(),
      db
        .collectionGroup('transactions')
        .where('type', '==', 'WITHDRAWAL')
        .where('status', '==', 'PENDING_REVIEW')
        .limit(50)
        .get(),
    ]);

    res.json({
      deposits: depositsSnap.docs.map(mapTransactionDoc),
      rewards: rewardsSnap.docs.map(mapTransactionDoc),
      withdrawals: withdrawalsSnap.docs.map(mapTransactionDoc),
    });
  } catch (err: any) {
    console.error('Error listing pending requests:', err);
    res.status(500).json({
      error: err?.message || 'Failed to list pending financial requests.',
    });
  }
});

/**
 * POST /api/admin/approve-deposit
 * Atomically approves a deposit, credits user's wallet balance, and updates transaction status.
 */
app.post('/api/admin/approve-deposit', requireAdminAuth, async (req, res) => {
  const { userId, txId, note } = req.body;
  const caller = (req as any).adminCaller as AuthenticatedCaller;

  if (!userId || !txId) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: userId and txId must be specified.',
    });
    return;
  }

  if (!hasActiveFirestoreBackend()) {
    res.status(503).json({
      success: false,
      error:
        'Firebase Admin SDK is not configured with service account credentials on this server. ' +
        'Please supply FIREBASE_SERVICE_ACCOUNT_KEY in your environment, or deploy /functions/index.ts to Firebase Cloud Functions.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  try {
    const db = getActiveFirestore();
    const result = await settleDepositApproval(db as any, {
      userId,
      txId,
      admin: { uid: caller.uid, email: caller.email },
      note,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error(`Approval error for deposit tx ${txId}:`, err);
    res.status(400).json({
      success: false,
      error: err?.message || 'Deposit approval failed.',
    });
  }
});

/**
 * POST /api/admin/reject-deposit
 * Rejects a deposit request without crediting any balance.
 */
app.post('/api/admin/reject-deposit', requireAdminAuth, async (req, res) => {
  const { userId, txId, reason } = req.body;
  const caller = (req as any).adminCaller as AuthenticatedCaller;

  if (!userId || !txId) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: userId and txId must be specified.',
    });
    return;
  }

  if (!hasActiveFirestoreBackend()) {
    res.status(503).json({
      success: false,
      error: 'Firebase Admin SDK is not initialized.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  try {
    const db = getActiveFirestore();
    const result = await settleDepositRejection(db as any, {
      userId,
      txId,
      admin: { uid: caller.uid, email: caller.email },
      reason,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error(`Rejection error for deposit tx ${txId}:`, err);
    res.status(400).json({
      success: false,
      error: err?.message || 'Failed to reject deposit.',
    });
  }
});

/**
 * POST /api/admin/approve-reward
 * Atomically approves a daily check-in bonus or task bounty claim,
 * credits the user's available balance once, and updates both the transaction
 * and `users/{userId}/rewards/dailyStreak`.
 */
app.post('/api/admin/approve-reward', requireAdminAuth, async (req, res) => {
  const { userId, txId, note } = req.body;
  const caller = (req as any).adminCaller as AuthenticatedCaller;

  if (!userId || !txId) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: userId and txId must be specified.',
    });
    return;
  }

  if (!hasActiveFirestoreBackend()) {
    res.status(503).json({
      success: false,
      error: 'Firebase Admin SDK is not initialized.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  try {
    const db = getActiveFirestore();
    const result = await settleRewardApproval(db as any, {
      userId,
      txId,
      admin: { uid: caller.uid, email: caller.email },
      note,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error(`Approval error for reward tx ${txId}:`, err);
    res.status(400).json({
      success: false,
      error: err?.message || 'Reward claim approval failed.',
    });
  }
});

/**
 * POST /api/admin/reject-reward
 * Rejects a daily check-in bonus or task bounty claim without crediting any balance.
 */
app.post('/api/admin/reject-reward', requireAdminAuth, async (req, res) => {
  const { userId, txId, reason } = req.body;
  const caller = (req as any).adminCaller as AuthenticatedCaller;

  if (!userId || !txId) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: userId and txId must be specified.',
    });
    return;
  }

  if (!hasActiveFirestoreBackend()) {
    res.status(503).json({
      success: false,
      error: 'Firebase Admin SDK is not initialized.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  try {
    const db = getActiveFirestore();
    const result = await settleRewardRejection(db as any, {
      userId,
      txId,
      admin: { uid: caller.uid, email: caller.email },
      reason,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error(`Rejection error for reward tx ${txId}:`, err);
    res.status(400).json({
      success: false,
      error: err?.message || 'Failed to reject reward claim.',
    });
  }
});

/**
 * POST /api/admin/approve-withdrawal
 * Atomically settles a withdrawal request as PAID/COMPLETED without double-deducting funds.
 */
app.post('/api/admin/approve-withdrawal', requireAdminAuth, async (req, res) => {
  const { userId, txId, payoutTxHash, note } = req.body;
  const caller = (req as any).adminCaller as AuthenticatedCaller;

  if (!userId || !txId) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: userId and txId must be specified.',
    });
    return;
  }

  if (!hasActiveFirestoreBackend()) {
    res.status(503).json({
      success: false,
      error: 'Firebase Admin SDK is not initialized.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  try {
    const db = getActiveFirestore();
    const result = await settleWithdrawalApproval(db as any, {
      userId,
      txId,
      admin: { uid: caller.uid, email: caller.email },
      payoutTxHash,
      note,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error(`Approval error for withdrawal tx ${txId}:`, err);
    res.status(400).json({
      success: false,
      error: err?.message || 'Withdrawal settlement failed.',
    });
  }
});

/**
 * POST /api/admin/reject-withdrawal
 * Rejects a withdrawal request and atomically refunds reserved funds from lockedBalance back to available balance.
 */
app.post('/api/admin/reject-withdrawal', requireAdminAuth, async (req, res) => {
  const { userId, txId, reason } = req.body;
  const caller = (req as any).adminCaller as AuthenticatedCaller;

  if (!userId || !txId) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: userId and txId must be specified.',
    });
    return;
  }

  if (!hasActiveFirestoreBackend()) {
    res.status(503).json({
      success: false,
      error: 'Firebase Admin SDK is not initialized.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  try {
    const db = getActiveFirestore();
    const result = await settleWithdrawalRejection(db as any, {
      userId,
      txId,
      admin: { uid: caller.uid, email: caller.email },
      reason,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error(`Rejection error for withdrawal tx ${txId}:`, err);
    res.status(400).json({
      success: false,
      error: err?.message || 'Failed to reject withdrawal.',
    });
  }
});

/**
 * POST /api/admin/reconcile-settlements
 * Scans for any transactions whose `status` was manually edited in Firebase Console
 * (e.g. `status === 'COMPLETED'` without `walletCredited`/`walletSettled`, or `WITHDRAWAL`
 * manually marked `REJECTED` with `reservedFromBalance === true` and `refunded !== true`)
 * and atomically settles legitimate admin-approved requests while rejecting invalid/unverified records.
 */
app.post('/api/admin/reconcile-settlements', requireAdminAuth, async (req, res) => {
  const { targetUserId } = req.body || {};
  const caller = (req as any).adminCaller as AuthenticatedCaller;

  if (!hasActiveFirestoreBackend()) {
    res.status(503).json({
      success: false,
      error: 'Firebase Admin SDK is not initialized.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  try {
    const db = getActiveFirestore();
    const adminActor = { uid: caller.uid, email: caller.email };
    const settledItems: Array<{ txId: string; userId: string; type: string; action: string; message: string }> = [];
    const skippedItems: Array<{ txId: string; userId: string; type: string; reason: string }> = [];

    let docsToInspect: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    if (targetUserId) {
      const userTxSnap = await db.collection(`users/${targetUserId}/transactions`).limit(100).get();
      docsToInspect = userTxSnap.docs;
    } else {
      const [completedDeposits, completedRewards, completedWithdrawals, rejectedWithdrawals] = await Promise.all([
        db.collectionGroup('transactions').where('type', '==', 'DEPOSIT').where('status', '==', 'COMPLETED').limit(50).get(),
        db.collectionGroup('transactions').where('type', '==', 'TASK_REWARD').where('status', '==', 'COMPLETED').limit(50).get(),
        db.collectionGroup('transactions').where('type', '==', 'WITHDRAWAL').where('status', '==', 'COMPLETED').limit(50).get(),
        db.collectionGroup('transactions').where('type', '==', 'WITHDRAWAL').where('status', '==', 'REJECTED').limit(50).get(),
      ]);
      docsToInspect = [
        ...completedDeposits.docs,
        ...completedRewards.docs,
        ...completedWithdrawals.docs,
        ...rejectedWithdrawals.docs,
      ];
    }

    for (const docSnap of docsToInspect) {
      const data = docSnap.data();
      const parentUid = docSnap.ref.parent.parent?.id;
      const uid = parentUid || data.userId;
      if (!uid) continue;

      try {
        if (data.type === 'DEPOSIT' && data.status === 'COMPLETED' && !data.walletCredited) {
          const resDeposit = await settleDepositApproval(db as any, {
            userId: uid,
            txId: docSnap.id,
            admin: adminActor,
            note: 'Reconciled manual Firebase Console deposit confirmation',
            serverTimestamp: () => FieldValue.serverTimestamp(),
            allowManualCompletedStatus: true,
          });
          if (!resDeposit.alreadyProcessed) {
            settledItems.push({
              txId: docSnap.id,
              userId: uid,
              type: 'DEPOSIT',
              action: 'CREDITED',
              message: resDeposit.message,
            });
          }
        } else if (
          (data.type === 'TASK_REWARD' || data.type === 'REFERRAL_BONUS') &&
          data.status === 'COMPLETED' &&
          !data.walletCredited
        ) {
          const resReward = await settleRewardApproval(db as any, {
            userId: uid,
            txId: docSnap.id,
            admin: adminActor,
            note: 'Reconciled manual Firebase Console reward approval',
            serverTimestamp: () => FieldValue.serverTimestamp(),
            allowManualCompletedStatus: true,
          });
          if (!resReward.alreadyProcessed) {
            settledItems.push({
              txId: docSnap.id,
              userId: uid,
              type: data.type,
              action: 'CREDITED',
              message: resReward.message,
            });
          }
        } else if (data.type === 'WITHDRAWAL' && data.status === 'COMPLETED' && !data.walletSettled) {
          const resWithdraw = await settleWithdrawalApproval(db as any, {
            userId: uid,
            txId: docSnap.id,
            admin: adminActor,
            note: 'Reconciled manual Firebase Console withdrawal settlement',
            serverTimestamp: () => FieldValue.serverTimestamp(),
            allowManualCompletedStatus: true,
          });
          if (!resWithdraw.alreadyProcessed) {
            settledItems.push({
              txId: docSnap.id,
              userId: uid,
              type: 'WITHDRAWAL',
              action: 'PAID',
              message: resWithdraw.message,
            });
          }
        } else if (
          data.type === 'WITHDRAWAL' &&
          data.status === 'REJECTED' &&
          data.reservedFromBalance === true &&
          !data.refunded
        ) {
          const resRefund = await settleWithdrawalRejection(db as any, {
            userId: uid,
            txId: docSnap.id,
            admin: adminActor,
            reason: data.rejectionReason || 'Reconciled manual Firebase Console withdrawal rejection',
            serverTimestamp: () => FieldValue.serverTimestamp(),
            allowManualRejectedStatus: true,
          });
          if (!resRefund.alreadyProcessed) {
            settledItems.push({
              txId: docSnap.id,
              userId: uid,
              type: 'WITHDRAWAL',
              action: 'REFUNDED',
              message: resRefund.message,
            });
          }
        }
      } catch (itemErr: any) {
        skippedItems.push({
          txId: docSnap.id,
          userId: uid,
          type: String(data.type || 'UNKNOWN'),
          reason: itemErr?.message || 'Failed structural verification for Console reconciliation.',
        });
      }
    }

    res.json({
      success: true,
      reconciledCount: settledItems.length,
      settledItems,
      skippedCount: skippedItems.length,
      skippedItems,
      message:
        settledItems.length > 0
          ? `Successfully reconciled and settled ${settledItems.length} record(s)${
              skippedItems.length > 0 ? ` (${skippedItems.length} invalid/unverified record(s) skipped)` : ''
            }.`
          : skippedItems.length > 0
          ? `Skipped ${skippedItems.length} invalid or unverified record(s); no funds credited.`
          : 'All completed and rejected records are already settled in user wallet balances.',
    });
  } catch (err: any) {
    console.error('Error reconciling settlements:', err);
    res.status(400).json({
      success: false,
      error: err?.message || 'Failed to reconcile settlements.',
    });
  }
});

// -------------------------------------------------------------
// VITE OR STATIC SERVING
// -------------------------------------------------------------

async function initializeServer() {
  const http = await import('http');
  const httpServer = http.createServer(app);

  const distPath = path.resolve(__dirname, 'dist');
  const indexHtmlPath = path.resolve(distPath, 'index.html');
  const hasDist = fs.existsSync(indexHtmlPath);

  if (process.env.NODE_ENV === 'production' && hasDist) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(indexHtmlPath);
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        next(e);
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Nexora Mine server active on http://0.0.0.0:${PORT} (mode: ${process.env.NODE_ENV || 'development'})`);
  });

  httpServer.on('error', (err: any) => {
    console.error('Express server listen error:', err);
  });
}

if (process.env.NEXORA_SKIP_LISTEN !== 'true') {
  initializeServer().catch((err) => {
    console.error('Fatal error initializing Nexora Mine server:', err);
  });
}
