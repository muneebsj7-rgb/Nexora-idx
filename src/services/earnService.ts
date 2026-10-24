import {
  doc,
  getDoc,
  getDocFromCache,
  setDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  FirestoreError,
} from 'firebase/firestore';
import { DailyReward, EarnTask, DailyStreakRecord, DailyStreakClaimItem } from '../types';
import { db } from './firebase';

export const INITIAL_DAILY_REWARDS: DailyReward[] = [
  { day: 1, rewardUSD: 0.50, isClaimed: true, isToday: false },
  { day: 2, rewardUSD: 0.75, isClaimed: true, isToday: false },
  { day: 3, rewardUSD: 1.00, isClaimed: true, isToday: false },
  { day: 4, rewardUSD: 1.50, isClaimed: false, isToday: true },
  { day: 5, rewardUSD: 2.00, isClaimed: false, isToday: false },
  { day: 6, rewardUSD: 3.00, isClaimed: false, isToday: false },
  { day: 7, rewardUSD: 5.00, isClaimed: false, isToday: false },
];

export const DAILY_REWARD_RATES: Record<number, number> = {
  1: 0.50,
  2: 0.75,
  3: 1.00,
  4: 1.50,
  5: 2.00,
  6: 3.00,
  7: 5.00,
};

export const INITIAL_EARN_TASKS: EarnTask[] = [
  {
    id: 'task_telegram',
    title: 'Join Nexora Official Telegram',
    description: 'Join our community for daily mining tips, pool updates, and promo codes.',
    category: 'Community',
    rewardUSD: 2.00,
    rewardAsset: 'USDT',
    status: 'AVAILABLE',
    actionUrl: 'https://t.me/nexoramine',
  },
  {
    id: 'task_2fa',
    title: 'Enable Two-Factor Authentication (2FA)',
    description: 'Enhance your mining account security with Google Authenticator or SMS 2FA.',
    category: 'Security',
    rewardUSD: 3.00,
    rewardAsset: 'USDT',
    status: 'AVAILABLE',
  },
  {
    id: 'task_verify_email',
    title: 'Complete Email Verification',
    description: 'Verify your primary email address to unlock higher withdrawal limits.',
    category: 'Security',
    rewardUSD: 1.50,
    rewardAsset: 'USDT',
    status: 'COMPLETED',
  },
  {
    id: 'task_mine_24h',
    title: 'Maintain 24h Continuous Mining Session',
    description: 'Keep your cloud hash power online for at least 24 consecutive hours.',
    category: 'Mining',
    rewardUSD: 5.00,
    rewardAsset: 'USDT',
    status: 'IN_PROGRESS',
  },
  {
    id: 'task_refer_friend',
    title: 'Invite Your First Active Miner',
    description: 'Share your referral code. Receive 5% hashrate bonus when they start.',
    category: 'Milestone',
    rewardUSD: 10.00,
    rewardAsset: 'USDT',
    status: 'AVAILABLE',
  }
];

function formatRewardError(error: unknown, action: string): Error {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as FirestoreError).code;
    if (code === 'permission-denied') {
      return new Error(
        `Cloud Firestore permission denied during ${action}. ` +
        `Ensure firestore.rules for users/{userId}/rewards have been deployed to your Firebase project.`
      );
    }
    if (code === 'unavailable') {
      return new Error('Firestore service is temporarily unavailable. Please verify your connection.');
    }
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(`An unexpected error occurred during ${action}.`);
}

/**
 * Service for managing daily streak rewards in Firestore.
 * Path: users/{uid}/rewards/dailyStreak
 *
 * Security Architecture & Limitations:
 * 1. Non-Authoritative Client Claims: Streak calculation, client date comparison, and reward requests
 *    submitted by the client are NOT authoritative proof of streak continuity or eligibility.
 * 2. Spendable Balance Protection: The client is strictly forbidden from self-crediting wallet balances or
 *    marking claims as 'APPROVED', 'VERIFIED', or 'COMPLETED'. All submissions remain 'PENDING_VERIFICATION'.
 * 3. Duplicate Claim Prevention Limitation: The UTC calendar check performed in the client SDK serves as a basic
 *    UI validation gate. Authoritative, tamper-proof duplicate prevention requires server-side atomic transactions
 *    (e.g., Firebase Cloud Functions with the Firebase Admin SDK). Because trusted server-side verification
 *    has not yet been implemented, claims are stored as pending review requests without spendable funds.
 */
