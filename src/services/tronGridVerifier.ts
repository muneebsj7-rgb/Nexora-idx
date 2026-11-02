/**
 * Trusted Server-Side TRON USDT (TRC20) Deposit Verifier for Nexora Mine.
 *
 * Responsibilities:
 * - Strict network isolation between TRON Mainnet ('mainnet'), Nile Testnet ('nile'),
 *   and Shasta Testnet ('shasta'). Never mixes testnet and mainnet data.
 * - Pins official USDT TRC20 smart contract addresses server-side (6 decimals).
 * - Queries TronGrid API (/wallet/gettransactionbyid, /wallet/gettransactioninfobyid,
 *   /v1/transactions/{txID}/events, /wallet/getnowblock, /walletsolidity/getnowblock)
 *   using server-only TRONGRID_API_KEY credentials.
 * - Independently verifies:
 *   1. Transaction existence and 64-character hex format.
 *   2. Successful smart-contract execution (receipt.result === 'SUCCESS' & contractRet === 'SUCCESS').
 *   3. Authentic TRC20 Transfer(address,address,uint256) event emitted by the official USDT contract.
 *   4. Verified sender and recipient addresses decoded from event topics/logs (Base58Check <-> 41-hex).
 *   5. Deposit address attribution to an authoritative platform address bound to (userId, txId).
 *   6. Exact 6-decimal USDT amount conversion using BigInt arithmetic (rejects underpaid/overpaid).
 *   7. Block solidification and configurable confirmation depth (default: 19 blocks).
 *   8. Atomic, idempotent creation of server-only verifiedPayments/txhash_<normalized> receipts
 *      with global cross-user and cross-deposit replay protection.
 * - Integrates with the existing settleDepositApproval() engine without duplicating wallet-credit logic.
 */

import crypto from 'node:crypto';
import type {
  AdminActor,
  FirestoreLike,
  IndependentPaymentVerificationReceipt,
  SettlementResult,
} from './settlementEngine.ts';
import {
  normalizeAndValidateDepositReference,
  settleDepositApproval,
} from './settlementEngine.ts';

export type TronNetworkId = 'mainnet' | 'nile' | 'shasta';

export interface TronNetworkSpec {
  networkId: TronNetworkId;
  chainName: string;
  canonicalNetworkLabel: string;
  apiBaseUrl: string;
  officialUsdtContractBase58: string;
  officialUsdtContractHex41: string;
  decimals: 6;
  isTestnet: boolean;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Map<string, number>(
  BASE58_ALPHABET.split('').map((char, idx) => [char, idx])
);

/**
 * Computes double SHA-256 checksum (first 4 bytes) for TRON Base58Check encoding.
 */
function sha256DoubleChecksum(payload: Buffer): Buffer {
  const first = crypto.createHash('sha256').update(payload).digest();
  const second = crypto.createHash('sha256').update(first).digest();
  return second.subarray(0, 4);
}

/**
 * Converts a 21-byte TRON hex address (starting with '41') or 20-byte EVM hex address
 * into a 34-character TRON Base58Check address (starting with 'T').
 */
export function tronHexToBase58(rawHexInput: string): string {
  const clean = String(rawHexInput || '')
    .trim()
    .replace(/^0x/i, '')
    .toLowerCase();

  let hex41 = clean;
  if (clean.length === 40 && /^[0-9a-f]{40}$/.test(clean)) {
    hex41 = `41${clean}`;
  }

  if (hex41.length !== 42 || !/^41[0-9a-f]{40}$/.test(hex41)) {
    throw new Error(`Invalid TRON hex address '${rawHexInput}'. Expected 21-byte '41...' or 20-byte hex.`);
  }

  const addressBytes = Buffer.from(hex41, 'hex');
  const checksum = sha256DoubleChecksum(addressBytes);
  const fullBytes = Buffer.concat([addressBytes, checksum]);

  let num = BigInt('0x' + fullBytes.toString('hex'));
  const chars: string[] = [];
  while (num > 0n) {
    const rem = Number(num % 58n);
    chars.push(BASE58_ALPHABET[rem]);
    num = num / 58n;
  }

  for (let i = 0; i < fullBytes.length && fullBytes[i] === 0; i++) {
    chars.push(BASE58_ALPHABET[0]);
  }

  return chars.reverse().join('');
}

/**
 * Decodes and verifies a 34-character TRON Base58Check address ('T...') into its
 * 42-character lowercase hex representation ('41...').
 */
export function tronBase58ToHex41(base58Input: string): string {
  const clean = String(base58Input || '').trim();
  if (clean.length < 33 || clean.length > 35 || !clean.startsWith('T')) {
    throw new Error(`Invalid TRON Base58 address '${base58Input}'.`);
  }

  let num = 0n;
  for (const ch of clean) {
    const val = BASE58_MAP.get(ch);
    if (val === undefined) {
      throw new Error(`Invalid Base58 character '${ch}' in TRON address '${base58Input}'.`);
    }
    num = num * 58n + BigInt(val);
  }

  let hex = num.toString(16);
  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }

  const rawBytes = Buffer.from(hex, 'hex');
  let leadingZeros = 0;
  for (let i = 0; i < clean.length && clean[i] === '1'; i++) {
    leadingZeros++;
  }

  const fullBytes = Buffer.concat([Buffer.alloc(leadingZeros, 0), rawBytes]);
  if (fullBytes.length !== 25) {
    throw new Error(`Invalid TRON Base58 address byte length (${fullBytes.length}) for '${base58Input}'.`);
  }

  const payload = fullBytes.subarray(0, 21);
  const checksum = fullBytes.subarray(21, 25);
  const expectedChecksum = sha256DoubleChecksum(payload);

  if (!checksum.equals(expectedChecksum)) {
    throw new Error(`TRON Base58Check checksum verification failed for address '${base58Input}'.`);
  }

  if (payload[0] !== 0x41) {
    throw new Error(`Invalid TRON address version byte (0x${payload[0].toString(16)}) for '${base58Input}'.`);
  }

  return payload.toString('hex').toLowerCase();
}

/**
 * Normalizes any valid TRON address (Base58 'T...', 21-byte hex '41...', or 20-byte '0x...')
 * into canonical Base58Check and 41-prefixed lowercase hex.
 */
export function normalizeTronAddress(addressInput: unknown): {
  base58: string;
  hex41: string;
  evmHex20: string;
} {
  const raw = typeof addressInput === 'string' ? addressInput.trim() : '';
  if (!raw) {
    throw new Error('Missing TRON address.');
  }

  if (raw.startsWith('T')) {
    const hex41 = tronBase58ToHex41(raw);
    return {
      base58: tronHexToBase58(hex41),
      hex41,
      evmHex20: `0x${hex41.slice(2)}`,
    };
  }

  const cleanHex = raw.replace(/^0x/i, '').toLowerCase();
  if (cleanHex.length === 64 && /^0{24}[0-9a-f]{40}$/.test(cleanHex)) {
    // 32-byte padded topic word from TRC20 Transfer event log
    const hex20 = cleanHex.slice(24);
    const hex41 = `41${hex20}`;
    return {
      base58: tronHexToBase58(hex41),
      hex41,
      evmHex20: `0x${hex20}`,
    };
  }

  const base58 = tronHexToBase58(cleanHex);
  const hex41 = tronBase58ToHex41(base58);
  return {
    base58,
    hex41,
    evmHex20: `0x${hex41.slice(2)}`,
  };
}

/**
 * Authoritative TRON network specifications and official USDT TRC20 contracts.
 * Both Base58Check and 41-prefixed Hex representations are explicitly pinned and
 * cryptographically cross-verified at module load time.
 */
