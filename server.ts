import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In development, the dev server must run strictly on port 3000.
// In production (Cloud Run), bind to process.env.PORT if specified.
const PORT = process.env.NODE_ENV === 'production' && process.env.PORT
  ? Number(process.env.PORT)
  : 3000;
const ADMIN_EMAILS = [
  'muneebsj7@gmail.com',
  ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()) : []),
];

// Initialize Firebase Admin SDK
let isFirebaseAdminInitialized = false;
let adminInitError: string | null = null;

function setupFirebaseAdmin() {
  if (getApps().length > 0) {
    isFirebaseAdminInitialized = true;
    return;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;

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
      console.log('Firebase Admin SDK initialized using FIREBASE_SERVICE_ACCOUNT_KEY.');
      return;
    }

    if (credentialsPath) {
      initializeApp({
        credential: applicationDefault(),
        projectId,
      });
      isFirebaseAdminInitialized = true;
      console.log('Firebase Admin SDK initialized using GOOGLE_APPLICATION_CREDENTIALS.');
      return;
    }

    // Try default credential initialization (e.g. inside GCP environment)
    if (projectId && !projectId.includes('default') && !projectId.includes('your-project-id')) {
      initializeApp({
        projectId,
      });
      isFirebaseAdminInitialized = true;
      console.log(`Firebase Admin initialized with projectId: ${projectId}`);
      return;
    }
  } catch (err: any) {
    adminInitError = err?.message || String(err);
    console.warn('Firebase Admin SDK initialization notice:', adminInitError);
  }
}

setupFirebaseAdmin();

const app = express();
app.use(express.json());

// Interface for authenticated admin caller
interface AdminCaller {
  uid: string;
  email: string;
  isAdmin: boolean;
}

/**
 * Middleware: Verify caller is an authenticated administrator
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
    // 1. Try Firebase Admin token verification if Admin Auth is available
    if (getApps().length > 0) {
      try {
        const decoded = await getAuth().verifyIdToken(token);
        const email = (decoded.email || '').toLowerCase();
        const isEmailVerified = decoded.email_verified === true;
        const hasAdminRole = decoded.admin === true || (ADMIN_EMAILS.includes(email) && isEmailVerified);

        if (!hasAdminRole) {
          res.status(403).json({
            success: false,
            error: !isEmailVerified
              ? `User email ${email} must be verified before administrative access is granted.`
              : `User ${email || decoded.uid} does not have administrative privileges.`,
          });
          return;
        }

        (req as any).adminCaller = {
          uid: decoded.uid,
          email: decoded.email || decoded.uid,
          isAdmin: true,
        };
        next();
        return;
      } catch (adminVerifyErr) {
        // If admin token verification fails, check if we can verify with Google Identity Toolkit REST API
      }
    }

    // 2. Fallback token verification using Google Identity Toolkit REST API
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    if (apiKey && !apiKey.toLowerCase().includes('placeholder')) {
      const restResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        }
      );

      if (restResp.ok) {
        const data = await restResp.json();
        const userObj = data.users?.[0];
        if (userObj) {
          const email = (userObj.email || '').toLowerCase();
          const isEmailVerified = userObj.emailVerified === true;
          const hasAdminRole = ADMIN_EMAILS.includes(email) && isEmailVerified;

          if (!hasAdminRole) {
            res.status(403).json({
              success: false,
              error: !isEmailVerified
                ? `User email ${email} must be verified before administrative access is granted.`
                : `User ${email || userObj.localId} is not in the authorized administrator allowlist.`,
            });
            return;
          }

          (req as any).adminCaller = {
            uid: userObj.localId,
            email: userObj.email,
            isAdmin: true,
          };
          next();
          return;
        }
      }
    }

    // Demo/Sandbox fallback: strictly limited to local development and exact demo token
    if (process.env.NODE_ENV !== 'production' && token === 'demo-admin-token') {
      (req as any).adminCaller = {
        uid: 'demo_admin',
        email: 'muneebsj7@gmail.com',
        isAdmin: true,
      };
      next();
      return;
    }

    res.status(401).json({
      success: false,
      error: 'Invalid or expired Firebase ID token.',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Failed to authenticate admin request.',
    });
  }
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

app.get('/api/admin/setup-status', (_req, res) => {
  res.json({
    isConfigured: isFirebaseAdminInitialized,
    adminEmails: ADMIN_EMAILS,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || null,
    hasServiceAccount: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS),
    functionsDeployed: false,
    notes: [
      isFirebaseAdminInitialized
        ? 'Firebase Admin SDK is initialized.'
        : 'Firebase Admin SDK credentials not detected in local environment. Set FIREBASE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS for direct server-side database writes.',
      'Cloud Functions blueprint available at /functions/index.ts for Firebase CLI deployment (firebase deploy --only functions).',
    ],
  });
});

/**
 * GET /api/admin/pending-deposits
 * Lists pending deposits for administrative review
 */
