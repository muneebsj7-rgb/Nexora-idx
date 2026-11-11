/**
 * Shared Transactional Settlement Engine for Nexora Mine.
 *
 * Centralizes all wallet Available Balance (`balance`), Escrow (`lockedBalance`),
 * Transaction status, Daily Streak status, and Idempotency Ledger (`settlements/{txId}`)
 * mutations inside atomic Firestore `runTransaction` blocks.
 *
 * Used by both:
 * 1. Express Admin & Wallet API routes (`server.ts`)
 * 2. Firebase Cloud Functions triggers & callables (`functions/index.ts`)
 */

export interface AdminActor {
  uid: string;
  email: string;
}

export interface ManualAdminDepositAttestation {
  explorerConfirmed: boolean;
  recipientAddress?: string;
  confirmedRecipientAddress?: string;
  network?: string;
  confirmedNetwork?: string;
  asset?: string;
  confirmedAsset?: string;
  amount?: number;
  confirmedAmount?: number;
  confirmations?: number;
  creditToPrimaryUsdt?: boolean;
  exchangeRateUSD?: number;
  usdtCreditAmount?: number;
  note?: string;
  verificationNote?: string;
}

import {
  validatePaymentMethodAddress,
  normalizeNetworkCode,
  normalizePaymentMethodId,
  inferPaymentMethodId,
  sanitizePaymentMethodConfig,
  validateTrustedServerRateQuote,
  addCryptoBalancesBigInt,
  type TrustedServerExchangeRateQuote,
  type ValidatedExchangeRateCalculation,
} from './paymentMethodService.ts';

export interface DocSnapshotLike {
  exists: boolean;
  id: string;
  data(): Record<string, any> | undefined;
}

export interface DocRefLike {
  id: string;
  path: string;
}

export interface TransactionLike {
  get(docRef: DocRefLike): Promise<DocSnapshotLike>;
  set(docRef: DocRefLike, data: Record<string, any>, options?: { merge?: boolean }): TransactionLike;
  update(docRef: DocRefLike, data: Record<string, any>): TransactionLike;
}

export interface FirestoreLike {
  doc(path: string): DocRefLike;
  runTransaction<T>(updateFunction: (transaction: TransactionLike) => Promise<T>): Promise<T>;
}

export interface AuthoritativeAssetSpec {
  symbol: string;
  name: string;
  minDeposit: number;
  minWithdraw: number;
  withdrawFee: number;
  defaultUsdRate: number;
}

export const AUTHORITATIVE_ASSET_CONFIG: Record<string, AuthoritativeAssetSpec> = {
  USDT: { symbol: 'USDT', name: 'Tether USD', minDeposit: 10, minWithdraw: 20, withdrawFee: 1.5, defaultUsdRate: 1.0 },
  BTC: { symbol: 'BTC', name: 'Bitcoin', minDeposit: 0.0005, minWithdraw: 0.001, withdrawFee: 0.0002, defaultUsdRate: 94250 },
  ETH: { symbol: 'ETH', name: 'Ethereum', minDeposit: 0.01, minWithdraw: 0.02, withdrawFee: 0.003, defaultUsdRate: 2785 },
  SOL: { symbol: 'SOL', name: 'Solana', minDeposit: 0.1, minWithdraw: 0.25, withdrawFee: 0.01, defaultUsdRate: 186.4 },
  LTC: { symbol: 'LTC', name: 'Litecoin', minDeposit: 0.1, minWithdraw: 0.2, withdrawFee: 0.005, defaultUsdRate: 128.5 },
};

export const OFFICIAL_DAILY_REWARD_SCHEDULE: Record<number, number> = {
  1: 0.5,
  2: 0.75,
  3: 1.0,
  4: 1.5,
  5: 2.0,
  6: 3.0,
  7: 5.0,
};

