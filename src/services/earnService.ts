import {
  doc,
  getDoc,
  setDoc,
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
   * Computes the 7-day reward display array based on the user's saved Firestore streak record.
   */
  static computeDailyRewardsState(streakRecord: DailyStreakRecord | null): DailyReward[] {
    const todayUTC = this.getTodayUTCDate();
    const hasClaimedToday = streakRecord?.lastClaimDate === todayUTC;
    const currentStreak = streakRecord?.currentStreak || 0;

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

      const status: DailyReward['status'] = isClaimed
        ? 'PENDING_VERIFICATION'
        : isToday
        ? 'CLAIMED' // eligible
        : 'LOCKED';

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
            totalClaims: typeof data.totalClaims === 'number' ? data.totalClaims : 0,
            claimStatus: data.claimStatus || 'PENDING_VERIFICATION',
            claimHistory: Array.isArray(data.claimHistory) ? data.claimHistory : [],
            updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
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
    try {
      const streakDocRef = doc(db, 'users', uid, 'rewards', 'dailyStreak');
      const snap = await getDoc(streakDocRef);
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        userId: uid,
        currentStreak: typeof data.currentStreak === 'number' ? data.currentStreak : 0,
        lastClaimDate: data.lastClaimDate || '',
        lastClaimTimestamp: data.lastClaimTimestamp || '',
        totalClaims: typeof data.totalClaims === 'number' ? data.totalClaims : 0,
        claimStatus: data.claimStatus || 'PENDING_VERIFICATION',
        claimHistory: Array.isArray(data.claimHistory) ? data.claimHistory : [],
      };
    } catch (error) {
      console.error(`Error reading users/${uid}/rewards/dailyStreak:`, error);
      throw formatRewardError(error, 'fetching daily streak');
    }
  }

  /**
   * Claims the daily streak reward for an authenticated user.
   * Security constraints:
   * 1. Checks that today (UTC) has not already been claimed.
   * 2. Computes consecutive streak continuity.
   * 3. Writes users/{uid}/rewards/dailyStreak with status PENDING_VERIFICATION.
   * 4. Queues a pending transaction in users/{uid}/transactions with status PENDING_REVIEW.
   * 5. Does NOT directly credit wallet balances from the client.
   */
  static async claimDailyReward(
    uid: string,
    day: number,
    currentStreakRecord: DailyStreakRecord | null
  ): Promise<{ streakRecord: DailyStreakRecord; txId: string; message: string }> {
    if (!db) {
      throw new Error('Firestore is not configured. Cannot save daily check-in.');
    }

    const todayUTC = this.getTodayUTCDate();

    // 1. Duplicate claim prevention for same calendar day (UTC)
    if (currentStreakRecord?.lastClaimDate === todayUTC) {
      throw new Error(
        `Today's check-in bonus has already been claimed (UTC date: ${todayUTC}). Next streak bonus unlocks tomorrow at 00:00 UTC.`
      );
    }

    // 2. Calculate next consecutive streak
    let nextStreak = 1;
    if (currentStreakRecord?.lastClaimDate) {
      const lastDate = new Date(`${currentStreakRecord.lastClaimDate}T00:00:00Z`);
      const currDate = new Date(`${todayUTC}T00:00:00Z`);
      const diffMs = currDate.getTime() - lastDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Consecutive day
        nextStreak = (currentStreakRecord.currentStreak % 7) + 1;
      } else if (diffDays > 1) {
        // Streak broken
        nextStreak = 1;
      } else {
        // Same day or invalid
        throw new Error('Claim date timestamp anomaly detected. Please verify your device clock.');
      }
    }

    const rewardUSD = DAILY_REWARD_RATES[nextStreak] || 1.00;
    const nowIso = new Date().toISOString();

    const newClaimItem: DailyStreakClaimItem = {
      day: nextStreak,
      date: todayUTC,
      rewardUSD,
      status: 'PENDING_VERIFICATION',
      timestamp: nowIso,
    };

    const updatedStreakRecord: DailyStreakRecord = {
      userId: uid,
      currentStreak: nextStreak,
      lastClaimDate: todayUTC,
      lastClaimTimestamp: nowIso,
      totalClaims: (currentStreakRecord?.totalClaims || 0) + 1,
      claimStatus: 'PENDING_VERIFICATION',
      claimHistory: [
        ...(currentStreakRecord?.claimHistory || []),
        newClaimItem,
      ].slice(-30),
      updatedAt: nowIso,
    };

    const streakDocRef = doc(db, 'users', uid, 'rewards', 'dailyStreak');
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const txDocRef = doc(db, 'users', uid, 'transactions', txId);

    try {
      // 1. Update dailyStreak document
      await setDoc(streakDocRef, {
        userId: uid,
        currentStreak: updatedStreakRecord.currentStreak,
        lastClaimDate: updatedStreakRecord.lastClaimDate,
        lastClaimTimestamp: updatedStreakRecord.lastClaimTimestamp,
        totalClaims: updatedStreakRecord.totalClaims,
        claimStatus: 'PENDING_VERIFICATION',
        claimHistory: updatedStreakRecord.claimHistory,
        updatedAt: serverTimestamp(),
      });

      // 2. Queue pending reward transaction
      await setDoc(txDocRef, {
        id: txId,
        userId: uid,
        type: 'TASK_REWARD',
        asset: 'USDT',
        amount: rewardUSD,
        amountUSD: rewardUSD,
        fee: 0,
        status: 'PENDING_REVIEW',
        timestamp: nowIso,
        note: `Daily Check-in Day ${nextStreak} Bonus (Pending Verification)`,
        createdAt: serverTimestamp(),
      });

      return {
        streakRecord: updatedStreakRecord,
        txId,
        message: `Day ${nextStreak} check-in recorded. Status: PENDING_VERIFICATION. Client balance crediting is blocked; requires trusted backend verification.`,
      };
    } catch (error) {
      console.error(`Error claiming daily reward for users/${uid}:`, error);
      throw formatRewardError(error, 'submitting daily reward claim');
    }
  }
}
