/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Nexora Mine — Firebase Cloud Functions for Financial Approval & Wallet Settlement
 *
 * Deployment Instructions:
 * 1. Ensure your Firebase project is on the Blaze (pay-as-you-go) plan.
 * 2. In your terminal:
 *    firebase deploy --only functions
 *
 * This file provides:
 * A) onTransactionStatusChanged (and onDepositStatusChanged alias):
 *    Background Firestore Trigger on users/{userId}/transactions/{txId}.
 *    Processes ONLY valid pending-to-settled status transitions:
 *    - DEPOSIT: ['PENDING_CONFIRMATION', 'PENDING_REVIEW'] -> ['COMPLETED', 'APPROVED', 'CONFIRMED']
 *    - TASK_REWARD / REFERRAL_BONUS: ['PENDING_REVIEW', 'PENDING_VERIFICATION', 'PENDING_CONFIRMATION'] -> ['COMPLETED', 'APPROVED', 'CONFIRMED']
 *    - WITHDRAWAL (Payout): ['PENDING_REVIEW', 'PENDING_CONFIRMATION'] -> ['COMPLETED', 'PAID', 'APPROVED', 'CONFIRMED']
 *    - WITHDRAWAL (Refund): ['PENDING_REVIEW', 'PENDING_CONFIRMATION'] -> ['REJECTED', 'FAILED']
 * B) Callable HTTPS functions:
 *    approveDeposit, rejectDeposit, approveReward, rejectReward, approveWithdrawal, rejectWithdrawal.
 */

import * as functions from 'firebase-functions/v1';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

const ADMIN_EMAILS = Array.from(
  new Set([
    'muneebsj7@gmail.com',
    'procurement.initialsaudi@gmail.com',
    ...(process.env.ADMIN_EMAILS
      ? process.env.ADMIN_EMAILS
          .split(',')
          .map((s: string) => s.trim().toLowerCase())
          .filter(Boolean)
      : []),
  ])
);

const AUTHORITATIVE_ASSET_CONFIG: Record<
  string,
  {
    symbol: string;
    name: string;
    minDeposit: number;
    minWithdraw: number;
    withdrawFee: number;
    defaultUsdRate: number;
  }
> = {
  USDT: { symbol: 'USDT', name: 'Tether USD', minDeposit: 10, minWithdraw: 20, withdrawFee: 1.5, defaultUsdRate: 1.0 },
  BTC: { symbol: 'BTC', name: 'Bitcoin', minDeposit: 0.0005, minWithdraw: 0.001, withdrawFee: 0.0002, defaultUsdRate: 94250 },
  ETH: { symbol: 'ETH', name: 'Ethereum', minDeposit: 0.01, minWithdraw: 0.02, withdrawFee: 0.003, defaultUsdRate: 2785 },
  SOL: { symbol: 'SOL', name: 'Solana', minDeposit: 0.1, minWithdraw: 0.25, withdrawFee: 0.01, defaultUsdRate: 186.4 },
  LTC: { symbol: 'LTC', name: 'Litecoin', minDeposit: 0.1, minWithdraw: 0.2, withdrawFee: 0.005, defaultUsdRate: 128.5 },
};

const FORBIDDEN_PAYMENT_REFERENCE_VALUES = new Set([
  'internal',
  'demo',
  'test',
  'pending',
  'none',
  'null',
  'undefined',
  'n/a',
  'na',
  'fake',
  'mock',
  'unverified',
  'simulated',
  'placeholder',
]);

function normalizeAndValidateDepositReference(
  rawTxHashInput: unknown,
  txId: string
): { rawTxHash: string; normalizedHash: string; paymentRefDocId: string } {
  const rawTxHash = typeof rawTxHashInput === 'string' ? rawTxHashInput.trim() : '';
  if (rawTxHash.length < 8 || rawTxHash.length > 140) {
    throw new Error(
      `Deposit transaction ${txId} is missing a valid blockchain transaction hash (txHash must be at least 8 characters).`
    );
  }

  const lower = rawTxHash.toLowerCase();
  const strippedPrefix = lower.replace(/^0x/i, '');
  if (
    FORBIDDEN_PAYMENT_REFERENCE_VALUES.has(lower) ||
    FORBIDDEN_PAYMENT_REFERENCE_VALUES.has(strippedPrefix) ||
    !/^[a-zA-Z0-9:_-]{8,140}$/.test(rawTxHash) ||
    /^([a-z0-9])\1{7,}$/i.test(strippedPrefix)
  ) {
    throw new Error(
      `Deposit transaction ${txId} is missing a valid blockchain transaction hash (unverified or placeholder reference '${rawTxHash}' rejected).`
    );
  }

  const normalizedHash = lower.replace(/[^a-z0-9_-]/g, '');
  if (normalizedHash.length < 8) {
    throw new Error(
      `Deposit transaction ${txId} is missing a valid blockchain transaction hash (normalized reference too short).`
    );
  }

  return {
    rawTxHash,
    normalizedHash,
    paymentRefDocId: `txhash_${normalizedHash}`,
  };
}

const OFFICIAL_DAILY_REWARD_SCHEDULE: Record<number, number> = {
  1: 0.5,
  2: 0.75,
  3: 1.0,
  4: 1.5,
  5: 2.0,
  6: 3.0,
  7: 5.0,
};

const OFFICIAL_TASK_REWARD_AMOUNTS: Record<string, number> = {
  task_telegram: 2.0,
  task_2fa: 3.0,
  task_verify_email: 1.5,
  task_mine_24h: 5.0,
  task_refer_friend: 10.0,
  task_first_mine: 1.5,
  task_referral_1: 5.0,
  task_deposit_first: 10.0,
  t1: 5.0,
  t2: 10.0,
  t3: 50.0,
  t4: 2.5,
  t5: 25.0,
};

const ALLOWED_REWARD_AMOUNTS = new Set<number>([
  0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 4.5, 5.0, 6.0, 8.5, 10.0, 12.0, 25.0, 50.0,
]);

function isAuthorizedAdminEmail(email?: string): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

function requireCallableAdmin(context: functions.https.CallableContext): { uid: string; email: string } {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const callerEmail = context.auth.token.email;
  const isEmailVerified = context.auth.token.email_verified === true;
  const isCustomAdmin = context.auth.token.admin === true;

  if (!isEmailVerified || (!isCustomAdmin && !isAuthorizedAdminEmail(callerEmail))) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Caller is not an authorized administrator with a verified email.'
    );
  }

  return {
    uid: context.auth.uid,
    email: callerEmail || context.auth.uid,
  };
}

const round8 = (n: number): number => Number(n.toFixed(8));

function validateOwnershipAndNotRejected(txData: Record<string, any>, expectedUserId: string, txId: string): void {
  if (txData.userId && String(txData.userId) !== expectedUserId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Transaction ${txId} userId (${txData.userId}) does not match path owner (${expectedUserId}).`
    );
  }
  if (
    txData.rejectedAt ||
    txData.rejectedBy ||
    txData.refunded === true ||
    txData.settlementStatus === 'REJECTED' ||
    txData.settlementStatus === 'REFUNDED'
  ) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Transaction ${txId} carries rejection or refund markers and cannot be approved.`
    );
  }
}