export const OFFICIAL_TASK_REWARD_AMOUNTS: Record<string, number> = {
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

export const ALLOWED_REWARD_AMOUNTS = new Set<number>([
  0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 4.5, 5.0, 6.0, 8.5, 10.0, 12.0, 25.0, 50.0,
]);

export const roundCrypto = (val: number): number => Number(Number(val || 0).toFixed(8));

const ALLOWED_DEPOSIT_PENDING_STATUSES = ['PENDING_CONFIRMATION', 'PENDING_REVIEW'];
const ALLOWED_DEPOSIT_RECONCILE_STATUSES = [
  'PENDING_CONFIRMATION',
  'PENDING_REVIEW',
  'CONFIRMED',
  'APPROVED',
  'COMPLETED',
];
const ALLOWED_REWARD_PENDING_STATUSES = ['PENDING_REVIEW', 'PENDING_CONFIRMATION'];
const ALLOWED_WITHDRAWAL_PENDING_STATUSES = ['PENDING_REVIEW', 'PENDING_CONFIRMATION', 'PROCESSING'];

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

export function normalizeAndValidateDepositReference(
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

export interface IndependentPaymentVerificationReceipt {
  verified: boolean;
  provider: string;
  txHash: string;
  network: string;
  tronNetwork?: string;
  recipientAddress: string;
  expectedTreasuryAddress?: string;
  recipientVerified?: boolean;
  senderAddress?: string;
  contractAddress?: string;
  contractAddressHex41?: string;
  blockNumber?: number;
  solidified?: boolean;
  userId?: string;
  txId?: string;
  asset: string;
  amount: number;
  rawAmountBaseUnits?: string;
  txStatus: 'SUCCESS' | 'CONFIRMED';
  confirmations: number;
  requiredConfirmations?: number;
  verifiedAt?: string;
}

export function validateIndependentPaymentProof(
  proof: Record<string, any> | null | undefined,
  expected: {
    userId?: string;
    txId: string;
    rawTxHash: string;
    normalizedHash: string;
    paymentRefDocId: string;
    assetSymbol: string;
    amount: number;
    expectedNetwork?: string;
    allowTestnetCreditForTesting?: boolean;
  }
): IndependentPaymentVerificationReceipt {
  const {
    userId,
    txId,
    rawTxHash,
    normalizedHash,
    paymentRefDocId,
    assetSymbol,
    amount,
    expectedNetwork,
    allowTestnetCreditForTesting = false,
  } = expected;

  if (!proof || proof.verified !== true) {
    throw new Error(
      `Unverified deposit payment on ${txId}: no independent blockchain/provider verification receipt found for txHash '${rawTxHash}' (verifiedPayments/${paymentRefDocId}). Status changes and plausible transaction hashes cannot credit wallets without verified payment proof.`
    );
  }

  if (userId && proof.userId && String(proof.userId).trim() !== String(userId).trim()) {
    throw new Error(
      `Duplicate payment reference: verified payment receipt for '${rawTxHash}' is already bound to user '${proof.userId}', not '${userId}'.`
    );
  }

  if (proof.txId && String(proof.txId).trim() !== String(txId).trim()) {
    throw new Error(
      `Duplicate payment reference: verified payment receipt for '${rawTxHash}' is already bound to deposit transaction '${proof.txId}', not '${txId}'.`
    );
  }

  const proofRef = normalizeAndValidateDepositReference(proof.txHash, txId);
  if (proofRef.normalizedHash !== normalizedHash) {
    throw new Error(
      `Payment verification mismatch on ${txId}: receipt txHash '${proof.txHash}' does not match deposit txHash '${rawTxHash}'.`
    );
  }

  const txStatus = String(proof.txStatus || '').toUpperCase().trim();
  if (txStatus !== 'SUCCESS' && txStatus !== 'CONFIRMED') {
    throw new Error(
      `Payment verification failed on ${txId}: on-chain/provider transaction status is '${proof.txStatus}' (expected 'SUCCESS' or 'CONFIRMED').`
    );
  }

  const proofAsset = String(proof.asset || '').toUpperCase().trim();
  if (proofAsset !== assetSymbol) {
    throw new Error(
      `Payment verification mismatch on ${txId}: verified asset '${proofAsset}' does not match deposit asset '${assetSymbol}'.`
    );
  }

  const proofAmount = roundCrypto(Number(proof.amount));
  if (!Number.isFinite(proofAmount) || Math.abs(proofAmount - amount) > 1e-8) {
    throw new Error(
      `Payment verification mismatch on ${txId}: verified amount (${proof.amount} ${proofAsset}) does not match claimed deposit amount (${amount} ${assetSymbol}).`
    );
  }

  if (assetSymbol === 'USDT' && proof.rawAmountBaseUnits !== undefined && proof.rawAmountBaseUnits !== null) {
    const rawUnitsStr = String(proof.rawAmountBaseUnits).trim();
    if (!/^\d+$/.test(rawUnitsStr)) {
      throw new Error(
        `Payment verification failed on ${txId}: invalid USDT integer token base units '${rawUnitsStr}'.`
      );
    }
    const expectedBaseUnits = BigInt(Math.round(amount * 1_000_000));
    const proofBaseUnits = BigInt(rawUnitsStr);
    if (proofBaseUnits !== expectedBaseUnits) {
      throw new Error(
        `Payment verification mismatch on ${txId}: verified USDT token base units (${proofBaseUnits.toString()} base units) do not match deposit amount (${expectedBaseUnits.toString()} base units).`
      );
    }
  }

  const proofNetwork = String(proof.network || '').trim();
  if (!proofNetwork) {
    throw new Error(`Payment verification failed on ${txId}: verified receipt is missing blockchain network.`);
  }
  const cleanProofNet = proofNetwork.toUpperCase();
  const cleanTronNet = String(proof.tronNetwork || '').toLowerCase().trim();
  const isTestnetReceipt =
    cleanTronNet === 'nile' ||
    cleanTronNet === 'shasta' ||
    cleanProofNet.includes('NILE') ||
    cleanProofNet.includes('SHASTA') ||
    cleanProofNet.includes('TESTNET');

  if (isTestnetReceipt && !allowTestnetCreditForTesting) {
    throw new Error(
      `Refusing to credit live Firestore wallet balance from a testnet payment receipt (${proofNetwork}) on deposit ${txId}: testnet and production share the same users/${userId || '{uid}'}/wallet/${assetSymbol} ledger.`
    );
  }

  if (expectedNetwork && String(expectedNetwork).trim().length > 0) {
    const cleanExpectedNet = String(expectedNetwork).toUpperCase().trim();
    const bothTrc20 =
      (cleanExpectedNet.includes('TRC20') || cleanExpectedNet.includes('TRON')) &&
      (cleanProofNet.includes('TRC20') || cleanProofNet.includes('TRON'));
    const bothBtc =
      (cleanExpectedNet.includes('BTC') || cleanExpectedNet.includes('BITCOIN')) &&
      (cleanProofNet.includes('BTC') || cleanProofNet.includes('BITCOIN'));
    const bothErc20 =
      (cleanExpectedNet.includes('ERC20') || cleanExpectedNet.includes('ETHEREUM')) &&
      (cleanProofNet.includes('ERC20') || cleanProofNet.includes('ETHEREUM'));
    const bothBep20 =
      (cleanExpectedNet.includes('BEP20') || cleanExpectedNet.includes('BNB') || cleanExpectedNet.includes('BSC')) &&
      (cleanProofNet.includes('BEP20') || cleanProofNet.includes('BNB') || cleanProofNet.includes('BSC'));
    const bothSol =
      (cleanExpectedNet.includes('SOL') || cleanExpectedNet.includes('SOLANA')) &&
      (cleanProofNet.includes('SOL') || cleanProofNet.includes('SOLANA'));
    const bothLtc =
      (cleanExpectedNet.includes('LTC') || cleanExpectedNet.includes('LITECOIN')) &&
      (cleanProofNet.includes('LTC') || cleanProofNet.includes('LITECOIN'));
    if (
      !bothTrc20 &&
      !bothBtc &&
      !bothErc20 &&
      !bothBep20 &&
      !bothSol &&
      !bothLtc &&
      !cleanProofNet.includes(cleanExpectedNet) &&
      !cleanExpectedNet.includes(cleanProofNet)
    ) {
      throw new Error(
        `Payment verification mismatch on ${txId}: verified network '${proofNetwork}' does not match deposit network '${expectedNetwork}'.`
      );
    }
  }

  const recipientAddress = String(proof.recipientAddress || '').trim();
  const expectedTreasury = String(proof.expectedTreasuryAddress || '').trim();
  const isRecipientVerified =
    proof.recipientVerified === true ||
    (recipientAddress.length >= 10 && expectedTreasury.length >= 10 && recipientAddress === expectedTreasury);
  if (recipientAddress.length < 10 || !isRecipientVerified) {
    throw new Error(
      `Payment verification failed on ${txId}: recipient address '${recipientAddress}' is not a verified platform custodial treasury address.`
    );
  }

  const confirmations = Number(proof.confirmations);
  const requiredConfirmations = Math.max(1, Number(proof.requiredConfirmations || 1));
  if (!Number.isFinite(confirmations) || confirmations < requiredConfirmations) {
    throw new Error(
      `Payment verification failed on ${txId}: insufficient block confirmations (${proof.confirmations} < ${requiredConfirmations}).`
    );
  }

  return {
    verified: true,
    provider: String(proof.provider || 'VERIFIED_PROVIDER'),
    txHash: proofRef.rawTxHash,
    network: proofNetwork,
    tronNetwork: cleanTronNet || undefined,
    recipientAddress,
    expectedTreasuryAddress: expectedTreasury || undefined,
    recipientVerified: true,
    senderAddress: proof.senderAddress ? String(proof.senderAddress) : undefined,
    contractAddress: proof.contractAddress ? String(proof.contractAddress) : undefined,
    contractAddressHex41: proof.contractAddressHex41 ? String(proof.contractAddressHex41) : undefined,
    blockNumber: Number.isFinite(Number(proof.blockNumber)) ? Number(proof.blockNumber) : undefined,
    solidified: typeof proof.solidified === 'boolean' ? proof.solidified : undefined,
    userId: proof.userId ? String(proof.userId) : userId,
    txId: proof.txId ? String(proof.txId) : txId,
    asset: assetSymbol,
    amount: proofAmount,
    rawAmountBaseUnits: proof.rawAmountBaseUnits !== undefined ? String(proof.rawAmountBaseUnits) : undefined,
    txStatus: txStatus as 'SUCCESS' | 'CONFIRMED',
    confirmations,
    requiredConfirmations,
    verifiedAt: String(proof.verifiedAt || new Date().toISOString()),
  };
}

export interface SettlementResult {
  alreadyProcessed: boolean;
  userId: string;
  txId: string;
  type: 'DEPOSIT' | 'TASK_REWARD' | 'WITHDRAWAL';
  status: 'COMPLETED' | 'REJECTED';
  asset: string;
  amount: number;
  creditedAsset?: string;
  creditedAmount?: number;
  nativeAsset?: string;
  nativeAmount?: number;
  exchangeRateUSD?: number;
  previousBalance: number;
  newBalance: number;
  previousLockedBalance: number;
  newLockedBalance: number;
  netPayoutAmount?: number;
  fee?: number;
  paymentReferenceId?: string;
  message: string;
}

const assertOwnership = (txData: Record<string, any>, expectedUserId: string, txId: string): void => {
  if (txData.userId !== undefined && txData.userId !== null && String(txData.userId).trim() !== '') {
    if (String(txData.userId) !== String(expectedUserId)) {
      throw new Error(
        `Transaction ownership mismatch on ${txId}: document userId '${txData.userId}' does not match target userId '${expectedUserId}'.`
      );
    }
  }
};

const assertNotContradictoryForApproval = (txData: Record<string, any>, txId: string): void => {
  if (
    txData.status === 'REJECTED' ||
    txData.status === 'FAILED' ||
    txData.settlementStatus === 'REJECTED' ||
    txData.refunded === true ||
    Boolean(txData.rejectedAt) ||
    Boolean(txData.rejectionReason)
  ) {
    throw new Error(
      `Transaction ${txId} contains rejection/failure markers (status=${txData.status}, settlementStatus=${txData.settlementStatus}) and cannot be approved.`
    );
  }
};

/**
 * 1. APPROVE DEPOSIT
 * Atomically verifies deposit request AND independent payment proof (`verifiedPayments/txhash_<normalized>`),
 * locks global `paymentReferences/txhash_<normalized>`, credits `users/{userId}/wallet/{asset}.balance`,
 * marks transaction `COMPLETED` + `walletCredited: true` + `walletSettled: true`,
 * and writes immutable `users/{userId}/settlements/{txId}`.
 */
export async function settleDepositApproval(
  db: FirestoreLike,
  params: {
    userId: string;
    txId: string;
    admin: AdminActor;
    note?: string;
    allowManualCompletedStatus?: boolean;
    allowTestnetCreditForTesting?: boolean;
    paymentVerification?: IndependentPaymentVerificationReceipt;
    manualVerification?: ManualAdminDepositAttestation;
    trustedRateQuote?: TrustedServerExchangeRateQuote | null;
    serverTimestamp?: () => any;
  }
): Promise<SettlementResult> {
  const {
    userId,
    txId,
    admin,
    note,
    allowManualCompletedStatus = false,
    allowTestnetCreditForTesting = false,
    paymentVerification,
    manualVerification,
    trustedRateQuote,
  } = params;
  if (!userId || !txId) {
    throw new Error('Missing required userId or txId for deposit approval.');
  }
  if (!admin || (!admin.uid && !admin.email)) {
    throw new Error('Authorized administrator actor is required for deposit settlement.');
  }

  // CRITICAL-02 Guard: Reject any caller/client-supplied exchange rate or USDT credit overrides
  if (
    manualVerification &&
    (manualVerification.exchangeRateUSD !== undefined ||
      manualVerification.usdtCreditAmount !== undefined ||
      (manualVerification as any).amountUSD !== undefined)
  ) {
    throw new Error(
      `Forbidden conversion override on ${txId}: caller-supplied exchangeRateUSD, usdtCreditAmount, or amountUSD is not permitted. Non-USDT conversion rates must come exclusively from a trusted server-side exchangeRateQuote.`
    );
  }

  return db.runTransaction(async (transaction) => {
    const txRef = db.doc(`users/${userId}/transactions/${txId}`);
    const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);

    const [txSnap, settlementSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(settlementRef),
    ]);

    if (!txSnap.exists) {
      throw new Error(`Deposit transaction ${txId} not found for user ${userId}.`);
    }

    const txData = txSnap.data() || {};
    if (txData.type !== 'DEPOSIT') {
      throw new Error(`Invalid transaction type '${txData.type}'. Expected 'DEPOSIT'.`);
    }

    assertOwnership(txData, userId, txId);

    const assetSymbol = String(txData.asset || '').toUpperCase().trim();
    const assetSpec = AUTHORITATIVE_ASSET_CONFIG[assetSymbol];
    if (!assetSpec) {
      throw new Error(`Unsupported or missing deposit asset symbol '${assetSymbol}' on transaction ${txId}.`);
    }

    const rawAmountNum = Number(txData.amount);
    const amount = roundCrypto(rawAmountNum);
    if (!Number.isFinite(rawAmountNum) || !Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Invalid deposit amount (${txData.amount}) on transaction ${txId}.`);
    }
    if (Math.abs(rawAmountNum - amount) > 1e-8) {
      throw new Error(`Deposit amount (${txData.amount}) exceeds maximum 8-decimal precision on transaction ${txId}.`);
    }
    if (amount < assetSpec.minDeposit) {
      throw new Error(
        `Deposit amount (${amount} ${assetSymbol}) is below the minimum required deposit (${assetSpec.minDeposit} ${assetSymbol}).`
      );
    }

    // Resolve candidate paymentMethodId from deposit document or (asset, network)
    const explicitMethodId =
      typeof txData.paymentMethodId === 'string' && txData.paymentMethodId.trim()
        ? normalizePaymentMethodId(txData.paymentMethodId)
        : '';
    let inferredMethodId = explicitMethodId;
    if (!inferredMethodId && txData.network) {
      try {
        inferredMethodId = inferPaymentMethodId(assetSymbol, String(txData.network));
      } catch {
        inferredMethodId = '';
      }
    }

    const paymentMethodDoc = inferredMethodId ? db.doc(`paymentMethods/${inferredMethodId}`) : null;
    const paymentMethodSnap = paymentMethodDoc ? await transaction.get(paymentMethodDoc) : null;

    const requiresPaymentMethodBinding =
      Boolean(explicitMethodId) ||
      Boolean(manualVerification) ||
      Boolean(paymentMethodSnap?.exists) ||
      Boolean(txData.recipientAddress) ||
      Boolean(txData.memoUsed);

    const convertToPrimaryUsdt =
      assetSymbol !== 'USDT' &&
      (requiresPaymentMethodBinding ||
        Boolean(trustedRateQuote) ||
        (Boolean(manualVerification) && manualVerification?.creditToPrimaryUsdt !== false));

    const targetWalletSymbol = convertToPrimaryUsdt ? 'USDT' : assetSymbol;
    const targetAssetSpec = AUTHORITATIVE_ASSET_CONFIG[targetWalletSymbol] || assetSpec;

    const walletRef = db.doc(`users/${userId}/wallet/${targetWalletSymbol}`);
    const walletSnap = await transaction.get(walletRef);
    const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentBalance = roundCrypto(Number(walletData.balance || 0));
    const currentLocked = roundCrypto(Number(walletData.lockedBalance || 0));

    // Reject any deposit carrying REJECTED / FAILED markers before idempotency return
    assertNotContradictoryForApproval(txData, txId);
    if (settlementSnap.exists && settlementSnap.data()?.status === 'REJECTED') {
      throw new Error(
        `Transaction ${txId} was already settled as REJECTED and cannot be approved.`
      );
    }

    // Idempotency guard: if already credited/settled as COMPLETED in ledger, return safe no-op
    if (
      txData.walletCredited === true ||
      txData.walletSettled === true ||
      settlementSnap.exists
    ) {
      return {
        alreadyProcessed: true,
        userId,
        txId,
        type: 'DEPOSIT',
        status: 'COMPLETED',
        asset: String(txData.creditedAsset || targetWalletSymbol),
        amount: roundCrypto(Number(txData.creditedAmount || amount)),
        creditedAsset: String(txData.creditedAsset || targetWalletSymbol),
        creditedAmount: roundCrypto(Number(txData.creditedAmount || amount)),
        nativeAsset: String(txData.nativeAsset || assetSymbol),
        nativeAmount: roundCrypto(Number(txData.nativeAmount || amount)),
        exchangeRateUSD: txData.exchangeRateUSD !== undefined ? Number(txData.exchangeRateUSD) : undefined,
        previousBalance: currentBalance,
        newBalance: currentBalance,
        previousLockedBalance: currentLocked,
        newLockedBalance: currentLocked,
        paymentReferenceId: txData.paymentReferenceId,
        message: 'Deposit has already been approved and credited.',
      };
    }

    const { rawTxHash, normalizedHash, paymentRefDocId } = normalizeAndValidateDepositReference(
      txData.txHash,
      txId
    );

    // Strict pending/reconciliation state check:
    const allowedStatuses = allowManualCompletedStatus
      ? ALLOWED_DEPOSIT_RECONCILE_STATUSES
      : ALLOWED_DEPOSIT_PENDING_STATUSES;

    if (!allowedStatuses.includes(txData.status)) {
      if (
        !allowManualCompletedStatus &&
        ['COMPLETED', 'CONFIRMED', 'APPROVED'].includes(String(txData.status))
      ) {
        throw new Error(
          `Deposit transaction ${txId} has status '${txData.status}' without prior settlement verification. Standard approval requires a pending state (${ALLOWED_DEPOSIT_PENDING_STATUSES.join(' or ')}).`
        );
      }
      throw new Error(
        `Deposit transaction ${txId} cannot be approved from status '${txData.status}'. Required: ${ALLOWED_DEPOSIT_PENDING_STATUSES.join(' or ')}.`
      );
    }

    // Global payment-reference uniqueness AND independent payment verification reads (ALL READS BEFORE WRITES)
    const paymentRefDoc = db.doc(`paymentReferences/${paymentRefDocId}`);
    const verifiedPaymentDoc = db.doc(`verifiedPayments/${paymentRefDocId}`);
    const [paymentRefSnap, verifiedPaymentSnap] = await Promise.all([
      transaction.get(paymentRefDoc),
      transaction.get(verifiedPaymentDoc),
    ]);

    if (paymentRefSnap.exists) {
      const existingRef = paymentRefSnap.data() || {};
      if (existingRef.txId !== txId || existingRef.userId !== userId) {
        throw new Error(
          `Duplicate payment reference: transaction hash '${rawTxHash}' has already been credited to deposit transaction '${existingRef.txId}' (user '${existingRef.userId}').`
        );
      }
    }

    // CRITICAL-01: Authoritative Server-Side Payment Method & Recipient Binding
    let authoritativeRecipientAddress = '';
    let authoritativeMethodNetworkCode: string | null = null;
    let authoritativeConfirmationsRequired = 1;
    let authoritativeMemoRequired = false;
    let authoritativeMemoValue = '';

    if (requiresPaymentMethodBinding) {
      if (!inferredMethodId || !paymentMethodSnap || !paymentMethodSnap.exists) {
        throw new Error(
          `Unconfigured payment method on ${txId}: authoritative record paymentMethods/${inferredMethodId || 'unknown'} does not exist.`
        );
      }

      const rawMethodData = paymentMethodSnap.data() || {};
      const rawConfiguredAddr = String(rawMethodData.receivingAddress || '').trim();
      const rawMethodNetwork = String(rawMethodData.networkCode || rawMethodData.network || '');
      const methodAddrCheck = validatePaymentMethodAddress(rawMethodNetwork, rawConfiguredAddr);

      if (!rawConfiguredAddr || !methodAddrCheck.valid) {
        throw new Error(
          `Unconfigured payment method on ${txId}: paymentMethods/${inferredMethodId} does not have a valid configured owner receiving address (${methodAddrCheck.error || 'empty address'}).`
        );
      }

      const sanitizedMethod = sanitizePaymentMethodConfig({
        ...rawMethodData,
        id: inferredMethodId,
      });

      if (rawMethodData.enabled !== true || sanitizedMethod.enabled !== true) {
        throw new Error(
          `Disabled payment method on ${txId}: paymentMethods/${inferredMethodId} is disabled and cannot be used for deposit approval.`
        );
      }

      if (sanitizedMethod.settlementEnabled !== true) {
        throw new Error(
          `Settlement disabled for payment method '${inferredMethodId}' (${assetSymbol}): real-money settlement for ${assetSymbol} is disabled until independent chain and exchange-rate verification is enabled.`
        );
      }

      if (sanitizedMethod.symbol !== assetSymbol) {
        throw new Error(
          `Payment method asset mismatch on ${txId}: paymentMethods/${inferredMethodId} is configured for ${sanitizedMethod.symbol}, not deposit asset ${assetSymbol}.`
        );
      }

      const depositNetCode = normalizeNetworkCode(String(txData.network || ''));
      if (depositNetCode !== sanitizedMethod.networkCode) {
        throw new Error(
          `Payment method network mismatch on ${txId}: deposit network '${txData.network}' (${depositNetCode}) does not match paymentMethods/${inferredMethodId} network '${sanitizedMethod.networkCode}'.`
        );
      }

      if (amount < sanitizedMethod.minDeposit) {
        throw new Error(
          `Deposit amount (${amount} ${assetSymbol}) is below paymentMethods/${inferredMethodId} minimum deposit (${sanitizedMethod.minDeposit} ${assetSymbol}).`
        );
      }

      authoritativeRecipientAddress = sanitizedMethod.receivingAddress;
      authoritativeMethodNetworkCode = sanitizedMethod.networkCode;
      authoritativeConfirmationsRequired = sanitizedMethod.confirmationsRequired;
      authoritativeMemoRequired = sanitizedMethod.memoRequired;
      authoritativeMemoValue = String(sanitizedMethod.memoValue || '').trim();

      // Check deposit recipientAddress (if present) for spoofing or silent address rotation
      const txRecipient = String(txData.recipientAddress || '').trim();
      if (txRecipient) {
        if (txRecipient.toLowerCase() !== authoritativeRecipientAddress.toLowerCase()) {
          const previousAddr = String(rawMethodData.previousReceivingAddress || '').trim();
          const authorizedHistorical = String(txData.authorizedHistoricalRecipient || '').trim();
          const isRotatedMatch =
            Boolean(previousAddr) && txRecipient.toLowerCase() === previousAddr.toLowerCase();

          if (isRotatedMatch) {
            if (
              authorizedHistorical &&
              authorizedHistorical.toLowerCase() === txRecipient.toLowerCase()
            ) {
              authoritativeRecipientAddress = authorizedHistorical;
            } else {
              throw new Error(
                `Address rotation detected on ${txId}: deposit targeted outdated receiving address '${txRecipient}', which was rotated to '${authoritativeRecipientAddress}'. Outdated address deposits cannot be approved without verified historical payment instructions.`
              );
            }
          } else {
            throw new Error(
              `Spoofed or mismatched recipient address on ${txId}: deposit recipientAddress '${txRecipient}' does not match authoritative owner address '${authoritativeRecipientAddress}' in paymentMethods/${inferredMethodId}.`
            );
          }
        }
      }

      // Check manualVerification recipient/network/asset/amount if supplied by admin request
      if (manualVerification) {
        const manualRecip = String(
          manualVerification.recipientAddress || manualVerification.confirmedRecipientAddress || ''
        ).trim();
        if (manualRecip && manualRecip.toLowerCase() !== authoritativeRecipientAddress.toLowerCase()) {
          throw new Error(
            `Spoofed or mismatched recipient address on ${txId}: manualVerification recipient '${manualRecip}' does not match authoritative owner address '${authoritativeRecipientAddress}' in paymentMethods/${inferredMethodId}.`
          );
        }
        const manualNet = String(
          manualVerification.network || manualVerification.confirmedNetwork || ''
        ).trim();
        if (manualNet) {
          const manualNetCode = normalizeNetworkCode(manualNet);
          if (manualNetCode !== sanitizedMethod.networkCode) {
            throw new Error(
              `Payment verification mismatch on ${txId}: manualVerification network '${manualNet}' (${manualNetCode}) does not match paymentMethods/${inferredMethodId} network '${sanitizedMethod.networkCode}'.`
            );
          }
        }
      }

      // Check required Memo / Destination Tag on deposit document
      if (authoritativeMemoRequired) {
        if (!authoritativeMemoValue) {
          throw new Error(
            `Payment method ${inferredMethodId} requires a Memo/Destination Tag, but memoValue is not configured.`
          );
        }
        const txMemo = String(txData.memoUsed || '').trim();
        if (txMemo !== authoritativeMemoValue) {
          throw new Error(
            `Missing or incorrect Memo/Destination Tag on ${txId}: expected '${authoritativeMemoValue}', received '${txMemo}'.`
          );
        }
      }
    }

    // HIGH-03: Never fabricate a verifiedPayments receipt from a manual checkbox attestation.
    // Independent blockchain verification in `verifiedPayments/txhash_<normalized>` (or `paymentVerification`) is ALWAYS required.
    const rawProof =
      paymentVerification ||
      (verifiedPaymentSnap.exists ? verifiedPaymentSnap.data() : null);

    if (!rawProof) {
      throw new Error(
        `Unverified deposit payment on ${txId}: no independent blockchain/provider verification receipt found for txHash '${rawTxHash}' (verifiedPayments/${paymentRefDocId}). Manual checkbox attestation cannot substitute for independent blockchain verification.`
      );
    }

    const verifiedProof = validateIndependentPaymentProof(rawProof, {
      userId,
      txId,
      rawTxHash,
      normalizedHash,
      paymentRefDocId,
      assetSymbol,
      amount,
      expectedNetwork: txData.network,
      allowTestnetCreditForTesting,
    });

    // Enforce paymentMethod-specific recipient, confirmationsRequired, memo, and TRC20 verifier rules against the independent proof
    if (requiresPaymentMethodBinding) {
      if (
        authoritativeMethodNetworkCode === 'TRC20' &&
        verifiedProof.provider !== 'TRONGRID_INDEXER'
      ) {
        throw new Error(
          `TRC20 deposit verification on ${txId} must use the trusted TRON verifier (provider 'TRONGRID_INDEXER', received '${verifiedProof.provider}'). Manual approval cannot bypass TRON verification.`
        );
      }

      if (
        verifiedProof.recipientAddress.toLowerCase() !==
        authoritativeRecipientAddress.toLowerCase()
      ) {
        throw new Error(
          `Spoofed or mismatched recipient address on ${txId}: verified blockchain recipient '${verifiedProof.recipientAddress}' does not match authoritative owner address '${authoritativeRecipientAddress}' in paymentMethods/${inferredMethodId}.`
        );
      }

      if (verifiedProof.confirmations < authoritativeConfirmationsRequired) {
        throw new Error(
          `Payment verification failed on ${txId}: insufficient block confirmations (${verifiedProof.confirmations} < ${authoritativeConfirmationsRequired} required by paymentMethods/${inferredMethodId}).`
        );
      }

      if (authoritativeMemoRequired) {
        const proofMemo = String(
          (rawProof as any).memoUsed ?? (rawProof as any).memo ?? ''
        ).trim();
        if (proofMemo !== authoritativeMemoValue) {
          throw new Error(
            `Missing or incorrect Memo/Destination Tag in verified payment receipt on ${txId}: expected '${authoritativeMemoValue}', received '${proofMemo}'.`
          );
        }
      }
    }

    // CRITICAL-02: Server-Side Exchange Rate Validation & BigInt Fixed-Point Conversion
    // NEVER use client-supplied txData.amountUSD, manualVerification.exchangeRateUSD, or static defaultUsdRate!
    let creditAmount = amount;
    let resolvedExchangeRateUSD: number | undefined = assetSymbol === 'USDT' ? 1.0 : undefined;
    let rateCalculationMeta: ValidatedExchangeRateCalculation | null = null;

    if (convertToPrimaryUsdt) {
      rateCalculationMeta = validateTrustedServerRateQuote(
        trustedRateQuote,
        assetSymbol,
        amount
      );
      creditAmount = rateCalculationMeta.creditedUsdtAmount;
      resolvedExchangeRateUSD = rateCalculationMeta.exchangeRateUSD;
    }

    if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
      throw new Error(`Invalid computed wallet credit amount (${creditAmount}) on deposit ${txId}.`);
    }

    // Safe BigInt fixed-point balance addition (eliminates IEEE-754 floating-point drift)
    const newBalance = addCryptoBalancesBigInt(currentBalance, creditAmount);
    const nowIso = new Date().toISOString();
    const resolvedPriceUSD =
      targetWalletSymbol === 'USDT'
        ? 1.0
        : Number(walletData.priceUSD || targetAssetSpec.defaultUsdRate);
    const resolvedChange24h =
      walletData.change24h !== undefined ? Number(walletData.change24h) : 0;

    // 1. Reserve unique global payment reference
    transaction.set(paymentRefDoc, {
      id: paymentRefDocId,
      txHash: rawTxHash,
      normalizedHash,
      userId,
      txId,
      type: 'DEPOSIT',
      asset: assetSymbol,
      amount,
      creditedAsset: targetWalletSymbol,
      creditedAmount: creditAmount,
      ...(resolvedExchangeRateUSD !== undefined ? { exchangeRateUSD: resolvedExchangeRateUSD } : {}),
      ...(rateCalculationMeta ? { rateCalculation: rateCalculationMeta } : {}),
      network: verifiedProof.network,
      recipientAddress: verifiedProof.recipientAddress,
      confirmations: verifiedProof.confirmations,
      verificationProvider: verifiedProof.provider,
      status: 'CREDITED',
      approvedBy: admin.email || admin.uid,
      approvedByUid: admin.uid,
      settledAt: nowIso,
    });

    // 2. Credit wallet balance once with full authoritative asset metadata
    if (!walletSnap.exists) {
      transaction.set(walletRef, {
        symbol: targetWalletSymbol,
        name: targetAssetSpec.name,
        balance: newBalance,
        lockedBalance: 0,
        priceUSD: resolvedPriceUSD,
        change24h: resolvedChange24h,
        updatedAt: nowIso,
      });
    } else {
      transaction.update(walletRef, {
        symbol: walletData.symbol || targetWalletSymbol,
        name: walletData.name || targetAssetSpec.name,
        balance: newBalance,
        lockedBalance: currentLocked,
        priceUSD: walletData.priceUSD !== undefined ? Number(walletData.priceUSD) : resolvedPriceUSD,
        change24h: resolvedChange24h,
        updatedAt: nowIso,
      });
    }

    const effectiveNote =
      note ||
      manualVerification?.note ||
      manualVerification?.verificationNote ||
      txData.adminNote ||
      (convertToPrimaryUsdt
        ? `Deposit of ${amount} ${assetSymbol} verified and converted to +${creditAmount} USDT (@ $${resolvedExchangeRateUSD} via ${rateCalculationMeta?.provider}).`
        : 'Deposit verified and credited to Available Balance.');

    // 3. Update deposit transaction settlement fields
    transaction.update(txRef, {
      userId,
      status: 'COMPLETED',
      settlementStatus: 'CREDITED',
      walletCredited: true,
      walletSettled: true,
      creditedAmount: creditAmount,
      creditedAsset: targetWalletSymbol,
      nativeAsset: assetSymbol,
      nativeAmount: amount,
      ...(resolvedExchangeRateUSD !== undefined ? { exchangeRateUSD: resolvedExchangeRateUSD } : {}),
      ...(rateCalculationMeta
        ? {
            exchangeRateProvider: rateCalculationMeta.provider,
            exchangeRateQuotedAt: rateCalculationMeta.quotedAt,
            exchangeRateValidityMs: rateCalculationMeta.validityWindowMs,
          }
        : {}),
      previousBalance: currentBalance,
      newBalance,
      paymentReferenceId: paymentRefDocId,
      verifiedNetwork: verifiedProof.network,
      verifiedRecipientAddress: verifiedProof.recipientAddress,
      verifiedConfirmations: verifiedProof.confirmations,
      verificationProvider: verifiedProof.provider,
      approvedAt: nowIso,
      approvedBy: admin.email || admin.uid,
      approvedByUid: admin.uid,
      adminNote: effectiveNote,
      updatedAt: nowIso,
    });

    // 4. Create immutable settlement ledger receipt
    transaction.set(settlementRef, {
      txId,
      userId,
      type: 'DEPOSIT',
      action: 'APPROVE_DEPOSIT',
      status: 'COMPLETED',
      asset: targetWalletSymbol,
      amount: creditAmount,
      nativeAsset: assetSymbol,
      nativeAmount: amount,
      ...(resolvedExchangeRateUSD !== undefined ? { exchangeRateUSD: resolvedExchangeRateUSD } : {}),
      ...(rateCalculationMeta ? { rateCalculation: rateCalculationMeta } : {}),
      txHash: rawTxHash,
      paymentReferenceId: paymentRefDocId,
      verifiedNetwork: verifiedProof.network,
      verifiedRecipientAddress: verifiedProof.recipientAddress,
      verifiedConfirmations: verifiedProof.confirmations,
      verificationProvider: verifiedProof.provider,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: currentLocked,
      processedBy: admin.email || admin.uid,
      processedByUid: admin.uid,
      processedAt: nowIso,
      note: effectiveNote,
    });

    return {
      alreadyProcessed: false,
      userId,
      txId,
      type: 'DEPOSIT',
      status: 'COMPLETED',
      asset: targetWalletSymbol,
      amount: creditAmount,
      creditedAsset: targetWalletSymbol,
      creditedAmount: creditAmount,
      nativeAsset: assetSymbol,
      nativeAmount: amount,
      exchangeRateUSD: resolvedExchangeRateUSD,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: currentLocked,
      paymentReferenceId: paymentRefDocId,
      message: convertToPrimaryUsdt
        ? `Approved ${amount} ${assetSymbol} and credited +${creditAmount} USDT to user Available Balance.`
        : `Approved and credited +${creditAmount} ${targetWalletSymbol} to user Available Balance.`,
    };
  });
}

/**
 * 2. REJECT DEPOSIT
 * Atomically marks a pending deposit as `REJECTED` without crediting any wallet balance.
 */
export async function settleDepositRejection(
  db: FirestoreLike,
  params: {
    userId: string;
    txId: string;
    admin: AdminActor;
    reason?: string;
    allowManualRejectedStatus?: boolean;
    serverTimestamp?: () => any;
  }
): Promise<SettlementResult> {
  const { userId, txId, admin, reason, allowManualRejectedStatus = false } = params;
  if (!userId || !txId) {
    throw new Error('Missing required userId or txId for deposit rejection.');
  }

  return db.runTransaction(async (transaction) => {
    const txRef = db.doc(`users/${userId}/transactions/${txId}`);
    const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);

    const [txSnap, settlementSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(settlementRef),
    ]);

    if (!txSnap.exists) {
      throw new Error(`Deposit transaction ${txId} not found for user ${userId}.`);
    }

    const txData = txSnap.data() || {};
    if (txData.type !== 'DEPOSIT') {
      throw new Error(`Invalid transaction type '${txData.type}'. Expected 'DEPOSIT'.`);
    }

    assertOwnership(txData, userId, txId);

    const assetSymbol = String(txData.asset || 'USDT').toUpperCase().trim();
    const amount = roundCrypto(Number(txData.amount || 0));

    if (txData.walletCredited === true || txData.status === 'COMPLETED') {
      throw new Error(`Deposit ${txId} was already approved and credited; cannot reject.`);
    }

    const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
    const walletSnap = await transaction.get(walletRef);
    const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentBalance = roundCrypto(Number(walletData.balance || 0));
    const currentLocked = roundCrypto(Number(walletData.lockedBalance || 0));

    if (
      txData.walletSettled === true ||
      settlementSnap.exists ||
      (!allowManualRejectedStatus && (txData.status === 'REJECTED' || txData.status === 'FAILED'))
    ) {
      return {
        alreadyProcessed: true,
        userId,
        txId,
        type: 'DEPOSIT',
        status: 'REJECTED',
        asset: assetSymbol,
        amount,
        previousBalance: currentBalance,
        newBalance: currentBalance,
        previousLockedBalance: currentLocked,
        newLockedBalance: currentLocked,
        message: 'Deposit was already marked as rejected.',
      };
    }

    const allowedStatuses = allowManualRejectedStatus
      ? [...ALLOWED_DEPOSIT_PENDING_STATUSES, 'REJECTED', 'FAILED']
      : ALLOWED_DEPOSIT_PENDING_STATUSES;

    if (!allowedStatuses.includes(txData.status)) {
      throw new Error(`Deposit ${txId} cannot be rejected from status '${txData.status}'.`);
    }

    const nowIso = new Date().toISOString();
    const cleanReason = reason || txData.rejectionReason || 'Deposit verification failed.';

    transaction.update(txRef, {
      userId,
      status: 'REJECTED',
      settlementStatus: 'REJECTED',
      walletCredited: false,
      walletSettled: true,
      rejectedAt: nowIso,
      rejectedBy: admin.email || admin.uid,
      rejectedByUid: admin.uid,
      rejectionReason: cleanReason,
      updatedAt: nowIso,
    });

    transaction.set(settlementRef, {
      txId,
      userId,
      type: 'DEPOSIT',
      action: 'REJECT_DEPOSIT',
      status: 'REJECTED',
      asset: assetSymbol,
      amount,
      previousBalance: currentBalance,
      newBalance: currentBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: currentLocked,
      processedBy: admin.email || admin.uid,
      processedByUid: admin.uid,
      processedAt: nowIso,
      reason: cleanReason,
    });

    return {
      alreadyProcessed: false,
      userId,
      txId,
      type: 'DEPOSIT',
      status: 'REJECTED',
      asset: assetSymbol,
      amount,
      previousBalance: currentBalance,
      newBalance: currentBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: currentLocked,
      message: `Deposit ${txId} rejected. No funds were credited.`,
    };
  });
}

const UTC_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface VerifiedRewardMetadata {
  rewardSource: 'DAILY_STREAK' | 'TASK_BOUNTY';
  rewardDay: string | null; // UTC YYYY-MM-DD for daily streak
  streakDay: number | null; // 1..7 for daily streak
  claimDate: string | null; // UTC YYYY-MM-DD
  taskId: string | null;    // task identifier for task bounty
  backfilledFrom?: string;
}

/**
 * Validates reward metadata (`rewardDay`, `streakDay`, `claimDate`, `taskId`) against
 * the authoritative server-side schedules (`OFFICIAL_DAILY_REWARD_SCHEDULE` and `OFFICIAL_TASK_REWARD_AMOUNTS`).
 *
 * For legacy daily streak transactions created without `rewardDay` or `taskId` (such as `tx_1792853655871_lvtxn`),
 * inspects the already-read `users/{userId}/rewards/dailyStreak` snapshot (`streakSnap`) for deterministic proof
 * of the exact streak day (1..7), UTC claim date (`YYYY-MM-DD`), and official reward amount.
 * Never invents metadata or credits unverified records.
 */
export function resolveAndVerifyRewardMetadata(params: {
  userId: string;
  txId: string;
  txData: Record<string, any>;
  amount: number;
  streakSnap: DocSnapshotLike;
}): VerifiedRewardMetadata {
  const { userId, txId, txData, amount, streakSnap } = params;

  const rawTaskId = typeof txData.taskId === 'string' ? txData.taskId.trim() : '';
  const hasTaskId = rawTaskId.length > 0;
  const rawRewardDay = txData.rewardDay;
  const hasRewardDay =
    rawRewardDay !== undefined &&
    rawRewardDay !== null &&
    String(rawRewardDay).trim() !== '';
  const rawStreakDay = txData.streakDay;
  const hasStreakDay =
    rawStreakDay !== undefined &&
    rawStreakDay !== null &&
    Number.isInteger(Number(rawStreakDay));

  // Case 1: Task / Bounty Reward (has taskId)
  if (hasTaskId) {
    const expectedTaskAmount = OFFICIAL_TASK_REWARD_AMOUNTS[rawTaskId];
    if (expectedTaskAmount === undefined) {
      throw new Error(
        `Unrecognized taskId '${rawTaskId}' on reward transaction ${txId}. Cannot verify against official bounty schedule.`
      );
    }
    if (expectedTaskAmount !== amount) {
      throw new Error(
        `Reward amount (${amount} USDT) does not match official bounty schedule (${expectedTaskAmount} USDT) for task '${rawTaskId}'.`
      );
    }
    const claimDate =
      typeof txData.claimDate === 'string' && UTC_DATE_REGEX.test(txData.claimDate.trim())
        ? txData.claimDate.trim()
        : typeof txData.timestamp === 'string' && UTC_DATE_REGEX.test(txData.timestamp.slice(0, 10))
        ? txData.timestamp.slice(0, 10)
        : null;

    return {
      rewardSource: 'TASK_BOUNTY',
      rewardDay: null,
      streakDay: null,
      claimDate,
      taskId: rawTaskId,
    };
  }

  // Case 2: Daily Streak Reward with explicit rewardDay or streakDay metadata
  if (hasRewardDay || hasStreakDay) {
    let resolvedUtcDate: string | null = null;
    let resolvedStreakDay: number | null = null;

    if (typeof rawRewardDay === 'string' && UTC_DATE_REGEX.test(rawRewardDay.trim())) {
      resolvedUtcDate = rawRewardDay.trim();
    } else if (
      typeof rawRewardDay === 'number' ||
      (typeof rawRewardDay === 'string' && /^\d+$/.test(rawRewardDay.trim()))
    ) {
      const parsedDay = Number(rawRewardDay);
      if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 7) {
        throw new Error(`Invalid daily streak rewardDay (${rawRewardDay}) on transaction ${txId}.`);
      }
      resolvedStreakDay = parsedDay;
    } else if (hasRewardDay) {
      throw new Error(
        `Invalid daily streak rewardDay (${rawRewardDay}) on transaction ${txId}. Expected UTC date (YYYY-MM-DD) or streak day (1-7).`
      );
    }

    if (hasStreakDay) {
      const parsedStreak = Number(rawStreakDay);
      if (!Number.isInteger(parsedStreak) || parsedStreak < 1 || parsedStreak > 7) {
        throw new Error(`Invalid daily streakDay (${rawStreakDay}) on transaction ${txId}.`);
      }
      if (resolvedStreakDay !== null && resolvedStreakDay !== parsedStreak) {
        throw new Error(
          `Conflicting rewardDay (${resolvedStreakDay}) and streakDay (${parsedStreak}) on transaction ${txId}.`
        );
      }
      resolvedStreakDay = parsedStreak;
    }

    if (!resolvedUtcDate) {
      if (typeof txData.claimDate === 'string' && UTC_DATE_REGEX.test(txData.claimDate.trim())) {
        resolvedUtcDate = txData.claimDate.trim();
      } else if (streakSnap.exists) {
        const sData = streakSnap.data() || {};
        const history: any[] = Array.isArray(sData.claimHistory) ? sData.claimHistory : [];
        const matchedEntry = history.find(
          (h) =>
            h &&
            (h.txId === txId ||
              (resolvedStreakDay !== null &&
                Number(h.day) === resolvedStreakDay &&
                roundCrypto(Number(h.rewardUSD ?? h.amount ?? 0)) === amount))
        );
        if (matchedEntry && typeof matchedEntry.date === 'string' && UTC_DATE_REGEX.test(matchedEntry.date)) {
          resolvedUtcDate = matchedEntry.date;
        } else if (typeof sData.lastClaimDate === 'string' && UTC_DATE_REGEX.test(sData.lastClaimDate)) {
          resolvedUtcDate = sData.lastClaimDate;
        }
      }
      if (!resolvedUtcDate && typeof txData.timestamp === 'string' && UTC_DATE_REGEX.test(txData.timestamp.slice(0, 10))) {
        resolvedUtcDate = txData.timestamp.slice(0, 10);
      }
    }

    if (resolvedStreakDay === null) {
      // Infer streakDay from streakSnap history or note or unique official schedule match
      if (streakSnap.exists) {
        const sData = streakSnap.data() || {};
        const history: any[] = Array.isArray(sData.claimHistory) ? sData.claimHistory : [];
        const matchedEntry = history.find(
          (h) =>
            h &&
            (h.txId === txId ||
              (resolvedUtcDate &&
                h.date === resolvedUtcDate &&
                roundCrypto(Number(h.rewardUSD ?? h.amount ?? 0)) === amount))
        );
        if (matchedEntry && Number.isInteger(Number(matchedEntry.day)) && Number(matchedEntry.day) >= 1 && Number(matchedEntry.day) <= 7) {
          resolvedStreakDay = Number(matchedEntry.day);
        } else if (
          resolvedUtcDate &&
          sData.lastClaimDate === resolvedUtcDate &&
          Number.isInteger(Number(sData.currentStreak)) &&
          Number(sData.currentStreak) >= 1 &&
          Number(sData.currentStreak) <= 7 &&
          OFFICIAL_DAILY_REWARD_SCHEDULE[Number(sData.currentStreak)] === amount
        ) {
          resolvedStreakDay = Number(sData.currentStreak);
        }
      }

      if (resolvedStreakDay === null && typeof txData.note === 'string') {
        const dayMatch = txData.note.match(/Day\s+([1-7])\b/i);
        if (dayMatch) {
          resolvedStreakDay = Number(dayMatch[1]);
        }
      }

      if (resolvedStreakDay === null) {
        const matchingDays = Object.entries(OFFICIAL_DAILY_REWARD_SCHEDULE)
          .filter(([, schedAmt]) => schedAmt === amount)
          .map(([d]) => Number(d));
        if (matchingDays.length === 1) {
          resolvedStreakDay = matchingDays[0];
        }
      }
    }

    if (resolvedStreakDay === null || resolvedStreakDay < 1 || resolvedStreakDay > 7) {
      throw new Error(
        `Invalid daily streak rewardDay (${rawRewardDay}) on transaction ${txId}: could not determine valid streak day (1-7).`
      );
    }

    const expectedDailyAmount = OFFICIAL_DAILY_REWARD_SCHEDULE[resolvedStreakDay];
    if (expectedDailyAmount !== amount) {
      throw new Error(
        `Reward amount (${amount} USDT) on ${txId} does not match official Day ${resolvedStreakDay} schedule (${expectedDailyAmount} USDT).`
      );
    }

    return {
      rewardSource: 'DAILY_STREAK',
      rewardDay: resolvedUtcDate || String(resolvedStreakDay),
      streakDay: resolvedStreakDay,
      claimDate: resolvedUtcDate,
      taskId: null,
    };
  }

  // Case 3: Legacy transaction missing both `rewardDay` and `taskId` (e.g. `tx_1792853655871_lvtxn`).
  // Never invent metadata: require deterministic proof in `users/{userId}/rewards/dailyStreak`.
  if (streakSnap.exists) {
    const streakData = streakSnap.data() || {};
    const history: any[] = Array.isArray(streakData.claimHistory) ? streakData.claimHistory : [];
    const txDatePrefix =
      typeof txData.claimDate === 'string' && UTC_DATE_REGEX.test(txData.claimDate.trim())
        ? txData.claimDate.trim()
        : typeof txData.timestamp === 'string' && UTC_DATE_REGEX.test(txData.timestamp.slice(0, 10))
        ? txData.timestamp.slice(0, 10)
        : null;
    const noteDayMatch =
      typeof txData.note === 'string' ? txData.note.match(/Day\s+([1-7])\b/i) : null;
    const noteDay = noteDayMatch ? Number(noteDayMatch[1]) : null;

    // 3a. Exact txId match in claimHistory
    let provenEntry = history.find((h) => h && h.txId === txId);

    // 3b. Match pending claimHistory item by date/day and exact official amount
    if (!provenEntry) {
      const candidates = history.filter((h) => {
        if (!h || h.status === 'CLAIMED' || h.status === 'REJECTED') return false;
        const hDay = Number(h.day);
        const hDate = typeof h.date === 'string' ? h.date.trim() : '';
        const hAmt = roundCrypto(Number(h.rewardUSD ?? h.amount ?? 0));
        if (!Number.isInteger(hDay) || hDay < 1 || hDay > 7) return false;
        if (!UTC_DATE_REGEX.test(hDate)) return false;
        if (OFFICIAL_DAILY_REWARD_SCHEDULE[hDay] !== amount) return false;
        if (hAmt > 0 && hAmt !== amount) return false;
        if (txDatePrefix && hDate !== txDatePrefix) return false;
        if (noteDay !== null && hDay !== noteDay) return false;
        return true;
      });
      if (candidates.length === 1) {
        provenEntry = candidates[0];
      }
    }

    if (provenEntry) {
      const provenDay = Number(provenEntry.day);
      const provenDate = typeof provenEntry.date === 'string' ? provenEntry.date.trim() : '';
      if (
        Number.isInteger(provenDay) &&
        provenDay >= 1 &&
        provenDay <= 7 &&
        UTC_DATE_REGEX.test(provenDate) &&
        OFFICIAL_DAILY_REWARD_SCHEDULE[provenDay] === amount
      ) {
        return {
          rewardSource: 'DAILY_STREAK',
          rewardDay: provenDate,
          streakDay: provenDay,
          claimDate: provenDate,
          taskId: null,
          backfilledFrom: 'rewards/dailyStreak.claimHistory',
        };
      }
    }

    // 3c. Top-level dailyStreak state proof when claimStatus is PENDING_VERIFICATION
    const topStreakDay = Number(streakData.currentStreak);
    const topLastClaimDate =
      typeof streakData.lastClaimDate === 'string' ? streakData.lastClaimDate.trim() : '';
    if (
      streakData.claimStatus === 'PENDING_VERIFICATION' &&
      Number.isInteger(topStreakDay) &&
      topStreakDay >= 1 &&
      topStreakDay <= 7 &&
      UTC_DATE_REGEX.test(topLastClaimDate) &&
      OFFICIAL_DAILY_REWARD_SCHEDULE[topStreakDay] === amount &&
      (!txDatePrefix || txDatePrefix === topLastClaimDate) &&
      (noteDay === null || noteDay === topStreakDay)
    ) {
      return {
        rewardSource: 'DAILY_STREAK',
        rewardDay: topLastClaimDate,
        streakDay: topStreakDay,
        claimDate: topLastClaimDate,
        taskId: null,
        backfilledFrom: 'rewards/dailyStreak',
      };
    }
  }

  throw new Error(
    `Reward transaction ${txId} is missing both rewardDay and taskId metadata and cannot be verified against users/${userId}/rewards/dailyStreak. Use Reject Reward to cancel this unverified request.`
  );
}

/**
 * 3. APPROVE DAILY BONUS / BOUNTY REWARD (`TASK_REWARD`)
 * Atomically verifies reward claim, credits `users/{userId}/wallet/USDT.balance`,
 * updates `users/{userId}/rewards/dailyStreak` if applicable, marks transaction `COMPLETED`,
 * and records `users/{userId}/settlements/{txId}`.
 *
 * NOTE: All Firestore reads (`txRef`, `settlementRef`, `walletRef`, `streakRef`) are
 * executed upfront via `Promise.all` before any writes are staged.
 */
export async function settleRewardApproval(
  db: FirestoreLike,
  params: {
    userId: string;
    txId: string;
    admin: AdminActor;
    note?: string;
    allowManualCompletedStatus?: boolean;
    serverTimestamp?: () => any;
  }
): Promise<SettlementResult> {
  const { userId, txId, admin, note, allowManualCompletedStatus = false } = params;
  if (!userId || !txId) {
    throw new Error('Missing required userId or txId for reward approval.');
  }

  return db.runTransaction(async (transaction) => {
    const txRef = db.doc(`users/${userId}/transactions/${txId}`);
    const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);
    const walletRef = db.doc(`users/${userId}/wallet/USDT`);
    const streakRef = db.doc(`users/${userId}/rewards/dailyStreak`);

    // Execute ALL reads upfront before any transaction write
    const [txSnap, settlementSnap, walletSnap, streakSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(settlementRef),
      transaction.get(walletRef),
      transaction.get(streakRef),
    ]);

    if (!txSnap.exists) {
      throw new Error(`Reward claim transaction ${txId} not found for user ${userId}.`);
    }

    const txData = txSnap.data() || {};
    if (txData.type !== 'TASK_REWARD') {
      throw new Error(`Invalid transaction type '${txData.type}'. Expected 'TASK_REWARD'.`);
    }

    assertOwnership(txData, userId, txId);

    const assetSymbol = String(txData.asset || 'USDT').toUpperCase().trim();
    if (assetSymbol !== 'USDT') {
      throw new Error(`Invalid reward asset '${assetSymbol}' on ${txId}. All bonus and task rewards must settle in USDT.`);
    }

    const amount = roundCrypto(Number(txData.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Invalid reward amount (${txData.amount}) on transaction ${txId}.`);
    }

    // Authoritative server-side reward schedule validation
    if (!ALLOWED_REWARD_AMOUNTS.has(amount)) {
      throw new Error(
        `Reward amount (${amount} USDT) on ${txId} does not match any official server-side reward tier.`
      );
    }

    const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentBalance = roundCrypto(Number(walletData.balance || 0));
    const currentLocked = roundCrypto(Number(walletData.lockedBalance || 0));

    // Idempotency guard: if already credited/settled, return safe no-op
    if (
      txData.walletCredited === true ||
      txData.walletSettled === true ||
      settlementSnap.exists
    ) {
      return {
        alreadyProcessed: true,
        userId,
        txId,
        type: 'TASK_REWARD',
        status: 'COMPLETED',
        asset: assetSymbol,
        amount,
        previousBalance: currentBalance,
        newBalance: currentBalance,
        previousLockedBalance: currentLocked,
        newLockedBalance: currentLocked,
        message: 'Reward claim has already been approved and credited.',
      };
    }

    assertNotContradictoryForApproval(txData, txId);

    // Validate rewardDay / streakDay / taskId metadata (or authoritative dailyStreak proof for legacy records)
    const verifiedMeta = resolveAndVerifyRewardMetadata({
      userId,
      txId,
      txData,
      amount,
      streakSnap,
    });

    const allowedStatuses = allowManualCompletedStatus
      ? [...ALLOWED_REWARD_PENDING_STATUSES, 'COMPLETED']
      : ALLOWED_REWARD_PENDING_STATUSES;

    if (!allowedStatuses.includes(txData.status)) {
      if (!allowManualCompletedStatus && txData.status === 'COMPLETED') {
        throw new Error(
          `Reward transaction ${txId} has status 'COMPLETED' without prior settlement verification. Standard approval requires a pending state (${ALLOWED_REWARD_PENDING_STATUSES.join(' or ')}).`
        );
      }
      throw new Error(
        `Reward claim ${txId} cannot be approved from status '${txData.status}'. Required: ${ALLOWED_REWARD_PENDING_STATUSES.join(' or ')}.`
      );
    }

    // Per-task / per-day deterministic idempotency lock (ALL READS BEFORE WRITES)
    const claimLockKey =
      verifiedMeta.rewardSource === 'TASK_BOUNTY' && verifiedMeta.taskId
        ? `task_${String(verifiedMeta.taskId).trim().replace(/[^a-zA-Z0-9_-]/g, '')}`
        : verifiedMeta.rewardSource === 'DAILY_STREAK' && verifiedMeta.rewardDay
        ? `streak_${String(verifiedMeta.rewardDay).trim().replace(/[^a-zA-Z0-9_-]/g, '')}`
        : null;

    const rewardClaimLockRef = claimLockKey
      ? db.doc(`users/${userId}/rewardClaims/${claimLockKey}`)
      : null;
    const rewardClaimLockSnap = rewardClaimLockRef
      ? await transaction.get(rewardClaimLockRef)
      : null;

    if (rewardClaimLockSnap && rewardClaimLockSnap.exists) {
      const existingLock = rewardClaimLockSnap.data() || {};
      if (existingLock.txId && String(existingLock.txId) !== String(txId)) {
        throw new Error(
          `Duplicate reward claim: '${claimLockKey}' has already been approved and credited for user ${userId} (txId: ${existingLock.txId}).`
        );
      }
    }

    const newBalance = roundCrypto(currentBalance + amount);
    const nowIso = new Date().toISOString();

    if (rewardClaimLockRef && claimLockKey) {
      transaction.set(rewardClaimLockRef, {
        claimKey: claimLockKey,
        userId,
        txId,
        rewardSource: verifiedMeta.rewardSource,
        taskId: verifiedMeta.taskId,
        rewardDay: verifiedMeta.rewardDay,
        amount,
        approvedAt: nowIso,
        approvedBy: admin.email || admin.uid,
        approvedByUid: admin.uid,
      });
    }

    if (!walletSnap.exists) {
      transaction.set(walletRef, {
        symbol: 'USDT',
        name: 'Tether USD',
        balance: newBalance,
        lockedBalance: 0,
        priceUSD: 1.0,
        change24h: 0.01,
        updatedAt: nowIso,
      });
    } else {
      transaction.update(walletRef, {
        balance: newBalance,
        updatedAt: nowIso,
      });
    }

    const txUpdatePayload: Record<string, any> = {
      userId,
      status: 'COMPLETED',
      settlementStatus: 'CREDITED',
      walletCredited: true,
      walletSettled: true,
      creditedAmount: amount,
      creditedAsset: 'USDT',
      rewardSource: verifiedMeta.rewardSource,
      ...(verifiedMeta.rewardDay !== null ? { rewardDay: verifiedMeta.rewardDay } : {}),
      ...(verifiedMeta.streakDay !== null ? { streakDay: verifiedMeta.streakDay } : {}),
      ...(verifiedMeta.claimDate !== null ? { claimDate: verifiedMeta.claimDate } : {}),
      ...(verifiedMeta.taskId !== null ? { taskId: verifiedMeta.taskId } : {}),
      ...(verifiedMeta.backfilledFrom ? { metadataBackfilledFrom: verifiedMeta.backfilledFrom } : {}),
      previousBalance: currentBalance,
      newBalance,
      approvedAt: nowIso,
      approvedBy: admin.email || admin.uid,
      approvedByUid: admin.uid,
      adminNote: note || txData.adminNote || 'Reward claim verified and credited to USDT Available Balance.',
      updatedAt: nowIso,
    };

    transaction.update(txRef, txUpdatePayload);

    transaction.set(settlementRef, {
      txId,
      userId,
      type: 'TASK_REWARD',
      action: 'APPROVE_REWARD',
      status: 'COMPLETED',
      asset: 'USDT',
      amount,
      rewardSource: verifiedMeta.rewardSource,
      rewardDay: verifiedMeta.rewardDay,
      streakDay: verifiedMeta.streakDay,
      taskId: verifiedMeta.taskId,
      claimDate: verifiedMeta.claimDate,
      ...(verifiedMeta.backfilledFrom ? { metadataBackfilledFrom: verifiedMeta.backfilledFrom } : {}),
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: currentLocked,
      processedBy: admin.email || admin.uid,
      processedByUid: admin.uid,
      processedAt: nowIso,
      note: note || 'Reward claim verified and credited to USDT Available Balance.',
    });

    // Synchronize `users/{userId}/rewards/dailyStreak` ONLY for daily streak rewards
    if (verifiedMeta.rewardSource === 'DAILY_STREAK' && streakSnap.exists) {
      const streakData = streakSnap.data() || {};
      const history = Array.isArray(streakData.claimHistory) ? [...streakData.claimHistory] : [];
      let updatedHistory = false;

      const nextHistory = history.map((entry: any) => {
        if (
          entry.txId === txId ||
          (verifiedMeta.claimDate &&
            entry.date === verifiedMeta.claimDate &&
            Number(entry.day) === Number(verifiedMeta.streakDay))
        ) {
          updatedHistory = true;
          return {
            ...entry,
            txId: entry.txId || txId,
            status: 'CLAIMED',
            approvedAt: nowIso,
          };
        }
        return entry;
      });

      if (updatedHistory || streakData.claimStatus === 'PENDING_VERIFICATION') {
        transaction.update(streakRef, {
          claimStatus: 'CLAIMED',
          approvalStatus: 'APPROVED',
          approvedAmount: amount,
          walletCredited: true,
          claimHistory: nextHistory,
          approvedAt: nowIso,
          approvedBy: admin.email || admin.uid,
          updatedAt: nowIso,
        });
      }
    }

    return {
      alreadyProcessed: false,
      userId,
      txId,
      type: 'TASK_REWARD',
      status: 'COMPLETED',
      asset: 'USDT',
      amount,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: currentLocked,
      message: `Approved and credited +${amount.toFixed(2)} USDT reward to user Available Balance.`,
    };
  });
}