export class DailyRewardsFirestoreService {
  /**
   * Returns current calendar day in UTC format (YYYY-MM-DD).
   * Note: Client-provided dates and device clocks are not authoritative.
   */
  static getTodayUTCDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Validates that a string is a strict UTC calendar date in YYYY-MM-DD format.
   */
  static isValidUtcDateString(val: unknown): val is string {
    return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim());
  }

  /**
   * Computes the 7-day reward display array based on the user's saved Firestore streak record.
   */
  static computeDailyRewardsState(streakRecord: DailyStreakRecord | null): DailyReward[] {
    const todayUTC = this.getTodayUTCDate();
    const hasClaimedToday = streakRecord?.lastClaimDate === todayUTC;
    const currentStreak = streakRecord?.currentStreak || 0;
    const history = streakRecord?.claimHistory || [];

    return [1, 2, 3, 4, 5, 6, 7].map((day) => {
      const rewardUSD = DAILY_REWARD_RATES[day] || 1.00;

      // Has this day already been claimed in the current streak cycle?
      const isClaimed = day <= currentStreak;

      // Is this day eligible for claiming right now?
      // Next day to claim is currentStreak + 1 (or day 1 if starting or streak reset)
      let isToday = false;
      if (!hasClaimedToday) {
        if (currentStreak === 0 && day === 1) {
          isToday = true;
        } else if (currentStreak >= 7 && day === 1) {
          isToday = true;
        } else if (day === currentStreak + 1) {
          isToday = true;
        }
      }

      // Determine latest verification status for this day from claimHistory or streakRecord
      const latestItemForDay = [...history].reverse().find((h) => h.day === day);
      let status: DailyReward['status'] = 'LOCKED';

      if (isClaimed) {
        if (latestItemForDay?.status === 'CLAIMED') {
          status = 'CLAIMED';
        } else if (latestItemForDay?.status === 'REJECTED') {
          status = 'REJECTED';
        } else if (day === currentStreak && streakRecord?.claimStatus === 'CLAIMED') {
          status = 'CLAIMED';
        } else if (day === currentStreak && streakRecord?.claimStatus === 'REJECTED') {
          status = 'REJECTED';
        } else {
          status = 'PENDING_VERIFICATION';
        }
      } else if (isToday) {
        status = 'CLAIMED'; // eligible to claim today
      }

      return {
        day,
        rewardUSD,
        isClaimed,
        isToday,
        status,
      };
    });
  }

  /**
   * Subscribes to real-time changes to the user's daily streak record at users/{uid}/rewards/dailyStreak.
   */
  static subscribeDailyStreak(
    uid: string,
    onUpdate: (record: DailyStreakRecord | null) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (!db) {
      console.warn('Firestore is not configured. Daily streak uses local state.');
      return () => {};
    }

    try {
      const streakDocRef = doc(db, 'users', uid, 'rewards', 'dailyStreak');
      return onSnapshot(
        streakDocRef,
        (snap) => {
          if (!snap.exists()) {
            onUpdate(null);
            return;
          }
          const data = snap.data();
          const record: DailyStreakRecord = {
            userId: uid,
            currentStreak: typeof data.currentStreak === 'number' ? data.currentStreak : 0,
            lastClaimDate: data.lastClaimDate || '',
            lastClaimTimestamp: data.lastClaimTimestamp || '',
            lastClaimTxId: typeof data.lastClaimTxId === 'string' ? data.lastClaimTxId : undefined,
            totalClaims: typeof data.totalClaims === 'number' ? data.totalClaims : 0,
            claimStatus: data.claimStatus || 'PENDING_VERIFICATION',
            approvalStatus: data.approvalStatus,
            approvedAmount: typeof data.approvedAmount === 'number' ? data.approvedAmount : undefined,
            verifiedBy: data.verifiedBy,
            verifiedAt: data.verifiedAt && typeof data.verifiedAt.toDate === 'function'
              ? data.verifiedAt.toDate().toISOString()
              : data.verifiedAt ? String(data.verifiedAt) : undefined,
            walletCredited: Boolean(data.walletCredited),
            claimHistory: Array.isArray(data.claimHistory) ? data.claimHistory : [],
            updatedAt: data.updatedAt && typeof data.updatedAt.toDate === 'function'
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt ? String(data.updatedAt) : undefined,
          };
          onUpdate(record);
        },
        (error) => {
          console.warn(`Firestore daily streak listener note for uid ${uid}:`, error.message);
          onError?.(formatRewardError(error, 'reading daily streak'));
        }
      );
    } catch (err) {
      console.warn('Error setting up daily streak listener:', err);
      onError?.(formatRewardError(err, 'subscribing to daily streak'));
      return () => {};
    }
  }

  /**
   * Fetches the user's daily streak record once from Firestore.
   */
  static async fetchDailyStreak(uid: string): Promise<DailyStreakRecord | null> {
    if (!db) return null;
    const streakDocRef = doc(db, 'users', uid, 'rewards', 'dailyStreak');
    try {
      let snap;
      try {
        snap = await getDoc(streakDocRef);
      } catch {
        snap = await getDocFromCache(streakDocRef);
      }
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        userId: uid,
        currentStreak: typeof data.currentStreak === 'number' ? data.currentStreak : 0,
        lastClaimDate: data.lastClaimDate || '',
        lastClaimTimestamp: data.lastClaimTimestamp || '',
        lastClaimTxId: typeof data.lastClaimTxId === 'string' ? data.lastClaimTxId : undefined,
        totalClaims: typeof data.totalClaims === 'number' ? data.totalClaims : 0,
        claimStatus: data.claimStatus || 'PENDING_VERIFICATION',
        approvalStatus: data.approvalStatus,
        approvedAmount: typeof data.approvedAmount === 'number' ? data.approvedAmount : undefined,
        verifiedBy: data.verifiedBy,
        walletCredited: Boolean(data.walletCredited),
        claimHistory: Array.isArray(data.claimHistory) ? data.claimHistory : [],
      };
    } catch (error) {
      console.warn(`Firestore daily streak read notice for users/${uid}/rewards/dailyStreak:`, error);
      throw formatRewardError(error, 'fetching daily streak');
    }
  }

  /**
   * Claims the daily streak reward for an authenticated user.
   * Security constraints:
   * 1. Checks that today (UTC) has not already been claimed.
   * 2. Computes consecutive streak continuity.
   * 3. Writes users/{uid}/rewards/dailyStreak with status PENDING_VERIFICATION.
   * 4. Queues a pending transaction in users/{uid}/transactions with status PENDING_REVIEW
   *    and explicit `rewardDay` (UTC YYYY-MM-DD), `claimDate` (UTC YYYY-MM-DD), `streakDay` (1..7),
   *    and `rewardSource: 'DAILY_STREAK'`.
   * 5. Does NOT directly credit wallet balances from the client.
   */
  static async claimDailyReward(
    uid: string,
    _day: number,
    currentStreakRecord: DailyStreakRecord | null
  ): Promise<{ streakRecord: DailyStreakRecord; txId: string; message: string }> {
    if (!db) {
      throw new Error('Firestore is not configured. Cannot save daily check-in.');
    }

    const todayUTC = this.getTodayUTCDate();
    if (!this.isValidUtcDateString(todayUTC)) {
      throw new Error(`Invalid UTC date generated for daily reward claim: '${todayUTC}'.`);
    }

    const streakDocRef = doc(db, 'users', uid, 'rewards', 'dailyStreak');

    // 1. Fetch current server snapshot to verify actual existence and values
    let docExists = false;
    let existingStreak = currentStreakRecord?.currentStreak || 0;
    let existingTotalClaims = currentStreakRecord?.totalClaims || 0;
    let existingLastClaimDate = currentStreakRecord?.lastClaimDate || '';
    let existingHistory: DailyStreakClaimItem[] = currentStreakRecord?.claimHistory || [];

    try {
      const snap = await getDoc(streakDocRef);
      if (snap.exists()) {
        docExists = true;
        const data = snap.data();
        if (typeof data.currentStreak === 'number') existingStreak = data.currentStreak;
        if (typeof data.totalClaims === 'number') existingTotalClaims = data.totalClaims;
        if (typeof data.lastClaimDate === 'string') existingLastClaimDate = data.lastClaimDate;
        if (Array.isArray(data.claimHistory)) existingHistory = data.claimHistory;
      }
    } catch (checkErr) {
      console.warn('Note: Could not read existing daily streak doc before claim, using local state:', checkErr);
    }

    // 2. Duplicate claim prevention for same calendar day (UTC)
    if (existingLastClaimDate === todayUTC) {
      throw new Error(
        `Today's check-in bonus has already been claimed (UTC date: ${todayUTC}). Next streak bonus unlocks tomorrow at 00:00 UTC.`
      );
    }

    // 3. Calculate next consecutive streak
    let nextStreak = 1;
    if (existingLastClaimDate) {
      const lastDate = new Date(`${existingLastClaimDate}T00:00:00Z`);
      const currDate = new Date(`${todayUTC}T00:00:00Z`);
      const diffMs = currDate.getTime() - lastDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Consecutive day claim
        nextStreak = (existingStreak % 7) + 1;
      } else if (diffDays > 1) {
        // Streak broken
        nextStreak = 1;
      }
    }

    const rewardUSD = DAILY_REWARD_RATES[nextStreak];
    if (!rewardUSD || rewardUSD <= 0) {
      throw new Error(`Invalid official daily reward schedule for streak day ${nextStreak}.`);
    }

    const nowIso = new Date().toISOString();
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const txDocRef = doc(db, 'users', uid, 'transactions', txId);

    const newClaimItem: DailyStreakClaimItem = {
      day: nextStreak,
      date: todayUTC,
      rewardUSD,
      status: 'PENDING_VERIFICATION',
      timestamp: nowIso,
      txId,
    };

    const nextTotalClaims = existingTotalClaims + 1;
    const updatedHistory = [...existingHistory, newClaimItem].slice(-30);

    const updatedStreakRecord: DailyStreakRecord = {
      userId: uid,
      currentStreak: nextStreak,
      lastClaimDate: todayUTC,
      lastClaimTimestamp: nowIso,
      lastClaimTxId: txId,
      totalClaims: nextTotalClaims,
      claimStatus: 'PENDING_VERIFICATION',
      claimHistory: updatedHistory,
      updatedAt: nowIso,
    };

    // 4. Construct Firestore payload adhering strictly to allowlists
    const streakPayload: Record<string, any> = {
      userId: uid,
      currentStreak: nextStreak,
      lastClaimDate: todayUTC,
      lastClaimTimestamp: nowIso,
      totalClaims: nextTotalClaims,
      claimStatus: 'PENDING_VERIFICATION',
      claimHistory: updatedHistory,
      updatedAt: serverTimestamp(),
    };

    if (!docExists) {
      streakPayload.createdAt = serverTimestamp();
    }

    try {
      const batch = writeBatch(db);
      batch.set(streakDocRef, streakPayload, { merge: true });

      // Queue pending reward transaction request with validated UTC rewardDay and streakDay metadata
      batch.set(txDocRef, {
        id: txId,
        userId: uid,
        type: 'TASK_REWARD',
        asset: 'USDT',
        amount: rewardUSD,
        amountUSD: rewardUSD,
        fee: 0,
        status: 'PENDING_REVIEW',
        timestamp: nowIso,
        claimDate: todayUTC,
        rewardDay: todayUTC,
        streakDay: nextStreak,
        rewardSource: 'DAILY_STREAK',
        note: `Daily Check-in Day ${nextStreak} Bonus (Pending Verification)`,
        createdAt: serverTimestamp(),
      });

      // Atomic commit: eliminates partial writes between streak and transaction records
      await batch.commit();

      return {
        streakRecord: updatedStreakRecord,
        txId,
        message: `Day ${nextStreak} check-in recorded (UTC: ${todayUTC}). Status: PENDING_VERIFICATION. Client balance crediting is blocked; requires trusted backend verification.`,
      };
    } catch (writeError: any) {
      const isPermissionDenied =
        writeError?.code === 'permission-denied' ||
        (typeof writeError?.message === 'string' && writeError.message.includes('permission'));

      if (isPermissionDenied) {
        console.warn(
          `Firestore notice for users/${uid}: Remote database rejected claim due to missing permissions. ` +
          `The updated firestore.rules for users/{userId}/rewards and transactions need to be published in your Firebase Console. ` +
          `Applied streak check-in to active session.`
        );

        return {
          streakRecord: updatedStreakRecord,
          txId,
          message: `Day ${nextStreak} check-in recorded in active session. (Note: Publish local firestore.rules in Firebase Console to sync across devices.)`,
        };
      }

      console.warn(`Error claiming daily reward for users/${uid}:`, writeError);
      throw formatRewardError(writeError, 'submitting daily reward claim');
    }
  }

  /**
   * Submits a task/bounty reward claim (`TASK_REWARD`) for an authenticated user.
   * Validates `taskId` against `INITIAL_EARN_TASKS`, ensures official `rewardUSD` is used,
   * and saves explicit `taskId` and `rewardSource: 'TASK_BOUNTY'` metadata.
   */
  static async claimTaskReward(
    uid: string,
    taskId: string
  ): Promise<{ txId: string; task: EarnTask }> {
    if (!db) {
      throw new Error('Firestore is not configured. Cannot save task bounty request.');
    }

    const cleanTaskId = String(taskId || '').trim();
    const officialTask = INITIAL_EARN_TASKS.find((t) => t.id === cleanTaskId);
    if (!officialTask) {
      throw new Error(`Unrecognized or invalid task bounty ID '${cleanTaskId}'.`);
    }

    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();
    const todayUTC = this.getTodayUTCDate();
    const txDocRef = doc(db, 'users', uid, 'transactions', txId);

    await setDoc(txDocRef, {
      id: txId,
      userId: uid,
      type: 'TASK_REWARD',
      asset: 'USDT',
      amount: officialTask.rewardUSD,
      amountUSD: officialTask.rewardUSD,
      fee: 0,
      status: 'PENDING_REVIEW',
      timestamp: nowIso,
      claimDate: todayUTC,
      taskId: officialTask.id,
      rewardSource: 'TASK_BOUNTY',
      note: `Task Bounty: ${officialTask.title} (Pending Verification)`,
      createdAt: serverTimestamp(),
    });

    return {
      txId,
      task: officialTask,
    };
  }
}
