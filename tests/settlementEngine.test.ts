import assert from 'node:assert/strict';
import http from 'node:http';
import {
  settleDepositApproval,
  settleDepositRejection,
  settleRewardApproval,
  settleRewardRejection,
  reserveWithdrawalRequest,
  settleWithdrawalApproval,
  settleWithdrawalRejection,
  purchaseMiningContract,
  AUTHORITATIVE_MINING_PLANS,
  convertHashrateToGHs,
  convertHashrateToTHs,
  convertTHsToGHs,
  convertGHsToMHs,
  type FirestoreLike,
  type TransactionLike,
  type DocRefLike,
} from '../src/services/settlementEngine.ts';
import { isExpectedOfflineError, sanitizeDiagnosticMessage } from '../src/services/firebase.ts';

/**
 * In-memory transactional Firestore mock supporting:
 * - doc(path).get / set / update
 * - runTransaction(async (t) => ...) with serializable isolation
 * - strict Firestore read-before-write enforcement (throws if get() is called after set() or update())
 */
class InMemoryFirestore implements FirestoreLike {
  private store = new Map<string, Record<string, any>>();
  private lockQueue: Promise<void> = Promise.resolve();

  doc(path: string): DocRefLike {
    const cleanPath = path.replace(/^\/+/, '');
    return {
      id: cleanPath.split('/').pop() || '',
      path: cleanPath,
    };
  }

  seed(path: string, data: Record<string, any>) {
    const cleanPath = path.replace(/^\/+/, '');
    this.store.set(cleanPath, structuredClone(data));
  }

  peek(path: string): Record<string, any> | undefined {
    const cleanPath = path.replace(/^\/+/, '');
    const val = this.store.get(cleanPath);
    return val ? structuredClone(val) : undefined;
  }

  async runTransaction<T>(updateFunction: (transaction: TransactionLike) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const stagedWrites: Array<() => void> = [];
      let hasWritten = false;

      const tx: TransactionLike = {
        get: async (docRef: DocRefLike) => {
          if (hasWritten) {
            throw new Error(
              `Firestore transactions require all reads to be executed before all writes (attempted to read ${docRef.path} after a write).`
            );
          }
          const raw = this.store.get(docRef.path);
          return {
            exists: raw !== undefined,
            id: docRef.id,
            data: () => (raw !== undefined ? structuredClone(raw) : undefined),
          };
        },
        set: (docRef: DocRefLike, data: Record<string, any>, options?: { merge?: boolean }) => {
          hasWritten = true;
          stagedWrites.push(() => {
            const existing = this.store.get(docRef.path);
            if (options?.merge && existing) {
              this.store.set(docRef.path, { ...structuredClone(existing), ...structuredClone(data) });
            } else {
              this.store.set(docRef.path, structuredClone(data));
            }
          });
          return tx;
        },
        update: (docRef: DocRefLike, data: Record<string, any>) => {
          hasWritten = true;
          stagedWrites.push(() => {
            const existing = this.store.get(docRef.path) || {};
            this.store.set(docRef.path, { ...structuredClone(existing), ...structuredClone(data) });
          });
          return tx;
        },
      };

      const result = await updateFunction(tx);
      for (const write of stagedWrites) {
        write();
      }
      return result;
    };

    const next = this.lockQueue.then(run);
    this.lockQueue = next.then(() => undefined, () => undefined);
    return next;
  }
}

