import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  FirestoreError,
} from 'firebase/firestore';
import { MiningPlan, MiningSession } from '../types';
import { db } from './firebase';

export const MINING_PLANS: MiningPlan[] = [
  {
    id: 'plan_starter_sha256',
    name: 'Antminer S21 Pro Cloud',
    tier: 'Starter',
    algorithm: 'SHA-256',
    targetCoin: 'BTC',
    hashrate: 65,
    hashrateUnit: 'TH/s',
    priceUSD: 149.00,
    durationDays: 30,
    estimatedDailyYieldCoin: 0.000084,
    estimatedDailyYieldUSD: 7.92,
    powerConsumptionW: 980,
    maintenanceFeePercent: 8,
  },
  {
    id: 'plan_pro_sha256',
    name: 'WhatsMiner M60S+ Turbo',
    tier: 'Pro',
    algorithm: 'SHA-256',
    targetCoin: 'BTC',
    hashrate: 190,
    hashrateUnit: 'TH/s',
    priceUSD: 399.00,
    durationDays: 60,
    estimatedDailyYieldCoin: 0.000258,
    estimatedDailyYieldUSD: 24.31,
    powerConsumptionW: 2450,
    maintenanceFeePercent: 6,
    popular: true,
  },
  {
    id: 'plan_scrypt_ltc_doge',
    name: 'Antminer L9 Dual Scrypt',
    tier: 'Pro',
    algorithm: 'Scrypt AuxPoW',
    targetCoin: 'LTC',
    hashrate: 16.5,
    hashrateUnit: 'GH/s',
    priceUSD: 320.00,
    durationDays: 45,
    estimatedDailyYieldCoin: 0.185,
    estimatedDailyYieldUSD: 20.86,
    powerConsumptionW: 3360,
    maintenanceFeePercent: 7,
  },
  {
    id: 'plan_enterprise_sha256',
    name: 'Nexora Hydro Cluster X',
    tier: 'Enterprise',
    algorithm: 'SHA-256',
    targetCoin: 'BTC',
    hashrate: 680,
    hashrateUnit: 'TH/s',
    priceUSD: 1250.00,
    durationDays: 90,
    estimatedDailyYieldCoin: 0.000962,
    estimatedDailyYieldUSD: 90.66,
    powerConsumptionW: 7800,
    maintenanceFeePercent: 4.5,
  }
];

export const INITIAL_MINING_SESSION: MiningSession = {
  id: 'session-live-01',
  algorithm: 'SHA-256 (BTC)',
  targetCoin: 'BTC',
  hashrateTHs: 124.8,
  efficiencyWTH: 16.2,
  temperatureC: 58.4,
  uptimeSeconds: 74210,
  status: 'ACTIVE',
  startedAt: new Date(Date.now() - 74210 * 1000).toISOString(),
  todayEstimatedRewardCoin: 0.000162,
  todayEstimatedRewardUSD: 15.26,
  confirmedRewardCoin: 0.001420,
  poolName: 'Nexora Global Stratum - FRA01',
  acceptedShares: 4982,
  rejectedShares: 8,
  hardwareProfile: 'Balanced',
  isSimulated: true,
};

