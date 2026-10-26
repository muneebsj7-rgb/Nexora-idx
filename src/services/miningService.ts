import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  setDoc,
  onSnapshot,
  serverTimestamp,
  FirestoreError,
} from 'firebase/firestore';
import { ContractStatus, MiningContract, MiningPlan, MiningSession, Transaction } from '../types';
import { auth, db, isExpectedOfflineError, sanitizeDiagnosticMessage } from './firebase';
import {
  AUTHORITATIVE_MINING_PLANS,
  convertGHsToMHs,
  convertHashrateToGHs,
  convertHashrateToTHs,
  convertTHsToGHs,
} from './settlementEngine';

export {
  AUTHORITATIVE_MINING_PLANS,
  convertGHsToMHs,
  convertHashrateToGHs,
  convertHashrateToTHs,
  convertTHsToGHs,
};

/**
 * Single authoritative catalog of the 5 BTC Cloud Mining Plans shared between frontend and backend.
 */
export const MINING_PLANS: MiningPlan[] = [
  AUTHORITATIVE_MINING_PLANS.plan_genesis_shaft,
  AUTHORITATIVE_MINING_PLANS.plan_blockfoundry,
  AUTHORITATIVE_MINING_PLANS.plan_stratum_yard,
  AUTHORITATIVE_MINING_PLANS.plan_halving_bench,
  AUTHORITATIVE_MINING_PLANS.plan_epoch_vault,
];

/**
 * Computes the effective GH/s for a mining session, prioritizing active contracts or explicit hashrateGHs,
 * and falling back to converting hashrateTHs (1 TH/s = 1,000 GH/s).
 */
export function resolveSessionHashrateGHs(
  session: MiningSession,
  activeContracts: MiningContract[] = []
): number {
  const activeList = activeContracts.filter((c) => c.status === 'ACTIVE');
  if (activeList.length > 0) {
    const sumGHs = activeList.reduce((sum, c) => {
      if (typeof c.hashrateGHs === 'number' && c.hashrateGHs > 0) return sum + c.hashrateGHs;
      return sum + convertHashrateToGHs(c.hashrate, c.hashrateUnit);
    }, 0);
    if (sumGHs > 0) return Number(sumGHs.toFixed(2));
  }
  if (typeof session.hashrateGHs === 'number' && session.hashrateGHs > 0) {
    return Number(session.hashrateGHs.toFixed(2));
  }
  if (typeof session.hashrateTHs === 'number' && session.hashrateTHs > 0) {
    return convertTHsToGHs(session.hashrateTHs);
  }
  return 0;
}

export const INITIAL_MINING_SESSION: MiningSession = {
  id: 'session-live-01',
  algorithm: 'SHA-256 (BTC)',
  targetCoin: 'BTC',
  hashrateGHs: 34,
  hashrateTHs: 0.034,
  efficiencyWTH: 16.0,
  temperatureC: 58.4,
  uptimeSeconds: 74210,
  status: 'ACTIVE',
  startedAt: new Date(Date.now() - 74210 * 1000).toISOString(),
  todayEstimatedRewardCoin: 0.000022,
  todayEstimatedRewardUSD: 2.07,
  confirmedRewardCoin: 0.000154,
  poolName: 'Nexora Cloud Mining',
  acceptedShares: 4982,
  rejectedShares: 8,
  hardwareProfile: 'Balanced',
  planId: 'plan_stratum_yard',
  activeContractId: 'order_demo_stratum_01',
  activeContractName: 'Stratum Yard',
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
    return new Error(sanitizeDiagnosticMessage(error.message));
  }
  return new Error(`An unexpected error occurred during ${action}.`);
}

function formatContractTimestamp(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return String(val);
}

function resolveContractStatus(rawStatus: unknown, expiresIso: string): ContractStatus {
  const normalized = String(rawStatus || 'ACTIVE').toUpperCase();
  if (normalized === 'PENDING') return 'PENDING';
  if (normalized === 'CANCELLED') return 'CANCELLED';
  if (normalized === 'FAILED') return 'FAILED';
  if (normalized === 'COMPLETED' || normalized === 'EXPIRED') return 'COMPLETED';

  const expMs = new Date(expiresIso).getTime();
  if (Number.isFinite(expMs) && expMs <= Date.now()) {
    return 'COMPLETED';
  }
  return 'ACTIVE';
}