async function runTests() {
  console.log('=== NEXORA MINE: ADMIN APPROVAL & AVAILABLE BALANCE SETTLEMENT VERIFICATION ===\n');

  const db = new InMemoryFirestore();
  const userId = 'user_test_001';
  const adminActor = { uid: 'admin_1', email: 'admin@nexora.io' };

  // Seed initial user wallet
  db.seed(`users/${userId}/wallet/USDT`, {
    symbol: 'USDT',
    name: 'Tether USD',
    balance: 100,
    lockedBalance: 0,
    priceUSD: 1,
    change24h: 0.01,
  });

  // ---------------------------------------------------------------------------
  // 1. DEPOSIT APPROVAL & IDEMPOTENCY (CONCURRENT / DUPLICATE APPROVAL)
  // ---------------------------------------------------------------------------
  db.seed(`users/${userId}/transactions/TX-DEP-100`, {
    id: 'TX-DEP-100',
    userId,
    type: 'DEPOSIT',
    asset: 'USDT',
    amount: 250,
    amountUSD: 250,
    txHash: '0x9876543210abcdef1234567890abcdef',
    status: 'PENDING_CONFIRMATION',
    walletCredited: false,
    walletSettled: false,
  });

  // Execute two concurrent deposit approvals for the exact same deposit
  const [depRes1, depRes2] = await Promise.all([
    settleDepositApproval(db, {
      userId,
      txId: 'TX-DEP-100',
      admin: adminActor,
    }),
    settleDepositApproval(db, {
      userId,
      txId: 'TX-DEP-100',
      admin: adminActor,
    }),
  ]);

  assert.equal(depRes1.alreadyProcessed, false, 'First deposit approval should settle');
  assert.equal(depRes2.alreadyProcessed, true, 'Concurrent duplicate deposit approval must be idempotent no-op');
  assert.equal(depRes1.newBalance, 350, 'USDT Available Balance should increase from 100 to 350');
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 350, 'Wallet balance in Firestore must be exactly 350');
  assert.equal(db.peek(`users/${userId}/transactions/TX-DEP-100`)?.status, 'COMPLETED');
  assert.equal(db.peek(`users/${userId}/transactions/TX-DEP-100`)?.walletCredited, true);
  assert.equal(db.peek(`users/${userId}/transactions/TX-DEP-100`)?.walletSettled, true);
  assert.equal(db.peek(`users/${userId}/settlements/TX-DEP-100`)?.action, 'APPROVE_DEPOSIT');
  console.log('✓ Test 1 Passed: Deposit approval & concurrent duplicate idempotency (balance credited once: 100 -> 350 USDT)');

  // ---------------------------------------------------------------------------
  // 2. DEPOSIT REJECTION (ZERO BALANCE CREDIT)
  // ---------------------------------------------------------------------------
  db.seed(`users/${userId}/transactions/TX-DEP-200`, {
    id: 'TX-DEP-200',
    userId,
    type: 'DEPOSIT',
    asset: 'USDT',
    amount: 500,
    amountUSD: 500,
    txHash: '0x11112222333344445555666677778888',
    status: 'PENDING_CONFIRMATION',
    walletCredited: false,
    walletSettled: false,
  });

  const depRej = await settleDepositRejection(db, {
    userId,
    txId: 'TX-DEP-200',
    admin: adminActor,
    reason: 'Invalid TxID',
  });
  assert.equal(depRej.status, 'REJECTED');
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 350, 'Rejected deposit must not credit Available Balance');
  assert.equal(db.peek(`users/${userId}/transactions/TX-DEP-200`)?.status, 'REJECTED');
  console.log('✓ Test 2 Passed: Deposit rejection marks REJECTED and does not credit Available Balance');

  // ---------------------------------------------------------------------------
  // 3. DAILY BONUS / REWARD CLAIM APPROVAL, UTC METADATA, LEGACY PROOF & TAMPER PROTECTION
  // ---------------------------------------------------------------------------
  const todayUTC = '2026-10-24';
  db.seed(`users/${userId}/rewards/dailyStreak`, {
    currentStreak: 4,
    lastClaimDate: todayUTC,
    claimStatus: 'PENDING_VERIFICATION',
    approvalStatus: 'PENDING',
    claimHistory: [
      {
        day: 4,
        rewardUSD: 1.5,
        date: todayUTC,
        timestamp: `${todayUTC}T08:00:00.000Z`,
        status: 'PENDING_VERIFICATION',
        txId: 'TX-REW-101',
      },
    ],
  });

  // 3a. Daily streak claim with new UTC date rewardDay ('YYYY-MM-DD') and streakDay (1..7)
  db.seed(`users/${userId}/transactions/TX-REW-101`, {
    id: 'TX-REW-101',
    userId,
    type: 'TASK_REWARD',
    asset: 'USDT',
    amount: 1.5,
    amountUSD: 1.5,
    status: 'PENDING_REVIEW',
    claimDate: todayUTC,
    rewardDay: todayUTC,
    streakDay: 4,
    rewardSource: 'DAILY_STREAK',
    note: 'Daily Check-in Day 4 Bonus (Pending Verification)',
    walletCredited: false,
    walletSettled: false,
  });

  const [rewRes1, rewRes2] = await Promise.all([
    settleRewardApproval(db, {
      userId,
      txId: 'TX-REW-101',
      admin: adminActor,
    }),
    settleRewardApproval(db, {
      userId,
      txId: 'TX-REW-101',
      admin: adminActor,
    }),
  ]);

  assert.equal(rewRes1.alreadyProcessed, false);
  assert.equal(rewRes2.alreadyProcessed, true, 'Duplicate reward approval must be idempotent');
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 351.5, 'USDT balance must increase by 1.50 once');
  assert.equal(db.peek(`users/${userId}/rewards/dailyStreak`)?.claimStatus, 'CLAIMED');
  assert.equal(db.peek(`users/${userId}/rewards/dailyStreak`)?.approvalStatus, 'APPROVED');
  assert.equal(db.peek(`users/${userId}/rewards/dailyStreak`)?.claimHistory?.[0]?.status, 'CLAIMED');

  // 3b. Task bounty claim with explicit taskId ('task_telegram' = 2.00 USDT)
  db.seed(`users/${userId}/transactions/TX-BOUNTY-201`, {
    id: 'TX-BOUNTY-201',
    userId,
    type: 'TASK_REWARD',
    asset: 'USDT',
    amount: 2.0,
    amountUSD: 2.0,
    status: 'PENDING_REVIEW',
    claimDate: todayUTC,
    taskId: 'task_telegram',
    rewardSource: 'TASK_BOUNTY',
    note: 'Task Bounty: Join Nexora Official Telegram',
    walletCredited: false,
    walletSettled: false,
  });

  const bountyRes = await settleRewardApproval(db, {
    userId,
    txId: 'TX-BOUNTY-201',
    admin: adminActor,
  });
  assert.equal(bountyRes.alreadyProcessed, false);
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 353.5, 'Task bounty must credit +2.00 USDT once');
  assert.equal(db.peek(`users/${userId}/transactions/TX-BOUNTY-201`)?.rewardSource, 'TASK_BOUNTY');

  // Undo the 2.00 USDT to keep subsequent balance assertions at 351.5
  db.seed(`users/${userId}/wallet/USDT`, {
    ...db.peek(`users/${userId}/wallet/USDT`)!,
    balance: 351.5,
  });

  // 3c. Legacy transaction `tx_1792853655871_lvtxn` missing BOTH rewardDay and taskId:
  // Case i: When NO authoritative proof exists in `users/{uid}/rewards/dailyStreak`, approval MUST fail safely and never invent metadata
  const legacyUnprovenUser = 'user_legacy_unproven';
  db.seed(`users/${legacyUnprovenUser}/wallet/USDT`, {
    symbol: 'USDT',
    name: 'Tether USD',
    balance: 10,
    lockedBalance: 0,
    priceUSD: 1,
  });
  db.seed(`users/${legacyUnprovenUser}/transactions/tx_1792853655871_lvtxn`, {
    id: 'tx_1792853655871_lvtxn',
    userId: legacyUnprovenUser,
    type: 'TASK_REWARD',
    asset: 'USDT',
    amount: 0.5,
    amountUSD: 0.5,
    status: 'PENDING_REVIEW',
    timestamp: '2026-10-24T09:15:00.000Z',
    note: 'Daily Miner Check-in Bonus',
    walletCredited: false,
    walletSettled: false,
  });

  await assert.rejects(
    () =>
      settleRewardApproval(db, {
        userId: legacyUnprovenUser,
        txId: 'tx_1792853655871_lvtxn',
        admin: adminActor,
      }),
    /missing both rewardDay and taskId metadata and cannot be verified/i,
    'Unproven legacy reward transaction missing rewardDay and taskId must not be credited'
  );
  assert.equal(db.peek(`users/${legacyUnprovenUser}/wallet/USDT`)?.balance, 10, 'Unproven legacy tx must not alter balance');

  // Admin can safely reject/cancel the malformed unproven pending record so it does not remain stuck
  const legacyRejectRes = await settleRewardRejection(db, {
    userId: legacyUnprovenUser,
    txId: 'tx_1792853655871_lvtxn',
    admin: adminActor,
    reason: 'Malformed legacy reward record without verifiable streak proof',
  });
  assert.equal(legacyRejectRes.status, 'REJECTED');
  assert.equal(db.peek(`users/${legacyUnprovenUser}/transactions/tx_1792853655871_lvtxn`)?.status, 'REJECTED');
  assert.equal(db.peek(`users/${legacyUnprovenUser}/wallet/USDT`)?.balance, 10);

  // Case ii: When authoritative proof DOES exist in `users/{uid}/rewards/dailyStreak` matching day (1..7), UTC date (YYYY-MM-DD), and official amount:
  // settleRewardApproval atomically backfills rewardDay, streakDay, claimDate, metadataBackfilledFrom and credits once
  const legacyProvenUser = 'user_legacy_proven';
  db.seed(`users/${legacyProvenUser}/wallet/USDT`, {
    symbol: 'USDT',
    name: 'Tether USD',
    balance: 20,
    lockedBalance: 0,
    priceUSD: 1,
  });
  db.seed(`users/${legacyProvenUser}/rewards/dailyStreak`, {
    userId: legacyProvenUser,
    currentStreak: 1,
    lastClaimDate: '2026-10-24',
    claimStatus: 'PENDING_VERIFICATION',
    claimHistory: [
      {
        day: 1,
        date: '2026-10-24',
        rewardUSD: 0.5,
        status: 'PENDING_VERIFICATION',
        timestamp: '2026-10-24T09:15:00.000Z',
      },
    ],
  });
  db.seed(`users/${legacyProvenUser}/transactions/tx_1792853655871_lvtxn`, {
    id: 'tx_1792853655871_lvtxn',
    userId: legacyProvenUser,
    type: 'TASK_REWARD',
    asset: 'USDT',
    amount: 0.5,
    amountUSD: 0.5,
    status: 'PENDING_REVIEW',
    timestamp: '2026-10-24T09:15:00.000Z',
    note: 'Daily Check-in Day 1 Bonus (Pending Verification)',
    walletCredited: false,
    walletSettled: false,
  });

  const legacyProvenRes = await settleRewardApproval(db, {
    userId: legacyProvenUser,
    txId: 'tx_1792853655871_lvtxn',
    admin: adminActor,
  });
  assert.equal(legacyProvenRes.alreadyProcessed, false);
  assert.equal(db.peek(`users/${legacyProvenUser}/wallet/USDT`)?.balance, 20.5, 'Proven legacy daily streak claim must credit +0.50 USDT once');
  const backfilledTx = db.peek(`users/${legacyProvenUser}/transactions/tx_1792853655871_lvtxn`);
  assert.equal(backfilledTx?.rewardDay, '2026-10-24');
  assert.equal(backfilledTx?.claimDate, '2026-10-24');
  assert.equal(backfilledTx?.streakDay, 1);
  assert.equal(backfilledTx?.rewardSource, 'DAILY_STREAK');
  assert.ok(backfilledTx?.metadataBackfilledFrom?.startsWith('rewards/dailyStreak'));
  assert.equal(db.peek(`users/${legacyProvenUser}/rewards/dailyStreak`)?.claimStatus, 'CLAIMED');

  // 3d. Test tampered reward amount (client claims 500 USDT for Day 1 check-in) -> must be rejected by server validation
  db.seed(`users/${userId}/transactions/TX-REW-TAMPERED`, {
    id: 'TX-REW-TAMPERED',
    userId,
    type: 'TASK_REWARD',
    asset: 'USDT',
    amount: 500,
    amountUSD: 500,
    status: 'PENDING_REVIEW',
    rewardDay: todayUTC,
    streakDay: 1,
    walletCredited: false,
    walletSettled: false,
  });
  await assert.rejects(
    () =>
      settleRewardApproval(db, {
        userId,
        txId: 'TX-REW-TAMPERED',
        admin: adminActor,
      }),
    /Reward amount .* does not match any official server-side reward tier/i,
    'Tampered reward claim amount must be rejected server-side'
  );

  // 3e. Test mismatched streakDay vs amount (e.g. Day 1 claim with Day 7 amount 5.0 USDT)
  db.seed(`users/${userId}/transactions/TX-REW-MISMATCH`, {
    id: 'TX-REW-MISMATCH',
    userId,
    type: 'TASK_REWARD',
    asset: 'USDT',
    amount: 5.0,
    amountUSD: 5.0,
    status: 'PENDING_REVIEW',
    rewardDay: todayUTC,
    streakDay: 1,
    walletCredited: false,
    walletSettled: false,
  });
  await assert.rejects(
    () =>
      settleRewardApproval(db, {
        userId,
        txId: 'TX-REW-MISMATCH',
        admin: adminActor,
      }),
    /does not match official Day 1 schedule/i,
    'Mismatched streakDay vs amount must be rejected server-side'
  );

  // 3f. Test rejected reward claim
  db.seed(`users/${userId}/transactions/TX-REW-102`, {
    id: 'TX-REW-102',
    userId,
    type: 'TASK_REWARD',
    asset: 'USDT',
    amount: 5.0,
    amountUSD: 5.0,
    status: 'PENDING_REVIEW',
    taskId: 't1',
    walletCredited: false,
    walletSettled: false,
  });
  await settleRewardRejection(db, {
    userId,
    txId: 'TX-REW-102',
    admin: adminActor,
    reason: 'Verification failed',
  });
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 351.5, 'Rejected reward claim must not credit balance');
  assert.equal(db.peek(`users/${userId}/transactions/TX-REW-102`)?.status, 'REJECTED');
  console.log('✓ Test 3 Passed: Daily bonus & bounty approval validates UTC rewardDay, taskId, and legacy dailyStreak proof while blocking tampered claims');

  // ---------------------------------------------------------------------------
  // 4. WITHDRAWAL ESCROW RESERVATION, INSUFFICIENT FUNDS & CONCURRENT DOUBLE-SPEND
  // ---------------------------------------------------------------------------
  // Current Available Balance is 351.5 USDT.
  // Attempt a withdrawal of 500 USDT -> should fail with Insufficient available USDT balance
  await assert.rejects(
    () =>
      reserveWithdrawalRequest(db, {
        userId,
        assetSymbol: 'USDT',
        amount: 500,
        fee: 1,
        usdRate: 1,
        network: 'TRC20',
        toAddress: 'TTestAddress12345678901234567890',
      }),
    /Insufficient available USDT balance/i,
    'Withdrawal exceeding Available Balance must fail'
  );

  // Attempt TWO concurrent withdrawals of 200 USDT each against 351.5 USDT balance.
  // Exactly one must succeed and the second must fail.
  const concurrentWithdrawals = await Promise.allSettled([
    reserveWithdrawalRequest(db, {
      userId,
      txId: 'TX-WD-1',
      assetSymbol: 'USDT',
      amount: 200,
      fee: 1,
      usdRate: 1,
      network: 'TRC20',
      toAddress: 'TTestAddress12345678901234567890',
    }),
    reserveWithdrawalRequest(db, {
      userId,
      txId: 'TX-WD-2',
      assetSymbol: 'USDT',
      amount: 200,
      fee: 1,
      usdRate: 1,
      network: 'TRC20',
      toAddress: 'TTestAddress12345678901234567890',
    }),
  ]);

  const fulfilledCount = concurrentWithdrawals.filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = concurrentWithdrawals.filter((r) => r.status === 'rejected').length;
  assert.equal(fulfilledCount, 1, 'Exactly one concurrent 200 USDT withdrawal should succeed');
  assert.equal(rejectedCount, 1, 'Second concurrent 200 USDT withdrawal must be rejected');
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 151.5, 'Available Balance must be 351.5 - 200 = 151.5');
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.lockedBalance, 200, 'Locked Balance must be 200 USDT');
  assert.equal(db.peek(`users/${userId}/transactions/TX-WD-1`)?.netPayoutAmount, 199, 'Net payout must be 200 - 1 = 199');
  console.log('✓ Test 4 Passed: Insufficient funds blocked & concurrent withdrawal double-spend prevented via lockedBalance escrow');

  // ---------------------------------------------------------------------------
  // 5. WITHDRAWAL APPROVAL (PAYMENT SETTLEMENT — NO DOUBLE DEDUCTION, NO DEPOSIT CREDIT)
  // ---------------------------------------------------------------------------
  const [wdApprove1, wdApprove2] = await Promise.all([
    settleWithdrawalApproval(db, {
      userId,
      txId: 'TX-WD-1',
      admin: adminActor,
      payoutTxHash: '0xabc123payout',
    }),
    settleWithdrawalApproval(db, {
      userId,
      txId: 'TX-WD-1',
      admin: adminActor,
      payoutTxHash: '0xabc123payout',
    }),
  ]);

  assert.equal(wdApprove1.alreadyProcessed, false);
  assert.equal(wdApprove2.alreadyProcessed, true, 'Duplicate withdrawal approval must be idempotent');
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 151.5, 'Available Balance must remain 151.5 (not double-deducted or credited)');
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.lockedBalance, 0, 'Locked Balance must be released from 200 to 0');
  assert.equal(db.peek(`users/${userId}/transactions/TX-WD-1`)?.status, 'COMPLETED');
  assert.equal(db.peek(`users/${userId}/transactions/TX-WD-1`)?.settlementStatus, 'PAID');
  assert.equal(db.peek(`users/${userId}/transactions/TX-WD-1`)?.payoutTxHash, '0xabc123payout');
  console.log('✓ Test 5 Passed: Withdrawal approval settles payment (PAID/COMPLETED), releases lockedBalance, and never credits balance');

  // ---------------------------------------------------------------------------
  // 6. WITHDRAWAL REJECTION & ATOMIC REFUND (NO DOUBLE REFUND)
  // ---------------------------------------------------------------------------
  await reserveWithdrawalRequest(db, {
    userId,
    txId: 'TX-WD-REFUND',
    assetSymbol: 'USDT',
    amount: 51.5,
    fee: 1,
    usdRate: 1,
    network: 'TRC20',
    toAddress: 'TTestAddress12345678901234567890',
  });
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 100);
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.lockedBalance, 51.5);

  const [wdRej1, wdRej2] = await Promise.all([
    settleWithdrawalRejection(db, {
      userId,
      txId: 'TX-WD-REFUND',
      admin: adminActor,
      reason: 'Invalid destination tag',
    }),
    settleWithdrawalRejection(db, {
      userId,
      txId: 'TX-WD-REFUND',
      admin: adminActor,
      reason: 'Invalid destination tag',
    }),
  ]);

  assert.equal(wdRej1.alreadyProcessed, false);
  assert.equal(wdRej2.alreadyProcessed, true, 'Duplicate withdrawal rejection must not double-refund');
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 151.5, 'Available Balance must be refunded once back to 151.5');
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.lockedBalance, 0, 'Locked Balance must return to 0');
  assert.equal(db.peek(`users/${userId}/transactions/TX-WD-REFUND`)?.status, 'REJECTED');
  assert.equal(db.peek(`users/${userId}/transactions/TX-WD-REFUND`)?.refunded, true);
  console.log('✓ Test 6 Passed: Rejected withdrawal restores reserved funds to Available Balance exactly once');

  // ---------------------------------------------------------------------------
  // 7. MANUAL FIREBASE CONSOLE EDIT RECONCILIATION & AMBIGUOUS STATUS PROTECTION
  // ---------------------------------------------------------------------------
  // 7a. Legitimate Console-edited deposit (has valid txHash, valid amount, no rejection flags)
  db.seed(`users/${userId}/transactions/TX-CONSOLE-DEP`, {
    id: 'TX-CONSOLE-DEP',
    userId,
    type: 'DEPOSIT',
    asset: 'USDT',
    amount: 48.5,
    amountUSD: 48.5,
    txHash: '0xconsoleverifiedtxhash9876543210',
    status: 'COMPLETED', // manually set in Console
    walletCredited: false,
    walletSettled: false,
  });

  // Standard approval endpoint (allowManualCompletedStatus: false) MUST NOT treat an unsettled COMPLETED status as valid pending state
  await assert.rejects(
    () =>
      settleDepositApproval(db, {
        userId,
        txId: 'TX-CONSOLE-DEP',
        admin: adminActor,
        allowManualCompletedStatus: false,
      }),
    /Standard approval requires a pending state/i,
    'Standard deposit approval must reject an unsettled COMPLETED status unless explicitly reconciled'
  );

  // Explicit Console reconciliation (allowManualCompletedStatus: true) settles valid deposit
  const consoleDepRes = await settleDepositApproval(db, {
    userId,
    txId: 'TX-CONSOLE-DEP',
    admin: { uid: 'console', email: 'firebase-console-reconcile' },
    allowManualCompletedStatus: true,
  });
  assert.equal(consoleDepRes.alreadyProcessed, false, 'Unsettled COMPLETED deposit from Console edit must settle');
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 200, 'Balance should increase from 151.5 to 200.0');
  assert.equal(db.peek(`users/${userId}/transactions/TX-CONSOLE-DEP`)?.walletCredited, true);
  assert.equal(db.peek(`users/${userId}/transactions/TX-CONSOLE-DEP`)?.walletSettled, true);

  // 7b. Invalid/unverified Console edit (missing txHash or previously rejected) must NOT credit funds even with allowManualCompletedStatus: true
  db.seed(`users/${userId}/transactions/TX-CONSOLE-INVALID`, {
    id: 'TX-CONSOLE-INVALID',
    userId,
    type: 'DEPOSIT',
    asset: 'USDT',
    amount: 1000,
    amountUSD: 1000,
    txHash: '', // missing proof of payment hash
    status: 'COMPLETED',
    walletCredited: false,
    walletSettled: false,
  });
  await assert.rejects(
    () =>
      settleDepositApproval(db, {
        userId,
        txId: 'TX-CONSOLE-INVALID',
        admin: { uid: 'console', email: 'firebase-console-reconcile' },
        allowManualCompletedStatus: true,
      }),
    /missing a valid blockchain transaction hash/i,
    'Console reconciliation must refuse to credit a deposit missing a valid txHash'
  );
  assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 200, 'Balance must remain unchanged at 200.0');
  console.log('✓ Test 7 Passed: Manual Console reconciliation settles verified edits and blocks unverified/missing-txHash COMPLETED edits');

  // ---------------------------------------------------------------------------
  // 8. ADMIN AUTHORIZATION AUDIT: NEGATIVE (401/403) & POSITIVE (200) TESTS ACROSS ALL ENDPOINTS
  // ---------------------------------------------------------------------------
  process.env.NEXORA_SKIP_LISTEN = 'true';
  const {
    app,
    setTokenVerifierForTesting,
    setFirestoreProviderForTesting,
    resetServerTestHooks,
  } = await import('../server.ts');

  // Configure deterministic token verifier and in-memory Firestore for HTTP endpoint testing
  setFirestoreProviderForTesting(() => ({
    doc: (p: string) => db.doc(p),
    runTransaction: (fn: any) => db.runTransaction(fn),
    collection: () => ({
      limit: () => ({
        get: async () => ({ docs: [] }),
      }),
    }),
    collectionGroup: () => ({
      where: () => ({
        where: () => ({
          limit: () => ({
            get: async () => ({ docs: [] }),
          }),
        }),
      }),
    }),
  }));

  setTokenVerifierForTesting(async (token: string) => {
    if (token === 'valid-regular-user-token') {
      return {
        uid: userId,
        email: 'miner@example.com',
        emailVerified: true,
        isAdmin: false,
      };
    }
    if (token === 'unverified-admin-email-token') {
      return {
        uid: 'admin_unverified',
        email: 'muneebsj7@gmail.com',
        emailVerified: false,
        isAdmin: false,
      };
    }
    if (token === 'valid-admin-token') {
      return {
        uid: 'admin_verified_uid',
        email: 'muneebsj7@gmail.com',
        emailVerified: true,
        isAdmin: true,
      };
    }
    return null;
  });

  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const addr = testServer.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const privilegedEndpoints: Array<{ method: 'GET' | 'POST'; path: string; body?: Record<string, any> }> = [
    { method: 'GET', path: '/api/admin/setup-status' },
    { method: 'GET', path: '/api/admin/pending-deposits' },
    { method: 'GET', path: '/api/admin/pending-requests' },
    { method: 'POST', path: '/api/admin/approve-deposit', body: { userId, txId: 'TX-HTTP-DEP' } },
    { method: 'POST', path: '/api/admin/reject-deposit', body: { userId, txId: 'TX-HTTP-DEP' } },
    { method: 'POST', path: '/api/admin/approve-reward', body: { userId, txId: 'TX-HTTP-REW' } },
    { method: 'POST', path: '/api/admin/reject-reward', body: { userId, txId: 'TX-HTTP-REW' } },
    { method: 'POST', path: '/api/admin/approve-withdrawal', body: { userId, txId: 'TX-HTTP-WD' } },
    { method: 'POST', path: '/api/admin/reject-withdrawal', body: { userId, txId: 'TX-HTTP-WD' } },
    { method: 'POST', path: '/api/admin/reconcile-settlements', body: { targetUserId: userId } },
  ];

  try {
    // 8a. Missing Authorization header -> 401 on EVERY privileged endpoint
    for (const ep of privilegedEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        ...(ep.body ? { body: JSON.stringify(ep.body) } : {}),
      });
      assert.equal(res.status, 401, `Unauthenticated ${ep.method} ${ep.path} must return 401`);
    }

    // 8b. Invalid / forged Bearer token -> 401 on EVERY privileged endpoint
    for (const ep of privilegedEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer forged-invalid-token',
        },
        ...(ep.body ? { body: JSON.stringify(ep.body) } : {}),
      });
      assert.equal(res.status, 401, `Forged token on ${ep.method} ${ep.path} must return 401`);
    }

    // 8c. Authenticated non-admin user -> 403 on EVERY privileged endpoint, even when spoofing isAdmin/role/email in body
    for (const ep of privilegedEndpoints) {
      const spoofedBody = ep.body
        ? {
            ...ep.body,
            isAdmin: true,
            role: 'admin',
            email: 'muneebsj7@gmail.com',
            admin: true,
          }
        : undefined;
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-regular-user-token',
        },
        ...(spoofedBody ? { body: JSON.stringify(spoofedBody) } : {}),
      });
      assert.equal(
        res.status,
        403,
        `Non-admin user calling ${ep.method} ${ep.path} (even with spoofed isAdmin body) must return 403`
      );
    }

    // 8d. Admin allowlisted email with emailVerified: false -> 403 on EVERY privileged endpoint
    for (const ep of privilegedEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer unverified-admin-email-token',
        },
        ...(ep.body ? { body: JSON.stringify(ep.body) } : {}),
      });
      assert.equal(res.status, 403, `Unverified admin email on ${ep.method} ${ep.path} must return 403`);
      const errBody = await res.json();
      assert.match(String(errBody.error), /Verified email address is required/i);
    }

    // 8e. Positive test: Authorized admin with verified email succeeds (200) on admin endpoints
    db.seed(`users/${userId}/transactions/TX-HTTP-DEP`, {
      id: 'TX-HTTP-DEP',
      userId,
      type: 'DEPOSIT',
      asset: 'USDT',
      amount: 50,
      amountUSD: 50,
      txHash: '0xadminhttpverifieddeposit999999',
      status: 'PENDING_CONFIRMATION',
      walletCredited: false,
      walletSettled: false,
    });

    const adminSetupRes = await fetch(`${baseUrl}/api/admin/setup-status`, {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-admin-token' },
    });
    assert.equal(adminSetupRes.status, 200, 'Authorized admin must receive 200 on /api/admin/setup-status');

    const adminApproveDepRes = await fetch(`${baseUrl}/api/admin/approve-deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token',
      },
      body: JSON.stringify({ userId, txId: 'TX-HTTP-DEP', note: 'Approved in positive admin test' }),
    });
    assert.equal(adminApproveDepRes.status, 200, 'Authorized admin must receive 200 on /api/admin/approve-deposit');
    const adminApproveDepBody = await adminApproveDepRes.json();
    assert.equal(adminApproveDepBody.success, true);
    assert.equal(adminApproveDepBody.newBalance, 250, 'Balance should increase from 200 to 250 USDT');
    assert.equal(
      db.peek(`users/${userId}/transactions/TX-HTTP-DEP`)?.approvedBy,
      'muneebsj7@gmail.com',
      'Approved transaction must record verified admin email'
    );

    // 8f. Unauthenticated withdrawal reservation -> 401
    const unauthWithdrawRes = await fetch(`${baseUrl}/api/wallet/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetSymbol: 'USDT', amount: 25, network: 'TRC20', address: 'T123456789012345' }),
    });
    assert.equal(unauthWithdrawRes.status, 401, 'Unauthenticated withdrawal submission must return 401');

    console.log(
      '✓ Test 8 Passed: All 10 admin endpoints enforce 401/403 against unauthenticated, non-admin, unverified-email, and body-spoofed callers, and 200 for verified admin'
    );

    // ---------------------------------------------------------------------------
    // Test 9: Authoritative 5-Plan BTC Catalog, Unit Conversions & Server-Side Contract Purchase
    // ---------------------------------------------------------------------------
    // 9.0 Verify all 5 official BTC mining contracts and unit conversion math (1 TH/s = 1,000 GH/s, 1 GH/s = 1,000 MH/s)
    const expectedCatalog = [
      { id: 'plan_genesis_shaft', name: 'Genesis Shaft', tier: 'Entry', priceUSD: 10.0, hashrate: 10, durationDays: 45, displayedReturnPercent: 150.0 },
      { id: 'plan_blockfoundry', name: 'Blockfoundry', tier: 'Core', priceUSD: 48.0, hashrate: 18, durationDays: 78, displayedReturnPercent: 158.0 },
      { id: 'plan_stratum_yard', name: 'Stratum Yard', tier: 'Value', priceUSD: 135.0, hashrate: 34, durationDays: 112, displayedReturnPercent: 172.0 },
      { id: 'plan_halving_bench', name: 'Halving Bench', tier: 'Pro', priceUSD: 510.0, hashrate: 96, durationDays: 156, displayedReturnPercent: 188.0 },
      { id: 'plan_epoch_vault', name: 'Epoch Vault', tier: 'Elite', priceUSD: 1480.0, hashrate: 268, durationDays: 210, displayedReturnPercent: 210.0 },
    ];
    assert.equal(Object.keys(AUTHORITATIVE_MINING_PLANS).length, 5, 'Must have exactly 5 authoritative BTC contracts');
    for (const exp of expectedCatalog) {
      const actual = AUTHORITATIVE_MINING_PLANS[exp.id];
      assert.ok(actual, `Plan ${exp.id} must exist in AUTHORITATIVE_MINING_PLANS`);
      assert.equal(actual.name, exp.name);
      assert.equal(actual.tier, exp.tier);
      assert.equal(actual.targetCoin, 'BTC');
      assert.equal(actual.algorithm, 'SHA-256');
      assert.equal(actual.priceUSD, exp.priceUSD);
      assert.equal(actual.hashrate, exp.hashrate);
      assert.equal(actual.hashrateUnit, 'GH/s');
      assert.equal(actual.hashrateGHs, exp.hashrate);
      assert.equal(actual.hashrateTHs, Number((exp.hashrate / 1000).toFixed(6)));
      assert.equal(actual.durationDays, exp.durationDays);
      assert.equal(actual.displayedReturnPercent, exp.displayedReturnPercent);
    }

    assert.equal(convertHashrateToTHs(10, 'GH/s'), 0.01);
    assert.equal(convertHashrateToTHs(268, 'GH/s'), 0.268);
    assert.equal(convertTHsToGHs(1), 1000);
    assert.equal(convertGHsToMHs(10), 10000);
    assert.equal(convertHashrateToGHs(18, 'GH/s'), 18);

    // 9a. Unauthenticated contract purchase -> 401
    const unauthPurchaseRes = await fetch(`${baseUrl}/api/mining/purchase-contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'plan_genesis_shaft', idempotencyKey: 'idem_unauth_123456' }),
    });
    assert.equal(unauthPurchaseRes.status, 401, 'Unauthenticated contract purchase must return 401');

    // 9b. Invalid or legacy planId rejected -> 400
    const invalidPlanRes = await fetch(`${baseUrl}/api/mining/purchase-contract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-regular-user-token',
      },
      body: JSON.stringify({ planId: 'plan-999', idempotencyKey: 'idem_badplan_123456' }),
    });
    assert.equal(invalidPlanRes.status, 400, 'Unknown planId must return 400');

    // 9c. Insufficient server-confirmed USDT balance rejected (current balance is 250, plan_epoch_vault costs 1480 USDT)
    const insufficientRes = await fetch(`${baseUrl}/api/mining/purchase-contract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-regular-user-token',
      },
      body: JSON.stringify({ planId: 'plan_epoch_vault', idempotencyKey: 'idem_insuff_123456' }),
    });
    assert.equal(insufficientRes.status, 400, 'Insufficient USDT balance must return 400');
    const insufficientBody = await insufficientRes.json();
    assert.match(String(insufficientBody.error), /Insufficient server-confirmed USDT balance/i);
    assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 250, 'Balance must remain unchanged after failed purchase');

    // 9d. Valid contract purchase (plan_blockfoundry costs $48.00 USDT, grants +18 GH/s = +0.018 TH/s for 78 days at 158.0% term return)
    db.seed(`users/${userId}/mining/session`, {
      status: 'ACTIVE',
      hashrateGHs: 10,
      hashrateTHs: 0.01,
    });

    const validPurchaseRes = await fetch(`${baseUrl}/api/mining/purchase-contract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-regular-user-token',
      },
      body: JSON.stringify({
        planId: 'plan_blockfoundry',
        idempotencyKey: 'idem_valid_blockfoundry_001',
        // Spoofed client parameters that must be completely ignored by server:
        priceUSD: 0.01,
        hashrate: 99999,
        hashrateTHs: 99999,
        userId: 'other_victim_uid',
      }),
    });
    assert.equal(validPurchaseRes.status, 200, 'Valid contract purchase must return 200');
    const validPurchaseBody = await validPurchaseRes.json();
    assert.equal(validPurchaseBody.success, true);
    assert.equal(validPurchaseBody.alreadyProcessed, false);
    assert.equal(validPurchaseBody.priceUSD, 48, 'Server must enforce authoritative $48.00 USDT price for plan_blockfoundry');
    assert.equal(validPurchaseBody.hashrateAddedGHs, 18, 'Server must enforce authoritative 18 GH/s hashrate for plan_blockfoundry');
    assert.equal(validPurchaseBody.hashrateAddedTHs, 0.018, 'Server must enforce authoritative 0.018 TH/s hashrate for plan_blockfoundry');
    assert.equal(validPurchaseBody.newBalance, 202, 'USDT balance must decrease atomically from 250 to 202');
    assert.equal(validPurchaseBody.newHashrateGHs, 28, 'Mining session hashrateGHs must increase atomically from 10 to 28 GH/s');
    assert.equal(validPurchaseBody.newHashrateTHs, 0.028, 'Mining session hashrateTHs must increase atomically from 0.01 to 0.028 TH/s');

    const orderId = validPurchaseBody.orderId;
    const savedContract = db.peek(`users/${userId}/contracts/${orderId}`);
    assert.ok(savedContract, 'Contract document must be written at users/{uid}/contracts/{orderId}');
    assert.equal(savedContract?.planId, 'plan_blockfoundry');
    assert.equal(savedContract?.planName, 'Blockfoundry');
    assert.equal(savedContract?.tier, 'Core');
    assert.equal(savedContract?.priceUSD, 48);
    assert.equal(savedContract?.hashrate, 18);
    assert.equal(savedContract?.hashrateUnit, 'GH/s');
    assert.equal(savedContract?.hashrateGHs, 18);
    assert.equal(savedContract?.hashrateTHs, 0.018);
    assert.equal(savedContract?.durationDays, 78);
    assert.equal(savedContract?.displayedReturnPercent, 158.0);
    assert.equal(savedContract?.status, 'ACTIVE');

    const savedPurchaseTx = db.peek(`users/${userId}/transactions/${orderId}`);
    assert.ok(savedPurchaseTx, 'Transaction document must be written at users/{uid}/transactions/{orderId}');
    assert.equal(savedPurchaseTx?.type, 'CONTRACT_PURCHASE');
    assert.equal(savedPurchaseTx?.status, 'COMPLETED');
    assert.equal(savedPurchaseTx?.settlementStatus, 'PURCHASED');
    assert.equal(savedPurchaseTx?.walletSettled, true);

    const savedSettlement = db.peek(`users/${userId}/settlements/${orderId}`);
    assert.ok(savedSettlement, 'Settlement audit record must be written at users/{uid}/settlements/{orderId}');
    assert.equal(savedSettlement?.settlementStatus, 'PURCHASED');
    assert.equal(savedSettlement?.previousBalance, 250);
    assert.equal(savedSettlement?.newBalance, 202);

    const updatedSession = db.peek(`users/${userId}/mining/session`);
    assert.equal(updatedSession?.activeContractId, orderId);
    assert.equal(updatedSession?.activeContractName, 'Blockfoundry');
    assert.equal(updatedSession?.hashrateGHs, 28);
    assert.equal(updatedSession?.hashrateTHs, 0.028);

    // 9e. Duplicate/concurrent retry with same idempotencyKey is idempotent (no double charge or double hashrate)
    const duplicatePurchaseRes = await fetch(`${baseUrl}/api/mining/purchase-contract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-regular-user-token',
      },
      body: JSON.stringify({
        planId: 'plan_blockfoundry',
        idempotencyKey: 'idem_valid_blockfoundry_001',
      }),
    });
    assert.equal(duplicatePurchaseRes.status, 200, 'Idempotent retry must return 200');
    const duplicatePurchaseBody = await duplicatePurchaseRes.json();
    assert.equal(duplicatePurchaseBody.alreadyProcessed, true, 'Duplicate idempotencyKey must report alreadyProcessed: true');
    assert.equal(duplicatePurchaseBody.newBalance, 202, 'USDT balance must remain 202 without double deduction');
    assert.equal(duplicatePurchaseBody.newHashrateGHs, 28, 'Hashrate must remain 28 GH/s without double increment');
    assert.equal(duplicatePurchaseBody.newHashrateTHs, 0.028, 'Hashrate must remain 0.028 TH/s without double increment');
    assert.equal(db.peek(`users/${userId}/wallet/USDT`)?.balance, 202);
    assert.equal(db.peek(`users/${userId}/mining/session`)?.hashrateGHs, 28);

    // 9f. Offline cache error classification audit
    assert.equal(
      isExpectedOfflineError({ code: 'unavailable', message: 'Could not reach Cloud Firestore backend.' }),
      true,
      'unavailable error must be classified as expected offline error'
    );
    assert.equal(
      isExpectedOfflineError({ code: 'firestore/unavailable', message: 'Failed to get document because the client is offline.' }),
      true,
      'firestore/unavailable offline message must be classified as expected offline error'
    );
    assert.equal(
      isExpectedOfflineError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }),
      false,
      'permission-denied must NEVER be classified as an offline error'
    );
    assert.equal(
      isExpectedOfflineError({ code: 'unauthenticated', message: 'Request had invalid authentication credentials.' }),
      false,
      'unauthenticated must NEVER be classified as an offline error'
    );
    assert.equal(
      isExpectedOfflineError({ code: 'invalid-argument', message: 'Invalid document reference.' }),
      false,
      'invalid-argument must NEVER be classified as an offline error'
    );
    assert.equal(
      isExpectedOfflineError({ code: 'not-found', message: 'No document to update.' }),
      false,
      'not-found must NEVER be classified as an offline error'
    );

    const sanitizedMsg = sanitizeDiagnosticMessage(
      'Auth failed with Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    );
    assert.ok(!sanitizedMsg.includes('eyJhbGci'), 'sanitizeDiagnosticMessage must redact JWT tokens');

    console.log(
      '✓ Test 9 Passed: All 5 authoritative BTC contracts, GH/s <-> TH/s unit conversions, atomic server-side purchase, idempotency, and offline cache classification verified'
    );

    // ---------------------------------------------------------------------------
    // Test 10: Firestore FAILED_PRECONDITION Missing Composite Index Fallback on Admin Endpoints
    // ---------------------------------------------------------------------------
    db.seed(`users/${userId}`, { id: userId, email: 'miner@example.com' });
    db.seed(`users/${userId}/transactions/TX-FALLBACK-DEP`, {
      id: 'TX-FALLBACK-DEP',
      userId,
      type: 'DEPOSIT',
      asset: 'USDT',
      amount: 120,
      amountUSD: 120,
      txHash: '0xfallbackdeposit1234567890abcdef',
      status: 'PENDING_CONFIRMATION',
    });
    db.seed(`users/${userId}/transactions/TX-FALLBACK-REW`, {
      id: 'TX-FALLBACK-REW',
      userId,
      type: 'TASK_REWARD',
      asset: 'USDT',
      amount: 0.75,
      amountUSD: 0.75,
      rewardDay: '2026-10-26',
      status: 'PENDING_REVIEW',
    });
    db.seed(`users/${userId}/transactions/TX-FALLBACK-WD`, {
      id: 'TX-FALLBACK-WD',
      userId,
      type: 'WITHDRAWAL',
      asset: 'USDT',
      amount: 40,
      amountUSD: 40,
      toAddress: 'T999888777666555444333222111',
      status: 'PENDING_REVIEW',
      reservedFromBalance: true,
    });

    setFirestoreProviderForTesting(() => ({
      doc: (p: string) => db.doc(p),
      runTransaction: (fn: any) => db.runTransaction(fn),
      collection: (colPath: string) => ({
        limit: () => ({
          get: async () => {
            if (colPath === 'users') {
              return {
                docs: [{ id: userId, data: () => ({ id: userId, email: 'miner@example.com' }) }],
              };
            }
            if (colPath === `users/${userId}/transactions`) {
              const ids = ['TX-FALLBACK-DEP', 'TX-FALLBACK-REW', 'TX-FALLBACK-WD'];
              return {
                docs: ids
                  .map((txId) => {
                    const raw = db.peek(`users/${userId}/transactions/${txId}`);
                    if (!raw) return null;
                    return {
                      id: txId,
                      ref: { parent: { parent: { id: userId } } },
                      data: () => raw,
                    };
                  })
                  .filter(Boolean),
              };
            }
            return { docs: [] };
          },
        }),
      }),
      collectionGroup: () => ({
        where: () => ({
          where: () => ({
            limit: () => ({
              get: async () => {
                const indexErr: any = new Error(
                  '9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/...'
                );
                indexErr.code = 9;
                throw indexErr;
              },
            }),
          }),
        }),
      }),
    }));

    const fallbackPendingRes = await fetch(`${baseUrl}/api/admin/pending-requests`, {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-admin-token' },
    });
    assert.equal(
      fallbackPendingRes.status,
      200,
      '/api/admin/pending-requests must return 200 via per-user subcollection fallback when collectionGroup throws FAILED_PRECONDITION'
    );
    const fallbackPendingBody = await fallbackPendingRes.json();
    assert.equal(fallbackPendingBody.deposits.length, 1);
    assert.equal(fallbackPendingBody.deposits[0].id, 'TX-FALLBACK-DEP');
    assert.equal(fallbackPendingBody.rewards.length, 1);
    assert.equal(fallbackPendingBody.rewards[0].id, 'TX-FALLBACK-REW');
    assert.equal(fallbackPendingBody.withdrawals.length, 1);
    assert.equal(fallbackPendingBody.withdrawals[0].id, 'TX-FALLBACK-WD');

    const fallbackDepRes = await fetch(`${baseUrl}/api/admin/pending-deposits`, {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-admin-token' },
    });
    assert.equal(fallbackDepRes.status, 200);
    const fallbackDepBody = await fallbackDepRes.json();
    assert.equal(fallbackDepBody.deposits.length, 1);
    assert.equal(fallbackDepBody.deposits[0].id, 'TX-FALLBACK-DEP');

    console.log(
      '✓ Test 10 Passed: /api/admin/pending-requests and /api/admin/pending-deposits transparently recover from Firestore 9 FAILED_PRECONDITION missing collectionGroup index'
    );

    // ---------------------------------------------------------------------------
    // Test 11: Real-User vs. Demo-User Wallet Isolation & Deposit Address Stripping
    // ---------------------------------------------------------------------------
    const { getCleanRealUserWalletAssets, INITIAL_WALLET_ASSETS } = await import('../src/services/walletService.ts');
    const cleanRealAssets = getCleanRealUserWalletAssets();
    assert.equal(cleanRealAssets.length, INITIAL_WALLET_ASSETS.length, 'Real user asset list must match supported symbols');
    for (const asset of cleanRealAssets) {
      assert.equal(asset.balance, 0, `Real user initial balance for ${asset.symbol} must be 0`);
      assert.equal(asset.lockedBalance, 0, `Real user initial lockedBalance for ${asset.symbol} must be 0`);
      assert.equal(
        asset.depositAddress,
        '',
        `Real user depositAddress for ${asset.symbol} must be empty when no live custodial gateway is connected`
      );
    }
    // Verify demo assets still retain sample addresses strictly for Sandbox Demo Mode
    for (const demoAsset of INITIAL_WALLET_ASSETS) {
      assert.ok(
        demoAsset.depositAddress.length > 10,
        `Sandbox demo asset ${demoAsset.symbol} retains sample address for demo mode`
      );
    }
    console.log(
      '✓ Test 11 Passed: Real-user wallet assets strip sample deposit addresses and demo balances while preserving Sandbox Demo Mode'
    );

    // ---------------------------------------------------------------------------
    // Test 12: Firestore Security Rules Policy & Schema Alignment Verification
    // ---------------------------------------------------------------------------
    const fs = await import('node:fs');
    const path = await import('node:path');
    const rulesSource = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

    // 12a. Admin RBAC & /admins/{adminId} collection
    assert.match(rulesSource, /function isAdmin\(\)/, 'firestore.rules must define isAdmin() helper');
    assert.match(
      rulesSource,
      /exists\(\/databases\/\$\(database\)\/documents\/admins\/\$\(request\.auth\.uid\)\)/,
      'isAdmin() must support /admins/{uid} document lookup'
    );
    assert.match(rulesSource, /match \/admins\/\{adminId\}/, 'firestore.rules must define /admins/{adminId} rules');

    // 12b. Mining session schema alignment (hashrateGHs, activeContractId, activeContractName)
    assert.match(
      rulesSource,
      /'hashrateGHs'/,
      'firestore.rules /mining/{docId} must allow hashrateGHs on create and update'
    );
    assert.match(
      rulesSource,
      /request\.resource\.data\.activeContractId == resource\.data\.activeContractId/,
      'firestore.rules /mining/{docId} must protect activeContractId from client tampering while allowing session updates'
    );
    assert.match(
      rulesSource,
      /request\.resource\.data\.activeContractName == resource\.data\.activeContractName/,
      'firestore.rules /mining/{docId} must protect activeContractName from client tampering while allowing session updates'
    );

    // 12c. Client-side WITHDRAWAL creation blocked (server-only atomic escrow required)
    assert.ok(
      !rulesSource.includes("request.resource.data.type == 'WITHDRAWAL'"),
      'firestore.rules must NOT permit direct client-side WITHDRAWAL creation bypassing server-side atomic escrow'
    );

    // 12d. Wallet, contracts, and settlements remain strictly non-writable by clients
    assert.match(
      rulesSource,
      /match \/wallet\/\{assetSymbol\}[\s\S]*?allow create, update, delete: if false;/,
      'Wallet subcollection must deny all client writes'
    );
    assert.match(
      rulesSource,
      /match \/contracts\/\{contractId\}[\s\S]*?allow create, update, delete: if false;/,
      'Contracts subcollection must deny all client writes'
    );
    assert.match(
      rulesSource,
      /match \/settlements\/\{settlementId\}[\s\S]*?allow create, update, delete: if false;/,
      'Settlements subcollection must deny all client writes'
    );

    console.log(
      '✓ Test 12 Passed: firestore.rules verified for isAdmin() RBAC, hashrateGHs mining schema alignment, server-only withdrawal escrow, and financial write blocks'
    );

    // ---------------------------------------------------------------------------
    // Test 13: Fail-Closed Withdrawal Verification & Post-Login Home Navigation Guard
    // ---------------------------------------------------------------------------
    const { WalletFirestoreService } = await import('../src/services/walletService.ts');
    await assert.rejects(
      () =>
        WalletFirestoreService.submitWithdrawalRequest('usr_unauth_test', {
          assetSymbol: 'USDT',
          network: 'TRC20 (Tron)',
          amount: 25,
          address: 'TQn9Y2khEsLJW1ChVWFMSMeSTow5Kax999',
          fee: 1.5,
          usdRate: 1.0,
        }),
      /You must be signed in with a real authenticated account/i,
      'submitWithdrawalRequest must fail closed when no authenticated Firebase user is active'
    );

    const walletServiceSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/walletService.ts'),
      'utf8'
    );
    const submitWithdrawSlice = walletServiceSource.slice(
      walletServiceSource.indexOf('static async submitWithdrawalRequest')
    );
    assert.ok(
      !submitWithdrawSlice.includes('setDoc('),
      'submitWithdrawalRequest must not contain any client-side setDoc fallback'
    );

    const appContextSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/context/AppContext.tsx'),
      'utf8'
    );
    assert.match(
      appContextSource,
      /lastAuthTransitionAtRef/,
      'AppContext must enforce post-login transition guard to prevent landing on Profile screen'
    );
    assert.match(
      appContextSource,
      /setActiveTabState\('home'\)/,
      'AppContext must deterministically route login, registration, and auth transitions to Home screen'
    );

    console.log(
      '✓ Test 13 Passed: Withdrawals fail closed without client fallback and login transitions deterministically route to Home'
    );
  } finally {
    resetServerTestHooks();
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  }

  console.log('\nALL 13 SETTLEMENT, ISOLATION & SECURITY VERIFICATION SUITES PASSED.');
}

runTests().catch((err) => {
  console.error('Verification test failed:', err);
  process.exit(1);
});