function formatMiningError(error: unknown, action: string): Error {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as FirestoreError).code;
    if (code === 'permission-denied') {
      return new Error(
        `Cloud Firestore permission denied during ${action}. ` +
        `Ensure firestore.rules with users/{userId}/mining/session have been deployed to your Firebase project.`
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
 * Service for persisting and streaming the authenticated user's mining session in Firestore.
 * Path: users/{uid}/mining/session
 */
export class MiningFirestoreService {
  /**
   * Subscribes to real-time changes to the user's mining session document.
   * Path: users/{uid}/mining/session
   */
  static subscribeUserMiningSession(
    uid: string,
    onUpdate: (session: MiningSession) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (!db) {
      console.warn('Firestore is not configured. Mining session uses local state.');
      return () => {};
    }

    try {
      const sessionDocRef = doc(db, 'users', uid, 'mining', 'session');
      return onSnapshot(
        sessionDocRef,
        async (docSnap) => {
          if (!docSnap.exists()) {
            // Document does not exist yet for this user: initialize default session in Firestore
            try {
              const defaultSessionData: Omit<MiningSession, 'updatedAt'> = {
                userId: uid,
                id: `sess_${Date.now()}`,
                algorithm: 'SHA-256 (BTC)',
                targetCoin: 'BTC',
                hashrateTHs: 0.0,
                efficiencyWTH: 16.2,
                temperatureC: 45.0,
                uptimeSeconds: 0,
                status: 'IDLE',
                startedAt: null,
                todayEstimatedRewardCoin: 0.0,
                todayEstimatedRewardUSD: 0.0,
                confirmedRewardCoin: 0.0,
                poolName: 'Nexora Global Stratum - FRA01',
                acceptedShares: 0,
                rejectedShares: 0,
                hardwareProfile: 'Balanced',
                planId: 'plan_starter_sha256',
                lastSessionId: `sess_${Date.now()}`,
                isSimulated: true,
              };
              await setDoc(sessionDocRef, {
                ...defaultSessionData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              onUpdate({
                ...defaultSessionData,
                updatedAt: new Date().toISOString(),
              });
            } catch (initErr) {
              console.warn('Could not auto-initialize mining session document:', initErr);
            }
            return;
          }

          const data = docSnap.data();
          const validAlgorithms = ['SHA-256 (BTC)', 'Ethash (ETC)', 'Scrypt (LTC/DOGE)'] as const;
          const algorithm = validAlgorithms.includes(data.algorithm) ? data.algorithm : 'SHA-256 (BTC)';
          const validCoins = ['BTC', 'ETC', 'LTC'] as const;
          const targetCoin = validCoins.includes(data.targetCoin) ? data.targetCoin : 'BTC';
          const validProfiles = ['Eco', 'Balanced', 'Turbo Overclock'] as const;
          const hardwareProfile = validProfiles.includes(data.hardwareProfile) ? data.hardwareProfile : 'Balanced';
          const validStatuses = ['IDLE', 'ACTIVE', 'PAUSED', 'MAINTENANCE'] as const;
          const status = validStatuses.includes(data.status) ? data.status : 'IDLE';

          const session: MiningSession = {
            id: data.id || 'session-live',
            userId: uid,
            algorithm,
            targetCoin,
            hashrateTHs: typeof data.hashrateTHs === 'number' ? data.hashrateTHs : 0,
            efficiencyWTH: typeof data.efficiencyWTH === 'number' ? data.efficiencyWTH : 16.2,
            temperatureC: typeof data.temperatureC === 'number' ? data.temperatureC : 52.0,
            uptimeSeconds: typeof data.uptimeSeconds === 'number' ? data.uptimeSeconds : 0,
            status,
            startedAt: data.startedAt || null,
            todayEstimatedRewardCoin: typeof data.todayEstimatedRewardCoin === 'number' ? data.todayEstimatedRewardCoin : 0,
            todayEstimatedRewardUSD: typeof data.todayEstimatedRewardUSD === 'number' ? data.todayEstimatedRewardUSD : 0,
            confirmedRewardCoin: typeof data.confirmedRewardCoin === 'number' ? data.confirmedRewardCoin : 0,
            poolName: data.poolName || 'Nexora Global Stratum - FRA01',
            acceptedShares: typeof data.acceptedShares === 'number' ? data.acceptedShares : 0,
            rejectedShares: typeof data.rejectedShares === 'number' ? data.rejectedShares : 0,
            hardwareProfile,
            planId: data.planId,
            lastSessionId: data.lastSessionId,
            updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
            isSimulated: true,
          };
          onUpdate(session);
        },
        (error) => {
          console.warn(`Firestore mining session listener note for uid ${uid}:`, error.message);
          onError?.(formatMiningError(error, 'reading mining session'));
        }
      );
    } catch (err) {
      console.warn('Error setting up mining session listener:', err);
      onError?.(formatMiningError(err, 'subscribing to mining session'));
      return () => {};
    }
  }

  /**
   * Fetches user's current mining session once from Firestore.
   */
  static async fetchUserMiningSession(uid: string): Promise<MiningSession | null> {
    if (!db) return null;
    try {
      const sessionDocRef = doc(db, 'users', uid, 'mining', 'session');
      const snap = await getDoc(sessionDocRef);
      if (!snap.exists()) return null;
      const data = snap.data();
      const validAlgorithms = ['SHA-256 (BTC)', 'Ethash (ETC)', 'Scrypt (LTC/DOGE)'] as const;
      const algorithm = validAlgorithms.includes(data.algorithm) ? data.algorithm : 'SHA-256 (BTC)';
      const validCoins = ['BTC', 'ETC', 'LTC'] as const;
      const targetCoin = validCoins.includes(data.targetCoin) ? data.targetCoin : 'BTC';
      const validProfiles = ['Eco', 'Balanced', 'Turbo Overclock'] as const;
      const hardwareProfile = validProfiles.includes(data.hardwareProfile) ? data.hardwareProfile : 'Balanced';
      const validStatuses = ['IDLE', 'ACTIVE', 'PAUSED', 'MAINTENANCE'] as const;
      const status = validStatuses.includes(data.status) ? data.status : 'IDLE';

      return {
        id: data.id || 'session-live',
        userId: uid,
        algorithm,
        targetCoin,
        hashrateTHs: typeof data.hashrateTHs === 'number' ? data.hashrateTHs : 0,
        efficiencyWTH: typeof data.efficiencyWTH === 'number' ? data.efficiencyWTH : 16.2,
        temperatureC: typeof data.temperatureC === 'number' ? data.temperatureC : 52.0,
        uptimeSeconds: typeof data.uptimeSeconds === 'number' ? data.uptimeSeconds : 0,
        status,
        startedAt: data.startedAt || null,
        todayEstimatedRewardCoin: typeof data.todayEstimatedRewardCoin === 'number' ? data.todayEstimatedRewardCoin : 0,
        todayEstimatedRewardUSD: typeof data.todayEstimatedRewardUSD === 'number' ? data.todayEstimatedRewardUSD : 0,
        confirmedRewardCoin: typeof data.confirmedRewardCoin === 'number' ? data.confirmedRewardCoin : 0,
        poolName: data.poolName || 'Nexora Global Stratum - FRA01',
        acceptedShares: typeof data.acceptedShares === 'number' ? data.acceptedShares : 0,
        rejectedShares: typeof data.rejectedShares === 'number' ? data.rejectedShares : 0,
        hardwareProfile,
        planId: data.planId,
        lastSessionId: data.lastSessionId,
        isSimulated: true,
      };
    } catch (error) {
      console.error(`Error reading users/${uid}/mining/session:`, error);
      throw formatMiningError(error, 'fetching mining session');
    }
  }

  /**
   * Starts or pauses the mining session in Firestore.
   */
  static async toggleMiningSession(
    uid: string,
    currentSession: MiningSession
  ): Promise<MiningSession> {
    if (!db) {
      throw new Error('Firestore is not configured. Mining session state is offline.');
    }

    const sessionDocRef = doc(db, 'users', uid, 'mining', 'session');
    const isCurrentlyActive = currentSession.status === 'ACTIVE';

    const newStatus = isCurrentlyActive ? 'PAUSED' : 'ACTIVE';
    const nowIso = new Date().toISOString();
    const sessionId = isCurrentlyActive ? (currentSession.lastSessionId || `sess_${Date.now()}`) : `sess_${Date.now()}`;

    // Base hashrate depends on hardware profile if turning active
    let targetHashrate = currentSession.hashrateTHs;
    if (!isCurrentlyActive && targetHashrate <= 0) {
      targetHashrate = currentSession.hardwareProfile === 'Eco' ? 106.0 : currentSession.hardwareProfile === 'Turbo Overclock' ? 156.0 : 124.8;
    }

    const updates = {
      userId: uid,
      status: newStatus,
      hashrateTHs: targetHashrate,
      startedAt: !isCurrentlyActive ? nowIso : currentSession.startedAt,
      lastSessionId: sessionId,
      temperatureC: !isCurrentlyActive ? 58.4 : 45.0,
      updatedAt: serverTimestamp(),
      isSimulated: true,
    };

    try {
      await setDoc(sessionDocRef, updates, { merge: true });
      return {
        ...currentSession,
        status: newStatus,
        hashrateTHs: targetHashrate,
        startedAt: updates.startedAt,
        lastSessionId: sessionId,
        temperatureC: updates.temperatureC,
        updatedAt: nowIso,
      };
    } catch (error) {
      console.error(`Error updating users/${uid}/mining/session:`, error);
      throw formatMiningError(error, 'toggling mining session');
    }
  }

  /**
   * Updates hardware tuning profile in Firestore.
   */
  static async updateHardwareProfile(
    uid: string,
    profile: 'Eco' | 'Balanced' | 'Turbo Overclock',
    currentSession: MiningSession
  ): Promise<void> {
    if (!db) return;

    let multiplier = 1.0;
    let power = 16.2;
    if (profile === 'Eco') {
      multiplier = 0.85;
      power = 13.8;
    } else if (profile === 'Turbo Overclock') {
      multiplier = 1.25;
      power = 19.5;
    }

    const newHashrate = Number((124.8 * multiplier).toFixed(1));
    const sessionDocRef = doc(db, 'users', uid, 'mining', 'session');

    try {
      await setDoc(
        sessionDocRef,
        {
          userId: uid,
          hardwareProfile: profile,
          hashrateTHs: newHashrate,
          efficiencyWTH: power,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error(`Error updating hardware profile for users/${uid}/mining/session:`, error);
      throw formatMiningError(error, 'updating hardware profile');
    }
  }
}