/**
 * 1. FIRESTORE TRIGGER: Automatically settles wallet balance when transaction status changes
 * Triggered whenever a transaction document in users/{userId}/transactions/{txId} is updated.
 */
export const onTransactionStatusChanged = functions.firestore
  .document('users/{userId}/transactions/{txId}')
  .onUpdate(async (change: functions.Change<functions.firestore.DocumentSnapshot>, context: functions.EventContext) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const { userId, txId } = context.params;

    if (!beforeData || !afterData) return null;

    // Ignore updates where status did not change
    if (beforeData.status === afterData.status) {
      return null;
    }

    const txRef = db.doc(`users/${userId}/transactions/${txId}`);
    const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);
    const assetSymbol = String(afterData.asset || '').trim().toUpperCase();
    const assetRule = AUTHORITATIVE_ASSET_CONFIG[assetSymbol];
    if (!assetRule) {
      console.error(`[onTransactionStatusChanged] Unsupported asset ${assetSymbol} for tx ${txId}`);
      return null;
    }

    const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
    const amount = round8(Number(afterData.amount));

    // A) DEPOSIT transitioned from PENDING_CONFIRMATION / PENDING_REVIEW -> COMPLETED / APPROVED / CONFIRMED
    if (
      afterData.type === 'DEPOSIT' &&
      ['PENDING_CONFIRMATION', 'PENDING_REVIEW'].includes(String(beforeData.status)) &&
      ['COMPLETED', 'APPROVED', 'CONFIRMED'].includes(String(afterData.status)) &&
      !afterData.walletCredited &&
      !afterData.walletSettled
    ) {
      if (!Number.isFinite(amount) || amount <= 0 || amount < assetRule.minDeposit) {
        console.error(`[onTransactionStatusChanged] Deposit ${txId} amount ${amount} below minimum ${assetRule.minDeposit}`);
        await txRef.update({
          settlementStatus: 'AWAITING_VERIFICATION',
          settlementWarning: `Invalid deposit amount (${amount} ${assetSymbol}). Minimum required is ${assetRule.minDeposit} ${assetSymbol}.`,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return null;
      }

      let refInfo: { rawTxHash: string; normalizedHash: string; paymentRefDocId: string };
      try {
        refInfo = normalizeAndValidateDepositReference(afterData.txHash, txId);
      } catch (refErr: any) {
        const msg = refErr?.message || `Deposit ${txId} missing valid txHash; skipping credit.`;
        console.error(`[onTransactionStatusChanged] ${msg}`);
        await txRef.update({
          settlementStatus: 'AWAITING_VERIFICATION',
          settlementWarning: msg,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return null;
      }

      const paymentRefDoc = db.doc(`paymentReferences/${refInfo.paymentRefDocId}`);

      await db.runTransaction(async (transaction) => {
        // ALL READS FIRST
        const [freshTx, settlementSnap, walletSnap, paymentRefSnap] = await Promise.all([
          transaction.get(txRef),
          transaction.get(settlementRef),
          transaction.get(walletRef),
          transaction.get(paymentRefDoc),
        ]);

        if (!freshTx.exists) return;
        const freshData = freshTx.data()!;
        if (freshData.walletCredited === true || freshData.walletSettled === true || settlementSnap.exists) {
          return;
        }

        validateOwnershipAndNotRejected(freshData, userId, txId);

        const verifiedRef = normalizeAndValidateDepositReference(freshData.txHash, txId);
        if (paymentRefSnap.exists) {
          const existingRef = paymentRefSnap.data() || {};
          if (existingRef.txId !== txId || existingRef.userId !== userId) {
            const dupMsg = `Duplicate payment reference: transaction hash '${verifiedRef.rawTxHash}' has already been credited to deposit '${existingRef.txId}'.`;
            console.error(`[onTransactionStatusChanged] ${dupMsg}`);
            transaction.update(txRef, {
              settlementStatus: 'AWAITING_VERIFICATION',
              settlementWarning: dupMsg,
              updatedAt: FieldValue.serverTimestamp(),
            });
            return;
          }
        }

        const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
        const currentBalance = round8(Number(walletData.balance) || 0);
        const currentLocked = round8(Number(walletData.lockedBalance) || 0);
        const newBalance = round8(currentBalance + amount);
        const settlementId = `settle_${txId}`;
        const resolvedPriceUSD =
          Number(freshData.amountUSD) > 0 && amount > 0
            ? Number((Number(freshData.amountUSD) / amount).toFixed(4))
            : Number(walletData.priceUSD || assetRule.defaultUsdRate);
        const resolvedChange24h =
          walletData.change24h !== undefined ? Number(walletData.change24h) : 0;

        // WRITES AFTER ALL READS
        // 1. Reserve unique global payment reference
        transaction.set(paymentRefDoc, {
          id: verifiedRef.paymentRefDocId,
          txHash: verifiedRef.rawTxHash,
          normalizedHash: verifiedRef.normalizedHash,
          userId,
          txId,
          type: 'DEPOSIT',
          asset: assetSymbol,
          amount,
          status: 'CREDITED',
          approvedBy: freshData.approvedBy || 'firebase-console-trigger',
          settledAt: FieldValue.serverTimestamp(),
        });

        // 2. Credit wallet with full authoritative metadata
        transaction.set(
          walletRef,
          {
            symbol: assetSymbol,
            name: walletData.name || assetRule.name,
            balance: newBalance,
            lockedBalance: currentLocked,
            priceUSD: resolvedPriceUSD,
            change24h: resolvedChange24h,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // 3. Create immutable settlement ledger receipt
        transaction.set(settlementRef, {
          id: settlementId,
          txId,
          userId,
          type: 'DEPOSIT',
          action: 'APPROVE_DEPOSIT',
          status: 'COMPLETED',
          asset: assetSymbol,
          amount,
          txHash: verifiedRef.rawTxHash,
          paymentReferenceId: verifiedRef.paymentRefDocId,
          previousBalance: currentBalance,
          newBalance,
          previousLockedBalance: currentLocked,
          newLockedBalance: currentLocked,
          approvedBy: freshData.approvedBy || 'firebase-console-trigger',
          settledAt: FieldValue.serverTimestamp(),
        });

        // 4. Update deposit transaction settlement state
        transaction.update(txRef, {
          status: 'COMPLETED',
          walletCredited: true,
          walletSettled: true,
          settlementId,
          paymentReferenceId: verifiedRef.paymentRefDocId,
          settlementStatus: 'CREDITED',
          creditedAmount: amount,
          creditedAsset: assetSymbol,
          previousBalance: currentBalance,
          newBalance,
          creditedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      return null;
    }

    // B) TASK_REWARD / REFERRAL_BONUS transitioned from PENDING -> COMPLETED / APPROVED / CONFIRMED
    if (
      (afterData.type === 'TASK_REWARD' || afterData.type === 'REFERRAL_BONUS') &&
      ['PENDING_REVIEW', 'PENDING_VERIFICATION', 'PENDING_CONFIRMATION'].includes(String(beforeData.status)) &&
      ['COMPLETED', 'APPROVED', 'CONFIRMED'].includes(String(afterData.status)) &&
      !afterData.walletCredited
    ) {
      if (assetSymbol !== 'USDT' || !ALLOWED_REWARD_AMOUNTS.has(amount)) {
        console.error(`[onTransactionStatusChanged] Invalid reward asset/amount (${amount} ${assetSymbol}) for ${txId}`);
        return null;
      }

      const streakRef = db.doc(`users/${userId}/rewards/dailyStreak`);

      await db.runTransaction(async (transaction) => {
        // ALL READS FIRST
        const [freshTx, settlementSnap, walletSnap, streakSnap] = await Promise.all([
          transaction.get(txRef),
          transaction.get(settlementRef),
          transaction.get(walletRef),
          transaction.get(streakRef),
        ]);

        if (!freshTx.exists) return;
        const freshData = freshTx.data()!;
        if (freshData.walletCredited === true || freshData.walletSettled === true || settlementSnap.exists) {
          return;
        }

        validateOwnershipAndNotRejected(freshData, userId, txId);

        const hasTaskId = typeof freshData.taskId === 'string' && freshData.taskId.trim().length > 0;
        const hasRewardDay =
          freshData.rewardDay !== undefined &&
          freshData.rewardDay !== null &&
          String(freshData.rewardDay).trim() !== '';
        const hasStreakDay =
          freshData.streakDay !== undefined &&
          freshData.streakDay !== null &&
          Number.isInteger(Number(freshData.streakDay));

        let isDailyStreakReward = false;
        let verifiedStreakDay: number | null = hasStreakDay ? Number(freshData.streakDay) : null;
        let verifiedRewardDay: string | number | null = hasRewardDay ? freshData.rewardDay : null;

        if (hasTaskId) {
          const expectedTaskReward = OFFICIAL_TASK_REWARD_AMOUNTS[freshData.taskId.trim()];
          if (expectedTaskReward === undefined || expectedTaskReward !== amount) {
            console.error(`[onTransactionStatusChanged] Task ${freshData.taskId} mismatch for amount ${amount}`);
            return;
          }
        } else if (hasRewardDay || hasStreakDay) {
          isDailyStreakReward = true;
          if (typeof freshData.rewardDay === 'number' || /^\d+$/.test(String(freshData.rewardDay || ''))) {
            verifiedStreakDay = Number(freshData.rewardDay);
          }
          if (verifiedStreakDay !== null && OFFICIAL_DAILY_REWARD_SCHEDULE[verifiedStreakDay] !== amount) {
            console.error(`[onTransactionStatusChanged] Reward day ${verifiedStreakDay} mismatch for amount ${amount}`);
            return;
          }
        } else if (streakSnap.exists) {
          // Verify legacy daily streak claim via authoritative rewards/dailyStreak record
          const sData = streakSnap.data()!;
          const topDay = Number(sData.currentStreak);
          const topDate = typeof sData.lastClaimDate === 'string' ? sData.lastClaimDate.trim() : '';
          if (
            sData.claimStatus === 'PENDING_VERIFICATION' &&
            Number.isInteger(topDay) &&
            topDay >= 1 &&
            topDay <= 7 &&
            /^\d{4}-\d{2}-\d{2}$/.test(topDate) &&
            OFFICIAL_DAILY_REWARD_SCHEDULE[topDay] === amount
          ) {
            isDailyStreakReward = true;
            verifiedStreakDay = topDay;
            verifiedRewardDay = topDate;
          } else {
            console.error(`[onTransactionStatusChanged] Missing rewardDay/taskId and no dailyStreak proof for ${txId}`);
            return;
          }
        } else {
          console.error(`[onTransactionStatusChanged] Missing rewardDay and taskId metadata on ${txId}`);
          return;
        }

        const currentBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
        const currentLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;
        const newBalance = round8(currentBalance + amount);
        const settlementId = `settle_${txId}`;

        // WRITES AFTER ALL READS
        transaction.set(
          walletRef,
          {
            symbol: assetSymbol,
            balance: newBalance,
            lockedBalance: currentLocked,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(settlementRef, {
          id: settlementId,
          txId,
          userId,
          type: freshData.type,
          action: 'APPROVE_REWARD',
          asset: assetSymbol,
          amount,
          rewardDay: verifiedRewardDay,
          streakDay: verifiedStreakDay,
          taskId: hasTaskId ? freshData.taskId.trim() : null,
          previousBalance: currentBalance,
          newBalance,
          approvedBy: freshData.approvedBy || 'firebase-console-trigger',
          settledAt: FieldValue.serverTimestamp(),
        });

        transaction.update(txRef, {
          status: 'COMPLETED',
          walletCredited: true,
          walletSettled: true,
          settlementId,
          settlementStatus: 'CREDITED',
          creditedAmount: amount,
          creditedAsset: assetSymbol,
          ...(verifiedRewardDay !== null ? { rewardDay: verifiedRewardDay } : {}),
          ...(verifiedStreakDay !== null ? { streakDay: verifiedStreakDay } : {}),
          creditedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (isDailyStreakReward && streakSnap.exists) {
          const streakData = streakSnap.data()!;
          const claimDate =
            freshData.claimDate ||
            (typeof verifiedRewardDay === 'string' ? verifiedRewardDay : '') ||
            (typeof freshData.timestamp === 'string' ? freshData.timestamp.slice(0, 10) : '');
          const history: any[] = Array.isArray(streakData.claimHistory) ? streakData.claimHistory : [];
          const updatedHistory = history.map((item) =>
            (item.txId && item.txId === txId) || (claimDate && item.date === claimDate)
              ? { ...item, status: 'CLAIMED', txId: item.txId || txId }
              : item
          );

          transaction.set(
            streakRef,
            {
              claimStatus: 'CLAIMED',
              approvalStatus: 'APPROVED',
              approvedAmount: amount,
              walletCredited: true,
              verifiedAt: FieldValue.serverTimestamp(),
              creditedAt: FieldValue.serverTimestamp(),
              claimHistory: updatedHistory,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      });

      return null;
    }

    // C) WITHDRAWAL transitioned from PENDING -> COMPLETED / PAID / APPROVED / CONFIRMED (Payout settlement)
    if (
      afterData.type === 'WITHDRAWAL' &&
      ['PENDING_REVIEW', 'PENDING_CONFIRMATION'].includes(String(beforeData.status)) &&
      ['COMPLETED', 'PAID', 'APPROVED', 'CONFIRMED'].includes(String(afterData.status)) &&
      !afterData.walletSettled
    ) {
      if (!Number.isFinite(amount) || amount < assetRule.minWithdraw) return null;

      await db.runTransaction(async (transaction) => {
        // ALL READS FIRST
        const [freshTx, settlementSnap, walletSnap] = await Promise.all([
          transaction.get(txRef),
          transaction.get(settlementRef),
          transaction.get(walletRef),
        ]);

        if (!freshTx.exists) return;
        const freshData = freshTx.data()!;
        if (freshData.walletSettled === true || settlementSnap.exists) {
          return;
        }

        validateOwnershipAndNotRejected(freshData, userId, txId);

        const toAddress = typeof freshData.toAddress === 'string' ? freshData.toAddress.trim() : '';
        if (toAddress.length < 12) {
          console.error(`[onTransactionStatusChanged] Withdrawal ${txId} has invalid toAddress; skipping.`);
          return;
        }

        const storedFee = round8(Number(freshData.fee) || 0);
        const fee = storedFee > 0 ? storedFee : assetRule.withdrawFee;
        const netPayoutAmount = round8(amount - fee);
        if (netPayoutAmount <= 0) return;

        const existingBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
        const existingLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;

        let newBalance = existingBalance;
        let newLocked = existingLocked;

        if (freshData.reservedFromBalance === true) {
          if (existingLocked + 1e-8 < amount) {
            throw new Error(`Locked balance (${existingLocked}) is less than reserved withdrawal (${amount})`);
          }
          newLocked = round8(Math.max(0, existingLocked - amount));
        } else {
          if (existingBalance + 1e-8 < amount) {
            throw new Error(`Insufficient balance to settle withdrawal ${txId}`);
          }
          newBalance = round8(existingBalance - amount);
        }

        const settlementId = `settle_${txId}`;

        // WRITES AFTER ALL READS
        transaction.set(
          walletRef,
          {
            symbol: assetSymbol,
            balance: newBalance,
            lockedBalance: newLocked,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(settlementRef, {
          id: settlementId,
          txId,
          userId,
          type: 'WITHDRAWAL',
          action: 'APPROVE_WITHDRAWAL',
          asset: assetSymbol,
          amount,
          fee,
          netPayoutAmount,
          previousBalance: existingBalance,
          newBalance,
          previousLockedBalance: existingLocked,
          newLockedBalance: newLocked,
          settledAt: FieldValue.serverTimestamp(),
        });

        transaction.update(txRef, {
          status: 'COMPLETED',
          walletSettled: true,
          settlementId,
          settlementStatus: 'PAID',
          fee,
          netPayoutAmount,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      return null;
    }

    // D) WITHDRAWAL transitioned from PENDING -> REJECTED / FAILED (Escrow refund)
    if (
      afterData.type === 'WITHDRAWAL' &&
      ['PENDING_REVIEW', 'PENDING_CONFIRMATION'].includes(String(beforeData.status)) &&
      ['REJECTED', 'FAILED'].includes(String(afterData.status)) &&
      afterData.reservedFromBalance === true &&
      !afterData.refunded
    ) {
      if (!Number.isFinite(amount) || amount <= 0) return null;

      await db.runTransaction(async (transaction) => {
        // ALL READS FIRST
        const [freshTx, settlementSnap, walletSnap] = await Promise.all([
          transaction.get(txRef),
          transaction.get(settlementRef),
          transaction.get(walletRef),
        ]);

        if (!freshTx.exists) return;
        const freshData = freshTx.data()!;
        if (freshData.refunded === true || freshData.walletSettled === true || settlementSnap.exists) {
          return;
        }

        const existingBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
        const existingLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;
        const newLocked = round8(Math.max(0, existingLocked - amount));
        const newBalance = round8(existingBalance + amount);
        const settlementId = `settle_${txId}`;

        // WRITES AFTER ALL READS
        transaction.set(
          walletRef,
          {
            symbol: assetSymbol,
            balance: newBalance,
            lockedBalance: newLocked,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(settlementRef, {
          id: settlementId,
          txId,
          userId,
          type: 'WITHDRAWAL',
          action: 'REJECT_WITHDRAWAL',
          asset: assetSymbol,
          amount,
          refunded: true,
          previousBalance: existingBalance,
          newBalance,
          previousLockedBalance: existingLocked,
          newLockedBalance: newLocked,
          settledAt: FieldValue.serverTimestamp(),
        });

        transaction.update(txRef, {
          status: 'REJECTED',
          walletSettled: true,
          refunded: true,
          refundedAt: FieldValue.serverTimestamp(),
          settlementId,
          settlementStatus: 'REFUNDED',
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    }

    return null;
  });

// Backward-compatible export name
export const onDepositStatusChanged = onTransactionStatusChanged;

/**
 * 2. CALLABLE HTTPS FUNCTION: Approve verified deposit
 */
export const approveDeposit = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const admin = requireCallableAdmin(context);
  const { userId, txId, note, allowManualCompletedStatus = true } = data || {};
  if (!userId || !txId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and txId are required.');
  }

  const txRef = db.doc(`users/${userId}/transactions/${txId}`);
  const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);

  return await db.runTransaction(async (transaction) => {
    const [txSnap, settlementSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(settlementRef),
    ]);
    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', `Transaction ${txId} not found.`);
    }

    const txData = txSnap.data()!;
    if (txData.type !== 'DEPOSIT') {
      throw new functions.https.HttpsError('failed-precondition', `Transaction ${txId} is not a deposit.`);
    }

    validateOwnershipAndNotRejected(txData, userId, txId);

    if (settlementSnap.exists || txData.walletCredited === true || txData.walletSettled === true) {
      return {
        success: true,
        alreadyProcessed: true,
        message: 'Deposit has already been approved and credited.',
        status: 'COMPLETED',
        creditedAmount: txData.creditedAmount || txData.amount,
      };
    }

    const allowedStatuses = allowManualCompletedStatus
      ? ['PENDING_CONFIRMATION', 'PENDING_REVIEW', 'CONFIRMED', 'APPROVED', 'COMPLETED']
      : ['PENDING_CONFIRMATION', 'PENDING_REVIEW'];

    if (!allowedStatuses.includes(String(txData.status))) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Cannot approve deposit in status ${txData.status}. Eligible statuses: ${allowedStatuses.join(', ')}.`
      );
    }

    const assetSymbol = String(txData.asset || '').trim().toUpperCase();
    const assetRule = AUTHORITATIVE_ASSET_CONFIG[assetSymbol];
    if (!assetRule) {
      throw new functions.https.HttpsError('invalid-argument', `Unsupported deposit asset: ${assetSymbol}`);
    }

    const amount = round8(Number(txData.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount < assetRule.minDeposit) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Invalid deposit amount: ${txData.amount} (minimum is ${assetRule.minDeposit} ${assetSymbol})`
      );
    }

    let verifiedRef: { rawTxHash: string; normalizedHash: string; paymentRefDocId: string };
    try {
      verifiedRef = normalizeAndValidateDepositReference(txData.txHash, txId);
    } catch (refErr: any) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        refErr?.message || `Deposit ${txId} is missing a valid blockchain txHash.`
      );
    }

    const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
    const paymentRefDoc = db.doc(`paymentReferences/${verifiedRef.paymentRefDocId}`);
    const [walletSnap, paymentRefSnap] = await Promise.all([
      transaction.get(walletRef),
      transaction.get(paymentRefDoc),
    ]);

    if (paymentRefSnap.exists) {
      const existingRef = paymentRefSnap.data() || {};
      if (existingRef.txId !== txId || existingRef.userId !== userId) {
        throw new functions.https.HttpsError(
          'already-exists',
          `Duplicate payment reference: transaction hash '${verifiedRef.rawTxHash}' has already been credited to deposit '${existingRef.txId}'.`
        );
      }
    }

    const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentBalance = round8(Number(walletData.balance) || 0);
    const currentLocked = round8(Number(walletData.lockedBalance) || 0);
    const newBalance = round8(currentBalance + amount);
    const settlementId = `settle_${txId}`;
    const resolvedPriceUSD =
      Number(txData.amountUSD) > 0 && amount > 0
        ? Number((Number(txData.amountUSD) / amount).toFixed(4))
        : Number(walletData.priceUSD || assetRule.defaultUsdRate);
    const resolvedChange24h =
      walletData.change24h !== undefined ? Number(walletData.change24h) : 0;

    transaction.set(paymentRefDoc, {
      id: verifiedRef.paymentRefDocId,
      txHash: verifiedRef.rawTxHash,
      normalizedHash: verifiedRef.normalizedHash,
      userId,
      txId,
      type: 'DEPOSIT',
      asset: assetSymbol,
      amount,
      status: 'CREDITED',
      approvedBy: admin.email,
      approvedByUid: admin.uid,
      settledAt: FieldValue.serverTimestamp(),
    });

    transaction.set(
      walletRef,
      {
        symbol: assetSymbol,
        name: walletData.name || assetRule.name,
        balance: newBalance,
        lockedBalance: currentLocked,
        priceUSD: resolvedPriceUSD,
        change24h: resolvedChange24h,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(settlementRef, {
      id: settlementId,
      txId,
      userId,
      type: 'DEPOSIT',
      action: 'APPROVE_DEPOSIT',
      status: 'COMPLETED',
      asset: assetSymbol,
      amount,
      txHash: verifiedRef.rawTxHash,
      paymentReferenceId: verifiedRef.paymentRefDocId,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: currentLocked,
      approvedBy: admin.email,
      approvedByUid: admin.uid,
      settledAt: FieldValue.serverTimestamp(),
    });

    transaction.update(txRef, {
      status: 'COMPLETED',
      walletCredited: true,
      walletSettled: true,
      settlementId,
      paymentReferenceId: verifiedRef.paymentRefDocId,
      settlementStatus: 'CREDITED',
      creditedAmount: amount,
      creditedAsset: assetSymbol,
      previousBalance: currentBalance,
      newBalance,
      approvedBy: admin.email,
      approvedByUid: admin.uid,
      approvedAt: FieldValue.serverTimestamp(),
      approvalNote: note || 'Verified blockchain deposit',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      alreadyProcessed: false,
      message: `Deposit approved: ${amount} ${assetSymbol} credited to user wallet.`,
      newBalance,
      creditedAmount: amount,
      creditedAsset: assetSymbol,
      paymentReferenceId: verifiedRef.paymentRefDocId,
    };
  });
});

/**
 * 3. CALLABLE HTTPS FUNCTION: Reject invalid deposit
 */
export const rejectDeposit = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const admin = requireCallableAdmin(context);
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
    if (txData.walletCredited === true || txData.walletSettled === true) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Cannot reject a deposit that has already been approved and credited.'
      );
    }

    transaction.update(txRef, {
      status: 'REJECTED',
      walletCredited: false,
      walletSettled: false,
      settlementStatus: 'REJECTED',
      rejectedBy: admin.email,
      rejectedByUid: admin.uid,
      rejectedAt: FieldValue.serverTimestamp(),
      rejectionReason: reason || 'Blockchain verification failed',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: `Deposit request ${txId} has been marked as REJECTED.`,
    };
  });
});

/**
 * 4. CALLABLE HTTPS FUNCTION: Approve daily bonus / task reward claim
 */
export const approveReward = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const admin = requireCallableAdmin(context);
  const { userId, txId, note } = data;
  if (!userId || !txId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and txId are required.');
  }

  const txRef = db.doc(`users/${userId}/transactions/${txId}`);
  const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);
  const streakRef = db.doc(`users/${userId}/rewards/dailyStreak`);

  return await db.runTransaction(async (transaction) => {
    const [txSnap, settlementSnap, streakSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(settlementRef),
      transaction.get(streakRef),
    ]);
    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', `Reward transaction ${txId} not found.`);
    }

    const txData = txSnap.data()!;
    if (txData.type !== 'TASK_REWARD' && txData.type !== 'REFERRAL_BONUS') {
      throw new functions.https.HttpsError('failed-precondition', `Transaction ${txId} is not a reward claim.`);
    }

    validateOwnershipAndNotRejected(txData, userId, txId);

    if (settlementSnap.exists || txData.walletCredited === true || txData.walletSettled === true) {
      return {
        success: true,
        alreadyProcessed: true,
        message: 'Reward claim has already been approved and credited.',
        status: 'COMPLETED',
        creditedAmount: txData.creditedAmount || txData.amount,
      };
    }

    if (!['PENDING_REVIEW', 'PENDING_VERIFICATION', 'PENDING_CONFIRMATION'].includes(String(txData.status))) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Cannot approve reward claim in status ${txData.status}.`
      );
    }

    const assetSymbol = String(txData.asset || '').trim().toUpperCase();
    if (assetSymbol !== 'USDT') {
      throw new functions.https.HttpsError('invalid-argument', `Reward claims must be denominated in USDT.`);
    }

    const amount = round8(Number(txData.amount));
    if (!ALLOWED_REWARD_AMOUNTS.has(amount)) {
      throw new functions.https.HttpsError('invalid-argument', `Invalid or unauthorized reward amount: ${txData.amount}`);
    }

    const hasTaskId = typeof txData.taskId === 'string' && txData.taskId.trim().length > 0;
    const hasRewardDay =
      txData.rewardDay !== undefined &&
      txData.rewardDay !== null &&
      String(txData.rewardDay).trim() !== '';
    const hasStreakDay =
      txData.streakDay !== undefined &&
      txData.streakDay !== null &&
      Number.isInteger(Number(txData.streakDay));

    let isDailyStreakReward = false;
    let verifiedStreakDay: number | null = hasStreakDay ? Number(txData.streakDay) : null;
    let verifiedRewardDay: string | number | null = hasRewardDay ? txData.rewardDay : null;

    if (hasTaskId) {
      const cleanTaskId = txData.taskId.trim();
      const expectedTaskAmount = OFFICIAL_TASK_REWARD_AMOUNTS[cleanTaskId];
      if (expectedTaskAmount === undefined || expectedTaskAmount !== amount) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Reward amount (${amount} USDT) does not match official schedule for task '${cleanTaskId}'.`
        );
      }
    } else if (hasRewardDay || hasStreakDay) {
      isDailyStreakReward = true;
      if (typeof txData.rewardDay === 'number' || /^\d+$/.test(String(txData.rewardDay || ''))) {
        verifiedStreakDay = Number(txData.rewardDay);
      }
      if (verifiedStreakDay !== null && OFFICIAL_DAILY_REWARD_SCHEDULE[verifiedStreakDay] !== amount) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Reward amount (${amount} USDT) does not match official Day ${verifiedStreakDay} schedule.`
        );
      }
    } else if (streakSnap.exists) {
      const sData = streakSnap.data()!;
      const topDay = Number(sData.currentStreak);
      const topDate = typeof sData.lastClaimDate === 'string' ? sData.lastClaimDate.trim() : '';
      if (
        sData.claimStatus === 'PENDING_VERIFICATION' &&
        Number.isInteger(topDay) &&
        topDay >= 1 &&
        topDay <= 7 &&
        /^\d{4}-\d{2}-\d{2}$/.test(topDate) &&
        OFFICIAL_DAILY_REWARD_SCHEDULE[topDay] === amount
      ) {
        isDailyStreakReward = true;
        verifiedStreakDay = topDay;
        verifiedRewardDay = topDate;
      } else {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Reward transaction ${txId} is missing both rewardDay and taskId metadata and cannot be verified.`
        );
      }
    } else {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Reward transaction ${txId} is missing both rewardDay and taskId metadata and cannot be verified.`
      );
    }

    const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
    const walletSnap = await transaction.get(walletRef);
    const currentBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
    const currentLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;
    const newBalance = round8(currentBalance + amount);
    const settlementId = `settle_${txId}`;

    transaction.set(
      walletRef,
      {
        symbol: assetSymbol,
        balance: newBalance,
        lockedBalance: currentLocked,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(settlementRef, {
      id: settlementId,
      txId,
      userId,
      type: txData.type,
      action: 'APPROVE_REWARD',
      asset: assetSymbol,
      amount,
      rewardDay: verifiedRewardDay,
      streakDay: verifiedStreakDay,
      taskId: hasTaskId ? txData.taskId.trim() : null,
      previousBalance: currentBalance,
      newBalance,
      approvedBy: admin.email,
      approvedByUid: admin.uid,
      settledAt: FieldValue.serverTimestamp(),
    });

    transaction.update(txRef, {
      status: 'COMPLETED',
      walletCredited: true,
      walletSettled: true,
      settlementId,
      settlementStatus: 'CREDITED',
      creditedAmount: amount,
      creditedAsset: assetSymbol,
      ...(verifiedRewardDay !== null ? { rewardDay: verifiedRewardDay } : {}),
      ...(verifiedStreakDay !== null ? { streakDay: verifiedStreakDay } : {}),
      approvedBy: admin.email,
      approvedByUid: admin.uid,
      approvedAt: FieldValue.serverTimestamp(),
      approvalNote: note || 'Verified daily streak / bounty reward claim',
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (isDailyStreakReward && streakSnap.exists) {
      transaction.set(
        streakRef,
        {
          claimStatus: 'CLAIMED',
          approvalStatus: 'APPROVED',
          approvedAmount: amount,
          walletCredited: true,
          verifiedBy: admin.email,
          verifiedAt: FieldValue.serverTimestamp(),
          creditedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return {
      success: true,
      alreadyProcessed: false,
      message: `Reward claim approved: ${amount} ${assetSymbol} credited to user wallet.`,
      newBalance,
      creditedAmount: amount,
      creditedAsset: assetSymbol,
    };
  });
});

/**
 * 5. CALLABLE HTTPS FUNCTION: Approve & Settle Withdrawal
 */
export const approveWithdrawal = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const admin = requireCallableAdmin(context);
  const { userId, txId, payoutTxHash, note } = data;
  if (!userId || !txId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and txId are required.');
  }

  const txRef = db.doc(`users/${userId}/transactions/${txId}`);
  const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);

  return await db.runTransaction(async (transaction) => {
    const [txSnap, settlementSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(settlementRef),
    ]);
    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', `Withdrawal transaction ${txId} not found.`);
    }

    const txData = txSnap.data()!;
    if (txData.type !== 'WITHDRAWAL') {
      throw new functions.https.HttpsError('failed-precondition', `Transaction ${txId} is not a withdrawal.`);
    }

    validateOwnershipAndNotRejected(txData, userId, txId);

    if (settlementSnap.exists || txData.walletSettled === true) {
      return {
        success: true,
        alreadyProcessed: true,
        message: 'Withdrawal has already been settled and paid.',
        status: 'COMPLETED',
      };
    }

    if (txData.status !== 'PENDING_REVIEW' && txData.status !== 'PENDING_CONFIRMATION') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Cannot approve withdrawal in status ${txData.status}.`
      );
    }

    const assetSymbol = String(txData.asset || '').trim().toUpperCase();
    const assetRule = AUTHORITATIVE_ASSET_CONFIG[assetSymbol];
    if (!assetRule) {
      throw new functions.https.HttpsError('invalid-argument', `Unsupported withdrawal asset: ${assetSymbol}`);
    }

    const amount = round8(Number(txData.amount));
    const storedFee = round8(Number(txData.fee) || 0);
    const fee = storedFee > 0 ? storedFee : assetRule.withdrawFee;
    const netPayoutAmount = round8(amount - fee);

    if (!Number.isFinite(amount) || amount < assetRule.minWithdraw || netPayoutAmount <= 0) {
      throw new functions.https.HttpsError('invalid-argument', `Invalid withdrawal amount or fee for ${txId}.`);
    }

    const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
    const walletSnap = await transaction.get(walletRef);
    const currentBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
    const currentLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;

    let newBalance = currentBalance;
    let newLocked = currentLocked;

    if (txData.reservedFromBalance === true) {
      if (currentLocked + 1e-8 < amount) {
        throw new functions.https.HttpsError('failed-precondition', 'Insufficient locked escrow balance.');
      }
      newLocked = round8(Math.max(0, currentLocked - amount));
    } else {
      if (currentBalance + 1e-8 < amount) {
        throw new functions.https.HttpsError('failed-precondition', 'Insufficient available balance.');
      }
      newBalance = round8(currentBalance - amount);
    }

    const settlementId = `settle_${txId}`;

    transaction.set(
      walletRef,
      {
        symbol: assetSymbol,
        balance: newBalance,
        lockedBalance: newLocked,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(settlementRef, {
      id: settlementId,
      txId,
      userId,
      type: 'WITHDRAWAL',
      action: 'APPROVE_WITHDRAWAL',
      asset: assetSymbol,
      amount,
      fee,
      netPayoutAmount,
      approvedBy: admin.email,
      approvedByUid: admin.uid,
      settledAt: FieldValue.serverTimestamp(),
    });

    transaction.update(txRef, {
      status: 'COMPLETED',
      walletSettled: true,
      settlementId,
      settlementStatus: 'PAID',
      fee,
      netPayoutAmount,
      ...(payoutTxHash ? { payoutTxHash, txHash: payoutTxHash } : {}),
      approvedBy: admin.email,
      approvedByUid: admin.uid,
      approvedAt: FieldValue.serverTimestamp(),
      approvalNote: note || `Withdrawal paid (${netPayoutAmount} ${assetSymbol} net)`,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      alreadyProcessed: false,
      message: `Withdrawal settled: ${netPayoutAmount} ${assetSymbol} paid after ${fee} ${assetSymbol} fee.`,
      newBalance,
      newLockedBalance: newLocked,
      netPayoutAmount,
    };
  });
});

/**
 * 6. CALLABLE HTTPS FUNCTION: Reject Withdrawal & Refund Escrow
 */
export const rejectWithdrawal = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  const admin = requireCallableAdmin(context);
  const { userId, txId, reason } = data;
  if (!userId || !txId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and txId are required.');
  }

  const txRef = db.doc(`users/${userId}/transactions/${txId}`);
  const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);

  return await db.runTransaction(async (transaction) => {
    const [txSnap, settlementSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(settlementRef),
    ]);
    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', `Withdrawal transaction ${txId} not found.`);
    }

    const txData = txSnap.data()!;
    if (txData.status === 'COMPLETED' && txData.walletSettled) {
      throw new functions.https.HttpsError('failed-precondition', 'Cannot reject a paid withdrawal.');
    }

    if (settlementSnap.exists || txData.refunded === true || txData.settlementStatus === 'REFUNDED') {
      return {
        success: true,
        alreadyProcessed: true,
        message: 'Withdrawal was already rejected.',
      };
    }

    const assetSymbol = String(txData.asset || 'USDT').trim().toUpperCase();
    const amount = round8(Number(txData.amount) || 0);
    const wasReserved = txData.reservedFromBalance === true;
    const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
    const walletSnap = await transaction.get(walletRef);
    const currentBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
    const currentLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;

    let newBalance = currentBalance;
    let newLocked = currentLocked;
    let refunded = false;

    if (wasReserved && amount > 0) {
      newLocked = round8(Math.max(0, currentLocked - amount));
      newBalance = round8(currentBalance + amount);
      refunded = true;

      transaction.set(
        walletRef,
        {
          symbol: assetSymbol,
          balance: newBalance,
          lockedBalance: newLocked,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    const settlementId = `settle_${txId}`;
    transaction.set(settlementRef, {
      id: settlementId,
      txId,
      userId,
      type: 'WITHDRAWAL',
      action: 'REJECT_WITHDRAWAL',
      asset: assetSymbol,
      amount,
      refunded,
      rejectedBy: admin.email,
      rejectedByUid: admin.uid,
      settledAt: FieldValue.serverTimestamp(),
    });

    transaction.update(txRef, {
      status: 'REJECTED',
      walletSettled: true,
      refunded,
      ...(refunded ? { refundedAt: FieldValue.serverTimestamp() } : {}),
      settlementId,
      settlementStatus: refunded ? 'REFUNDED' : 'REJECTED',
      rejectedBy: admin.email,
      rejectedByUid: admin.uid,
      rejectedAt: FieldValue.serverTimestamp(),
      rejectionReason: reason || 'Withdrawal rejected by administrator.',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      refunded,
      message: refunded
        ? `Withdrawal ${txId} rejected and ${amount} ${assetSymbol} refunded to available balance.`
        : `Withdrawal ${txId} marked as REJECTED.`,
    };
  });
});

/**
 * 7. CALLABLE HTTPS FUNCTION: Purchase Cloud Mining Contract (Atomic Server-Side Settlement)
 */
export const OFFICIAL_MINING_PLANS: Record<
  string,
  {
    id: string;
    name: string;
    tier: 'Entry' | 'Core' | 'Value' | 'Pro' | 'Elite';
    algorithm: 'SHA-256';
    targetCoin: 'BTC';
    hashrate: number;
    hashrateUnit: 'GH/s';
    hashrateGHs: number;
    hashrateTHs: number;
    priceUSD: number;
    durationDays: number;
    displayedReturnPercent: number;
    estimatedDailyYieldCoin: number;
    estimatedDailyYieldUSD: number;
    powerConsumptionW: number;
    maintenanceFeePercent: number;
  }
> = {
  plan_genesis_shaft: {
    id: 'plan_genesis_shaft',
    name: 'Genesis Shaft',
    tier: 'Entry',
    algorithm: 'SHA-256',
    targetCoin: 'BTC',
    hashrate: 10,
    hashrateUnit: 'GH/s',
    hashrateGHs: 10,
    hashrateTHs: 0.01,
    priceUSD: 10.0,
    durationDays: 45,
    displayedReturnPercent: 150.0,
    estimatedDailyYieldCoin: 0.0000035,
    estimatedDailyYieldUSD: 0.33,
    powerConsumptionW: 160,
    maintenanceFeePercent: 5.0,
  },
  plan_blockfoundry: {
    id: 'plan_blockfoundry',
    name: 'Blockfoundry',
    tier: 'Core',
    algorithm: 'SHA-256',
    targetCoin: 'BTC',
    hashrate: 18,
    hashrateUnit: 'GH/s',
    hashrateGHs: 18,
    hashrateTHs: 0.018,
    priceUSD: 48.0,
    durationDays: 78,
    displayedReturnPercent: 158.0,
    estimatedDailyYieldCoin: 0.00001031,
    estimatedDailyYieldUSD: 0.97,
    powerConsumptionW: 288,
    maintenanceFeePercent: 4.8,
  },
  plan_stratum_yard: {
    id: 'plan_stratum_yard',
    name: 'Stratum Yard',
    tier: 'Value',
    algorithm: 'SHA-256',
    targetCoin: 'BTC',
    hashrate: 34,
    hashrateUnit: 'GH/s',
    hashrateGHs: 34,
    hashrateTHs: 0.034,
    priceUSD: 135.0,
    durationDays: 112,
    displayedReturnPercent: 172.0,
    estimatedDailyYieldCoin: 0.000022,
    estimatedDailyYieldUSD: 2.07,
    powerConsumptionW: 544,
    maintenanceFeePercent: 4.5,
  },
  plan_halving_bench: {
    id: 'plan_halving_bench',
    name: 'Halving Bench',
    tier: 'Pro',
    algorithm: 'SHA-256',
    targetCoin: 'BTC',
    hashrate: 96,
    hashrateUnit: 'GH/s',
    hashrateGHs: 96,
    hashrateTHs: 0.096,
    priceUSD: 510.0,
    durationDays: 156,
    displayedReturnPercent: 188.0,
    estimatedDailyYieldCoin: 0.00006521,
    estimatedDailyYieldUSD: 6.15,
    powerConsumptionW: 1536,
    maintenanceFeePercent: 4.0,
  },
  plan_epoch_vault: {
    id: 'plan_epoch_vault',
    name: 'Epoch Vault',
    tier: 'Elite',
    algorithm: 'SHA-256',
    targetCoin: 'BTC',
    hashrate: 268,
    hashrateUnit: 'GH/s',
    hashrateGHs: 268,
    hashrateTHs: 0.268,
    priceUSD: 1480.0,
    durationDays: 210,
    displayedReturnPercent: 210.0,
    estimatedDailyYieldCoin: 0.00015703,
    estimatedDailyYieldUSD: 14.8,
    powerConsumptionW: 4288,
    maintenanceFeePercent: 3.5,
  },
};

export const purchaseMiningContract = functions.https.onCall(
  async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication is required to purchase a contract.');
    }

    const userId = context.auth.uid;
    const planId = String(data?.planId || '').trim();
    const plan = OFFICIAL_MINING_PLANS[planId];
    if (!plan) {
      throw new functions.https.HttpsError('invalid-argument', `Unsupported mining plan '${planId}'.`);
    }

    const rawKey = String(data?.idempotencyKey || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (rawKey.length < 6) {
      throw new functions.https.HttpsError('invalid-argument', 'Valid idempotencyKey is required.');
    }

    const orderId = rawKey.startsWith('order_') ? rawKey : `order_${rawKey}`;
    const settlementId = `settle_${orderId}`;

    const settlementRef = db.doc(`users/${userId}/settlements/${orderId}`);
    const contractRef = db.doc(`users/${userId}/contracts/${orderId}`);
    const txRef = db.doc(`users/${userId}/transactions/${orderId}`);
    const walletRef = db.doc(`users/${userId}/wallet/USDT`);
    const sessionRef = db.doc(`users/${userId}/mining/session`);

    return await db.runTransaction(async (transaction) => {
      const [settlementSnap, contractSnap, txSnap, walletSnap, sessionSnap] = await Promise.all([
        transaction.get(settlementRef),
        transaction.get(contractRef),
        transaction.get(txRef),
        transaction.get(walletRef),
        transaction.get(sessionRef),
      ]);

      const currentBalance = walletSnap.exists ? round8(Number(walletSnap.data()?.balance) || 0) : 0;
      const currentLocked = walletSnap.exists ? round8(Number(walletSnap.data()?.lockedBalance) || 0) : 0;
      const sessionData = sessionSnap.exists ? sessionSnap.data() || {} : {};
      const currentHashrateTHs = round8(Number(sessionData.hashrateTHs) || 0);
      const currentHashrateGHs =
        typeof sessionData.hashrateGHs === 'number' && Number.isFinite(sessionData.hashrateGHs)
          ? Number(sessionData.hashrateGHs.toFixed(4))
          : Number((currentHashrateTHs * 1000).toFixed(4));

      if (settlementSnap.exists || contractSnap.exists || (txSnap.exists && txSnap.data()?.walletSettled === true)) {
        return {
          success: true,
          alreadyProcessed: true,
          orderId,
          newBalance: currentBalance,
          newHashrateGHs: currentHashrateGHs,
          newHashrateTHs: currentHashrateTHs,
          message: `Order ${orderId} was already processed.`,
        };
      }

      if (currentBalance < plan.priceUSD) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Insufficient USDT balance ($${currentBalance.toFixed(2)} available, $${plan.priceUSD.toFixed(2)} required).`
        );
      }

      const newBalance = round8(currentBalance - plan.priceUSD);
      const newHashrateGHs = Number((currentHashrateGHs + plan.hashrateGHs).toFixed(4));
      const newHashrateTHs = Number((currentHashrateTHs + plan.hashrateTHs).toFixed(6));
      const nowIso = new Date().toISOString();
      const expiresIso = new Date(Date.now() + plan.durationDays * 86400 * 1000).toISOString();
      const sessionId = sessionData.lastSessionId || `sess_${Date.now()}`;

      transaction.set(
        walletRef,
        {
          symbol: 'USDT',
          balance: newBalance,
          lockedBalance: currentLocked,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(contractRef, {
        id: orderId,
        orderId,
        userId,
        planId: plan.id,
        planName: plan.name,
        tier: plan.tier,
        algorithm: plan.algorithm,
        targetCoin: plan.targetCoin,
        hashrate: plan.hashrate,
        hashrateUnit: plan.hashrateUnit,
        hashrateGHs: plan.hashrateGHs,
        hashrateTHs: plan.hashrateTHs,
        priceUSD: plan.priceUSD,
        asset: 'USDT',
        durationDays: plan.durationDays,
        displayedReturnPercent: plan.displayedReturnPercent,
        estimatedDailyYieldCoin: plan.estimatedDailyYieldCoin,
        estimatedDailyYieldUSD: plan.estimatedDailyYieldUSD,
        powerConsumptionW: plan.powerConsumptionW,
        maintenanceFeePercent: plan.maintenanceFeePercent,
        status: 'ACTIVE',
        purchasedAt: nowIso,
        expiresAt: expiresIso,
        settlementId,
        txId: orderId,
        sessionId,
        idempotencyKey: rawKey,
        isSimulated: true,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(txRef, {
        id: orderId,
        orderId,
        contractId: orderId,
        planId: plan.id,
        planName: plan.name,
        userId,
        type: 'CONTRACT_PURCHASE',
        asset: 'USDT',
        amount: plan.priceUSD,
        amountUSD: plan.priceUSD,
        fee: 0,
        status: 'COMPLETED',
        settlementStatus: 'PURCHASED',
        settlementId,
        walletSettled: true,
        walletCredited: false,
        idempotencyKey: rawKey,
        previousBalance: currentBalance,
        newBalance,
        timestamp: nowIso,
        note: `Cloud Hashrate Contract Purchase: ${plan.name} (+${plan.hashrate} ${plan.hashrateUnit})`,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(settlementRef, {
        id: settlementId,
        txId: orderId,
        orderId,
        contractId: orderId,
        userId,
        type: 'CONTRACT_PURCHASE',
        action: 'PURCHASE_CONTRACT',
        asset: 'USDT',
        amount: plan.priceUSD,
        planId: plan.id,
        planName: plan.name,
        hashrateAddedGHs: plan.hashrateGHs,
        hashrateAddedTHs: plan.hashrateTHs,
        previousBalance: currentBalance,
        newBalance,
        previousHashrateGHs: currentHashrateGHs,
        newHashrateGHs,
        previousHashrateTHs: currentHashrateTHs,
        newHashrateTHs,
        settledAt: FieldValue.serverTimestamp(),
      });

      transaction.set(
        sessionRef,
        {
          userId,
          status: 'ACTIVE',
          algorithm: 'SHA-256 (BTC)',
          targetCoin: 'BTC',
          hashrateGHs: newHashrateGHs,
          hashrateTHs: newHashrateTHs,
          planId: plan.id,
          activeContractId: orderId,
          activeContractName: plan.name,
          lastSessionId: sessionId,
          isSimulated: true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        success: true,
        alreadyProcessed: false,
        orderId,
        newBalance,
        newHashrateGHs,
        newHashrateTHs,
        message: `${plan.name} purchased and activated.`,
      };
    });
  }
);

