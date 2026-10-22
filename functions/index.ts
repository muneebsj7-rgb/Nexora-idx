/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Nexora Mine — Firebase Cloud Functions for Deposit Approval & Wallet Crediting
 * 
 * Deployment Instructions:
 * 1. Ensure your Firebase project is on the Blaze (pay-as-you-go) plan.
 * 2. In your terminal:
 *    firebase deploy --only functions
 * 
 * This file provides two mechanisms:
 * A) onDepositStatusChanged: Background Firestore Trigger. If you manually change
 *    a deposit's status to 'COMPLETED' in the Firebase Console, this function
 *    automatically and atomically updates the user's Available Balance in /users/{userId}/wallet/{assetSymbol}.
 * B) approveDeposit / rejectDeposit: Callable HTTPS functions invoked directly from the Nexora Mine Admin Desk.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

const ADMIN_EMAILS = [
  'muneebsj7@gmail.com',
  ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(s => s.trim().toLowerCase()) : [])
];

function isAuthorizedAdminEmail(email?: string): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * 1. FIRESTORE TRIGGER: Automatically syncs wallet balance when deposit status changes
 * Triggered whenever a transaction document in users/{userId}/transactions/{txId} is updated.
 */
export const onDepositStatusChanged = functions.firestore
  .document('users/{userId}/transactions/{txId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const { userId, txId } = context.params;

    if (!beforeData || !afterData) return null;
    if (afterData.type !== 'DEPOSIT') return null;

    // Detect manual or administrative status change to COMPLETED
    const wasPending = beforeData.status === 'PENDING_CONFIRMATION' || beforeData.status === 'PENDING_REVIEW';
    const isNowCompleted = afterData.status === 'COMPLETED';

    // Idempotency: only execute if not already credited
    if (wasPending && isNowCompleted && !afterData.walletCredited) {
      const assetSymbol = (afterData.asset || 'USDT').toUpperCase();
      const amount = Number(afterData.amount);

      if (!amount || isNaN(amount) || amount <= 0) {
        console.error(`[onDepositStatusChanged] Invalid amount for deposit ${txId}:`, afterData.amount);
        return null;
      }

      const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
      const txRef = change.after.ref;

      try {
        await db.runTransaction(async (transaction) => {
          const freshTx = await transaction.get(txRef);
          if (!freshTx.exists || freshTx.data()?.walletCredited) {
            console.log(`[onDepositStatusChanged] Tx ${txId} already credited or does not exist.`);
            return;
          }

          const walletSnap = await transaction.get(walletRef);
          const currentBalance = walletSnap.exists ? (Number(walletSnap.data()?.balance) || 0) : 0;
          const currentLocked = walletSnap.exists ? (Number(walletSnap.data()?.lockedBalance) || 0) : 0;
          const newBalance = Number((currentBalance + amount).toFixed(8));

          // Atomically update wallet document
          transaction.set(
            walletRef,
            {
              symbol: assetSymbol,
              balance: newBalance,
              lockedBalance: currentLocked,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          // Mark transaction as credited to avoid double-crediting
          transaction.update(txRef, {
            walletCredited: true,
            creditedAmount: amount,
            creditedAsset: assetSymbol,
            creditedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        console.log(`[onDepositStatusChanged] Successfully credited ${amount} ${assetSymbol} to user ${userId} for tx ${txId}`);
      } catch (err) {
        console.error(`[onDepositStatusChanged] Transaction failed for tx ${txId}:`, err);
        throw err;
      }
    }

    return null;
  });

/**
 * 2. CALLABLE HTTPS FUNCTION: Approve verified deposit
 */
export const approveDeposit = functions.https.onCall(async (data, context) => {
  // Authentication & Authorization check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const callerEmail = context.auth.token.email;
  const isCustomAdmin = Boolean(context.auth.token.admin);
  if (!isCustomAdmin && !isAuthorizedAdminEmail(callerEmail)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Caller ${callerEmail} is not authorized to approve deposits.`
    );
  }

  const { userId, txId, note } = data;
  if (!userId || !txId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and txId are required.');
  }

  const txRef = db.doc(`users/${userId}/transactions/${txId}`);

  return await db.runTransaction(async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', `Transaction ${txId} not found.`);
    }

    const txData = txSnap.data()!;
    if (txData.type !== 'DEPOSIT') {
      throw new functions.https.HttpsError('failed-precondition', `Transaction ${txId} is not a deposit.`);
    }

    // Idempotent return if already completed
    if (txData.status === 'COMPLETED' || txData.walletCredited) {
      return {
        success: true,
        alreadyProcessed: true,
        message: 'Deposit has already been approved and credited.',
        status: 'COMPLETED',
        creditedAmount: txData.creditedAmount || txData.amount,
      };
    }

    if (txData.status !== 'PENDING_CONFIRMATION') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Cannot approve deposit in status ${txData.status}. Only PENDING_CONFIRMATION is eligible.`
      );
    }

    const assetSymbol = (txData.asset || 'USDT').toUpperCase();
    const amount = Number(txData.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new functions.https.HttpsError('invalid-argument', `Invalid deposit amount: ${txData.amount}`);
    }

    const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
    const walletSnap = await transaction.get(walletRef);
    const currentBalance = walletSnap.exists ? (Number(walletSnap.data()?.balance) || 0) : 0;
    const currentLocked = walletSnap.exists ? (Number(walletSnap.data()?.lockedBalance) || 0) : 0;
    const newBalance = Number((currentBalance + amount).toFixed(8));

    // Update wallet
    transaction.set(
      walletRef,
      {
        symbol: assetSymbol,
        balance: newBalance,
        lockedBalance: currentLocked,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Update transaction
    transaction.update(txRef, {
      status: 'COMPLETED',
      walletCredited: true,
      creditedAmount: amount,
      creditedAsset: assetSymbol,
      approvedBy: callerEmail || context.auth?.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvalNote: note || 'Verified blockchain deposit',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      alreadyProcessed: false,
      message: `Deposit approved: ${amount} ${assetSymbol} credited to user wallet.`,
      newBalance,
      creditedAmount: amount,
      creditedAsset: assetSymbol,
    };
  });
});

/**
 * 3. CALLABLE HTTPS FUNCTION: Reject invalid deposit
 */
export const rejectDeposit = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const callerEmail = context.auth.token.email;
  const isCustomAdmin = Boolean(context.auth.token.admin);
  if (!isCustomAdmin && !isAuthorizedAdminEmail(callerEmail)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Caller ${callerEmail} is not authorized to reject deposits.`
    );
  }

  const { userId, txId, reason } = data;
  if (!userId || !txId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and txId are required.');
  }

  const txRef = db.doc(`users/${userId}/transactions/${txId}`);

  return await db.runTransaction(async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', `Transaction ${txId} not found.`);
    }

    const txData = txSnap.data()!;
    if (txData.status === 'COMPLETED' || txData.walletCredited) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Cannot reject a deposit that has already been approved and credited.'
      );
    }

    transaction.update(txRef, {
      status: 'REJECTED',
      rejectedBy: callerEmail || context.auth?.uid,
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectionReason: reason || 'Blockchain verification failed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: `Deposit request ${txId} has been marked as REJECTED.`,
    };
  });
});