/**
 * 4. REJECT DAILY BONUS / BOUNTY REWARD (`TASK_REWARD`)
 * Atomically marks a pending reward claim as `REJECTED` without crediting wallet balance.
 * All reads (`txRef`, `settlementRef`, `walletRef`, `streakRef`) are executed before any writes.
 */
export async function settleRewardRejection(
  db: FirestoreLike,
  params: {
    userId: string;
    txId: string;
    admin: AdminActor;
    reason?: string;
    allowManualRejectedStatus?: boolean;
    serverTimestamp?: () => any;
  }
): Promise<SettlementResult> {
  const { userId, txId, admin, reason, allowManualRejectedStatus = false } = params;
  if (!userId || !txId) {
    throw new Error('Missing required userId or txId for reward rejection.');
  }

  return db.runTransaction(async (transaction) => {
    const txRef = db.doc(`users/${userId}/transactions/${txId}`);
    const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);
    const walletRef = db.doc(`users/${userId}/wallet/USDT`);
    const streakRef = db.doc(`users/${userId}/rewards/dailyStreak`);

    // Execute ALL reads upfront before any transaction write
    const [txSnap, settlementSnap, walletSnap, streakSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(settlementRef),
      transaction.get(walletRef),
      transaction.get(streakRef),
    ]);

    if (!txSnap.exists) {
      throw new Error(`Reward claim transaction ${txId} not found for user ${userId}.`);
    }

    const txData = txSnap.data() || {};
    if (txData.type !== 'TASK_REWARD') {
      throw new Error(`Invalid transaction type '${txData.type}'. Expected 'TASK_REWARD'.`);
    }

    assertOwnership(txData, userId, txId);

    const assetSymbol = String(txData.asset || 'USDT').toUpperCase().trim();
    const amount = roundCrypto(Number(txData.amount || 0));

    if (txData.walletCredited === true || txData.status === 'COMPLETED') {
      throw new Error(`Reward claim ${txId} was already approved and credited; cannot reject.`);
    }

    const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentBalance = roundCrypto(Number(walletData.balance || 0));
    const currentLocked = roundCrypto(Number(walletData.lockedBalance || 0));

    if (
      txData.walletSettled === true ||
      settlementSnap.exists ||
      (!allowManualRejectedStatus && (txData.status === 'REJECTED' || txData.status === 'FAILED'))
    ) {
      return {
        alreadyProcessed: true,
        userId,
        txId,
        type: 'TASK_REWARD',
        status: 'REJECTED',
        asset: assetSymbol,
        amount,
        previousBalance: currentBalance,
        newBalance: currentBalance,
        previousLockedBalance: currentLocked,
        newLockedBalance: currentLocked,
        message: 'Reward claim was already marked as rejected.',
      };
    }

    const nowIso = new Date().toISOString();
    const cleanReason = reason || txData.rejectionReason || 'Reward verification declined by administrator.';

    transaction.update(txRef, {
      userId,
      status: 'REJECTED',
      settlementStatus: 'REJECTED',
      walletCredited: false,
      walletSettled: true,
      rejectedAt: nowIso,
      rejectedBy: admin.email || admin.uid,
      rejectedByUid: admin.uid,
      rejectionReason: cleanReason,
      updatedAt: nowIso,
    });

    transaction.set(settlementRef, {
      txId,
      userId,
      type: 'TASK_REWARD',
      action: 'REJECT_REWARD',
      status: 'REJECTED',
      asset: assetSymbol,
      amount,
      previousBalance: currentBalance,
      newBalance: currentBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: currentLocked,
      processedBy: admin.email || admin.uid,
      processedByUid: admin.uid,
      processedAt: nowIso,
      reason: cleanReason,
    });

    if (streakSnap.exists) {
      const streakData = streakSnap.data() || {};
      const history = Array.isArray(streakData.claimHistory) ? [...streakData.claimHistory] : [];
      const nextHistory = history.map((entry: any) => {
        if (entry.txId === txId) {
          return { ...entry, status: 'REJECTED', rejectedAt: nowIso };
        }
        return entry;
      });
      transaction.update(streakRef, {
        claimStatus: 'REJECTED',
        approvalStatus: 'REJECTED',
        claimHistory: nextHistory,
        updatedAt: nowIso,
      });
    }

    return {
      alreadyProcessed: false,
      userId,
      txId,
      type: 'TASK_REWARD',
      status: 'REJECTED',
      asset: assetSymbol,
      amount,
      previousBalance: currentBalance,
      newBalance: currentBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: currentLocked,
      message: `Reward claim ${txId} rejected. No funds were credited.`,
    };
  });
}