export const AUTHORITATIVE_TRON_NETWORKS: Record<TronNetworkId, TronNetworkSpec> = {
  mainnet: {
    networkId: 'mainnet',
    chainName: 'TRON_MAINNET',
    canonicalNetworkLabel: 'TRC20',
    apiBaseUrl: 'https://api.trongrid.io',
    officialUsdtContractBase58: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    officialUsdtContractHex41: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
    decimals: 6,
    isTestnet: false,
  },
  nile: {
    networkId: 'nile',
    chainName: 'TRON_NILE_TESTNET',
    canonicalNetworkLabel: 'TRC20_NILE',
    apiBaseUrl: 'https://nile.trongrid.io',
    officialUsdtContractBase58: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    officialUsdtContractHex41: '41eca9bc828a3005b9a3b909f2cc5c2a54794de05f',
    decimals: 6,
    isTestnet: true,
  },
  shasta: {
    networkId: 'shasta',
    chainName: 'TRON_SHASTA_TESTNET',
    canonicalNetworkLabel: 'TRC20_SHASTA',
    apiBaseUrl: 'https://api.shasta.trongrid.io',
    officialUsdtContractBase58: 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs',
    officialUsdtContractHex41: '4142a1e39aefa49290f2b3f9ed688d7cecf86cd6e0',
    decimals: 6,
    isTestnet: true,
  },
};

/**
 * Cryptographically verifies that every pinned TRON USDT contract's Base58Check address
 * and Hex41 address match in both directions (Base58Check -> Hex41 and Hex41 -> Base58Check).
 * Throws immediately if any discrepancy exists.
 */
export function assertAuthoritativeTronContractsIntegrity(): void {
  for (const [key, spec] of Object.entries(AUTHORITATIVE_TRON_NETWORKS)) {
    const computedHex41 = tronBase58ToHex41(spec.officialUsdtContractBase58);
    if (computedHex41 !== spec.officialUsdtContractHex41) {
      throw new Error(
        `CRITICAL TRON CONTRACT MISMATCH on '${key}': Base58 '${spec.officialUsdtContractBase58}' decodes to '${computedHex41}', which disagrees with pinned Hex41 '${spec.officialUsdtContractHex41}'.`
      );
    }
    const computedBase58 = tronHexToBase58(spec.officialUsdtContractHex41);
    if (computedBase58 !== spec.officialUsdtContractBase58) {
      throw new Error(
        `CRITICAL TRON CONTRACT MISMATCH on '${key}': Hex41 '${spec.officialUsdtContractHex41}' encodes to '${computedBase58}', which disagrees with pinned Base58 '${spec.officialUsdtContractBase58}'.`
      );
    }
    if (spec.decimals !== 6) {
      throw new Error(`Invalid USDT decimals (${spec.decimals}) on '${key}'. Expected 6.`);
    }
  }
}

// Run integrity check immediately on module load
assertAuthoritativeTronContractsIntegrity();

/**
 * Default TRON super-representative solidification depth (19 blocks / ~57 seconds).
 */
export const DEFAULT_TRON_REQUIRED_CONFIRMATIONS = 19;

/**
 * Keccak-256 topic0 hash for ERC20/TRC20 Transfer(address,address,uint256)
 */
export const TRC20_TRANSFER_EVENT_TOPIC0 =
  'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface TronVerifierRuntimeConfig {
  network: TronNetworkSpec;
  apiKey: string;
  requireApiKey: boolean;
  requiredConfirmations: number;
  requireSolidified: boolean;
  timeoutMs: number;
  maxRetries: number;
  allowMainnetInCurrentEnv: boolean;
  sharedTreasuryAddressBase58?: string;
}

export interface TronVerifierConfigOverrides {
  tronNetwork?: string;
  apiKey?: string;
  requireApiKey?: boolean;
  requiredConfirmations?: number;
  requireSolidified?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  allowMainnetInCurrentEnv?: boolean;
  customTestnetUsdtContract?: string;
  sharedTreasuryAddress?: string;
}

/**
 * Resolves and validates the server-side TRON verifier configuration.
 * Never mixes testnet and mainnet settings.
 */
export function resolveTronVerifierConfig(
  overrides: TronVerifierConfigOverrides = {}
): TronVerifierRuntimeConfig {
  const rawNet = String(
    overrides.tronNetwork ?? process.env.TRON_NETWORK ?? 'nile'
  )
    .trim()
    .toLowerCase();

  if (rawNet !== 'mainnet' && rawNet !== 'nile' && rawNet !== 'shasta') {
    throw new Error(
      `Unsupported TRON_NETWORK '${rawNet}'. Allowed values: 'nile', 'shasta', or 'mainnet'.`
    );
  }

  const baseSpec = AUTHORITATIVE_TRON_NETWORKS[rawNet as TronNetworkId];
  const allowMainnet =
    overrides.allowMainnetInCurrentEnv ??
    process.env.ALLOW_TRON_MAINNET_VERIFICATION === 'true';

  if (baseSpec.networkId === 'mainnet' && !allowMainnet) {
    throw new Error(
      'TRON Mainnet verification is disabled in Phase 5 testnet validation mode. Set TRON_NETWORK=nile or TRON_NETWORK=shasta (or explicitly enable ALLOW_TRON_MAINNET_VERIFICATION=true after production review).'
    );
  }

  let effectiveSpec: TronNetworkSpec = { ...baseSpec };

  // Allow explicit custom testnet contract override ONLY on testnets (never on mainnet)
  const customContractRaw = String(
    overrides.customTestnetUsdtContract ?? process.env.TRON_TESTNET_USDT_CONTRACT_ADDRESS ?? ''
  ).trim();
  if (customContractRaw) {
    if (!baseSpec.isTestnet) {
      throw new Error(
        'Custom USDT contract address override is strictly forbidden on TRON Mainnet.'
      );
    }
    const normContract = normalizeTronAddress(customContractRaw);
    effectiveSpec = {
      ...baseSpec,
      officialUsdtContractBase58: normContract.base58,
      officialUsdtContractHex41: normContract.hex41,
    };
  }

  const apiKey = String(overrides.apiKey ?? process.env.TRONGRID_API_KEY ?? '').trim();
  const requireApiKey =
    overrides.requireApiKey ??
    process.env.TRONGRID_REQUIRE_API_KEY !== 'false';

  const rawConfirmations =
    overrides.requiredConfirmations ??
    (process.env.TRON_REQUIRED_CONFIRMATIONS
      ? Number(process.env.TRON_REQUIRED_CONFIRMATIONS)
      : DEFAULT_TRON_REQUIRED_CONFIRMATIONS);

  if (!Number.isFinite(rawConfirmations) || rawConfirmations < 1 || rawConfirmations > 10000) {
    throw new Error(
      `Invalid TRON_REQUIRED_CONFIRMATIONS value (${rawConfirmations}). Must be an integer between 1 and 10000.`
    );
  }

  const requireSolidified =
    overrides.requireSolidified ??
    process.env.TRON_REQUIRE_SOLIDIFIED !== 'false';

  const timeoutMs = Math.max(
    1000,
    Math.min(30000, Number(overrides.timeoutMs ?? process.env.TRONGRID_TIMEOUT_MS ?? 8000))
  );

  const maxRetries = Math.max(
    0,
    Math.min(3, Number(overrides.maxRetries ?? process.env.TRONGRID_MAX_RETRIES ?? 1))
  );

  const rawTreasury = String(
    overrides.sharedTreasuryAddress ?? process.env.TRON_TREASURY_ADDRESS ?? ''
  ).trim();
  let sharedTreasuryAddressBase58: string | undefined;
  if (rawTreasury) {
    sharedTreasuryAddressBase58 = normalizeTronAddress(rawTreasury).base58;
  }

  return {
    network: effectiveSpec,
    apiKey,
    requireApiKey,
    requiredConfirmations: Math.floor(rawConfirmations),
    requireSolidified,
    timeoutMs,
    maxRetries,
    allowMainnetInCurrentEnv: allowMainnet,
    sharedTreasuryAddressBase58,
  };
}

