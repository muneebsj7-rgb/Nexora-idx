import {
  collection,
  doc,
  getDocs,
  setDoc,
  onSnapshot,
  serverTimestamp,
  FirestoreError,
} from 'firebase/firestore';
import { WalletAsset, Transaction } from '../types';
import { db } from './firebase';

export const INITIAL_WALLET_ASSETS: WalletAsset[] = [
  {
    symbol: 'USDT',
    name: 'Tether USD',
    balance: 450.00,
    lockedBalance: 50.00,
    usdRate: 1.00,
    iconBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    networks: ['TRC20 (Tron)', 'ERC20 (Ethereum)', 'BEP20 (BNB Chain)', 'Solana (SPL)'],
    depositAddress: 'TQn9Y2khEsLJW1ChVWFMSMeSTow5KaxUSDT',
    minDeposit: 10.00,
    minWithdraw: 20.00,
    withdrawFee: 1.50,
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    balance: 0.00142,
    lockedBalance: 0.00010,
    usdRate: 94250.00,
    iconBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    networks: ['Bitcoin Native SegWit', 'Bitcoin Legacy', 'Lightning Network'],
    depositAddress: 'bc1qnxora99k382m984xmsd837fmnexoramine792btc',
    minDeposit: 0.0005,
    minWithdraw: 0.001,
    withdrawFee: 0.0002,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    balance: 0.085,
    lockedBalance: 0.00,
    usdRate: 3340.50,
    iconBg: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    networks: ['ERC20 (Ethereum Mainnet)', 'Arbitrum One', 'Optimism'],
    depositAddress: '0x71C0a911B3e2189d2d88F3e21b21F48c90NexoraETH',
    minDeposit: 0.01,
    minWithdraw: 0.02,
    withdrawFee: 0.003,
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    balance: 1.25,
    lockedBalance: 0.00,
    usdRate: 182.40,
    iconBg: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    networks: ['Solana Mainnet-Beta'],
    depositAddress: 'Nex9soLmine7W9p2KmxV4q92KmxV92Lpoe931sL',
    minDeposit: 0.1,
    minWithdraw: 0.2,
    withdrawFee: 0.01,
  },
  {
    symbol: 'LTC',
    name: 'Litecoin',
    balance: 0.45,
    lockedBalance: 0.00,
    usdRate: 112.80,
    iconBg: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    networks: ['Litecoin Core'],
    depositAddress: 'ltc1qnxoraminedeposit48375910248ltc',
    minDeposit: 0.05,
    minWithdraw: 0.1,
    withdrawFee: 0.005,
  }
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-demo-1094',
    type: 'MINING_PAYOUT',
    asset: 'BTC',
    amount: 0.000155,
    amountUSD: 14.60,
    fee: 0.000005,
    status: 'COMPLETED',
    timestamp: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
    txHash: '0x9482f...c31b',
    note: '[DEMO] Daily Cloud Mining Share Yield (SHA-256 Pool)',
    isDemo: true,
  },
  {
    id: 'tx-demo-1093',
    type: 'REFERRAL_BONUS',
    asset: 'USDT',
    amount: 15.00,
    amountUSD: 15.00,
    fee: 0,
    status: 'COMPLETED',
    timestamp: new Date(Date.now() - 3600 * 1000 * 16).toISOString(),
    txHash: '0x712a8...99e1',
    note: '[DEMO] Tier-1 Referral Commission (User #8291)',
    isDemo: true,
  },
  {
    id: 'tx-demo-1092',
    type: 'DEPOSIT',
    asset: 'USDT',
    amount: 200.00,
    amountUSD: 200.00,
    fee: 0,
    status: 'COMPLETED',
    timestamp: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
    txHash: '0x438bf...73a0',
    network: 'TRC20',
    note: '[DEMO] External Wallet Deposit (Simulated)',
    isDemo: true,
  },
  {
    id: 'tx-demo-1091',
    type: 'WITHDRAWAL',
    asset: 'USDT',
    amount: 50.00,
    amountUSD: 50.00,
    fee: 1.50,
    status: 'PENDING_REVIEW',
    timestamp: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    toAddress: 'TFx4921...8mKz',
    network: 'TRC20',
    note: '[DEMO] Awaiting Automated Compliance & Node Confirmation',
    isDemo: true,
  }
];

export interface WalletBalanceRecord {
  balance: number;
  lockedBalance: number;
  updatedAt?: string;
}

export interface SubmitDepositParams {
  assetSymbol: string;
  network: string;
  amount: number;
  txHash: string;
  usdRate: number;
}