/**
 * 5. RESERVE WITHDRAWAL REQUEST (USER SUBMISSION)
 * Atomically checks `users/{userId}/wallet/{asset}.balance >= amount`,
 * deducts `amount` from `balance`, adds `amount` to `lockedBalance`,
 * and creates `users/{userId}/transactions/{txId}` with `reservedFromBalance: true`.
 */
export async function reserveWithdrawalRequest(
  db: FirestoreLike,
  params: {
    userId: string;
    txId?: string;
    assetSymbol: string;
    network: string;
    amount: number;
    fee?: number;
    usdRate?: number;
    toAddress: string;
    serverTimestamp?: () => any;
  }
): Promise<{
  txId: string;
  asset: string;
  amount: number;
  fee: number;
  netPayoutAmount: number;
  previousBalance: number;
  newBalance: number;
  previousLockedBalance: number;
  newLockedBalance: number;
}> {
  const cleanAssetSymbol = String(params.assetSymbol || '').toUpperCase().trim();
  const assetSpec = AUTHORITATIVE_ASSET_CONFIG[cleanAssetSymbol];
  if (!assetSpec) {
    throw new Error(`Unsupported withdrawal asset '${cleanAssetSymbol}'.`);
  }

  const cleanAmount = roundCrypto(Number(params.amount));
  const cleanFee =
    Number.isFinite(params.fee) && Number(params.fee) > 0
      ? roundCrypto(Number(params.fee))
      : assetSpec.withdrawFee;
  const cleanAddress = String(params.toAddress || '').trim();
  const cleanNetwork = String(params.network || '').trim();
  const resolvedUsdRate =
    Number.isFinite(params.usdRate) && Number(params.usdRate) > 0
      ? Number(params.usdRate)
      : assetSpec.defaultUsdRate;

  if (!params.userId) {
    throw new Error('Authentication required.');
  }
  if (!cleanNetwork) {
    throw new Error('Withdrawal network is required.');
  }
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    throw new Error('Invalid withdrawal amount.');
  }
  if (cleanAmount < assetSpec.minWithdraw) {
    throw new Error(
      `Minimum withdrawal amount for ${cleanAssetSymbol} is ${assetSpec.minWithdraw} ${cleanAssetSymbol}.`
    );
  }
  if (cleanAmount <= cleanFee) {
    throw new Error(`Withdrawal amount must be greater than the network fee (${cleanFee} ${cleanAssetSymbol}).`);
  }
  if (!cleanAddress || cleanAddress.length < 12) {
    throw new Error('Invalid recipient wallet address.');
  }

  const netPayoutAmount = roundCrypto(cleanAmount - cleanFee);
  const txId =
    params.txId ||
    `TX-WD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  return db.runTransaction(async (transaction) => {
    const walletRef = db.doc(`users/${params.userId}/wallet/${cleanAssetSymbol}`);
    const txRef = db.doc(`users/${params.userId}/transactions/${txId}`);

    const [walletSnap, existingTxSnap] = await Promise.all([
      transaction.get(walletRef),
      transaction.get(txRef),
    ]);

    if (existingTxSnap.exists) {
      throw new Error(`Duplicate withdrawal request ID ${txId}.`);
    }

    const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentBalance = roundCrypto(Number(walletData.balance || 0));
    const currentLocked = roundCrypto(Number(walletData.lockedBalance || 0));

    if (currentBalance < cleanAmount) {
      throw new Error(
        `Insufficient available ${cleanAssetSymbol} balance. Available: ${currentBalance} ${cleanAssetSymbol}, Requested: ${cleanAmount} ${cleanAssetSymbol}.`
      );
    }

    const newBalance = roundCrypto(currentBalance - cleanAmount);
    const newLocked = roundCrypto(currentLocked + cleanAmount);
    const nowIso = new Date().toISOString();

    transaction.set(
      walletRef,
      {
        symbol: cleanAssetSymbol,
        name: walletData.name || assetSpec.name,
        balance: newBalance,
        lockedBalance: newLocked,
        priceUSD: Number(walletData.priceUSD || resolvedUsdRate),
        change24h: Number(walletData.change24h || 0),
        updatedAt: nowIso,
      },
      { merge: true }
    );

    transaction.set(txRef, {
      id: txId,
      userId: params.userId,
      type: 'WITHDRAWAL',
      asset: cleanAssetSymbol,
      amount: cleanAmount,
      amountUSD: Number((cleanAmount * resolvedUsdRate).toFixed(2)),
      fee: cleanFee,
      netPayoutAmount,
      status: 'PENDING_REVIEW',
      settlementStatus: 'RESERVED_IN_ESCROW',
      timestamp: nowIso,
      network: cleanNetwork,
      toAddress: cleanAddress,
      note: `Withdrawal request to ${cleanAddress.substring(0, 6)}...${cleanAddress.substring(cleanAddress.length - 4)} (Net payout: ${netPayoutAmount} ${cleanAssetSymbol})`,
      reservedFromBalance: true,
      walletCredited: false,
      walletSettled: false,
      refunded: false,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: newLocked,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    return {
      txId,
      asset: cleanAssetSymbol,
      amount: cleanAmount,
      fee: cleanFee,
      netPayoutAmount,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: newLocked,
    };
  });
}

/**
 * 6. APPROVE WITHDRAWAL (PAYMENT SETTLEMENT)
 * Finalizes an approved withdrawal payout:
 * - If `reservedFromBalance === true`, releases `amount` from `lockedBalance` (does NOT deduct `balance` again).
 * - If legacy unreserved (`reservedFromBalance !== true`), verifies `balance >= amount` and deducts `amount` from `balance`.
 * - NEVER credits wallet balance (preventing withdrawal-as-deposit bug).
 * - Records `netPayoutAmount = amount - fee`, `payoutTxHash`, `settlementStatus: 'PAID'`, and `status: 'COMPLETED'`.
 */
export async function settleWithdrawalApproval(
  db: FirestoreLike,
  params: {
    userId: string;
    txId: string;
    admin: AdminActor;
    payoutTxHash?: string;
    note?: string;
    allowManualCompletedStatus?: boolean;
    serverTimestamp?: () => any;
  }
): Promise<SettlementResult> {
  const { userId, txId, admin, payoutTxHash, note, allowManualCompletedStatus = false } = params;
  if (!userId || !txId) {
    throw new Error('Missing required userId or txId for withdrawal approval.');
  }

  return db.runTransaction(async (transaction) => {
    const txRef = db.doc(`users/${userId}/transactions/${txId}`);
    const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);

    const [txSnap, settlementSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(settlementRef),
    ]);

    if (!txSnap.exists) {
      throw new Error(`Withdrawal transaction ${txId} not found for user ${userId}.`);
    }

    const txData = txSnap.data() || {};
    if (txData.type !== 'WITHDRAWAL') {
      throw new Error(`Invalid transaction type '${txData.type}'. Expected 'WITHDRAWAL'.`);
    }

    assertOwnership(txData, userId, txId);

    const assetSymbol = String(txData.asset || '').toUpperCase().trim();
    const assetSpec = AUTHORITATIVE_ASSET_CONFIG[assetSymbol];
    if (!assetSpec) {
      throw new Error(`Unsupported or missing withdrawal asset symbol '${assetSymbol}' on transaction ${txId}.`);
    }

    const amount = roundCrypto(Number(txData.amount));
    const rawFee = Number(txData.fee);
    const fee = Number.isFinite(rawFee) && rawFee > 0 ? roundCrypto(rawFee) : assetSpec.withdrawFee;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Invalid withdrawal amount (${txData.amount}) on transaction ${txId}.`);
    }
    if (amount <= fee) {
      throw new Error(
        `Withdrawal amount (${amount} ${assetSymbol}) must exceed the network fee (${fee} ${assetSymbol}).`
      );
    }

    const cleanToAddress = typeof txData.toAddress === 'string' ? txData.toAddress.trim() : '';
    if (cleanToAddress.length < 12) {
      throw new Error(`Withdrawal transaction ${txId} is missing a valid recipient address.`);
    }

    const netPayoutAmount = roundCrypto(amount - fee);

    const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
    const walletSnap = await transaction.get(walletRef);
    const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentBalance = roundCrypto(Number(walletData.balance || 0));
    const currentLocked = roundCrypto(Number(walletData.lockedBalance || 0));

    // Idempotency guard: if already settled in ledger, return safe no-op
    if (
      txData.walletSettled === true ||
      settlementSnap.exists
    ) {
      return {
        alreadyProcessed: true,
        userId,
        txId,
        type: 'WITHDRAWAL',
        status: 'COMPLETED',
        asset: assetSymbol,
        amount,
        fee,
        netPayoutAmount,
        previousBalance: currentBalance,
        newBalance: currentBalance,
        previousLockedBalance: currentLocked,
        newLockedBalance: currentLocked,
        message: 'Withdrawal has already been settled and marked as paid.',
      };
    }

    assertNotContradictoryForApproval(txData, txId);

    const allowedStatuses = allowManualCompletedStatus
      ? [...ALLOWED_WITHDRAWAL_PENDING_STATUSES, 'COMPLETED']
      : ALLOWED_WITHDRAWAL_PENDING_STATUSES;

    if (!allowedStatuses.includes(txData.status)) {
      if (!allowManualCompletedStatus && txData.status === 'COMPLETED') {
        throw new Error(
          `Withdrawal transaction ${txId} has status 'COMPLETED' without prior settlement verification. Standard approval requires a pending state (${ALLOWED_WITHDRAWAL_PENDING_STATUSES.join(' or ')}).`
        );
      }
      throw new Error(
        `Withdrawal ${txId} cannot be approved from status '${txData.status}'. Required: ${ALLOWED_WITHDRAWAL_PENDING_STATUSES.join(' or ')}.`
      );
    }

    let newBalance = currentBalance;
    let newLocked = currentLocked;

    if (txData.reservedFromBalance === true) {
      // Funds were already deducted from Available Balance into lockedBalance on submission.
      // Release the reserved escrow without deducting Available Balance a second time.
      newLocked = roundCrypto(Math.max(0, currentLocked - amount));
    } else {
      // Legacy unreserved withdrawal: verify sufficient Available Balance and deduct once.
      if (currentBalance < amount) {
        throw new Error(
          `Insufficient available ${assetSymbol} balance (${currentBalance}) to settle unreserved withdrawal of ${amount} ${assetSymbol}.`
        );
      }
      newBalance = roundCrypto(currentBalance - amount);
    }

    const nowIso = new Date().toISOString();

    if (!walletSnap.exists) {
      transaction.set(walletRef, {
        symbol: assetSymbol,
        name: assetSpec.name,
        balance: newBalance,
        lockedBalance: newLocked,
        priceUSD: assetSpec.defaultUsdRate,
        change24h: 0,
        updatedAt: nowIso,
      });
    } else {
      transaction.update(walletRef, {
        balance: newBalance,
        lockedBalance: newLocked,
        updatedAt: nowIso,
      });
    }

    transaction.update(txRef, {
      userId,
      status: 'COMPLETED',
      settlementStatus: 'PAID',
      walletSettled: true,
      walletCredited: false,
      fee,
      netPayoutAmount,
      payoutTxHash: payoutTxHash || txData.payoutTxHash || txData.txHash || null,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: newLocked,
      approvedAt: nowIso,
      approvedBy: admin.email || admin.uid,
      approvedByUid: admin.uid,
      adminNote:
        note ||
        txData.adminNote ||
        `Withdrawal settled and paid (${netPayoutAmount} ${assetSymbol} net after ${fee} ${assetSymbol} fee).`,
      updatedAt: nowIso,
    });

    transaction.set(settlementRef, {
      txId,
      userId,
      type: 'WITHDRAWAL',
      action: 'APPROVE_WITHDRAWAL',
      status: 'COMPLETED',
      settlementStatus: 'PAID',
      asset: assetSymbol,
      amount,
      fee,
      netPayoutAmount,
      toAddress: cleanToAddress,
      network: txData.network || null,
      payoutTxHash: payoutTxHash || txData.payoutTxHash || txData.txHash || null,
      reservedFromBalance: Boolean(txData.reservedFromBalance),
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: newLocked,
      processedBy: admin.email || admin.uid,
      processedByUid: admin.uid,
      processedAt: nowIso,
      note: note || `Withdrawal paid (${netPayoutAmount} ${assetSymbol} net).`,
    });

    return {
      alreadyProcessed: false,
      userId,
      txId,
      type: 'WITHDRAWAL',
      status: 'COMPLETED',
      asset: assetSymbol,
      amount,
      fee,
      netPayoutAmount,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: newLocked,
      message: `Withdrawal settled as PAID (${netPayoutAmount} ${assetSymbol} net payout; ${amount} ${assetSymbol} escrow released).`,
    };
  });
}