/**
 * Service for persisting and streaming the authenticated user's simulated mining session
 * and server-verified cloud mining contracts in Firestore.
 * Paths:
 * - users/{uid}/mining/session
 * - users/{uid}/contracts/{contractId}
 */
export class MiningFirestoreService {
  /**
   * Subscribes to real-time changes to the user's mining session document.
   * Path: users/{uid}/mining/session
   */
  static subscribeUserMiningSession(
    uid: string,
    onUpdate: (session: MiningSession, meta?: { fromCache: boolean }) => void,
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
        { includeMetadataChanges: true },
        async (docSnap) => {
          const fromCache = docSnap.metadata.fromCache;
          if (!docSnap.exists()) {
            // Do not overwrite server state if the snapshot is merely an empty local cache while offline
            if (fromCache) {
              return;
            }
            try {
              // Document does not exist on server yet: write ONLY harmless simulation preference fields to Firestore
              const simulationPreferences = {
                userId: uid,
                id: `sess_${Date.now()}`,
                algorithm: 'SHA-256 (BTC)' as const,
                targetCoin: 'BTC' as const,
                hashrateGHs: 0.0,
                hashrateTHs: 0.0,
                efficiencyWTH: 16.0,
                temperatureC: 45.0,
                status: 'IDLE' as const,
                startedAt: null,
                poolName: 'Nexora Cloud Mining',
                hardwareProfile: 'Balanced' as const,
                planId: 'plan_genesis_shaft',
                lastSessionId: `sess_${Date.now()}`,
                isSimulated: true,
              };

              await setDoc(sessionDocRef, {
                ...simulationPreferences,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });

              onUpdate(
                {
                  ...simulationPreferences,
                  uptimeSeconds: 0,
                  todayEstimatedRewardCoin: 0.0,
                  todayEstimatedRewardUSD: 0.0,
                  confirmedRewardCoin: 0.0,
                  acceptedShares: 0,
                  rejectedShares: 0,
                  updatedAt: new Date().toISOString(),
                },
                { fromCache: false }
              );
            } catch (initErr) {
              console.warn(
                'Could not auto-initialize mining session document:',
                sanitizeDiagnosticMessage((initErr as any)?.message)
              );
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

          const rawTHs = typeof data.hashrateTHs === 'number' ? data.hashrateTHs : 0;
          const rawGHs =
            typeof data.hashrateGHs === 'number'
              ? data.hashrateGHs
              : convertTHsToGHs(rawTHs);

          const session: MiningSession = {
            id: data.id || 'session-live',
            userId: uid,
            algorithm,
            targetCoin,
            hashrateGHs: rawGHs,
            hashrateTHs: rawTHs,
            efficiencyWTH: typeof data.efficiencyWTH === 'number' ? data.efficiencyWTH : 16.0,
            temperatureC: typeof data.temperatureC === 'number' ? data.temperatureC : 52.0,
            uptimeSeconds: typeof data.uptimeSeconds === 'number' ? data.uptimeSeconds : 0,
            status,
            startedAt: data.startedAt || null,
            todayEstimatedRewardCoin: typeof data.todayEstimatedRewardCoin === 'number' ? data.todayEstimatedRewardCoin : 0,
            todayEstimatedRewardUSD: typeof data.todayEstimatedRewardUSD === 'number' ? data.todayEstimatedRewardUSD : 0,
            confirmedRewardCoin: typeof data.confirmedRewardCoin === 'number' ? data.confirmedRewardCoin : 0,
            poolName: data.poolName || 'Nexora Cloud Mining',
            acceptedShares: typeof data.acceptedShares === 'number' ? data.acceptedShares : 0,
            rejectedShares: typeof data.rejectedShares === 'number' ? data.rejectedShares : 0,
            hardwareProfile,
            planId: data.planId,
            activeContractId: data.activeContractId,
            activeContractName: data.activeContractName,
            lastSessionId: data.lastSessionId,
            updatedAt:
              data.updatedAt && typeof data.updatedAt.toDate === 'function'
                ? data.updatedAt.toDate().toISOString()
                : data.updatedAt
                ? String(data.updatedAt)
                : undefined,
            isSimulated: true,
          };
          onUpdate(session, { fromCache });
        },
        (error) => {
          console.warn(
            `Firestore mining session listener note for uid ${uid}:`,
            sanitizeDiagnosticMessage(error.message)
          );
          onError?.(formatMiningError(error, 'reading mining session'));
        }
      );
    } catch (err) {
      console.warn('Error setting up mining session listener:', sanitizeDiagnosticMessage((err as any)?.message));
      onError?.(formatMiningError(err, 'subscribing to mining session'));
      return () => {};
    }
  }