export interface SubmitWithdrawalParams {
  assetSymbol: string;
  network: string;
  amount: number;
  address: string;
  fee: number;
  usdRate: number;
}

function formatFirestoreWalletError(error: unknown, action: string): Error {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as FirestoreError).code;
    if (code === 'permission-denied') {
      return new Error(
        `Cloud Firestore permission denied during ${action}. ` +
        `Client balance modifications or non-pending transactions are rejected by security rules. ` +
        `Ensure firestore.rules have been deployed to your Firebase project.`
      );
    }
    if (code === 'unavailable') {
      return new Error(`Firestore service is temporarily unavailable. Please check your connection and retry.`);
    }
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(`An unexpected error occurred during ${action}.`);
}

/**
 * Firestore data service for reading authenticated user's wallet assets and transactions.
 * Enforces client read-only balance access and client pending-only transaction requests.
 *
 * Paths:
 * - users/{uid}/wallet/{assetSymbol}
 * - users/{uid}/transactions/{transactionId}
 */
export class WalletFirestoreService {
  /**
   * Subscribes to real-time wallet asset balances stored at users/{uid}/wallet.
   * Balances are read-only from the client.
   */
  static subscribeUserWallet(
    uid: string,
    onUpdate: (balances: Record<string, WalletBalanceRecord>) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!db) {
      console.warn('Firestore is not configured. Wallet balances will use default state.');
      return () => {};
    }