/**
 * 7. REJECT WITHDRAWAL (ATOMIC ESCROW REFUND)
 * Atomically marks a pending withdrawal as `REJECTED` and, if `reservedFromBalance === true`
 * and `refunded !== true`, restores `amount` back to `users/{userId}/wallet/{asset}.balance`
 * and releases `lockedBalance`.
 */
export async function settleWithdrawalRejection(
  db: FirestoreLike,
  params: {
    userId: string;
    txId: string;
    admin: AdminActor;
    reason?: string;
    allowManualRejectedStatus?: boolean;
    serverTimestamp?: () => any;
  }
): Promise<SettlementResult> {
  const { userId, txId, admin, reason, allowManualRejectedStatus = false } = params;
  if (!userId || !txId) {
    throw new Error('Missing required userId or txId for withdrawal rejection.');
  }

  return db.runTransaction(async (transaction) => {
    const txRef = db.doc(`users/${userId}/transactions/${txId}`);
    const settlementRef = db.doc(`users/${userId}/settlements/${txId}`);

    const [txSnap, settlementSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(settlementRef),
    ]);

    if (!txSnap.exists) {
      throw new Error(`Withdrawal transaction ${txId} not found for user ${userId}.`);
    }

    const txData = txSnap.data() || {};
    if (txData.type !== 'WITHDRAWAL') {
      throw new Error(`Invalid transaction type '${txData.type}'. Expected 'WITHDRAWAL'.`);
    }

    assertOwnership(txData, userId, txId);

    const assetSymbol = String(txData.asset || '').toUpperCase().trim();
    const assetSpec = AUTHORITATIVE_ASSET_CONFIG[assetSymbol];
    const amount = roundCrypto(Number(txData.amount || 0));
    const fee = roundCrypto(Number(txData.fee || assetSpec?.withdrawFee || 0));

    if (txData.status === 'COMPLETED' && txData.walletSettled === true) {
      throw new Error(`Withdrawal ${txId} has already been paid and settled; cannot reject.`);
    }

    const walletRef = db.doc(`users/${userId}/wallet/${assetSymbol}`);
    const walletSnap = await transaction.get(walletRef);
    const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentBalance = roundCrypto(Number(walletData.balance || 0));
    const currentLocked = roundCrypto(Number(walletData.lockedBalance || 0));

    if (
      txData.refunded === true ||
      txData.walletSettled === true ||
      settlementSnap.exists ||
      (!allowManualRejectedStatus && (txData.status === 'REJECTED' || txData.status === 'FAILED'))
    ) {
      return {
        alreadyProcessed: true,
        userId,
        txId,
        type: 'WITHDRAWAL',
        status: 'REJECTED',
        asset: assetSymbol,
        amount,
        fee,
        previousBalance: currentBalance,
        newBalance: currentBalance,
        previousLockedBalance: currentLocked,
        newLockedBalance: currentLocked,
        message: 'Withdrawal was already rejected and refunded.',
      };
    }

    const allowedStatuses = allowManualRejectedStatus
      ? [...ALLOWED_WITHDRAWAL_PENDING_STATUSES, 'REJECTED', 'FAILED']
      : ALLOWED_WITHDRAWAL_PENDING_STATUSES;

    if (!allowedStatuses.includes(txData.status)) {
      throw new Error(`Withdrawal ${txId} cannot be rejected from status '${txData.status}'.`);
    }

    let newBalance = currentBalance;
    let newLocked = currentLocked;
    let refundedNow = false;

    if (txData.reservedFromBalance === true && txData.refunded !== true && amount > 0) {
      newBalance = roundCrypto(currentBalance + amount);
      newLocked = roundCrypto(Math.max(0, currentLocked - amount));
      refundedNow = true;
    }

    const nowIso = new Date().toISOString();
    const cleanReason = reason || txData.rejectionReason || 'Withdrawal request declined by administrator.';

    if (refundedNow) {
      if (!walletSnap.exists) {
        transaction.set(walletRef, {
          symbol: assetSymbol,
          name: assetSpec?.name || assetSymbol,
          balance: newBalance,
          lockedBalance: newLocked,
          priceUSD: assetSpec?.defaultUsdRate || 1,
          change24h: 0,
          updatedAt: nowIso,
        });
      } else {
        transaction.update(walletRef, {
          balance: newBalance,
          lockedBalance: newLocked,
          updatedAt: nowIso,
        });
      }
    }

    transaction.update(txRef, {
      userId,
      status: 'REJECTED',
      settlementStatus: refundedNow ? 'REFUNDED' : 'REJECTED',
      walletSettled: true,
      walletCredited: false,
      refunded: refundedNow,
      refundedAmount: refundedNow ? amount : 0,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: newLocked,
      rejectedAt: nowIso,
      rejectedBy: admin.email || admin.uid,
      rejectedByUid: admin.uid,
      rejectionReason: cleanReason,
      updatedAt: nowIso,
    });

    transaction.set(settlementRef, {
      txId,
      userId,
      type: 'WITHDRAWAL',
      action: 'REJECT_WITHDRAWAL',
      status: 'REJECTED',
      settlementStatus: refundedNow ? 'REFUNDED' : 'REJECTED',
      asset: assetSymbol,
      amount,
      fee,
      refunded: refundedNow,
      refundedAmount: refundedNow ? amount : 0,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: newLocked,
      processedBy: admin.email || admin.uid,
      processedByUid: admin.uid,
      processedAt: nowIso,
      reason: cleanReason,
    });

    return {
      alreadyProcessed: false,
      userId,
      txId,
      type: 'WITHDRAWAL',
      status: 'REJECTED',
      asset: assetSymbol,
      amount,
      fee,
      previousBalance: currentBalance,
      newBalance,
      previousLockedBalance: currentLocked,
      newLockedBalance: newLocked,
      message: refundedNow
        ? `Withdrawal rejected and ${amount} ${assetSymbol} refunded to user Available Balance.`
        : `Withdrawal rejected.`,
    };
  });
}