  /**
   * Subscribes to the user's server-settled cloud mining contracts at users/{uid}/contracts.
   */
  static subscribeUserContracts(
    uid: string,
    onUpdate: (contracts: MiningContract[], meta?: { fromCache: boolean }) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (!db) {
      return () => {};
    }

    try {
      const contractsColRef = collection(db, 'users', uid, 'contracts');
      return onSnapshot(
        contractsColRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          const contracts: MiningContract[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const matchedPlan = AUTHORITATIVE_MINING_PLANS[String(data.planId || '')];
            const hashrate = typeof data.hashrate === 'number' ? data.hashrate : matchedPlan?.hashrate || 0;
            const hashrateUnit = (data.hashrateUnit as 'TH/s' | 'GH/s' | 'MH/s') || matchedPlan?.hashrateUnit || 'GH/s';
            const hashrateGHs =
              typeof data.hashrateGHs === 'number'
                ? data.hashrateGHs
                : convertHashrateToGHs(hashrate, hashrateUnit);
            const hashrateTHs =
              typeof data.hashrateTHs === 'number'
                ? data.hashrateTHs
                : convertHashrateToTHs(hashrate, hashrateUnit);
            const purchasedAt = formatContractTimestamp(data.purchasedAt);
            const expiresAt = formatContractTimestamp(data.expiresAt);

            contracts.push({
              id: docSnap.id,
              orderId: data.orderId || docSnap.id,
              userId: data.userId || uid,
              planId: data.planId || 'plan_genesis_shaft',
              planName: data.planName || matchedPlan?.name || 'Cloud Hashrate Contract',
              tier: data.tier || matchedPlan?.tier || 'Entry',
              algorithm: data.algorithm || 'SHA-256',
              targetCoin: data.targetCoin || 'BTC',
              hashrate,
              hashrateUnit,
              hashrateGHs,
              hashrateTHs,
              priceUSD: typeof data.priceUSD === 'number' ? data.priceUSD : matchedPlan?.priceUSD || 0,
              asset: 'USDT',
              durationDays: typeof data.durationDays === 'number' ? data.durationDays : matchedPlan?.durationDays || 45,
              displayedReturnPercent:
                typeof data.displayedReturnPercent === 'number'
                  ? data.displayedReturnPercent
                  : matchedPlan?.displayedReturnPercent,
              estimatedDailyYieldCoin:
                typeof data.estimatedDailyYieldCoin === 'number'
                  ? data.estimatedDailyYieldCoin
                  : matchedPlan?.estimatedDailyYieldCoin || 0,
              estimatedDailyYieldUSD:
                typeof data.estimatedDailyYieldUSD === 'number'
                  ? data.estimatedDailyYieldUSD
                  : matchedPlan?.estimatedDailyYieldUSD || 0,
              powerConsumptionW: typeof data.powerConsumptionW === 'number' ? data.powerConsumptionW : 0,
              maintenanceFeePercent: typeof data.maintenanceFeePercent === 'number' ? data.maintenanceFeePercent : 0,
              status: resolveContractStatus(data.status, expiresAt),
              purchasedAt,
              expiresAt,
              settlementId: data.settlementId || `settle_${docSnap.id}`,
              txId: data.txId || docSnap.id,
              sessionId: data.sessionId,
              idempotencyKey: data.idempotencyKey,
              isSimulated: true,
            });
          });
          contracts.sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime());
          onUpdate(contracts, { fromCache: snapshot.metadata.fromCache });
        },
        (error) => {
          console.warn(
            `Firestore contracts listener note for uid ${uid}:`,
            sanitizeDiagnosticMessage(error.message)
          );
          onError?.(formatMiningError(error, 'reading mining contracts'));
        }
      );
    } catch (err) {
      onError?.(formatMiningError(err, 'subscribing to mining contracts'));
      return () => {};
    }
  }

  /**
   * Fetches user's current mining session once from Firestore.
   * Only falls back to `getDocFromCache` when `isExpectedOfflineError(err)` is true.
   */
  static async fetchUserMiningSession(uid: string): Promise<MiningSession | null> {
    if (!db) return null;
    const sessionDocRef = doc(db, 'users', uid, 'mining', 'session');
    try {
      let snap;
      try {
        snap = await getDoc(sessionDocRef);
      } catch (err) {
        if (!isExpectedOfflineError(err)) {
          throw formatMiningError(err, 'fetching mining session');
        }
        snap = await getDocFromCache(sessionDocRef);
      }
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
      const rawTHs = typeof data.hashrateTHs === 'number' ? data.hashrateTHs : 0;
      const rawGHs =
        typeof data.hashrateGHs === 'number' ? data.hashrateGHs : convertTHsToGHs(rawTHs);

      return {
        id: data.id || 'session-live',
        userId: uid,
        algorithm,
        targetCoin,
        hashrateGHs: rawGHs,
        hashrateTHs: rawTHs,
        efficiencyWTH: typeof data.efficiencyWTH === 'number' ? data.efficiencyWTH : 16.0,
        temperatureC: typeof data.temperatureC === 'number' ? data.temperatureC : 52.0,
        uptimeSeconds: typeof data.uptimeSeconds === 'number' ? data.uptimeSeconds : 0,
        status,
        startedAt: data.startedAt || null,
        todayEstimatedRewardCoin: typeof data.todayEstimatedRewardCoin === 'number' ? data.todayEstimatedRewardCoin : 0,
        todayEstimatedRewardUSD: typeof data.todayEstimatedRewardUSD === 'number' ? data.todayEstimatedRewardUSD : 0,
        confirmedRewardCoin: typeof data.confirmedRewardCoin === 'number' ? data.confirmedRewardCoin : 0,
        poolName: data.poolName || 'Nexora Cloud Mining',
        acceptedShares: typeof data.acceptedShares === 'number' ? data.acceptedShares : 0,
        rejectedShares: typeof data.rejectedShares === 'number' ? data.rejectedShares : 0,
        hardwareProfile,
        planId: data.planId,
        activeContractId: data.activeContractId,
        activeContractName: data.activeContractName,
        lastSessionId: data.lastSessionId,
        isSimulated: true,
      };
    } catch (error) {
      console.warn(
        `Firestore mining session read notice for users/${uid}/mining/session:`,
        sanitizeDiagnosticMessage((error as any)?.message)
      );
      throw formatMiningError(error, 'fetching mining session');
    }
  }

  /**
   * Executes a server-side atomic Cloud Contract purchase via POST /api/mining/purchase-contract.
   * Never modifies balances or contract entitlements directly from the client.
   * If a request times out or enters an uncertain state, checks existing Firestore contract/transaction records before failing.
   */
  static async purchaseContract(
    planId: string,
    idempotencyKey: string
  ): Promise<{
    success: boolean;
    alreadyProcessed: boolean;
    message: string;
    contract: MiningContract;
    transaction: Transaction;
    newBalance: number;
    newHashrateGHs: number;
    newHashrateTHs: number;
  }> {
    if (!auth || !auth.currentUser) {
      throw new Error('Authentication required. Please sign in to purchase a cloud mining contract.');
    }

    const uid = auth.currentUser.uid;
    const sanitizedKey = idempotencyKey.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const orderId = sanitizedKey.startsWith('order_') ? sanitizedKey : `order_${sanitizedKey}`;

    const token = await auth.currentUser.getIdToken();
    try {
      const response = await fetch('/api/mining/purchase-contract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId,
          idempotencyKey: sanitizedKey,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Contract purchase failed (HTTP ${response.status}).`);
      }

      const newHashrateTHs = Number(data.newHashrateTHs ?? 0);
      const newHashrateGHs =
        typeof data.newHashrateGHs === 'number'
          ? Number(data.newHashrateGHs)
          : convertTHsToGHs(newHashrateTHs);

      return {
        success: true,
        alreadyProcessed: Boolean(data.alreadyProcessed),
        message: data.message || 'Cloud mining contract purchased and activated.',
        contract: data.contract as MiningContract,
        transaction: data.transaction as Transaction,
        newBalance: Number(data.newBalance ?? 0),
        newHashrateGHs,
        newHashrateTHs,
      };
    } catch (err: any) {
      // If a network interruption or timeout occurred, check whether the order was already settled in Firestore
      if (db) {
        try {
          const [contractSnap, txSnap, walletSnap, sessionSnap] = await Promise.all([
            getDoc(doc(db, 'users', uid, 'contracts', orderId)),
            getDoc(doc(db, 'users', uid, 'transactions', orderId)),
            getDoc(doc(db, 'users', uid, 'wallet', 'USDT')),
            getDoc(doc(db, 'users', uid, 'mining', 'session')),
          ]);

          if (contractSnap.exists() && txSnap.exists() && txSnap.data()?.walletSettled === true) {
            const cData = contractSnap.data() as MiningContract;
            const tData = txSnap.data() as Transaction;
            const wBalance = walletSnap.exists() ? Number(walletSnap.data()?.balance ?? 0) : 0;
            const sTHs = sessionSnap.exists() ? Number(sessionSnap.data()?.hashrateTHs ?? 0) : 0;
            const sGHs = sessionSnap.exists()
              ? Number(sessionSnap.data()?.hashrateGHs ?? convertTHsToGHs(sTHs))
              : convertTHsToGHs(sTHs);

            return {
              success: true,
              alreadyProcessed: true,
              message: `Order ${orderId} reconciled from verified ledger after connection interruption.`,
              contract: cData,
              transaction: tData,
              newBalance: wBalance,
              newHashrateGHs: sGHs,
              newHashrateTHs: sTHs,
            };
          }
        } catch {
          // Ignore reconciliation read error and surface original purchase failure
        }
      }
      throw err;
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
    const sessionId = isCurrentlyActive
      ? currentSession.lastSessionId || `sess_${Date.now()}`
      : `sess_${Date.now()}`;

    let targetHashrateGHs =
      typeof currentSession.hashrateGHs === 'number' && currentSession.hashrateGHs > 0
        ? currentSession.hashrateGHs
        : convertTHsToGHs(currentSession.hashrateTHs);

    if (!isCurrentlyActive && targetHashrateGHs <= 0) {
      targetHashrateGHs =
        currentSession.hardwareProfile === 'Eco'
          ? 8.5
          : currentSession.hardwareProfile === 'Turbo Overclock'
          ? 12.5
          : 10.0;
    }

    const targetHashrateTHs = convertHashrateToTHs(targetHashrateGHs, 'GH/s');

    const updates = {
      userId: uid,
      status: newStatus,
      hashrateGHs: targetHashrateGHs,
      hashrateTHs: targetHashrateTHs,
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
        hashrateGHs: targetHashrateGHs,
        hashrateTHs: targetHashrateTHs,
        startedAt: updates.startedAt,
        lastSessionId: sessionId,
        temperatureC: updates.temperatureC,
        updatedAt: nowIso,
      };
    } catch (error) {
      console.warn(`Error updating users/${uid}/mining/session:`, sanitizeDiagnosticMessage((error as any)?.message));
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
    let power = 16.0;
    if (profile === 'Eco') {
      multiplier = 0.85;
      power = 13.8;
    } else if (profile === 'Turbo Overclock') {
      multiplier = 1.25;
      power = 19.5;
    }

    const baseGHs =
      typeof currentSession.hashrateGHs === 'number' && currentSession.hashrateGHs > 0
        ? currentSession.hashrateGHs
        : currentSession.hashrateTHs > 0
        ? convertTHsToGHs(currentSession.hashrateTHs)
        : 10.0;

    const newHashrateGHs = Number((baseGHs * multiplier).toFixed(2));
    const newHashrateTHs = convertHashrateToTHs(newHashrateGHs, 'GH/s');
    const sessionDocRef = doc(db, 'users', uid, 'mining', 'session');

    try {
      await setDoc(
        sessionDocRef,
        {
          userId: uid,
          status: currentSession.status || 'IDLE',
          hardwareProfile: profile,
          hashrateGHs: newHashrateGHs,
          hashrateTHs: newHashrateTHs,
          efficiencyWTH: power,
          isSimulated: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.warn(
        `Error updating hardware profile for users/${uid}/mining/session:`,
        sanitizeDiagnosticMessage((error as any)?.message)
      );
      throw formatMiningError(error, 'updating hardware profile');
    }
  }
}