app.get('/api/admin/pending-deposits', requireAdminAuth, async (_req, res) => {
  try {
    if (!getApps().length) {
      res.json({
        deposits: [],
        notice: 'Firebase Admin not connected to Firestore database.',
      });
      return;
    }

    const db = getFirestore();
    // Query pending deposit transactions across all users via collectionGroup
    const txGroupSnap = await db
      .collectionGroup('transactions')
      .where('type', '==', 'DEPOSIT')
      .where('status', '==', 'PENDING_CONFIRMATION')
      .limit(50)
      .get();

    const deposits = txGroupSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      const parentUserPath = docSnap.ref.parent.parent;
      const inferredUserId = data.userId || parentUserPath?.id;

      return {
        id: docSnap.id,
        userId: inferredUserId,
        type: data.type,
        asset: data.asset,
        amount: data.amount,
        amountUSD: data.amountUSD,
        fee: data.fee,
        status: data.status,
        timestamp: data.timestamp,
        txHash: data.txHash,
        network: data.network,
        note: data.note,
        createdAt: data.createdAt,
      };
    });

    res.json({ deposits });
  } catch (err: any) {
    console.error('Error listing pending deposits:', err);
    res.status(500).json({
      error: err?.message || 'Failed to list pending deposits.',
    });
  }
});

/**
 * POST /api/admin/approve-deposit
 * Atomically approves a deposit, credits user's wallet balance, and updates transaction status.
 * Strictly Idempotent: safe against duplicate clicks, network retries, or concurrent attempts.
 */