// ---------------------------------------------------------------------------
// 8. AUTHORITATIVE CLOUD MINING PLANS & ATOMIC CONTRACT PURCHASE SETTLEMENT
// ---------------------------------------------------------------------------

export type AuthoritativePlanTier = 'Entry' | 'Core' | 'Value' | 'Pro' | 'Elite';

export interface AuthoritativeMiningPlanSpec {
  id: string;
  name: string;
  tier: AuthoritativePlanTier;
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
  popular?: boolean;
}

/**
 * Standard hashrate unit conversion helpers:
 * - 1 TH/s = 1,000 GH/s
 * - 1 GH/s = 1,000 MH/s
 */
export function convertHashrateToGHs(value: number, unit: 'TH/s' | 'GH/s' | 'MH/s'): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (unit === 'TH/s') return Number((value * 1000).toFixed(4));
  if (unit === 'MH/s') return Number((value / 1000).toFixed(6));
  return Number(value.toFixed(4));
}

export function convertHashrateToTHs(value: number, unit: 'TH/s' | 'GH/s' | 'MH/s'): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (unit === 'GH/s') return Number((value / 1000).toFixed(6));
  if (unit === 'MH/s') return Number((value / 1_000_000).toFixed(9));
  return Number(value.toFixed(6));
}

export function convertTHsToGHs(ths: number): number {
  if (!Number.isFinite(ths) || ths < 0) return 0;
  return Number((ths * 1000).toFixed(4));
}

