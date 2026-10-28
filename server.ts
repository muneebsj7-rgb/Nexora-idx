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
  AUTHORITATIVE_MINING_PLANS,
  settleDepositApproval,
  settleDepositRejection,
  settleRewardApproval,
  settleRewardRejection,
  reserveWithdrawalRequest,
  settleWithdrawalApproval,
  settleWithdrawalRejection,
  purchaseMiningContract,
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
    'procurement.initialsaudi@gmail.com',
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

let collectionGroupIndexUnavailable = false;

export function resetServerTestHooks() {
  customTokenVerifierForTesting = null;
  customFirestoreProviderForTesting = null;
  collectionGroupIndexUnavailable = false;
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
      let isAdmin = emailVerified && (hasCustomAdminClaim || isAllowlistedAdmin);

      if (emailVerified && !isAdmin) {
        try {
          const adminDoc = await getActiveFirestore().doc(`admins/${decoded.uid}`).get();
          if (adminDoc && adminDoc.exists) {
            isAdmin = true;
          }
        } catch {
          // ignore if Firestore lookup fails
        }
      }

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
  const parentUserPath = docSnap.ref?.parent?.parent;
  const fallbackUid = (docSnap as any)._fallbackUserId;
  const inferredUserId = data.userId || parentUserPath?.id || fallbackUid || '';

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
    paymentReferenceId: data.paymentReferenceId,
    settlementWarning: data.settlementWarning,
    claimDate: data.claimDate,
    rewardDay: data.rewardDay,
    streakDay: data.streakDay,
    taskId: data.taskId,
    rewardSource: data.rewardSource,
    metadataBackfilledFrom: data.metadataBackfilledFrom,
    createdAt: data.createdAt,
  };
}

export function isMissingIndexError(err: any): boolean {
  if (!err) return false;
  const code = err.code;
  const msg = String(err.message || err.details || '');
  return (
    code === 9 ||
    code === 'failed-precondition' ||
    code === 'FAILED_PRECONDITION' ||
    msg.includes('FAILED_PRECONDITION') ||
    msg.includes('requires an index')
  );
}

/**
 * Fallback helper that scans `users/{uid}/transactions` subcollections directly when
 * a remote `COLLECTION_GROUP` composite index has not yet been deployed on `transactions`.
 * Single-collection queries on `users/{uid}/transactions` rely only on Firestore's automatic
 * collection indexes and never fail with `FAILED_PRECONDITION`.
 */
async function scanTransactionsViaUserSubcollections(
  db: any,
  limitPerUser = 100
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const userIds = new Set<string>();
  const usersCol = db.collection('users');

  if (usersCol && typeof usersCol.limit === 'function') {
    const usersSnap = await usersCol.limit(200).get();
    for (const userDoc of usersSnap?.docs || []) {
      if (userDoc?.id) userIds.add(userDoc.id);
    }
  }

  if (usersCol && typeof usersCol.listDocuments === 'function') {
    try {
      const refs = await usersCol.listDocuments();
      for (const ref of refs || []) {
        if (ref?.id) userIds.add(ref.id);
      }
    } catch {
      // Ignore if listDocuments is unavailable in test mocks
    }
  }

  const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  await Promise.all(
    Array.from(userIds).map(async (uid) => {
      try {
        const txCol = db.collection(`users/${uid}/transactions`);
        const snap =
          txCol && typeof txCol.limit === 'function'
            ? await txCol.limit(limitPerUser).get()
            : await txCol.get();
        for (const docSnap of snap?.docs || []) {
          (docSnap as any)._fallbackUserId = uid;
          allDocs.push(docSnap);
        }
      } catch {
        // Ignore individual user subcollection errors so remaining users still load
      }
    })
  );

  return allDocs;
}

/**
 * Executes one or more `(type, status)` queries across user transactions.
 * Attempts fast `collectionGroup('transactions')` queries first; if Firestore reports
 * `FAILED_PRECONDITION: The query requires an index`, transparently falls back to
 * scanning `users/{uid}/transactions` subcollections and filtering in memory.
 */