    try {
      const walletColRef = collection(db, 'users', uid, 'wallet');
      return onSnapshot(
        walletColRef,
        (snapshot) => {
          const balances: Record<string, WalletBalanceRecord> = {};
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const symbol = docSnap.id.toUpperCase();
            balances[symbol] = {
              balance: typeof data.balance === 'number' ? data.balance : 0,
              lockedBalance: typeof data.lockedBalance === 'number' ? data.lockedBalance : 0,
              updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
            };
          });
          onUpdate(balances);
        },
        (error) => {
          console.warn(`Firestore wallet subscription note for uid ${uid}:`, error.message);
          onError?.(formatFirestoreWalletError(error, 'reading wallet balances'));
        }
      );
    } catch (err) {
      console.warn('Error setting up wallet snapshot listener:', err);
      onError?.(formatFirestoreWalletError(err, 'subscribing to wallet'));
      return () => {};
    }
  }

  /**
   * Reads current wallet balances once from users/{uid}/wallet.
   */
  static async fetchUserWallet(uid: string): Promise<Record<string, WalletBalanceRecord>> {
    if (!db) return {};

    try {
      const walletColRef = collection(db, 'users', uid, 'wallet');
      const snap = await getDocs(walletColRef);
      const balances: Record<string, WalletBalanceRecord> = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const symbol = docSnap.id.toUpperCase();
        balances[symbol] = {
          balance: typeof data.balance === 'number' ? data.balance : 0,
          lockedBalance: typeof data.lockedBalance === 'number' ? data.lockedBalance : 0,
        };
      });
      return balances;
    } catch (error) {
      console.error(`Error reading users/${uid}/wallet:`, error);
      throw formatFirestoreWalletError(error, 'reading wallet assets');
    }
  }

  /**
   * Subscribes to real-time transaction ledger stored at users/{uid}/transactions.
   */
  static subscribeUserTransactions(
    uid: string,
    onUpdate: (transactions: Transaction[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!db) {
      console.warn('Firestore is not configured. Real transaction listener disabled.');
      return () => {};
    }

    try {
      const txColRef = collection(db, 'users', uid, 'transactions');
      return onSnapshot(
        txColRef,
        (snapshot) => {
          const txs: Transaction[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            txs.push({
              id: docSnap.id,
              userId: uid,
              type: data.type,
              asset: data.asset,
              amount: typeof data.amount === 'number' ? data.amount : 0,
              amountUSD: typeof data.amountUSD === 'number' ? data.amountUSD : 0,
              fee: typeof data.fee === 'number' ? data.fee : 0,
              status: data.status,
              timestamp: data.timestamp || new Date().toISOString(),
              txHash: data.txHash,
              network: data.network,
              toAddress: data.toAddress,
              fromAddress: data.fromAddress,
              note: data.note,
              isDemo: false,
            });
          });

          // Sort descending by timestamp
          txs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          onUpdate(txs);
        },
        (error) => {
          console.warn(`Firestore transaction subscription note for uid ${uid}:`, error.message);
          onError?.(formatFirestoreWalletError(error, 'reading transactions'));
        }
      );
    } catch (err) {
      console.warn('Error setting up transaction snapshot listener:', err);
      onError?.(formatFirestoreWalletError(err, 'subscribing to transactions'));
      return () => {};
    }
  }

  /**
   * Submits a pending deposit request to users/{uid}/transactions/{transactionId}.
   * Security constraints:
   * - Status must strictly be PENDING_CONFIRMATION
   * - Cannot credit own balance from client
   */
  static async submitDepositRequest(
    uid: string,
    params: SubmitDepositParams
  ): Promise<Transaction> {
    if (!db) {
      throw new Error('Firestore is not initialized. Cannot persist deposit request.');
    }

    if (!params.amount || params.amount <= 0) {
      throw new Error('Deposit amount must be greater than zero.');
    }
    if (!params.txHash || params.txHash.trim().length < 8) {
      throw new Error('A valid blockchain transaction hash (TxID) is required.');
    }
    if (!params.assetSymbol) {
      throw new Error('Asset symbol is required.');
    }

    const cleanSymbol = params.assetSymbol.toUpperCase();
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const txDocRef = doc(db, 'users', uid, 'transactions', txId);

    const newTx: Transaction = {
      id: txId,
      userId: uid,
      type: 'DEPOSIT',
      asset: cleanSymbol,
      amount: params.amount,
      amountUSD: Number((params.amount * params.usdRate).toFixed(2)),
      fee: 0,
      status: 'PENDING_CONFIRMATION',
      timestamp: new Date().toISOString(),
      network: params.network,
      txHash: params.txHash.trim(),
      note: 'Deposit Request Submitted (Pending Verification)',
      isDemo: false,
    };

    try {
      await setDoc(txDocRef, {
        id: newTx.id,
        userId: uid,
        type: newTx.type,
        asset: newTx.asset,
        amount: newTx.amount,
        amountUSD: newTx.amountUSD,
        fee: newTx.fee,
        status: newTx.status,
        timestamp: newTx.timestamp,
        network: newTx.network,
        txHash: newTx.txHash,
        note: newTx.note,
        createdAt: serverTimestamp(),
      });
      return newTx;
    } catch (error) {
      console.error(`Error writing users/${uid}/transactions/${txId}:`, error);
      throw formatFirestoreWalletError(error, 'submitting deposit request');
    }
  }

  /**
   * Submits a pending withdrawal request to users/{uid}/transactions/{transactionId}.
   * Security constraints:
   * - Status must strictly be PENDING_REVIEW
   * - Client cannot self-approve or mark as completed
   * - Wallet balances are read-only on client; updating balances requires a trusted backend (e.g., Firebase Cloud Functions with Admin SDK)
   */
  static async submitWithdrawalRequest(
    uid: string,
    params: SubmitWithdrawalParams
  ): Promise<Transaction> {
    if (!db) {
      throw new Error('Firestore is not initialized. Cannot persist withdrawal request.');
    }

    if (!params.amount || params.amount <= 0) {
      throw new Error('Withdrawal amount must be greater than zero.');
    }
    if (!params.address || params.address.trim().length < 12) {
      throw new Error('Please enter a valid recipient blockchain address.');
    }
    if (!params.assetSymbol) {
      throw new Error('Asset symbol is required.');
    }

    const cleanSymbol = params.assetSymbol.toUpperCase();
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const txDocRef = doc(db, 'users', uid, 'transactions', txId);

    const newTx: Transaction = {
      id: txId,
      userId: uid,
      type: 'WITHDRAWAL',
      asset: cleanSymbol,
      amount: params.amount,
      amountUSD: Number((params.amount * params.usdRate).toFixed(2)),
      fee: params.fee,
      status: 'PENDING_REVIEW',
      timestamp: new Date().toISOString(),
      network: params.network,
      toAddress: params.address.trim(),
      note: 'Withdrawal Request Submitted (Pending Review)',
      isDemo: false,
    };

    try {
      await setDoc(txDocRef, {
        id: newTx.id,
        userId: uid,
        type: newTx.type,
        asset: newTx.asset,
        amount: newTx.amount,
        amountUSD: newTx.amountUSD,
        fee: newTx.fee,
        status: newTx.status,
        timestamp: newTx.timestamp,
        network: newTx.network,
        toAddress: newTx.toAddress,
        note: newTx.note,
        createdAt: serverTimestamp(),
      });
      return newTx;
    } catch (error) {
      console.error(`Error writing users/${uid}/transactions/${txId}:`, error);
      throw formatFirestoreWalletError(error, 'submitting withdrawal request');
    }
  }
}