app.post('/api/admin/approve-deposit', requireAdminAuth, async (req, res) => {
  const { userId, txId, note } = req.body;
  const caller = (req as any).adminCaller as AdminCaller;

  if (!userId || !txId) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: userId and txId must be specified.',
    });
    return;
  }

  // Check if Firebase Admin is connected
  if (!getApps().length) {
    res.status(503).json({
      success: false,
      error:
        'Firebase Admin SDK is not configured with service account credentials on this server. ' +
        'Please supply FIREBASE_SERVICE_ACCOUNT_KEY in your environment, or deploy the Cloud Function in /functions/index.ts to Firebase Cloud Functions.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  const db = getFirestore();
  const txRef = db.doc(`users/${userId}/transactions/${txId}`);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const txSnap = await transaction.get(txRef);
      if (!txSnap.exists) {
        throw new Error(`Deposit transaction ${txId} was not found under users/${userId}.`);
      }

      const txData = txSnap.data()!;
      if (txData.type !== 'DEPOSIT') {
        throw new Error(`Transaction ${txId} has type "${txData.type}". Only DEPOSIT transactions can be approved.`);
      }

      // 1. Idempotency Check: if already completed or wallet already credited, return without double-crediting
      if (txData.status === 'COMPLETED' || txData.walletCredited === true) {
        return {
          alreadyProcessed: true,
          status: 'COMPLETED',
          message: 'Deposit has already been approved and credited. Duplicate credit was prevented.',
          creditedAmount: txData.creditedAmount || txData.amount,
          creditedAsset: txData.creditedAsset || txData.asset,
        };
      }

      // 2. Validate current status is PENDING_CONFIRMATION
      if (txData.status !== 'PENDING_CONFIRMATION') {
        throw new Error(
          `Cannot approve deposit in status "${txData.status}". Only PENDING_CONFIRMATION transactions are eligible.`
        );
      }

      const assetSymbol = (txData.asset || 'USDT').toUpperCase();
      const depositAmount = Number(txData.amount);

      if (!depositAmount || isNaN(depositAmount) || depositAmount <= 0) {
        throw new Error(`Invalid deposit amount "${txData.amount}" recorded on transaction ${txId}.`);
      }

      // 3. Retrieve the target wallet document: users/{userId}/wallet/{assetSymbol}
      const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
      const walletSnap = await transaction.get(walletRef);

      const existingBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
      const existingLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;

      // 4. Calculate new available balance
      const newBalance = Number((existingBalance + depositAmount).toFixed(8));

      // 5. Atomically update wallet document
      transaction.set(
        walletRef,
        {
          symbol: assetSymbol,
          balance: newBalance,
          lockedBalance: existingLocked,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // 6. Atomically update transaction status and record approval metadata
      transaction.update(txRef, {
        status: 'COMPLETED',
        walletCredited: true,
        creditedAmount: depositAmount,
        creditedAsset: assetSymbol,
        approvedBy: caller.email,
        approvedAt: FieldValue.serverTimestamp(),
        approvalNote: note || 'Admin verified deposit payment',
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        alreadyProcessed: false,
        status: 'COMPLETED',
        message: `Deposit of ${depositAmount} ${assetSymbol} approved successfully. User balance updated.`,
        previousBalance: existingBalance,
        newBalance,
        creditedAmount: depositAmount,
        creditedAsset: assetSymbol,
        txId,
        userId,
      };
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error(`Approval error for tx ${txId}:`, err);
    res.status(400).json({
      success: false,
      error: err?.message || 'Transaction approval failed.',
    });
  }
});

/**
 * POST /api/admin/reject-deposit
 * Rejects a deposit request without crediting any balance.
 */
app.post('/api/admin/reject-deposit', requireAdminAuth, async (req, res) => {
  const { userId, txId, reason } = req.body;
  const caller = (req as any).adminCaller as AdminCaller;

  if (!userId || !txId) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: userId and txId must be specified.',
    });
    return;
  }

  if (!getApps().length) {
    res.status(503).json({
      success: false,
      error: 'Firebase Admin SDK is not initialized.',
      code: 'MISSING_ADMIN_CREDENTIALS',
    });
    return;
  }

  const db = getFirestore();
  const txRef = db.doc(`users/${userId}/transactions/${txId}`);

  try {
    await db.runTransaction(async (transaction) => {
      const txSnap = await transaction.get(txRef);
      if (!txSnap.exists) {
        throw new Error(`Transaction ${txId} does not exist.`);
      }

      const txData = txSnap.data()!;
      if (txData.status === 'COMPLETED' || txData.walletCredited) {
        throw new Error('Cannot reject a deposit that has already been approved and credited.');
      }

      transaction.update(txRef, {
        status: 'REJECTED',
        rejectedBy: caller.email,
        rejectedAt: FieldValue.serverTimestamp(),
        rejectionReason: reason || 'Blockchain verification unconfirmed or invalid.',
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    res.json({
      success: true,
      message: `Deposit ${txId} has been marked as REJECTED.`,
    });
  } catch (err: any) {
    console.error(`Rejection error for tx ${txId}:`, err);
    res.status(400).json({
      success: false,
      error: err?.message || 'Failed to reject deposit.',
    });
  }
});

// -------------------------------------------------------------
// VITE OR STATIC SERVING
// -------------------------------------------------------------

async function initializeServer() {
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
        hmr: false,
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nexora Mine server active on http://0.0.0.0:${PORT} (mode: ${process.env.NODE_ENV || 'development'})`);
  });

  server.on('error', (err: any) => {
    console.error('Express server listen error:', err);
  });
}

initializeServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