/**
 * Validates that a transaction hash is a strict 64-character hexadecimal TRON txID
 * and normalizes it for global paymentReferences / verifiedPayments lookup.
 */
export function validateTronTxHash(
  rawTxHashInput: unknown,
  depositTxId: string
): {
  txIdHex: string;
  rawTxHash: string;
  normalizedHash: string;
  paymentRefDocId: string;
} {
  const ref = normalizeAndValidateDepositReference(rawTxHashInput, depositTxId);
  const stripped = ref.rawTxHash.replace(/^0x/i, '').toLowerCase();

  if (stripped.length !== 64 || !/^[0-9a-f]{64}$/.test(stripped)) {
    throw new Error(
      `Invalid TRON transaction hash '${ref.rawTxHash}' on deposit ${depositTxId}: must be an exact 64-character hexadecimal txID.`
    );
  }

  if (/^([0-9a-f])\1{63}$/.test(stripped)) {
    throw new Error(
      `Invalid placeholder TRON transaction hash '${ref.rawTxHash}' on deposit ${depositTxId}.`
    );
  }

  return {
    txIdHex: stripped,
    rawTxHash: ref.rawTxHash,
    normalizedHash: ref.normalizedHash,
    paymentRefDocId: ref.paymentRefDocId,
  };
}

/**
 * Converts a human-readable USDT amount (up to 6 decimal places) into exact integer
 * 6-decimal USDT token base units (1 USDT = 1,000,000 base units) using deterministic
 * string parsing and BigInt arithmetic.
 */
export function usdtAmountToBaseUnitsBigInt(amountInput: number | string): bigint {
  const num = Number(amountInput);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Invalid USDT amount '${amountInput}': must be a positive finite number.`);
  }

  const str = typeof amountInput === 'number' ? amountInput.toFixed(8) : String(amountInput).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Malformed USDT amount '${amountInput}'.`);
  }

  const [wholePart, fracPartRaw = ''] = str.split('.');
  // Trim trailing zeros beyond 6 decimals, but reject non-zero digits beyond 6 decimals
  const beyondSix = fracPartRaw.slice(6);
  if (beyondSix && !/^0+$/.test(beyondSix)) {
    throw new Error(
      `USDT TRC20 amount '${amountInput}' exceeds maximum 6-decimal token precision.`
    );
  }

  const fracPadded6 = fracPartRaw.slice(0, 6).padEnd(6, '0');
  return BigInt(wholePart) * 1_000_000n + BigInt(fracPadded6);
}

/**
 * Converts an integer 6-decimal USDT token base-unit BigInt (10^6 base units = 1 USDT)
 * into a 6-decimal USDT number and exact string.
 */
export function baseUnitsBigIntToUsdt(baseUnits: bigint): { amount: number; formatted: string } {
  if (baseUnits < 0n) {
    throw new Error(`Negative token base-unit amount (${baseUnits.toString()}) is invalid.`);
  }
  const whole = baseUnits / 1_000_000n;
  const frac = baseUnits % 1_000_000n;
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  const formatted = fracStr.length > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
  return {
    amount: Number(formatted),
    formatted,
  };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text?(): Promise<string>;
}>;

let customFetchForTesting: FetchLike | null = null;

export function setTronGridFetchForTesting(fn: FetchLike | null): void {
  customFetchForTesting = fn;
}