async function queryTransactionsAcrossUsers(
  db: any,
  queries: Array<{ type: string; status: string; limit?: number }>
): Promise<FirebaseFirestore.QueryDocumentSnapshot[][]> {
  if (!collectionGroupIndexUnavailable) {
    try {
      const snaps = await Promise.all(
        queries.map((q) =>
          db
            .collectionGroup('transactions')
            .where('type', '==', q.type)
            .where('status', '==', q.status)
            .limit(q.limit ?? 50)
            .get()
        )
      );
      return snaps.map((s) => s.docs || []);
    } catch (err: any) {
      if (!isMissingIndexError(err)) {
        throw err;
      }
      collectionGroupIndexUnavailable = true;
      console.warn(
        'Firestore collectionGroup composite index on transactions is not yet active; falling back to per-user subcollection scan.'
      );
    }
  }

  const allDocs = await scanTransactionsViaUserSubcollections(db, 100);
  return queries.map((q) => {
    const cap = q.limit ?? 50;
    return allDocs
      .filter((docSnap) => {
        const d = docSnap.data() || {};
        return d.type === q.type && d.status === q.status;
      })
      .slice(0, cap);
  });
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
 * POST /api/mining/purchase-contract
 * Authenticated user endpoint: Atomically validates the requested `planId` against the
 * authoritative server-side plan catalogue, verifies server-confirmed USDT available balance,
 * deducts `plan.priceUSD` once, records the contract in `users/{uid}/contracts/{orderId}`,
 * records a `CONTRACT_PURCHASE` transaction and settlement record, and increments simulated
 * cloud hashrate in `users/{uid}/mining/session`.
 */
app.post('/api/mining/purchase-contract', requireUserAuth, async (req, res) => {
  const caller = (req as any).userCaller as AuthenticatedCaller;
  const { planId, idempotencyKey } = req.body || {};

  const cleanPlanId = String(planId || '').trim();
  if (!cleanPlanId || !AUTHORITATIVE_MINING_PLANS[cleanPlanId]) {
    res.status(400).json({
      success: false,
      error: `Invalid or unsupported cloud mining plan: ${cleanPlanId || 'MISSING_PLAN_ID'}`,
    });
    return;
  }

  const cleanKey = String(idempotencyKey || '').trim();
  if (cleanKey.length < 6) {
    res.status(400).json({
      success: false,
      error: 'Missing or invalid idempotencyKey for contract order.',
    });
    return;
  }

  if (!hasActiveFirestoreBackend()) {
    res.status(503).json({
      success: false,
      error: 'Firebase Admin SDK is not initialized on this server instance.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  try {
    const db = getActiveFirestore();
    const result = await purchaseMiningContract(db as any, {
      userId: caller.uid,
      planId: cleanPlanId,
      idempotencyKey: cleanKey,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    const msg = err?.message || 'Failed to process cloud mining contract purchase.';
    res.status(400).json({
      success: false,
      error: msg,
    });
  }
});

/**
 * Helper to deduplicate and filter unsettled deposit documents, optionally auto-reconciling
 * valid CONFIRMED or APPROVED deposits when an authorized admin loads the queue.
 */
async function collectAndReconcileUnsettledDeposits(
  db: any,
  rawDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  adminActor: { uid: string; email: string },
  autoReconcileConfirmed: boolean
): Promise<{
  deposits: Array<ReturnType<typeof mapTransactionDoc>>;
  autoReconciled: Array<{ txId: string; userId: string; amount: number; asset: string; message: string }>;
}> {
  const seenKeys = new Set<string>();
  const deposits: Array<ReturnType<typeof mapTransactionDoc>> = [];
  const autoReconciled: Array<{ txId: string; userId: string; amount: number; asset: string; message: string }> = [];

  for (const docSnap of rawDocs) {
    if (!docSnap) continue;
    const mapped = mapTransactionDoc(docSnap);
    const uniqueKey = `${mapped.userId || 'unknown'}:${mapped.id}`;
    if (seenKeys.has(uniqueKey)) continue;
    seenKeys.add(uniqueKey);

    // Never include already-settled deposits in the pending/unsettled queue
    if (mapped.walletCredited || mapped.walletSettled) {
      continue;
    }

    if (
      autoReconcileConfirmed &&
      mapped.userId &&
      (mapped.status === 'CONFIRMED' || mapped.status === 'APPROVED')
    ) {
      try {
        const res = await settleDepositApproval(db as any, {
          userId: mapped.userId,
          txId: mapped.id,
          admin: adminActor,
          note: `Auto-reconciled verified ${mapped.status} deposit via Admin Settlement Console`,
          allowManualCompletedStatus: true,
          serverTimestamp: () => FieldValue.serverTimestamp(),
        });
        if (!res.alreadyProcessed) {
          autoReconciled.push({
            txId: mapped.id,
            userId: mapped.userId,
            amount: res.amount,
            asset: res.asset,
            message: res.message,
          });
        }
        continue;
      } catch (reconcileErr: any) {
        const warningMsg =
          reconcileErr?.message || 'Awaiting payment verification before wallet credit.';
        mapped.settlementWarning = warningMsg;
        try {
          await db.doc(`users/${mapped.userId}/transactions/${mapped.id}`).update({
            settlementStatus: 'AWAITING_VERIFICATION',
            settlementWarning: warningMsg,
            updatedAt: new Date().toISOString(),
          });
        } catch {
          // Ignore if read-only test mock does not implement direct doc.update
        }
      }
    }

    deposits.push(mapped);
  }

  return { deposits, autoReconciled };
}

/**
 * GET /api/admin/pending-deposits
 * Lists pending and unsettled CONFIRMED/APPROVED deposits for administrative review
 */
app.get('/api/admin/pending-deposits', requireAdminAuth, async (req, res) => {
  try {
    if (!hasActiveFirestoreBackend()) {
      res.json({
        deposits: [],
        autoReconciled: [],
        notice: 'Firebase Admin not connected to Firestore database.',
      });
      return;
    }

    const caller = (req as any).adminCaller as AuthenticatedCaller;
    const autoReconcile = req.query.autoReconcile !== 'false';
    const db = getActiveFirestore();
    const [pendingConfirmDocs, pendingReviewDocs, confirmedDocs, approvedDocs] =
      await queryTransactionsAcrossUsers(db, [
        { type: 'DEPOSIT', status: 'PENDING_CONFIRMATION', limit: 50 },
        { type: 'DEPOSIT', status: 'PENDING_REVIEW', limit: 50 },
        { type: 'DEPOSIT', status: 'CONFIRMED', limit: 50 },
        { type: 'DEPOSIT', status: 'APPROVED', limit: 50 },
      ]);

    const { deposits, autoReconciled } = await collectAndReconcileUnsettledDeposits(
      db,
      [...pendingConfirmDocs, ...pendingReviewDocs, ...confirmedDocs, ...approvedDocs],
      { uid: caller.uid, email: caller.email || caller.uid },
      autoReconcile
    );

    res.json({ deposits, autoReconciled });
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
 * - Unsettled Deposits (`PENDING_CONFIRMATION`, `PENDING_REVIEW`, `CONFIRMED`, `APPROVED`)
 * - Daily Bonus / Task Reward Claims (`type == 'TASK_REWARD'`, `status == 'PENDING_REVIEW'`)
 * - Withdrawals (`type == 'WITHDRAWAL'`, `status == 'PENDING_REVIEW'`)
 */
app.get('/api/admin/pending-requests', requireAdminAuth, async (req, res) => {
  try {
    if (!hasActiveFirestoreBackend()) {
      res.json({
        deposits: [],
        rewards: [],
        withdrawals: [],
        autoReconciled: [],
        notice: 'Firebase Admin not connected to Firestore database.',
      });
      return;
    }

    const caller = (req as any).adminCaller as AuthenticatedCaller;
    const autoReconcile = req.query.autoReconcile !== 'false';
    const db = getActiveFirestore();
    const [
      pendingConfirmDocs,
      pendingReviewDocs,
      confirmedDocs,
      approvedDocs,
      rewardDocs,
      withdrawalDocs,
    ] = await queryTransactionsAcrossUsers(db, [
      { type: 'DEPOSIT', status: 'PENDING_CONFIRMATION', limit: 50 },
      { type: 'DEPOSIT', status: 'PENDING_REVIEW', limit: 50 },
      { type: 'DEPOSIT', status: 'CONFIRMED', limit: 50 },
      { type: 'DEPOSIT', status: 'APPROVED', limit: 50 },
      { type: 'TASK_REWARD', status: 'PENDING_REVIEW', limit: 50 },
      { type: 'WITHDRAWAL', status: 'PENDING_REVIEW', limit: 50 },
    ]);

    const { deposits, autoReconciled } = await collectAndReconcileUnsettledDeposits(
      db,
      [...pendingConfirmDocs, ...pendingReviewDocs, ...confirmedDocs, ...approvedDocs],
      { uid: caller.uid, email: caller.email || caller.uid },
      autoReconcile
    );

    res.json({
      deposits,
      rewards: rewardDocs.map(mapTransactionDoc).filter((r) => !r.walletCredited && !r.walletSettled),
      withdrawals: withdrawalDocs.map(mapTransactionDoc).filter((w) => !w.walletSettled),
      autoReconciled,
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
  const { userId, txId, note, allowManualCompletedStatus } = req.body;
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
      allowManualCompletedStatus: allowManualCompletedStatus !== undefined ? Boolean(allowManualCompletedStatus) : true,
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
      const [
        confirmedDeposits,
        approvedDeposits,
        completedDeposits,
        completedRewards,
        completedWithdrawals,
        rejectedWithdrawals,
      ] = await queryTransactionsAcrossUsers(db, [
        { type: 'DEPOSIT', status: 'CONFIRMED', limit: 50 },
        { type: 'DEPOSIT', status: 'APPROVED', limit: 50 },
        { type: 'DEPOSIT', status: 'COMPLETED', limit: 50 },
        { type: 'TASK_REWARD', status: 'COMPLETED', limit: 50 },
        { type: 'WITHDRAWAL', status: 'COMPLETED', limit: 50 },
        { type: 'WITHDRAWAL', status: 'REJECTED', limit: 50 },
      ]);
      docsToInspect = [
        ...confirmedDeposits,
        ...approvedDeposits,
        ...completedDeposits,
        ...completedRewards,
        ...completedWithdrawals,
        ...rejectedWithdrawals,
      ];
    }

    for (const docSnap of docsToInspect) {
      const data = docSnap.data();
      const parentUid = docSnap.ref?.parent?.parent?.id || (docSnap as any)._fallbackUserId;
      const uid = parentUid || data.userId;
      if (!uid) continue;

      try {
        if (
          data.type === 'DEPOSIT' &&
          ['CONFIRMED', 'APPROVED', 'COMPLETED'].includes(String(data.status)) &&
          !data.walletCredited &&
          !data.walletSettled
        ) {
          const resDeposit = await settleDepositApproval(db as any, {
            userId: uid,
            txId: docSnap.id,
            admin: adminActor,
            note: `Reconciled manual Firebase Console deposit (${data.status})`,
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
        const failureReason =
          itemErr?.message || 'Failed structural verification for Console reconciliation.';
        skippedItems.push({
          txId: docSnap.id,
          userId: uid,
          type: String(data.type || 'UNKNOWN'),
          reason: failureReason,
        });
        try {
          await db.doc(`users/${uid}/transactions/${docSnap.id}`).update({
            settlementStatus: 'AWAITING_VERIFICATION',
            settlementWarning: failureReason,
            updatedAt: new Date().toISOString(),
          });
        } catch {
          // Ignore if read-only test mock does not implement direct doc.update
        }
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
    console.log(`Nexora Cloud Mining server active on http://0.0.0.0:${PORT} (mode: ${process.env.NODE_ENV || 'development'})`);
  });

  httpServer.on('error', (err: any) => {
    console.error('Express server listen error:', err);
  });
}

if (process.env.NEXORA_SKIP_LISTEN !== 'true') {
  initializeServer().catch((err) => {
    console.error('Fatal error initializing Nexora Cloud Mining server:', err);
  });
}
