"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectWithdrawal = exports.approveWithdrawal = exports.approveReward = exports.rejectDeposit = exports.approveDeposit = exports.onDepositStatusChanged = exports.onTransactionStatusChanged = void 0;
const functions = require("firebase-functions/v1");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
const ADMIN_EMAILS = Array.from(new Set([
    'muneebsj7@gmail.com',
    ...(process.env.ADMIN_EMAILS
        ? process.env.ADMIN_EMAILS
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        : []),
]));
const AUTHORITATIVE_ASSET_CONFIG = {
    USDT: { minDeposit: 10, minWithdraw: 20, withdrawFee: 1.0 },
    BTC: { minDeposit: 0.0005, minWithdraw: 0.001, withdrawFee: 0.0002 },
    ETH: { minDeposit: 0.01, minWithdraw: 0.02, withdrawFee: 0.002 },
    SOL: { minDeposit: 0.1, minWithdraw: 0.2, withdrawFee: 0.01 },
    LTC: { minDeposit: 0.1, minWithdraw: 0.2, withdrawFee: 0.005 },
};
const OFFICIAL_DAILY_REWARD_SCHEDULE = {
    1: 0.5,
    2: 0.75,
    3: 1.0,
    4: 1.5,
    5: 2.0,
    6: 3.0,
    7: 5.0,
};
const OFFICIAL_TASK_REWARD_AMOUNTS = {
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
const ALLOWED_REWARD_AMOUNTS = new Set([
    0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 4.5, 5.0, 6.0, 8.5, 10.0, 12.0, 25.0, 50.0,
]);
function isAuthorizedAdminEmail(email) {
    if (!email)
        return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}
function requireCallableAdmin(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const callerEmail = context.auth.token.email;
    const isEmailVerified = context.auth.token.email_verified === true;
    const isCustomAdmin = context.auth.token.admin === true;
    if (!isEmailVerified || (!isCustomAdmin && !isAuthorizedAdminEmail(callerEmail))) {
        throw new functions.https.HttpsError('permission-denied', 'Caller is not an authorized administrator with a verified email.');
    }
    return {
        uid: context.auth.uid,
        email: callerEmail || context.auth.uid,
    };
}
const round8 = (n) => Number(n.toFixed(8));
function validateOwnershipAndNotRejected(txData, expectedUserId, txId) {
    if (txData.userId && String(txData.userId) !== expectedUserId) {
        throw new functions.https.HttpsError('permission-denied', `Transaction ${txId} userId (${txData.userId}) does not match path owner (${expectedUserId}).`);
    }
    if (txData.rejectedAt ||
        txData.rejectedBy ||
        txData.refunded === true ||
        txData.settlementStatus === 'REJECTED' ||
        txData.settlementStatus === 'REFUNDED') {
        throw new functions.https.HttpsError('failed-precondition', `Transaction ${txId} carries rejection or refund markers and cannot be approved.`);
    }
}
/**
 * 1. FIRESTORE TRIGGER: Automatically settles wallet balance when transaction status changes
 * Triggered whenever a transaction document in users/{userId}/transactions/{txId} is updated.
 */
exports.onTransactionStatusChanged = functions.firestore
    .document('users/{userId}/transactions/{txId}')
    .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const { userId, txId } = context.params;
    if (!beforeData || !afterData)
        return null;
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
    if (afterData.type === 'DEPOSIT' &&
        ['PENDING_CONFIRMATION', 'PENDING_REVIEW'].includes(String(beforeData.status)) &&
        ['COMPLETED', 'APPROVED', 'CONFIRMED'].includes(String(afterData.status)) &&
        !afterData.walletCredited) {
        if (!Number.isFinite(amount) || amount < assetRule.minDeposit) {
            console.error(`[onTransactionStatusChanged] Deposit ${txId} amount ${amount} below minimum ${assetRule.minDeposit}`);
            return null;
        }
        await db.runTransaction(async (transaction) => {
            // ALL READS FIRST
            const [freshTx, settlementSnap, walletSnap] = await Promise.all([
                transaction.get(txRef),
                transaction.get(settlementRef),
                transaction.get(walletRef),
            ]);
            if (!freshTx.exists)
                return;
            const freshData = freshTx.data();
            if (freshData.walletCredited === true || freshData.walletSettled === true || settlementSnap.exists) {
                return;
            }
            validateOwnershipAndNotRejected(freshData, userId, txId);
            const txHash = typeof freshData.txHash === 'string' ? freshData.txHash.trim() : '';
            if (txHash.length < 8) {
                console.error(`[onTransactionStatusChanged] Deposit ${txId} missing valid txHash; skipping credit.`);
                return;
            }
            const currentBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
            const currentLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;
            const newBalance = round8(currentBalance + amount);
            const settlementId = `settle_${txId}`;
            // WRITES AFTER ALL READS
            transaction.set(walletRef, {
                symbol: assetSymbol,
                balance: newBalance,
                lockedBalance: currentLocked,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            transaction.set(settlementRef, {
                id: settlementId,
                txId,
                userId,
                type: 'DEPOSIT',
                action: 'APPROVE_DEPOSIT',
                asset: assetSymbol,
                amount,
                previousBalance: currentBalance,
                newBalance,
                approvedBy: freshData.approvedBy || 'firebase-console-trigger',
                settledAt: firestore_1.FieldValue.serverTimestamp(),
            });
            transaction.update(txRef, {
                status: 'COMPLETED',
                walletCredited: true,
                walletSettled: true,
                settlementId,
                settlementStatus: 'CREDITED',
                creditedAmount: amount,
                creditedAsset: assetSymbol,
                creditedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        return null;
    }
    // B) TASK_REWARD / REFERRAL_BONUS transitioned from PENDING -> COMPLETED / APPROVED / CONFIRMED
    if ((afterData.type === 'TASK_REWARD' || afterData.type === 'REFERRAL_BONUS') &&
        ['PENDING_REVIEW', 'PENDING_VERIFICATION', 'PENDING_CONFIRMATION'].includes(String(beforeData.status)) &&
        ['COMPLETED', 'APPROVED', 'CONFIRMED'].includes(String(afterData.status)) &&
        !afterData.walletCredited) {
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
            if (!freshTx.exists)
                return;
            const freshData = freshTx.data();
            if (freshData.walletCredited === true || freshData.walletSettled === true || settlementSnap.exists) {
                return;
            }
            validateOwnershipAndNotRejected(freshData, userId, txId);
            if (freshData.rewardDay !== undefined && freshData.rewardDay !== null) {
                const dayNum = Number(freshData.rewardDay);
                if (OFFICIAL_DAILY_REWARD_SCHEDULE[dayNum] !== amount) {
                    console.error(`[onTransactionStatusChanged] Reward day ${dayNum} mismatch for amount ${amount}`);
                    return;
                }
            }
            if (typeof freshData.taskId === 'string' && freshData.taskId.trim()) {
                const expectedTaskReward = OFFICIAL_TASK_REWARD_AMOUNTS[freshData.taskId.trim()];
                if (expectedTaskReward !== undefined && expectedTaskReward !== amount) {
                    console.error(`[onTransactionStatusChanged] Task ${freshData.taskId} mismatch for amount ${amount}`);
                    return;
                }
            }
            const currentBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
            const currentLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;
            const newBalance = round8(currentBalance + amount);
            const settlementId = `settle_${txId}`;
            // WRITES AFTER ALL READS
            transaction.set(walletRef, {
                symbol: assetSymbol,
                balance: newBalance,
                lockedBalance: currentLocked,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            transaction.set(settlementRef, {
                id: settlementId,
                txId,
                userId,
                type: freshData.type,
                action: 'APPROVE_REWARD',
                asset: assetSymbol,
                amount,
                previousBalance: currentBalance,
                newBalance,
                approvedBy: freshData.approvedBy || 'firebase-console-trigger',
                settledAt: firestore_1.FieldValue.serverTimestamp(),
            });
            transaction.update(txRef, {
                status: 'COMPLETED',
                walletCredited: true,
                walletSettled: true,
                settlementId,
                settlementStatus: 'CREDITED',
                creditedAmount: amount,
                creditedAsset: assetSymbol,
                creditedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            if (freshData.type === 'TASK_REWARD' && streakSnap.exists) {
                const streakData = streakSnap.data();
                const claimDate = freshData.claimDate || (typeof freshData.timestamp === 'string' ? freshData.timestamp.slice(0, 10) : '');
                const history = Array.isArray(streakData.claimHistory) ? streakData.claimHistory : [];
                const updatedHistory = history.map((item) => (item.txId && item.txId === txId) || (claimDate && item.date === claimDate)
                    ? { ...item, status: 'CLAIMED', txId: item.txId || txId }
                    : item);
                transaction.set(streakRef, {
                    claimStatus: 'CLAIMED',
                    approvalStatus: 'APPROVED',
                    approvedAmount: amount,
                    walletCredited: true,
                    verifiedAt: firestore_1.FieldValue.serverTimestamp(),
                    creditedAt: firestore_1.FieldValue.serverTimestamp(),
                    claimHistory: updatedHistory,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        });
        return null;
    }
    // C) WITHDRAWAL transitioned from PENDING -> COMPLETED / PAID / APPROVED / CONFIRMED (Payout settlement)
    if (afterData.type === 'WITHDRAWAL' &&
        ['PENDING_REVIEW', 'PENDING_CONFIRMATION'].includes(String(beforeData.status)) &&
        ['COMPLETED', 'PAID', 'APPROVED', 'CONFIRMED'].includes(String(afterData.status)) &&
        !afterData.walletSettled) {
        if (!Number.isFinite(amount) || amount < assetRule.minWithdraw)
            return null;
        await db.runTransaction(async (transaction) => {
            // ALL READS FIRST
            const [freshTx, settlementSnap, walletSnap] = await Promise.all([
                transaction.get(txRef),
                transaction.get(settlementRef),
                transaction.get(walletRef),
            ]);
            if (!freshTx.exists)
                return;
            const freshData = freshTx.data();
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
            if (netPayoutAmount <= 0)
                return;
            const existingBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
            const existingLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;
            let newBalance = existingBalance;
            let newLocked = existingLocked;
            if (freshData.reservedFromBalance === true) {
                if (existingLocked + 1e-8 < amount) {
                    throw new Error(`Locked balance (${existingLocked}) is less than reserved withdrawal (${amount})`);
                }
                newLocked = round8(Math.max(0, existingLocked - amount));
            }
            else {
                if (existingBalance + 1e-8 < amount) {
                    throw new Error(`Insufficient balance to settle withdrawal ${txId}`);
                }
                newBalance = round8(existingBalance - amount);
            }
            const settlementId = `settle_${txId}`;
            // WRITES AFTER ALL READS
            transaction.set(walletRef, {
                symbol: assetSymbol,
                balance: newBalance,
                lockedBalance: newLocked,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
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
                settledAt: firestore_1.FieldValue.serverTimestamp(),
            });
            transaction.update(txRef, {
                status: 'COMPLETED',
                walletSettled: true,
                settlementId,
                settlementStatus: 'PAID',
                fee,
                netPayoutAmount,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        return null;
    }
    // D) WITHDRAWAL transitioned from PENDING -> REJECTED / FAILED (Escrow refund)
    if (afterData.type === 'WITHDRAWAL' &&
        ['PENDING_REVIEW', 'PENDING_CONFIRMATION'].includes(String(beforeData.status)) &&
        ['REJECTED', 'FAILED'].includes(String(afterData.status)) &&
        afterData.reservedFromBalance === true &&
        !afterData.refunded) {
        if (!Number.isFinite(amount) || amount <= 0)
            return null;
        await db.runTransaction(async (transaction) => {
            // ALL READS FIRST
            const [freshTx, settlementSnap, walletSnap] = await Promise.all([
                transaction.get(txRef),
                transaction.get(settlementRef),
                transaction.get(walletRef),
            ]);
            if (!freshTx.exists)
                return;
            const freshData = freshTx.data();
            if (freshData.refunded === true || freshData.walletSettled === true || settlementSnap.exists) {
                return;
            }
            const existingBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
            const existingLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;
            const newLocked = round8(Math.max(0, existingLocked - amount));
            const newBalance = round8(existingBalance + amount);
            const settlementId = `settle_${txId}`;
            // WRITES AFTER ALL READS
            transaction.set(walletRef, {
                symbol: assetSymbol,
                balance: newBalance,
                lockedBalance: newLocked,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
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
                settledAt: firestore_1.FieldValue.serverTimestamp(),
            });
            transaction.update(txRef, {
                status: 'REJECTED',
                walletSettled: true,
                refunded: true,
                refundedAt: firestore_1.FieldValue.serverTimestamp(),
                settlementId,
                settlementStatus: 'REFUNDED',
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
    }
    return null;
});
// Backward-compatible export name
exports.onDepositStatusChanged = exports.onTransactionStatusChanged;
/**
 * 2. CALLABLE HTTPS FUNCTION: Approve verified deposit
 */
exports.approveDeposit = functions.https.onCall(async (data, context) => {
    const admin = requireCallableAdmin(context);
    const { userId, txId, note } = data;
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
        const txData = txSnap.data();
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
        if (txData.status !== 'PENDING_CONFIRMATION' && txData.status !== 'PENDING_REVIEW') {
            throw new functions.https.HttpsError('failed-precondition', `Cannot approve deposit in status ${txData.status}. Only PENDING_CONFIRMATION or PENDING_REVIEW is eligible.`);
        }
        const assetSymbol = String(txData.asset || '').trim().toUpperCase();
        const assetRule = AUTHORITATIVE_ASSET_CONFIG[assetSymbol];
        if (!assetRule) {
            throw new functions.https.HttpsError('invalid-argument', `Unsupported deposit asset: ${assetSymbol}`);
        }
        const amount = round8(Number(txData.amount));
        if (!Number.isFinite(amount) || amount < assetRule.minDeposit) {
            throw new functions.https.HttpsError('invalid-argument', `Invalid deposit amount: ${txData.amount} (minimum is ${assetRule.minDeposit} ${assetSymbol})`);
        }
        const txHash = typeof txData.txHash === 'string' ? txData.txHash.trim() : '';
        if (txHash.length < 8) {
            throw new functions.https.HttpsError('failed-precondition', `Deposit ${txId} is missing a valid blockchain txHash.`);
        }
        const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
        const walletSnap = await transaction.get(walletRef);
        const currentBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
        const currentLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;
        const newBalance = round8(currentBalance + amount);
        const settlementId = `settle_${txId}`;
        transaction.set(walletRef, {
            symbol: assetSymbol,
            balance: newBalance,
            lockedBalance: currentLocked,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(settlementRef, {
            id: settlementId,
            txId,
            userId,
            type: 'DEPOSIT',
            action: 'APPROVE_DEPOSIT',
            asset: assetSymbol,
            amount,
            previousBalance: currentBalance,
            newBalance,
            approvedBy: admin.email,
            approvedByUid: admin.uid,
            settledAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.update(txRef, {
            status: 'COMPLETED',
            walletCredited: true,
            walletSettled: true,
            settlementId,
            settlementStatus: 'CREDITED',
            creditedAmount: amount,
            creditedAsset: assetSymbol,
            approvedBy: admin.email,
            approvedByUid: admin.uid,
            approvedAt: firestore_1.FieldValue.serverTimestamp(),
            approvalNote: note || 'Verified blockchain deposit',
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
exports.rejectDeposit = functions.https.onCall(async (data, context) => {
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
        const txData = txSnap.data();
        if (txData.walletCredited === true || txData.walletSettled === true) {
            throw new functions.https.HttpsError('failed-precondition', 'Cannot reject a deposit that has already been approved and credited.');
        }
        transaction.update(txRef, {
            status: 'REJECTED',
            walletCredited: false,
            walletSettled: false,
            settlementStatus: 'REJECTED',
            rejectedBy: admin.email,
            rejectedByUid: admin.uid,
            rejectedAt: firestore_1.FieldValue.serverTimestamp(),
            rejectionReason: reason || 'Blockchain verification failed',
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
exports.approveReward = functions.https.onCall(async (data, context) => {
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
        const txData = txSnap.data();
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
            throw new functions.https.HttpsError('failed-precondition', `Cannot approve reward claim in status ${txData.status}.`);
        }
        const assetSymbol = String(txData.asset || '').trim().toUpperCase();
        if (assetSymbol !== 'USDT') {
            throw new functions.https.HttpsError('invalid-argument', `Reward claims must be denominated in USDT.`);
        }
        const amount = round8(Number(txData.amount));
        if (!ALLOWED_REWARD_AMOUNTS.has(amount)) {
            throw new functions.https.HttpsError('invalid-argument', `Invalid or unauthorized reward amount: ${txData.amount}`);
        }
        const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
        const walletSnap = await transaction.get(walletRef);
        const currentBalance = walletSnap.exists ? Number(walletSnap.data()?.balance) || 0 : 0;
        const currentLocked = walletSnap.exists ? Number(walletSnap.data()?.lockedBalance) || 0 : 0;
        const newBalance = round8(currentBalance + amount);
        const settlementId = `settle_${txId}`;
        transaction.set(walletRef, {
            symbol: assetSymbol,
            balance: newBalance,
            lockedBalance: currentLocked,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(settlementRef, {
            id: settlementId,
            txId,
            userId,
            type: txData.type,
            action: 'APPROVE_REWARD',
            asset: assetSymbol,
            amount,
            previousBalance: currentBalance,
            newBalance,
            approvedBy: admin.email,
            approvedByUid: admin.uid,
            settledAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.update(txRef, {
            status: 'COMPLETED',
            walletCredited: true,
            walletSettled: true,
            settlementId,
            settlementStatus: 'CREDITED',
            creditedAmount: amount,
            creditedAsset: assetSymbol,
            approvedBy: admin.email,
            approvedByUid: admin.uid,
            approvedAt: firestore_1.FieldValue.serverTimestamp(),
            approvalNote: note || 'Verified daily streak / bounty reward claim',
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        if (streakSnap.exists) {
            transaction.set(streakRef, {
                claimStatus: 'CLAIMED',
                approvalStatus: 'APPROVED',
                approvedAmount: amount,
                walletCredited: true,
                verifiedBy: admin.email,
                verifiedAt: firestore_1.FieldValue.serverTimestamp(),
                creditedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
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
exports.approveWithdrawal = functions.https.onCall(async (data, context) => {
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
        const txData = txSnap.data();
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
            throw new functions.https.HttpsError('failed-precondition', `Cannot approve withdrawal in status ${txData.status}.`);
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
        }
        else {
            if (currentBalance + 1e-8 < amount) {
                throw new functions.https.HttpsError('failed-precondition', 'Insufficient available balance.');
            }
            newBalance = round8(currentBalance - amount);
        }
        const settlementId = `settle_${txId}`;
        transaction.set(walletRef, {
            symbol: assetSymbol,
            balance: newBalance,
            lockedBalance: newLocked,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
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
            settledAt: firestore_1.FieldValue.serverTimestamp(),
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
            approvedAt: firestore_1.FieldValue.serverTimestamp(),
            approvalNote: note || `Withdrawal paid (${netPayoutAmount} ${assetSymbol} net)`,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
exports.rejectWithdrawal = functions.https.onCall(async (data, context) => {
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
        const txData = txSnap.data();
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
            transaction.set(walletRef, {
                symbol: assetSymbol,
                balance: newBalance,
                lockedBalance: newLocked,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
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
            settledAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.update(txRef, {
            status: 'REJECTED',
            walletSettled: true,
            refunded,
            ...(refunded ? { refundedAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            settlementId,
            settlementStatus: refunded ? 'REFUNDED' : 'REJECTED',
            rejectedBy: admin.email,
            rejectedByUid: admin.uid,
            rejectedAt: firestore_1.FieldValue.serverTimestamp(),
            rejectionReason: reason || 'Withdrawal rejected by administrator.',
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
//# sourceMappingURL=index.js.map