export function convertGHsToMHs(ghs: number): number {
  if (!Number.isFinite(ghs) || ghs < 0) return 0;
  return Number((ghs * 1000).toFixed(2));
}

export const AUTHORITATIVE_MINING_PLANS: Record<string, AuthoritativeMiningPlanSpec> = {
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
    popular: true,
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

export interface ContractPurchaseResult {
  alreadyProcessed: boolean;
  userId: string;
  orderId: string;
  txId: string;
  settlementId: string;
  planId: string;
  planName: string;
  priceUSD: number;
  asset: 'USDT';
  hashrateAddedGHs: number;
  hashrateAddedTHs: number;
  previousBalance: number;
  newBalance: number;
  previousHashrateGHs: number;
  newHashrateGHs: number;
  previousHashrateTHs: number;
  newHashrateTHs: number;
  contract: Record<string, any>;
  transaction: Record<string, any>;
  message: string;
}

/**
 * Atomically settles a Cloud Hashrate Contract purchase on the trusted backend:
 * 1. Validates `planId` strictly against `AUTHORITATIVE_MINING_PLANS` (ignoring any client-supplied price/hashrate).
 * 2. Enforces idempotency via deterministic `orderId` (`order_${idempotencyKey}`) and `users/{userId}/settlements/{orderId}`.
 * 3. Reads server-confirmed `users/{userId}/wallet/USDT` and rejects if `balance < plan.priceUSD`.
 * 4. Atomically deducts `plan.priceUSD` from `wallet/USDT.balance`, creates `users/{userId}/contracts/{orderId}`,
 *    records `users/{userId}/transactions/{orderId}` (`type: 'CONTRACT_PURCHASE'`, `status: 'COMPLETED'`),
 *    writes `users/{userId}/settlements/{orderId}`, and updates `users/{userId}/mining/session`.
 */
export async function purchaseMiningContract(
  db: FirestoreLike,
  params: {
    userId: string;
    planId: string;
    idempotencyKey: string;
    serverTimestamp?: () => any;
  }
): Promise<ContractPurchaseResult> {
  const cleanUserId = String(params.userId || '').trim();
  if (!cleanUserId) {
    throw new Error('Authentication required: missing verified userId.');
  }

  const rawPlanId = String(params.planId || '').trim();
  const plan = AUTHORITATIVE_MINING_PLANS[rawPlanId];
  if (!plan) {
    throw new Error(`Invalid or unsupported cloud mining plan '${rawPlanId || 'UNKNOWN'}'.`);
  }

  const rawKey = String(params.idempotencyKey || '').trim();
  const sanitizedKey = rawKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (sanitizedKey.length < 6) {
    throw new Error('Valid idempotencyKey (at least 6 alphanumeric characters) is required for contract purchase.');
  }

  const orderId = sanitizedKey.startsWith('order_') ? sanitizedKey : `order_${sanitizedKey}`;
  const settlementId = `settle_${orderId}`;

  return db.runTransaction(async (transaction) => {
    const settlementRef = db.doc(`users/${cleanUserId}/settlements/${orderId}`);
    const contractRef = db.doc(`users/${cleanUserId}/contracts/${orderId}`);
    const txRef = db.doc(`users/${cleanUserId}/transactions/${orderId}`);
    const walletRef = db.doc(`users/${cleanUserId}/wallet/USDT`);
    const sessionRef = db.doc(`users/${cleanUserId}/mining/session`);

    // ALL READS FIRST (Firestore transaction requirement)
    const [settlementSnap, contractSnap, txSnap, walletSnap, sessionSnap] = await Promise.all([
      transaction.get(settlementRef),
      transaction.get(contractRef),
      transaction.get(txRef),
      transaction.get(walletRef),
      transaction.get(sessionRef),
    ]);

    const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentBalance = roundCrypto(Number(walletData.balance || 0));
    const currentLocked = roundCrypto(Number(walletData.lockedBalance || 0));

    const sessionData = sessionSnap.exists ? sessionSnap.data() || {} : {};
    const currentHashrateTHs = roundCrypto(Number(sessionData.hashrateTHs || 0));
    const currentHashrateGHs =
      typeof sessionData.hashrateGHs === 'number' && Number.isFinite(sessionData.hashrateGHs)
        ? Number(sessionData.hashrateGHs.toFixed(4))
        : convertTHsToGHs(currentHashrateTHs);

    // Idempotency guard: if order was already settled, return existing result without charging twice
    if (
      settlementSnap.exists ||
      contractSnap.exists ||
      (txSnap.exists && txSnap.data()?.walletSettled === true)
    ) {
      const existingContract = contractSnap.exists ? contractSnap.data() || {} : {};
      const existingTx = txSnap.exists ? txSnap.data() || {} : {};

      return {
        alreadyProcessed: true,
        userId: cleanUserId,
        orderId,
        txId: orderId,
        settlementId,
        planId: plan.id,
        planName: plan.name,
        priceUSD: plan.priceUSD,
        asset: 'USDT',
        hashrateAddedGHs: plan.hashrateGHs,
        hashrateAddedTHs: plan.hashrateTHs,
        previousBalance: currentBalance,
        newBalance: currentBalance,
        previousHashrateGHs: currentHashrateGHs,
        newHashrateGHs: currentHashrateGHs,
        previousHashrateTHs: currentHashrateTHs,
        newHashrateTHs: currentHashrateTHs,
        contract: existingContract,
        transaction: existingTx,
        message: `Contract order ${orderId} for ${plan.name} was already settled.`,
      };
    }

    if (!Number.isFinite(currentBalance) || currentBalance < plan.priceUSD) {
      throw new Error(
        `Insufficient server-confirmed USDT balance ($${currentBalance.toFixed(2)} available, $${plan.priceUSD.toFixed(2)} USDT required for ${plan.name}).`
      );
    }

    const newBalance = roundCrypto(currentBalance - plan.priceUSD);
    const newHashrateGHs = Number((currentHashrateGHs + plan.hashrateGHs).toFixed(4));
    const newHashrateTHs = Number((currentHashrateTHs + plan.hashrateTHs).toFixed(6));
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + plan.durationDays * 86400 * 1000).toISOString();
    const sessionId = sessionData.lastSessionId || `sess_${Date.now()}`;

    const contractRecord = {
      id: orderId,
      orderId,
      userId: cleanUserId,
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
      asset: 'USDT' as const,
      durationDays: plan.durationDays,
      displayedReturnPercent: plan.displayedReturnPercent,
      estimatedDailyYieldCoin: plan.estimatedDailyYieldCoin,
      estimatedDailyYieldUSD: plan.estimatedDailyYieldUSD,
      powerConsumptionW: plan.powerConsumptionW,
      maintenanceFeePercent: plan.maintenanceFeePercent,
      status: 'ACTIVE' as const,
      purchasedAt: nowIso,
      expiresAt: expiresIso,
      settlementId,
      txId: orderId,
      sessionId,
      idempotencyKey: sanitizedKey,
      isSimulated: true,
      updatedAt: nowIso,
    };

    const txRecord = {
      id: orderId,
      orderId,
      contractId: orderId,
      planId: plan.id,
      planName: plan.name,
      userId: cleanUserId,
      type: 'CONTRACT_PURCHASE' as const,
      asset: 'USDT',
      amount: plan.priceUSD,
      amountUSD: plan.priceUSD,
      fee: 0,
      status: 'COMPLETED' as const,
      settlementStatus: 'PURCHASED' as const,
      settlementId,
      walletSettled: true,
      walletCredited: false,
      idempotencyKey: sanitizedKey,
      previousBalance: currentBalance,
      newBalance,
      timestamp: nowIso,
      note: `Cloud Hashrate Contract Purchase: ${plan.name} (+${plan.hashrate} ${plan.hashrateUnit} for ${plan.durationDays} days)`,
      updatedAt: nowIso,
    };

    const settlementRecord = {
      id: settlementId,
      txId: orderId,
      orderId,
      contractId: orderId,
      userId: cleanUserId,
      type: 'CONTRACT_PURCHASE',
      action: 'PURCHASE_CONTRACT',
      status: 'COMPLETED',
      settlementStatus: 'PURCHASED',
      asset: 'USDT',
      amount: plan.priceUSD,
      planId: plan.id,
      planName: plan.name,
      hashrateAddedGHs: plan.hashrateGHs,
      hashrateAddedTHs: plan.hashrateTHs,
      previousHashrateGHs: currentHashrateGHs,
      newHashrateGHs,
      previousHashrateTHs: currentHashrateTHs,
      newHashrateTHs,
      previousBalance: currentBalance,
      newBalance,
      idempotencyKey: sanitizedKey,
      processedAt: nowIso,
      note: `Purchased ${plan.name} for ${plan.priceUSD} USDT.`,
    };

    // ALL WRITES AFTER READS
    if (!walletSnap.exists) {
      transaction.set(walletRef, {
        symbol: 'USDT',
        name: 'Tether USD',
        balance: newBalance,
        lockedBalance: currentLocked,
        priceUSD: 1.0,
        change24h: 0,
        updatedAt: nowIso,
      });
    } else {
      transaction.update(walletRef, {
        balance: newBalance,
        lockedBalance: currentLocked,
        updatedAt: nowIso,
      });
    }

    transaction.set(contractRef, contractRecord);
    transaction.set(txRef, txRecord);
    transaction.set(settlementRef, settlementRecord);

    transaction.set(
      sessionRef,
      {
        userId: cleanUserId,
        id: sessionData.id || 'session-live',
        status: 'ACTIVE',
        algorithm: 'SHA-256 (BTC)',
        targetCoin: 'BTC',
        hashrateGHs: newHashrateGHs,
        hashrateTHs: newHashrateTHs,
        planId: plan.id,
        activeContractId: orderId,
        activeContractName: plan.name,
        startedAt: sessionData.startedAt || nowIso,
        lastSessionId: sessionId,
        efficiencyWTH: typeof sessionData.efficiencyWTH === 'number' ? sessionData.efficiencyWTH : 16.0,
        temperatureC: 58.4,
        poolName: sessionData.poolName || 'Nexora Cloud Mining',
        hardwareProfile: sessionData.hardwareProfile || 'Balanced',
        isSimulated: true,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    return {
      alreadyProcessed: false,
      userId: cleanUserId,
      orderId,
      txId: orderId,
      settlementId,
      planId: plan.id,
      planName: plan.name,
      priceUSD: plan.priceUSD,
      asset: 'USDT',
      hashrateAddedGHs: plan.hashrateGHs,
      hashrateAddedTHs: plan.hashrateTHs,
      previousBalance: currentBalance,
      newBalance,
      previousHashrateGHs: currentHashrateGHs,
      newHashrateGHs,
      previousHashrateTHs: currentHashrateTHs,
      newHashrateTHs,
      contract: contractRecord,
      transaction: txRecord,
      message: `${plan.name} activated! Deducted $${plan.priceUSD.toFixed(2)} USDT and allocated +${plan.hashrate} ${plan.hashrateUnit} cloud hashrate.`,
    };
  });
}