async function fetchTronGridJson(
  url: string,
  init: RequestInit,
  config: TronVerifierRuntimeConfig
): Promise<any> {
  if (config.requireApiKey && !config.apiKey) {
    throw new Error(
      'Missing TRONGRID_API_KEY server credential. Deposit verification fails closed until provider credentials are configured.'
    );
  }

  const fetchImpl: FetchLike = customFetchForTesting || (globalThis.fetch as unknown as FetchLike);
  if (!fetchImpl) {
    throw new Error('Global fetch is unavailable in this runtime.');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (config.apiKey) {
    headers['TRON-PRO-API-KEY'] = config.apiKey;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetchImpl(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 429) {
        throw new Error('TronGrid API rate limit exceeded (HTTP 429). Failing closed.');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`TronGrid API authentication failed (HTTP ${response.status}). Failing closed.`);
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < config.maxRetries) {
          lastError = new Error(`TronGrid HTTP ${response.status}`);
          continue;
        }
        throw new Error(`TronGrid API request failed with HTTP ${response.status}.`);
      }

      const data = await response.json();
      if (!data || typeof data !== 'object') {
        throw new Error('Malformed non-JSON response from TronGrid API.');
      }
      return data;
    } catch (err: any) {
      clearTimeout(timer);
      const isAbort =
        err?.name === 'AbortError' ||
        String(err?.message || '').toLowerCase().includes('abort') ||
        String(err?.message || '').toLowerCase().includes('timeout');

      if (isAbort) {
        lastError = new Error(`TronGrid API request timed out after ${config.timeoutMs}ms.`);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (
        attempt >= config.maxRetries ||
        String(lastError.message).includes('429') ||
        String(lastError.message).includes('authentication failed')
      ) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('TronGrid API request failed.');
}

export interface DecodedTrc20TransferEvent {
  contractBase58: string;
  contractHex41: string;
  senderBase58: string;
  senderHex41: string;
  recipientBase58: string;
  recipientHex41: string;
  amountBaseUnits: bigint;
  amountUsdt: number;
}

/**
 * Extracts and cross-validates official USDT TRC20 Transfer events from both
 * /wallet/gettransactioninfobyid receipt logs and /v1/transactions/{txID}/events.
 */
function extractVerifiedUsdtTransferEvent(params: {
  txIdHex: string;
  txInfo: Record<string, any>;
  eventsResponse: Record<string, any> | null;
  networkSpec: TronNetworkSpec;
  requireSolidified: boolean;
}): DecodedTrc20TransferEvent {
  const { txIdHex, txInfo, eventsResponse, networkSpec, requireSolidified } = params;

  // 1. Parse raw EVM/TVM logs from gettransactioninfobyid
  const rawLogs: Array<Record<string, any>> = Array.isArray(txInfo.log) ? txInfo.log : [];
  const matchingLogTransfers: DecodedTrc20TransferEvent[] = [];
  let sawWrongContractTransfer = false;

  for (const logEntry of rawLogs) {
    const topics: string[] = Array.isArray(logEntry?.topics)
      ? logEntry.topics.map((t: any) => String(t || '').replace(/^0x/i, '').toLowerCase())
      : [];
    if (topics.length < 3 || topics[0] !== TRC20_TRANSFER_EVENT_TOPIC0) {
      continue;
    }

    let logContract: { base58: string; hex41: string };
    try {
      logContract = normalizeTronAddress(logEntry.address);
    } catch {
      continue;
    }

    if (logContract.hex41 !== networkSpec.officialUsdtContractHex41) {
      sawWrongContractTransfer = true;
      continue;
    }

    const sender = normalizeTronAddress(topics[1]);
    const recipient = normalizeTronAddress(topics[2]);
    const rawDataHex = String(logEntry.data || '').replace(/^0x/i, '').trim();
    if (!rawDataHex || !/^[0-9a-fA-F]+$/.test(rawDataHex)) {
      throw new Error(`Malformed TRC20 Transfer log data on transaction ${txIdHex}.`);
    }

    const amountBaseUnits = BigInt(`0x${rawDataHex}`);
    const { amount } = baseUnitsBigIntToUsdt(amountBaseUnits);
    matchingLogTransfers.push({
      contractBase58: logContract.base58,
      contractHex41: logContract.hex41,
      senderBase58: sender.base58,
      senderHex41: sender.hex41,
      recipientBase58: recipient.base58,
      recipientHex41: recipient.hex41,
      amountBaseUnits,
      amountUsdt: amount,
    });
  }

  // 2. Parse TronGrid v1 events if present
  const v1Events: Array<Record<string, any>> = Array.isArray(eventsResponse?.data)
    ? eventsResponse!.data
    : [];
  const matchingV1Transfers: DecodedTrc20TransferEvent[] = [];

  for (const ev of v1Events) {
    if (String(ev.event_name || '') !== 'Transfer') {
      continue;
    }
    if (ev.transaction_id && String(ev.transaction_id).toLowerCase() !== txIdHex) {
      throw new Error(
        `TronGrid event transaction_id mismatch: expected ${txIdHex}, got ${ev.transaction_id}.`
      );
    }
    if (requireSolidified && ev._unconfirmed === true) {
      throw new Error(
        `Transaction ${txIdHex} Transfer event is marked _unconfirmed by TronGrid (not yet solidified).`
      );
    }

    let evContract: { base58: string; hex41: string };
    try {
      evContract = normalizeTronAddress(ev.contract_address);
    } catch {
      continue;
    }

    if (evContract.hex41 !== networkSpec.officialUsdtContractHex41) {
      sawWrongContractTransfer = true;
      continue;
    }

    const resultObj = ev.result || {};
    const rawFrom = resultObj.from ?? resultObj['0'];
    const rawTo = resultObj.to ?? resultObj['1'];
    const rawVal = resultObj.value ?? resultObj['2'];

    if (!rawFrom || !rawTo || rawVal === undefined || rawVal === null) {
      throw new Error(`Incomplete TRC20 Transfer event parameters on transaction ${txIdHex}.`);
    }

    const sender = normalizeTronAddress(rawFrom);
    const recipient = normalizeTronAddress(rawTo);
    const amountBaseUnits = BigInt(String(rawVal));
    const { amount } = baseUnitsBigIntToUsdt(amountBaseUnits);

    matchingV1Transfers.push({
      contractBase58: evContract.base58,
      contractHex41: evContract.hex41,
      senderBase58: sender.base58,
      senderHex41: sender.hex41,
      recipientBase58: recipient.base58,
      recipientHex41: recipient.hex41,
      amountBaseUnits,
      amountUsdt: amount,
    });
  }

  if (matchingLogTransfers.length === 0 && matchingV1Transfers.length === 0) {
    if (sawWrongContractTransfer) {
      throw new Error(
        `Wrong TRC20 token contract on transaction ${txIdHex}: Transfer event was not emitted by official ${networkSpec.chainName} USDT contract (${networkSpec.officialUsdtContractBase58}).`
      );
    }
    throw new Error(
      `No official USDT TRC20 Transfer event found in transaction ${txIdHex} on ${networkSpec.chainName}.`
    );
  }

  if (matchingLogTransfers.length > 1 || matchingV1Transfers.length > 1) {
    throw new Error(
      `Ambiguous TRC20 transaction ${txIdHex}: multiple USDT Transfer events detected in a single transaction.`
    );
  }

  // If both receipt logs and v1 events are present, ensure they agree identically
  if (matchingLogTransfers.length === 1 && matchingV1Transfers.length === 1) {
    const a = matchingLogTransfers[0];
    const b = matchingV1Transfers[0];
    if (
      a.senderHex41 !== b.senderHex41 ||
      a.recipientHex41 !== b.recipientHex41 ||
      a.amountBaseUnits !== b.amountBaseUnits ||
      a.contractHex41 !== b.contractHex41
    ) {
      throw new Error(
        `Inconsistent provider data on transaction ${txIdHex}: receipt log Transfer does not match v1 event Transfer.`
      );
    }
  }

  return matchingLogTransfers[0] || matchingV1Transfers[0];
}

export interface OnChainTrc20VerificationInput {
  depositTxId: string;
  rawTxHash: string;
  expectedAmountUsdt: number;
  expectedRecipientBase58: string;
  expectedSenderBase58?: string;
  attributionMethod: 'USER_DEDICATED_ADDRESS' | 'DEPOSIT_INTENT_ATTRIBUTION';
  configOverrides?: TronVerifierConfigOverrides;
}

export interface VerifiedTrc20TransferDetails {
  verified: true;
  provider: 'TRONGRID_TRC20_VERIFIER';
  tronNetwork: TronNetworkId;
  network: string;
  chainName: string;
  txHash: string;
  normalizedHash: string;
  paymentRefDocId: string;
  contractAddress: string;
  contractAddressHex41: string;
  senderAddress: string;
  recipientAddress: string;
  expectedTreasuryAddress: string;
  recipientVerified: true;
  attributionMethod: 'USER_DEDICATED_ADDRESS' | 'DEPOSIT_INTENT_ATTRIBUTION';
  asset: 'USDT';
  decimals: 6;
  amount: number;
  rawAmountBaseUnits: string;
  txStatus: 'SUCCESS';
  blockNumber: number;
  latestBlockNumber: number;
  solidifiedBlockNumber: number;
  solidified: boolean;
  confirmations: number;
  requiredConfirmations: number;
  blockTimestamp?: number;
  verifiedAt: string;
}

/**
 * Queries TronGrid and independently verifies every on-chain invariant for a USDT TRC20 deposit.
 * Fails closed on any network error, missing field, wrong contract, wrong recipient,
 * wrong amount, reverted status, or insufficient confirmations/solidification.
 */
export async function verifyTrc20TransferOnChain(
  input: OnChainTrc20VerificationInput
): Promise<VerifiedTrc20TransferDetails> {
  const config = resolveTronVerifierConfig(input.configOverrides);
  const { txIdHex, rawTxHash, normalizedHash, paymentRefDocId } = validateTronTxHash(
    input.rawTxHash,
    input.depositTxId
  );

  const expectedAmountBaseUnits = usdtAmountToBaseUnitsBigInt(input.expectedAmountUsdt);
  const expectedRecipient = normalizeTronAddress(input.expectedRecipientBase58);
  const expectedSender = input.expectedSenderBase58
    ? normalizeTronAddress(input.expectedSenderBase58)
    : null;

  const baseUrl = config.network.apiBaseUrl;

  // 1. Fetch transaction, transaction receipt info, v1 events, latest block, and solidified block
  const [txRaw, txInfo, eventsRes, nowBlockRes, solidityBlockRes] = await Promise.all([
    fetchTronGridJson(
      `${baseUrl}/wallet/gettransactionbyid`,
      { method: 'POST', body: JSON.stringify({ value: txIdHex }) },
      config
    ),
    fetchTronGridJson(
      `${baseUrl}/wallet/gettransactioninfobyid`,
      { method: 'POST', body: JSON.stringify({ value: txIdHex }) },
      config
    ),
    fetchTronGridJson(
      `${baseUrl}/v1/transactions/${txIdHex}/events`,
      { method: 'GET' },
      config
    ),
    fetchTronGridJson(`${baseUrl}/wallet/getnowblock`, { method: 'POST', body: '{}' }, config),
    fetchTronGridJson(
      `${baseUrl}/walletsolidity/getnowblock`,
      { method: 'POST', body: '{}' },
      config
    ),
  ]);

  // 2. Verify transaction existence on selected network
  const returnedTxId = String(txRaw?.txID || txInfo?.id || '').toLowerCase();
  if (!returnedTxId || returnedTxId !== txIdHex || Object.keys(txInfo || {}).length === 0) {
    throw new Error(
      `Transaction ${txIdHex} was not found on ${config.network.chainName}.`
    );
  }

  // 3. Verify transaction execution success (both contractRet and receipt.result)
  const contractRet = txRaw?.ret?.[0]?.contractRet;
  if (contractRet && String(contractRet).toUpperCase() !== 'SUCCESS') {
    throw new Error(
      `Transaction ${txIdHex} failed on-chain execution with contractRet='${contractRet}'.`
    );
  }

  const receiptResult = String(txInfo?.receipt?.result || '').toUpperCase();
  if (receiptResult !== 'SUCCESS') {
    throw new Error(
      `Transaction ${txIdHex} did not execute successfully on-chain (receipt.result='${txInfo?.receipt?.result || 'MISSING'}').`
    );
  }

  // Verify top-level contract call target if present in raw_data
  const rawContractParam = txRaw?.raw_data?.contract?.[0]?.parameter?.value;
  if (rawContractParam?.contract_address) {
    const calledContract = normalizeTronAddress(rawContractParam.contract_address);
    if (calledContract.hex41 !== config.network.officialUsdtContractHex41) {
      throw new Error(
        `Wrong smart contract called in transaction ${txIdHex}: expected official USDT contract ${config.network.officialUsdtContractBase58}, got ${calledContract.base58}.`
      );
    }
  }

  // 4. Verify block inclusion, solidification, and confirmation count
  const txBlockNumber = Number(txInfo.blockNumber);
  if (!Number.isFinite(txBlockNumber) || txBlockNumber <= 0) {
    throw new Error(
      `Transaction ${txIdHex} is not yet included in a confirmed block (blockNumber=${txInfo.blockNumber}).`
    );
  }

  const latestBlockNumber = Number(
    nowBlockRes?.block_header?.raw_data?.number ?? nowBlockRes?.blockNumber ?? 0
  );
  const solidifiedBlockNumber = Number(
    solidityBlockRes?.block_header?.raw_data?.number ?? solidityBlockRes?.blockNumber ?? 0
  );

  if (!Number.isFinite(latestBlockNumber) || latestBlockNumber < txBlockNumber) {
    throw new Error(
      `Provider block height (${latestBlockNumber}) is invalid or behind transaction block (${txBlockNumber}).`
    );
  }

  const confirmations = latestBlockNumber - txBlockNumber + 1;
  const isSolidified =
    Number.isFinite(solidifiedBlockNumber) &&
    solidifiedBlockNumber >= txBlockNumber &&
    !(Array.isArray(eventsRes?.data) && eventsRes.data.some((e: any) => e?._unconfirmed === true));

  if (config.requireSolidified && !isSolidified) {
    throw new Error(
      `Transaction ${txIdHex} at block ${txBlockNumber} is not yet solidified on ${config.network.chainName} (solidified block: ${solidifiedBlockNumber}).`
    );
  }

  if (confirmations < config.requiredConfirmations) {
    throw new Error(
      `Insufficient TRON block confirmations for ${txIdHex}: ${confirmations} < ${config.requiredConfirmations} required.`
    );
  }

  // 5. Decode and validate official USDT TRC20 Transfer event
  const transferEvent = extractVerifiedUsdtTransferEvent({
    txIdHex,
    txInfo,
    eventsResponse: eventsRes,
    networkSpec: config.network,
    requireSolidified: config.requireSolidified,
  });

  // 6. Verify recipient matches authoritative platform deposit address for this deposit
  if (transferEvent.recipientHex41 !== expectedRecipient.hex41) {
    throw new Error(
      `Wrong TRC20 Transfer recipient on ${txIdHex}: funds were sent to '${transferEvent.recipientBase58}', expected platform deposit address '${expectedRecipient.base58}'.`
    );
  }

  // 7. If deposit attribution binds an expected sender wallet address, enforce exact match
  if (expectedSender && transferEvent.senderHex41 !== expectedSender.hex41) {
    throw new Error(
      `TRC20 Transfer sender mismatch on ${txIdHex}: transfer originated from '${transferEvent.senderBase58}', expected attributed sender '${expectedSender.base58}'.`
    );
  }

  // 8. Verify exact 6-decimal USDT amount in integer token base units (reject underpaid and overpaid transfers)
  if (transferEvent.amountBaseUnits < expectedAmountBaseUnits) {
    throw new Error(
      `Underpaid TRC20 transfer on ${txIdHex}: on-chain transfer is ${transferEvent.amountUsdt} USDT (${transferEvent.amountBaseUnits.toString()} base units), but deposit requested ${input.expectedAmountUsdt} USDT (${expectedAmountBaseUnits.toString()} base units).`
    );
  }
  if (transferEvent.amountBaseUnits > expectedAmountBaseUnits) {
    throw new Error(
      `Overpaid / mismatched TRC20 transfer amount on ${txIdHex}: on-chain transfer is ${transferEvent.amountUsdt} USDT (${transferEvent.amountBaseUnits.toString()} base units), which does not match requested deposit amount ${input.expectedAmountUsdt} USDT (${expectedAmountBaseUnits.toString()} base units).`
    );
  }

  return {
    verified: true,
    provider: 'TRONGRID_TRC20_VERIFIER',
    tronNetwork: config.network.networkId,
    network: config.network.canonicalNetworkLabel,
    chainName: config.network.chainName,
    txHash: rawTxHash,
    normalizedHash,
    paymentRefDocId,
    contractAddress: transferEvent.contractBase58,
    contractAddressHex41: transferEvent.contractHex41,
    senderAddress: transferEvent.senderBase58,
    recipientAddress: transferEvent.recipientBase58,
    expectedTreasuryAddress: expectedRecipient.base58,
    recipientVerified: true,
    attributionMethod: input.attributionMethod,
    asset: 'USDT',
    decimals: 6,
    amount: transferEvent.amountUsdt,
    rawAmountBaseUnits: transferEvent.amountBaseUnits.toString(),
    txStatus: 'SUCCESS',
    blockNumber: txBlockNumber,
    latestBlockNumber,
    solidifiedBlockNumber,
    solidified: isSolidified,
    confirmations,
    requiredConfirmations: config.requiredConfirmations,
    blockTimestamp: Number(txInfo.blockTimeStamp || 0) || undefined,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Resolves the authoritative platform deposit address attributed to a specific user/deposit.
 *
 * Supported server-side attribution mechanisms (without storing private keys in Firestore):
 * 1. Dedicated per-user deposit address registered in `depositAddresses/{addressBase58}`
 *    with `userId === deposit.userId` and `active !== false`.
 * 2. Explicit per-deposit attribution record in `depositAttributions/{txId}` binding
 *    `(userId, txId, expectedRecipientAddress, expectedTxHash / expectedSenderAddress)`.
 *
 * Never credits a transfer merely because it reached a shared general treasury address
 * without explicit user/deposit attribution.
 */
async function resolveDepositAddressAttribution(
  db: FirestoreLike,
  params: {
    userId: string;
    txId: string;
    txData: Record<string, any>;
    normalizedHash: string;
    tronNetwork: TronNetworkId;
  }
): Promise<{
  expectedRecipientBase58: string;
  expectedSenderBase58?: string;
  attributionMethod: 'USER_DEDICATED_ADDRESS' | 'DEPOSIT_INTENT_ATTRIBUTION';
}> {
  const { userId, txId, txData, normalizedHash, tronNetwork } = params;

  // Check 1: Explicit deposit attribution record at depositAttributions/{txId}
  const attributionSnap = await db.runTransaction(async (t) => {
    const attrRef = db.doc(`depositAttributions/${txId}`);
    const userRef = db.doc(`users/${userId}`);
    const [attrDoc, userDoc] = await Promise.all([t.get(attrRef), t.get(userRef)]);
    return {
      attrData: attrDoc.exists ? attrDoc.data() || null : null,
      userData: userDoc.exists ? userDoc.data() || null : null,
    };
  });

  if (attributionSnap.attrData) {
    const attr = attributionSnap.attrData;
    if (String(attr.userId || '') !== userId) {
      throw new Error(
        `Deposit attribution mismatch on ${txId}: attribution record belongs to user '${attr.userId}', not '${userId}'.`
      );
    }
    if (attr.tronNetwork && String(attr.tronNetwork).toLowerCase() !== tronNetwork) {
      throw new Error(
        `Deposit attribution network mismatch on ${txId}: attribution is for '${attr.tronNetwork}', verifier is configured for '${tronNetwork}'.`
      );
    }
    if (attr.expectedTxHash) {
      const attrHashNorm = normalizeAndValidateDepositReference(attr.expectedTxHash, txId).normalizedHash;
      if (attrHashNorm !== normalizedHash) {
        throw new Error(
          `Deposit attribution txHash mismatch on ${txId}: attributed hash does not match deposit txHash.`
        );
      }
    }
    if (attr.expectedAmount !== undefined && attr.expectedAmount !== null) {
      const attrBaseUnits = usdtAmountToBaseUnitsBigInt(Number(attr.expectedAmount));
      const txBaseUnits = usdtAmountToBaseUnitsBigInt(Number(txData.amount));
      if (attrBaseUnits !== txBaseUnits) {
        throw new Error(
          `Deposit attribution amount mismatch on ${txId}: attribution expects ${attr.expectedAmount} USDT (${attrBaseUnits.toString()} base units), deposit claims ${txData.amount} USDT (${txBaseUnits.toString()} base units).`
        );
      }
    }
    const recipientNorm = normalizeTronAddress(attr.expectedRecipientAddress || attr.recipientAddress);
    const senderNorm = attr.expectedSenderAddress
      ? normalizeTronAddress(attr.expectedSenderAddress).base58
      : undefined;

    return {
      expectedRecipientBase58: recipientNorm.base58,
      expectedSenderBase58: senderNorm,
      attributionMethod: 'DEPOSIT_INTENT_ATTRIBUTION',
    };
  }

  // Check 2: User-assigned dedicated TRC20 deposit address on users/{userId}.trc20DepositAddress
  // verified against server-side depositAddresses/{addressBase58} registry
  const candidateUserAddress =
    attributionSnap.userData?.trc20DepositAddress || txData.recipientAddress;

  if (candidateUserAddress) {
    const normCandidate = normalizeTronAddress(candidateUserAddress);
    const addrRegSnap = await db.runTransaction(async (t) => {
      return t.get(db.doc(`depositAddresses/${normCandidate.base58}`));
    });

    if (addrRegSnap.exists) {
      const regData = addrRegSnap.data() || {};
      if (
        String(regData.userId || '') === userId &&
        regData.active !== false &&
        (!regData.tronNetwork || String(regData.tronNetwork).toLowerCase() === tronNetwork)
      ) {
        return {
          expectedRecipientBase58: normCandidate.base58,
          attributionMethod: 'USER_DEDICATED_ADDRESS',
        };
      }
    }
  }

  throw new Error(
    `Missing verified deposit address attribution for user '${userId}' and deposit '${txId}'. ` +
      `Transfers to a general treasury address are never credited without a server-assigned ` +
      `'depositAddresses/{address}' registration or 'depositAttributions/${txId}' binding.`
  );
}

export interface VerifyAndRecordTrc20DepositResult {
  verified: true;
  dryRun: boolean;
  alreadyVerified: boolean;
  userId: string;
  txId: string;
  paymentRefDocId: string;
  receipt: VerifiedTrc20TransferDetails;
  settlement?: SettlementResult;
}

/**
 * End-to-end server-side TRC20 deposit verifier and atomic receipt writer:
 * 1. Validates deposit transaction state and resolves server-side deposit address attribution.
 * 2. Verifies the TRC20 transfer on-chain via TronGrid.
 * 3. If `dryRun === true`, returns the verified on-chain receipt preview immediately
 *    with ZERO Firestore writes and ZERO wallet balance changes.
 * 4. Otherwise atomically writes `verifiedPayments/txhash_<normalized>` while enforcing global
 *    uniqueness across users and deposits (checking both `verifiedPayments` and `paymentReferences`).
 * 5. Blocks automatic wallet settlement on testnets (`nile`/`shasta`) unless `allowTestnetCreditForTesting === true`
 *    is explicitly passed in isolated unit tests, protecting live shared Firestore user wallets.
 */
export async function verifyAndRecordTrc20Deposit(
  db: FirestoreLike,
  params: {
    userId: string;
    txId: string;
    admin?: AdminActor;
    dryRun?: boolean;
    autoSettle?: boolean;
    allowTestnetCreditForTesting?: boolean;
    note?: string;
    configOverrides?: TronVerifierConfigOverrides;
  }
): Promise<VerifyAndRecordTrc20DepositResult> {
  const {
    userId,
    txId,
    admin,
    dryRun = false,
    autoSettle = false,
    allowTestnetCreditForTesting = false,
    note,
    configOverrides,
  } = params;
  if (!userId || !txId) {
    throw new Error('Missing required userId or txId for TRC20 deposit verification.');
  }
  if (dryRun && autoSettle) {
    throw new Error('Cannot enable autoSettle when dryRun mode is active.');
  }

  const config = resolveTronVerifierConfig(configOverrides);
  if (autoSettle && config.network.isTestnet && !allowTestnetCreditForTesting) {
    throw new Error(
      `Refusing to credit wallet balance from a testnet (${config.network.chainName}) transaction because testnet and production share the same Firestore wallet ledger (users/${userId}/wallet/USDT). Use dryRun: true or Verify Proof Only (autoSettle: false) for testnet validation.`
    );
  }

  // Step 1: Read deposit transaction and check pre-existing replay locks before network call
  const preCheck = await db.runTransaction(async (transaction) => {
    const txRef = db.doc(`users/${userId}/transactions/${txId}`);
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists) {
      throw new Error(`Deposit transaction ${txId} not found for user ${userId}.`);
    }
    const txData = txSnap.data() || {};
    if (txData.type !== 'DEPOSIT') {
      throw new Error(`Invalid transaction type '${txData.type}' on ${txId}. Expected 'DEPOSIT'.`);
    }
    if (txData.userId && String(txData.userId) !== userId) {
      throw new Error(
        `Transaction ownership mismatch on ${txId}: document userId '${txData.userId}' != '${userId}'.`
      );
    }
    if (
      txData.status === 'REJECTED' ||
      txData.status === 'FAILED' ||
      txData.settlementStatus === 'REJECTED'
    ) {
      throw new Error(`Deposit transaction ${txId} is rejected and cannot be verified.`);
    }

    const assetSymbol = String(txData.asset || '').toUpperCase().trim();
    if (assetSymbol !== 'USDT') {
      throw new Error(
        `Phase 5 TRC20 verifier supports only USDT deposits (got '${assetSymbol}' on ${txId}).`
      );
    }

    const txNet = String(txData.network || '').toUpperCase().trim();
    if (!txNet.includes('TRC20') && !txNet.includes('TRON')) {
      throw new Error(
        `Deposit ${txId} network '${txData.network}' is not a TRON TRC20 network.`
      );
    }

    const { rawTxHash, normalizedHash, paymentRefDocId } = validateTronTxHash(
      txData.txHash,
      txId
    );

    const paymentRefDoc = db.doc(`paymentReferences/${paymentRefDocId}`);
    const verifiedPaymentDoc = db.doc(`verifiedPayments/${paymentRefDocId}`);
    const [paymentRefSnap, verifiedPaymentSnap] = await Promise.all([
      transaction.get(paymentRefDoc),
      transaction.get(verifiedPaymentDoc),
    ]);

    if (paymentRefSnap.exists) {
      const existingRef = paymentRefSnap.data() || {};
      if (existingRef.userId !== userId || existingRef.txId !== txId) {
        throw new Error(
          `Duplicate payment reference: transaction hash '${rawTxHash}' is already credited to deposit '${existingRef.txId}' (user '${existingRef.userId}').`
        );
      }
    }

    if (verifiedPaymentSnap.exists) {
      const existingProof = verifiedPaymentSnap.data() || {};
      if (
        (existingProof.userId && existingProof.userId !== userId) ||
        (existingProof.txId && existingProof.txId !== txId)
      ) {
        throw new Error(
          `Duplicate verified payment receipt: transaction hash '${rawTxHash}' is already bound to deposit '${existingProof.txId}' (user '${existingProof.userId}').`
        );
      }
    }

    return {
      txData,
      rawTxHash,
      normalizedHash,
      paymentRefDocId,
      existingVerifiedReceipt: verifiedPaymentSnap.exists
        ? (verifiedPaymentSnap.data() as VerifiedTrc20TransferDetails)
        : null,
    };
  });

  // Step 2: Resolve deposit address attribution
  const attribution = await resolveDepositAddressAttribution(db, {
    userId,
    txId,
    txData: preCheck.txData,
    normalizedHash: preCheck.normalizedHash,
    tronNetwork: config.network.networkId,
  });

  // Step 3: Independently verify on-chain transfer via TronGrid
  const onChainReceipt = await verifyTrc20TransferOnChain({
    depositTxId: txId,
    rawTxHash: preCheck.rawTxHash,
    expectedAmountUsdt: Number(preCheck.txData.amount),
    expectedRecipientBase58: attribution.expectedRecipientBase58,
    expectedSenderBase58: attribution.expectedSenderBase58,
    attributionMethod: attribution.attributionMethod,
    configOverrides,
  });

  // Read-only dry-run mode: return verified on-chain receipt without writing to Firestore or crediting any balance
  if (dryRun) {
    return {
      verified: true,
      dryRun: true,
      alreadyVerified: Boolean(preCheck.existingVerifiedReceipt),
      userId,
      txId,
      paymentRefDocId: preCheck.paymentRefDocId,
      receipt: onChainReceipt,
    };
  }

  // Step 4: Atomically persist verifiedPayments/txhash_<normalized> with replay protection
  const writeResult = await db.runTransaction(async (transaction) => {
    const txRef = db.doc(`users/${userId}/transactions/${txId}`);
    const paymentRefDoc = db.doc(`paymentReferences/${preCheck.paymentRefDocId}`);
    const verifiedPaymentDoc = db.doc(`verifiedPayments/${preCheck.paymentRefDocId}`);

    const [txSnap, paymentRefSnap, verifiedPaymentSnap] = await Promise.all([
      transaction.get(txRef),
      transaction.get(paymentRefDoc),
      transaction.get(verifiedPaymentDoc),
    ]);

    if (!txSnap.exists) {
      throw new Error(`Deposit transaction ${txId} no longer exists.`);
    }

    if (paymentRefSnap.exists) {
      const existingRef = paymentRefSnap.data() || {};
      if (existingRef.userId !== userId || existingRef.txId !== txId) {
        throw new Error(
          `Duplicate payment reference: transaction hash '${preCheck.rawTxHash}' is already credited to deposit '${existingRef.txId}' (user '${existingRef.userId}').`
        );
      }
    }

    if (verifiedPaymentSnap.exists) {
      const existingProof = verifiedPaymentSnap.data() || {};
      if (
        (existingProof.userId && existingProof.userId !== userId) ||
        (existingProof.txId && existingProof.txId !== txId)
      ) {
        throw new Error(
          `Duplicate verified payment receipt: transaction hash '${preCheck.rawTxHash}' is already bound to deposit '${existingProof.txId}' (user '${existingProof.userId}').`
        );
      }
      return {
        alreadyVerified: true,
        receipt: existingProof as VerifiedTrc20TransferDetails,
      };
    }

    const receiptRecord = {
      ...onChainReceipt,
      userId,
      txId,
    };

    transaction.set(verifiedPaymentDoc, receiptRecord);
    transaction.update(txRef, {
      settlementStatus: 'VERIFIED_AWAITING_SETTLEMENT',
      verifiedNetwork: onChainReceipt.network,
      verifiedTronNetwork: onChainReceipt.tronNetwork,
      verifiedContractAddress: onChainReceipt.contractAddress,
      verifiedContractAddressHex41: onChainReceipt.contractAddressHex41,
      verifiedSenderAddress: onChainReceipt.senderAddress,
      verifiedRecipientAddress: onChainReceipt.recipientAddress,
      verifiedRawAmountBaseUnits: onChainReceipt.rawAmountBaseUnits,
      verifiedConfirmations: onChainReceipt.confirmations,
      verifiedBlockNumber: onChainReceipt.blockNumber,
      verificationProvider: onChainReceipt.provider,
      verifiedAt: onChainReceipt.verifiedAt,
      updatedAt: onChainReceipt.verifiedAt,
    });

    return {
      alreadyVerified: false,
      receipt: onChainReceipt,
    };
  });

  // Step 5: Optional atomic settlement via existing settleDepositApproval() engine
  let settlement: SettlementResult | undefined;
  if (autoSettle) {
    if (!admin || (!admin.uid && !admin.email)) {
      throw new Error('Authorized administrator actor is required when autoSettle is enabled.');
    }
    settlement = await settleDepositApproval(db, {
      userId,
      txId,
      admin,
      note:
        note ||
        `Verified on ${onChainReceipt.chainName} (block ${onChainReceipt.blockNumber}, ${onChainReceipt.confirmations} confirmations) and settled.`,
      allowManualCompletedStatus: true,
      allowTestnetCreditForTesting,
      paymentVerification: writeResult.receipt as IndependentPaymentVerificationReceipt,
    });
  }

  return {
    verified: true,
    dryRun: false,
    alreadyVerified: writeResult.alreadyVerified,
    userId,
    txId,
    paymentRefDocId: preCheck.paymentRefDocId,
    receipt: writeResult.receipt,
    settlement,
  };
}

function decodeTvmAbiString(rawHexWord: unknown): string {
  const clean = String(rawHexWord || '').replace(/^0x/i, '').trim();
  if (clean.length < 128) return '';
  const lengthBytes = Number.parseInt(clean.slice(64, 128), 16);
  if (!Number.isFinite(lengthBytes) || lengthBytes <= 0 || 128 + lengthBytes * 2 > clean.length) {
    return '';
  }
  return Buffer.from(clean.slice(128, 128 + lengthBytes * 2), 'hex').toString('utf8');
}

export interface TronContractAndEndpointProbeResult {
  verified: true;
  readOnly: true;
  tronNetwork: TronNetworkId;
  chainName: string;
  apiBaseUrl: string;
  usedApiKeyHeader: boolean;
  contract: {
    base58: string;
    hex41: string;
    contractName: string;
    bytecodeLengthHexChars: number;
    hasTransferEventAbi: boolean;
    transferEventSignature: string;
    onChainSymbol: string;
    onChainName: string;
    onChainDecimals: number;
  };
  endpoints: {
    getContractOk: boolean;
    triggerConstantContractOk: boolean;
    getNowBlockOk: boolean;
    getSolidityNowBlockOk: boolean;
    latestBlockNumber: number;
    solidifiedBlockNumber: number;
    solidificationLagBlocks: number;
  };
  checkedAt: string;
}

/**
 * Strictly read-only on-chain contract and TronGrid endpoint validator.
 * Performs ZERO Firestore reads or writes, creates no receipts, and settles no deposits.
 * Allows public read-only TronGrid access if TRONGRID_API_KEY is not set in the environment
 * (while keeping TRONGRID_API_KEY mandatory for deposit verification).
 */
export async function verifyTronContractAndEndpointsReadOnly(
  overrides: TronVerifierConfigOverrides = {}
): Promise<TronContractAndEndpointProbeResult> {
  assertAuthoritativeTronContractsIntegrity();

  const probeConfig = resolveTronVerifierConfig({
    ...overrides,
    requireApiKey: overrides.requireApiKey ?? false,
  });

  const baseUrl = probeConfig.network.apiBaseUrl;
  const expectedHex41 = probeConfig.network.officialUsdtContractHex41;
  const expectedBase58 = probeConfig.network.officialUsdtContractBase58;

  const [contractRes, decimalsRes, symbolRes, nameRes, nowBlockRes, solidityBlockRes] =
    await Promise.all([
      fetchTronGridJson(
        `${baseUrl}/wallet/getcontract`,
        {
          method: 'POST',
          body: JSON.stringify({ value: expectedHex41 }),
        },
        probeConfig
      ),
      fetchTronGridJson(
        `${baseUrl}/wallet/triggerconstantcontract`,
        {
          method: 'POST',
          body: JSON.stringify({
            owner_address: expectedHex41,
            contract_address: expectedHex41,
            function_selector: 'decimals()',
            parameter: '',
          }),
        },
        probeConfig
      ),
      fetchTronGridJson(
        `${baseUrl}/wallet/triggerconstantcontract`,
        {
          method: 'POST',
          body: JSON.stringify({
            owner_address: expectedHex41,
            contract_address: expectedHex41,
            function_selector: 'symbol()',
            parameter: '',
          }),
        },
        probeConfig
      ),
      fetchTronGridJson(
        `${baseUrl}/wallet/triggerconstantcontract`,
        {
          method: 'POST',
          body: JSON.stringify({
            owner_address: expectedHex41,
            contract_address: expectedHex41,
            function_selector: 'name()',
            parameter: '',
          }),
        },
        probeConfig
      ),
      fetchTronGridJson(`${baseUrl}/wallet/getnowblock`, { method: 'POST', body: '{}' }, probeConfig),
      fetchTronGridJson(
        `${baseUrl}/walletsolidity/getnowblock`,
        { method: 'POST', body: '{}' },
        probeConfig
      ),
    ]);

  const returnedContractHex41 = String(contractRes?.contract_address || '').toLowerCase();
  if (returnedContractHex41 !== expectedHex41) {
    throw new Error(
      `On-chain contract address mismatch on ${probeConfig.network.chainName}: expected '${expectedHex41}' (${expectedBase58}), got '${returnedContractHex41 || 'MISSING'}'.`
    );
  }

  const bytecodeHex = String(contractRes?.bytecode || '').trim();
  if (bytecodeHex.length < 100) {
    throw new Error(
      `Contract ${expectedBase58} on ${probeConfig.network.chainName} has no deployed smart-contract bytecode.`
    );
  }

  const abiEntries: Array<Record<string, any>> = Array.isArray(contractRes?.abi?.entrys)
    ? contractRes.abi.entrys
    : [];
  const transferAbi = abiEntries.find(
    (entry) => String(entry?.type || '') === 'Event' && String(entry?.name || '') === 'Transfer'
  );
  const transferInputs: Array<Record<string, any>> = Array.isArray(transferAbi?.inputs)
    ? transferAbi!.inputs
    : [];
  const hasValidTransferEventAbi =
    Boolean(transferAbi) &&
    transferInputs.length === 3 &&
    transferInputs[0]?.type === 'address' &&
    transferInputs[0]?.indexed === true &&
    transferInputs[1]?.type === 'address' &&
    transferInputs[1]?.indexed === true &&
    transferInputs[2]?.type === 'uint256';

  if (!hasValidTransferEventAbi) {
    throw new Error(
      `Contract ${expectedBase58} ABI on ${probeConfig.network.chainName} does not expose standard TRC20 Transfer(address indexed from, address indexed to, uint256 value) event.`
    );
  }

  const rawDecimalsHex = String(decimalsRes?.constant_result?.[0] || '').trim();
  if (!rawDecimalsHex || !/^[0-9a-fA-F]+$/.test(rawDecimalsHex)) {
    throw new Error(
      `Failed to read on-chain decimals() from contract ${expectedBase58} on ${probeConfig.network.chainName}.`
    );
  }
  const onChainDecimals = Number.parseInt(rawDecimalsHex, 16);
  if (onChainDecimals !== 6) {
    throw new Error(
      `On-chain USDT decimals() mismatch on ${expectedBase58}: expected 6, got ${onChainDecimals}.`
    );
  }

  const onChainSymbol = decodeTvmAbiString(symbolRes?.constant_result?.[0]);
  if (onChainSymbol !== 'USDT') {
    throw new Error(
      `On-chain token symbol() mismatch on ${expectedBase58}: expected 'USDT', got '${onChainSymbol}'.`
    );
  }

  const onChainName = decodeTvmAbiString(nameRes?.constant_result?.[0]) || String(contractRes?.name || '');

  const latestBlockNumber = Number(
    nowBlockRes?.block_header?.raw_data?.number ?? nowBlockRes?.blockNumber ?? 0
  );
  const solidifiedBlockNumber = Number(
    solidityBlockRes?.block_header?.raw_data?.number ?? solidityBlockRes?.blockNumber ?? 0
  );

  if (!Number.isFinite(latestBlockNumber) || latestBlockNumber <= 0) {
    throw new Error(`Invalid latest block number (${latestBlockNumber}) from ${baseUrl}/wallet/getnowblock.`);
  }
  if (!Number.isFinite(solidifiedBlockNumber) || solidifiedBlockNumber <= 0) {
    throw new Error(
      `Invalid solidified block number (${solidifiedBlockNumber}) from ${baseUrl}/walletsolidity/getnowblock.`
    );
  }

  return {
    verified: true,
    readOnly: true,
    tronNetwork: probeConfig.network.networkId,
    chainName: probeConfig.network.chainName,
    apiBaseUrl: baseUrl,
    usedApiKeyHeader: Boolean(probeConfig.apiKey && probeConfig.apiKey.length > 0),
    contract: {
      base58: expectedBase58,
      hex41: expectedHex41,
      contractName: String(contractRes?.name || 'TetherToken'),
      bytecodeLengthHexChars: bytecodeHex.length,
      hasTransferEventAbi: true,
      transferEventSignature: 'Transfer(address,address,uint256)',
      onChainSymbol,
      onChainName,
      onChainDecimals,
    },
    endpoints: {
      getContractOk: true,
      triggerConstantContractOk: true,
      getNowBlockOk: true,
      getSolidityNowBlockOk: true,
      latestBlockNumber,
      solidifiedBlockNumber,
      solidificationLagBlocks: Math.max(0, latestBlockNumber - solidifiedBlockNumber),
    },
    checkedAt: new Date().toISOString(),
  };
}

