/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Nexora Mine — Owner-Configured Manual Crypto Payment System & Exchange Rate Guardrails
 *
 * Manages owner-supplied receiving wallet addresses, network confirmation thresholds,
 * address-rotation tracking, and server-side BigInt decimal conversion math.
 *
 * Security Invariants:
 * 1. Zero invented, demo, or placeholder addresses are ever shipped or enabled.
 * 2. All payment methods default to `receivingAddress: ''` and `enabled: false`.
 * 3. Non-USDT methods (BTC, ETH, SOL, LTC) default to `settlementEnabled: false` until
 *    both an independent blockchain verifier and a live server-side exchange-rate feed are active.
 * 4. Cross-network address reuse is blocked unless both networks are EVM-compatible
 *    (ERC20 and BEP20) AND `confirmSharedAddressAcrossNetworks: true` is passed.
 * 5. Financial conversions use strict BigInt fixed-point integer arithmetic (zero float drift).
 */

export interface ManualPaymentMethodConfig {
  id: string;
  symbol: string;
  name: string;
  network: string;
  networkCode: 'TRC20' | 'ERC20' | 'BEP20' | 'BTC' | 'SOL' | 'LTC';
  receivingAddress: string;
  previousReceivingAddress?: string;
  addressRotatedAt?: string;
  memoRequired: boolean;
  memoLabel?: string;
  memoValue?: string;
  minDeposit: number;
  confirmationsRequired: number;
  instructions?: string;
  explorerTxUrlTemplate?: string;
  enabled: boolean;
  settlementEnabled: boolean;
  sortOrder: number;
  updatedAt: string;
  updatedBy?: string;
}

/**
 * Trusted server-fetched exchange-rate quote required for converting non-USDT deposits.
 * NEVER accepted from client request payloads or transaction documents.
 */
export interface TrustedServerExchangeRateQuote {
  provider: string;
  baseAsset: string;
  quoteAsset: 'USDT' | 'USD';
  priceUSD: number;
  quotedAt: string;
  validityWindowMs?: number;
  fetchedByServer: boolean;
}

export interface ValidatedExchangeRateCalculation {
  provider: string;
  baseAsset: string;
  quoteAsset: 'USDT';
  exchangeRateUSD: number;
  rateScaled1e8: string;
  nativeAmount: number;
  nativeAmountScaled1e8: string;
  creditedUsdtAmount: number;
  creditedUsdtScaled1e6: string;
  quotedAt: string;
  validityWindowMs: number;
  quoteAgeMs: number;
  calculationMethod: 'BIGINT_FIXED_POINT_1E8_TO_1E6_HALF_DOWN';
}

export const DEFAULT_CONFIRMATIONS_BY_NETWORK: Record<
  'TRC20' | 'ERC20' | 'BEP20' | 'BTC' | 'SOL' | 'LTC',
  number
> = {
  TRC20: 19,
  ERC20: 12,
  BEP20: 15,
  BTC: 2,
  SOL: 32,
  LTC: 6,
};

/**
 * Reasonable sanity bounds for server-side crypto price quotes (protects against corrupted API responses).
 */
const EXCHANGE_RATE_SANITY_BOUNDS_USD: Record<string, { min: number; max: number }> = {
  USDT: { min: 0.95, max: 1.05 },
  BTC: { min: 5000, max: 500000 },
  ETH: { min: 200, max: 50000 },
  SOL: { min: 5, max: 5000 },
  LTC: { min: 10, max: 5000 },
};

/**
 * Default catalog of supported manual crypto payment methods.
 * CRITICAL: Every method ships with `receivingAddress: ''` and `enabled: false`
 * until the project owner configures their real receiving wallet addresses.
 * Non-USDT methods also ship with `settlementEnabled: false` until an independent
 * chain verifier and live server-side exchange-rate feed are active.
 */
export const DEFAULT_PAYMENT_METHODS_CATALOG: ManualPaymentMethodConfig[] = [
  {
    id: 'usdt_trc20',
    symbol: 'USDT',
    name: 'Tether USD',
    network: 'TRC20 (Tron)',
    networkCode: 'TRC20',
    receivingAddress: '',
    memoRequired: false,
    memoLabel: '',
    memoValue: '',
    minDeposit: 10,
    confirmationsRequired: 19,
    instructions: 'Send only USDT (TRC20) on the TRON network. Do not send ERC20 or BEP20 tokens to this address.',
    explorerTxUrlTemplate: 'https://tronscan.org/#/transaction/{txHash}',
    enabled: false,
    settlementEnabled: true,
    sortOrder: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'usdt_erc20',
    symbol: 'USDT',
    name: 'Tether USD',
    network: 'ERC20 (Ethereum)',
    networkCode: 'ERC20',
    receivingAddress: '',
    memoRequired: false,
    memoLabel: '',
    memoValue: '',
    minDeposit: 10,
    confirmationsRequired: 12,
    instructions: 'Send only USDT (ERC20) on the Ethereum Mainnet.',
    explorerTxUrlTemplate: 'https://etherscan.io/tx/{txHash}',
    enabled: false,
    settlementEnabled: true,
    sortOrder: 2,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'usdt_bep20',
    symbol: 'USDT',
    name: 'Tether USD',
    network: 'BEP20 (BNB Smart Chain)',
    networkCode: 'BEP20',
    receivingAddress: '',
    memoRequired: false,
    memoLabel: '',
    memoValue: '',
    minDeposit: 10,
    confirmationsRequired: 15,
    instructions: 'Send only USDT (BEP20) on BNB Smart Chain (BSC).',
    explorerTxUrlTemplate: 'https://bscscan.com/tx/{txHash}',
    enabled: false,
    settlementEnabled: true,
    sortOrder: 3,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'btc_native',
    symbol: 'BTC',
    name: 'Bitcoin',
    network: 'Bitcoin (BTC)',
    networkCode: 'BTC',
    receivingAddress: '',
    memoRequired: false,
    memoLabel: '',
    memoValue: '',
    minDeposit: 0.0005,
    confirmationsRequired: 2,
    instructions: 'Send only native Bitcoin (BTC). Disabled for real-money settlement until independent chain & rate verification is active.',
    explorerTxUrlTemplate: 'https://mempool.space/tx/{txHash}',
    enabled: false,
    settlementEnabled: false,
    sortOrder: 4,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'eth_erc20',
    symbol: 'ETH',
    name: 'Ethereum',
    network: 'Ethereum (ERC20)',
    networkCode: 'ERC20',
    receivingAddress: '',
    memoRequired: false,
    memoLabel: '',
    memoValue: '',
    minDeposit: 0.01,
    confirmationsRequired: 12,
    instructions: 'Send only native Ethereum (ETH) on Ethereum Mainnet. Disabled for real-money settlement until independent chain & rate verification is active.',
    explorerTxUrlTemplate: 'https://etherscan.io/tx/{txHash}',
    enabled: false,
    settlementEnabled: false,
    sortOrder: 5,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sol_spl',
    symbol: 'SOL',
    name: 'Solana',
    network: 'Solana (SPL)',
    networkCode: 'SOL',
    receivingAddress: '',
    memoRequired: false,
    memoLabel: '',
    memoValue: '',
    minDeposit: 0.1,
    confirmationsRequired: 32,
    instructions: 'Send only native Solana (SOL) on Solana Mainnet. Disabled for real-money settlement until independent chain & rate verification is active.',
    explorerTxUrlTemplate: 'https://solscan.io/tx/{txHash}',
    enabled: false,
    settlementEnabled: false,
    sortOrder: 6,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ltc_native',
    symbol: 'LTC',
    name: 'Litecoin',
    network: 'Litecoin (LTC)',
    networkCode: 'LTC',
    receivingAddress: '',
    memoRequired: false,
    memoLabel: '',
    memoValue: '',
    minDeposit: 0.1,
    confirmationsRequired: 6,
    instructions: 'Send only native Litecoin (LTC). Disabled for real-money settlement until independent chain & rate verification is active.',
    explorerTxUrlTemplate: 'https://blockchair.com/litecoin/transaction/{txHash}',
    enabled: false,
    settlementEnabled: false,
    sortOrder: 7,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * Known sample, demo, or placeholder addresses that must NEVER be accepted as real owner addresses.
 */
const FORBIDDEN_SAMPLE_ADDRESSES = new Set([
  'tqn9y2khesljw1chvwfmsmestow5kcblse',
  '0x71c7656ec7ab88b098defb751b7401b5f6d8976f',
  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  'hn7cabbmar2r5x9kpq2v8z1m4w6y3n5t7r9q2w4e6r8t',
  'ltc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx992a',
  'tnexoracustodialtreasuryvault99999',
  '0xnexoraethereumcustodialtreasury0001',
  'txyzopyrdj2d9xrtbg411xzz3km5vkaebf', // Nile USDT token contract address (not an owner wallet)
  'tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t', // Mainnet USDT token contract address (not an owner wallet)
]);

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58Bytes(input: string): Uint8Array | null {
  if (!input || typeof input !== 'string') return null;
  const bytes: number[] = [0];
  for (let i = 0; i < input.length; i++) {
    const charIndex = BASE58_ALPHABET.indexOf(input[i]);
    if (charIndex === -1) return null;
    let carry = charIndex;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < input.length && input[i] === '1'; i++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

export function normalizeNetworkCode(
  rawNetwork: string
): 'TRC20' | 'ERC20' | 'BEP20' | 'BTC' | 'SOL' | 'LTC' {
  const upper = String(rawNetwork || '').toUpperCase().trim();
  if (upper.includes('TRC20') || upper.includes('TRON') || upper === 'TRX') return 'TRC20';
  if (upper.includes('BEP20') || upper.includes('BSC') || upper.includes('BNB')) return 'BEP20';
  if (upper.includes('ERC20') || upper.includes('ETH')) return 'ERC20';
  if (upper.includes('BTC') || upper.includes('BITCOIN')) return 'BTC';
  if (upper.includes('SOL') || upper.includes('SPL')) return 'SOL';
  if (upper.includes('LTC') || upper.includes('LITECOIN')) return 'LTC';
  throw new Error(`Unsupported blockchain network code '${rawNetwork}'. Supported: TRC20, ERC20, BEP20, BTC, SOL, LTC.`);
}

export function normalizePaymentMethodId(rawMethodId: string): string {
  const clean = String(rawMethodId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (clean === 'sol_native') return 'sol_spl';
  return clean;
}

export function inferPaymentMethodId(assetInput: string, networkInput: string): string {
  const symbol = String(assetInput || '').toUpperCase().trim();
  const netCode = normalizeNetworkCode(networkInput);
  if (symbol === 'USDT') {
    if (netCode === 'TRC20') return 'usdt_trc20';
    if (netCode === 'ERC20') return 'usdt_erc20';
    if (netCode === 'BEP20') return 'usdt_bep20';
  }
  if (symbol === 'BTC' && netCode === 'BTC') return 'btc_native';
  if (symbol === 'ETH' && netCode === 'ERC20') return 'eth_erc20';
  if (symbol === 'SOL' && netCode === 'SOL') return 'sol_spl';
  if (symbol === 'LTC' && netCode === 'LTC') return 'ltc_native';
  throw new Error(
    `Unsupported asset/network combination '${symbol}' on '${networkInput}' (normalized '${netCode}').`
  );
}

/**
 * Converts a finite decimal number to an exact BigInt scaled by 10^decimals using string parsing
 * (avoids IEEE-754 float multiplication drift).
 */
export function decimalToScaledBigInt(value: number | string, decimals = 8): bigint {
  const rawStr = typeof value === 'number' ? value.toFixed(decimals + 4) : String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(rawStr)) {
    throw new Error(`Invalid positive decimal value '${value}' for fixed-point BigInt conversion.`);
  }
  const [intPart, fracPart = ''] = rawStr.split('.');
  const paddedFrac = (fracPart + '0'.repeat(decimals + 1)).slice(0, decimals);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(paddedFrac || '0');
}

export function scaledBigIntToDecimal(scaled: bigint, decimals = 8): number {
  const isNeg = scaled < 0n;
  const abs = isNeg ? -scaled : scaled;
  const divisor = 10n ** BigInt(decimals);
  const intPart = abs / divisor;
  const fracPart = (abs % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  const combined = fracPart.length > 0 ? `${intPart.toString()}.${fracPart}` : intPart.toString();
  return Number(isNeg ? `-${combined}` : combined);
}

/**
 * Safe fixed-point BigInt addition for 8-decimal crypto balances.
 */
export function addCryptoBalancesBigInt(a: number, b: number): number {
  const aScaled = decimalToScaledBigInt(a, 8);
  const bScaled = decimalToScaledBigInt(b, 8);
  return scaledBigIntToDecimal(aScaled + bScaled, 8);
}

/**
 * Validates a server-side exchange-rate quote and computes the exact USDT credit amount
 * using BigInt fixed-point integer arithmetic (10^8 native * 10^8 USD rate -> 10^6 micro-USDT).
 *
 * Fails closed if:
 * - Quote is missing or not marked `fetchedByServer: true`
 * - `provider` is empty or untrusted (e.g. 'CLIENT', 'STATIC', 'DEFAULT', 'FALLBACK')
 * - `baseAsset` does not match the deposit asset
 * - `priceUSD` is outside sanity bounds
 * - `quotedAt` is missing, unparseable, in the future (>5s clock skew), or older than `maxAgeMs` (default 5 min)
 */
export function validateTrustedServerRateQuote(
  quote: TrustedServerExchangeRateQuote | null | undefined,
  expectedBaseAsset: string,
  nativeAmount: number,
  options?: { nowMs?: number; maxAgeMs?: number }
): ValidatedExchangeRateCalculation {
  const cleanAsset = String(expectedBaseAsset || '').toUpperCase().trim();
  if (!quote || typeof quote !== 'object') {
    throw new Error(
      `Missing trusted server-side exchange-rate quote for ${cleanAsset} deposit. Client-supplied amountUSD and static fallback rates are forbidden.`
    );
  }

  if (quote.fetchedByServer !== true) {
    throw new Error(
      `Untrusted exchange-rate quote for ${cleanAsset}: rate quote must be fetched exclusively by the trusted server (fetchedByServer !== true).`
    );
  }

  const provider = String(quote.provider || '').trim();
  const providerUpper = provider.toUpperCase();
  if (
    !provider ||
    providerUpper.includes('CLIENT') ||
    providerUpper.includes('STATIC') ||
    providerUpper.includes('DEFAULT') ||
    providerUpper.includes('FALLBACK') ||
    providerUpper.includes('HARDCODED') ||
    providerUpper.includes('USER')
  ) {
    throw new Error(
      `Forbidden exchange-rate provider '${provider}' for ${cleanAsset}: static, fallback, or client-supplied rates cannot be used for settlement.`
    );
  }

  const quoteBase = String(quote.baseAsset || '').toUpperCase().trim();
  if (quoteBase !== cleanAsset) {
    throw new Error(
      `Exchange-rate asset mismatch: quote is for '${quoteBase}', expected '${cleanAsset}'.`
    );
  }

  const quoteCurrency = String(quote.quoteAsset || '').toUpperCase().trim();
  if (quoteCurrency !== 'USDT' && quoteCurrency !== 'USD') {
    throw new Error(
      `Exchange-rate quote currency must be 'USDT' or 'USD' (received '${quote.quoteAsset}').`
    );
  }

  const priceUSD = Number(quote.priceUSD);
  const bounds = EXCHANGE_RATE_SANITY_BOUNDS_USD[cleanAsset];
  if (!Number.isFinite(priceUSD) || priceUSD <= 0) {
    throw new Error(`Invalid exchange rate (${quote.priceUSD}) for ${cleanAsset}.`);
  }
  if (bounds && (priceUSD < bounds.min || priceUSD > bounds.max)) {
    throw new Error(
      `Exchange rate $${priceUSD} for ${cleanAsset} is outside safety bounds ($${bounds.min} – $${bounds.max}).`
    );
  }

  const quotedAtMs = Date.parse(String(quote.quotedAt || ''));
  if (!Number.isFinite(quotedAtMs)) {
    throw new Error(`Invalid or missing quote timestamp (quotedAt='${quote.quotedAt}') on ${cleanAsset} rate quote.`);
  }

  const nowMs = options?.nowMs ?? Date.now();
  const validityWindowMs = Math.max(
    1000,
    Math.min(300_000, Number(options?.maxAgeMs ?? quote.validityWindowMs ?? 300_000))
  );
  const quoteAgeMs = nowMs - quotedAtMs;

  if (quoteAgeMs < -5000) {
    throw new Error(
      `Exchange-rate quote timestamp (${quote.quotedAt}) is in the future relative to server clock.`
    );
  }
  if (quoteAgeMs > validityWindowMs) {
    throw new Error(
      `Stale exchange-rate quote for ${cleanAsset}: quote age ${quoteAgeMs}ms exceeds maximum validity window ${validityWindowMs}ms (quotedAt=${quote.quotedAt}).`
    );
  }

  // BigInt fixed-point calculation:
  // nativeScaled (10^8) * rateScaled (10^8) = product (10^16)
  // Divide by 10^10 to obtain micro-USDT (10^6, 6 decimal places), then round to 6 decimals.
  const nativeScaled1e8 = decimalToScaledBigInt(nativeAmount, 8);
  const rateScaled1e8 = decimalToScaledBigInt(priceUSD, 8);
  const product1e16 = nativeScaled1e8 * rateScaled1e8;
  const usdtScaled1e6 = product1e16 / 10_000_000_000n;

  if (usdtScaled1e6 <= 0n) {
    throw new Error(
      `Computed USDT credit amount is zero for ${nativeAmount} ${cleanAsset} @ $${priceUSD}.`
    );
  }

  const creditedUsdtAmount = scaledBigIntToDecimal(usdtScaled1e6, 6);

  return {
    provider,
    baseAsset: cleanAsset,
    quoteAsset: 'USDT',
    exchangeRateUSD: scaledBigIntToDecimal(rateScaled1e8, 8),
    rateScaled1e8: rateScaled1e8.toString(),
    nativeAmount: scaledBigIntToDecimal(nativeScaled1e8, 8),
    nativeAmountScaled1e8: nativeScaled1e8.toString(),
    creditedUsdtAmount,
    creditedUsdtScaled1e6: usdtScaled1e6.toString(),
    quotedAt: new Date(quotedAtMs).toISOString(),
    validityWindowMs,
    quoteAgeMs: Math.max(0, quoteAgeMs),
    calculationMethod: 'BIGINT_FIXED_POINT_1E8_TO_1E6_HALF_DOWN',
  };
}

/**
 * Validates an owner-supplied receiving wallet address for a specific blockchain network.
 */
export function validatePaymentMethodAddress(
  networkInput: string,
  rawAddressInput: string
): { valid: boolean; normalizedAddress: string; networkCode: 'TRC20' | 'ERC20' | 'BEP20' | 'BTC' | 'SOL' | 'LTC'; error?: string } {
  let networkCode: 'TRC20' | 'ERC20' | 'BEP20' | 'BTC' | 'SOL' | 'LTC';
  try {
    networkCode = normalizeNetworkCode(networkInput);
  } catch (err: any) {
    return {
      valid: false,
      normalizedAddress: '',
      networkCode: 'TRC20',
      error: err.message,
    };
  }

  const address = typeof rawAddressInput === 'string' ? rawAddressInput.trim() : '';
  if (!address) {
    return {
      valid: false,
      normalizedAddress: '',
      networkCode,
      error: `Receiving wallet address cannot be empty for ${networkCode}.`,
    };
  }

  const lower = address.toLowerCase();
  if (
    FORBIDDEN_SAMPLE_ADDRESSES.has(lower) ||
    lower.includes('demo') ||
    lower.includes('sample') ||
    lower.includes('placeholder') ||
    lower.includes('fake') ||
    lower.includes('test') ||
    /^0x0+$/.test(lower) ||
    /^([a-z0-9])\1{9,}$/i.test(address.replace(/^0x/i, ''))
  ) {
    return {
      valid: false,
      normalizedAddress: address,
      networkCode,
      error: `Rejected sample, placeholder, or token contract address '${address}'. Only a real owner-controlled wallet address is permitted.`,
    };
  }

  if (networkCode === 'TRC20') {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      return {
        valid: false,
        normalizedAddress: address,
        networkCode,
        error: 'Invalid TRON (TRC20) address: must start with "T" and be 34 Base58 characters.',
      };
    }
    const decoded = decodeBase58Bytes(address);
    if (!decoded || decoded.length !== 25 || decoded[0] !== 0x41) {
      return {
        valid: false,
        normalizedAddress: address,
        networkCode,
        error: 'Invalid TRON (TRC20) address payload: decoded Base58 payload must be 25 bytes starting with 0x41.',
      };
    }
    return { valid: true, normalizedAddress: address, networkCode };
  }

  if (networkCode === 'ERC20' || networkCode === 'BEP20') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return {
        valid: false,
        normalizedAddress: address,
        networkCode,
        error: `Invalid ${networkCode} address: must start with "0x" followed by 40 hexadecimal characters.`,
      };
    }
    return { valid: true, normalizedAddress: address, networkCode };
  }

  if (networkCode === 'BTC') {
    if (!/^(bc1[a-zA-HJ-NP-Z0-9]{25,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address)) {
      return {
        valid: false,
        normalizedAddress: address,
        networkCode,
        error: 'Invalid Bitcoin (BTC) address: must be a valid Bech32 (bc1...) or Legacy/P2SH (1... or 3...) address.',
      };
    }
    return { valid: true, normalizedAddress: address, networkCode };
  }

  if (networkCode === 'LTC') {
    if (!/^(ltc1[a-zA-HJ-NP-Z0-9]{25,59}|[LM3][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address)) {
      return {
        valid: false,
        normalizedAddress: address,
        networkCode,
        error: 'Invalid Litecoin (LTC) address: must start with ltc1, L, M, or 3.',
      };
    }
    return { valid: true, normalizedAddress: address, networkCode };
  }

  if (networkCode === 'SOL') {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return {
        valid: false,
        normalizedAddress: address,
        networkCode,
        error: 'Invalid Solana (SOL) address: must be 32 to 44 Base58 characters.',
      };
    }
    return { valid: true, normalizedAddress: address, networkCode };
  }

  return {
    valid: false,
    normalizedAddress: address,
    networkCode,
    error: `Unsupported network code '${networkCode}'.`,
  };
}

/**
 * Checks whether an address is already used across another payment method with a different network.
 * Allows sharing the same address across the SAME networkCode (e.g. USDT-ERC20 and ETH-ERC20),
 * or across EVM-compatible networks (ERC20 <-> BEP20) ONLY when `confirmSharedAddressAcrossNetworks: true`.
 */
export function validateCrossNetworkAddressReuse(
  targetMethodId: string,
  targetNetworkCode: 'TRC20' | 'ERC20' | 'BEP20' | 'BTC' | 'SOL' | 'LTC',
  rawAddress: string,
  existingMethods: ManualPaymentMethodConfig[],
  confirmSharedAddressAcrossNetworks = false
): void {
  const cleanAddr = rawAddress.trim().toLowerCase();
  if (!cleanAddr) return;

  for (const method of existingMethods) {
    if (method.id === targetMethodId) continue;
    const otherAddr = String(method.receivingAddress || '').trim().toLowerCase();
    if (!otherAddr || otherAddr !== cleanAddr) continue;

    // Same network code (e.g. ETH on ERC20 and USDT on ERC20) is naturally compatible
    if (method.networkCode === targetNetworkCode) {
      continue;
    }

    const bothEvm =
      (targetNetworkCode === 'ERC20' || targetNetworkCode === 'BEP20') &&
      (method.networkCode === 'ERC20' || method.networkCode === 'BEP20');

    if (bothEvm && confirmSharedAddressAcrossNetworks) {
      continue;
    }

    if (bothEvm) {
      throw new Error(
        `Receiving address '${rawAddress}' is already configured on ${method.symbol} (${method.networkCode}). Reusing the same EVM address across ${targetNetworkCode} and ${method.networkCode} requires setting confirmSharedAddressAcrossNetworks: true.`
      );
    }

    throw new Error(
      `Receiving address '${rawAddress}' is already configured for incompatible network ${method.networkCode} (${method.id}) and cannot be reused on ${targetNetworkCode}.`
    );
  }
}

/**
 * Normalizes and sanitizes a payment method record read from Firestore or admin input.
 * Guarantees that:
 * 1. Any method with an empty or invalid `receivingAddress` has `enabled: false`.
 * 2. Address changes on an existing configured method preserve `previousReceivingAddress`
 *    and `addressRotatedAt` so pending deposits targeting an old address are safely caught.
 * 3. Non-USDT methods default to `settlementEnabled: false` unless explicitly enabled.
 */
export function sanitizePaymentMethodConfig(
  raw: Partial<ManualPaymentMethodConfig>,
  fallback?: ManualPaymentMethodConfig
): ManualPaymentMethodConfig {
  const normalizedId = normalizePaymentMethodId(String(raw.id || fallback?.id || ''));
  const catalogMatch = DEFAULT_PAYMENT_METHODS_CATALOG.find((item) => item.id === normalizedId);
  const base: ManualPaymentMethodConfig = fallback ||
    catalogMatch || {
      id: normalizedId,
      symbol: String(raw.symbol || 'USDT').toUpperCase().trim(),
      name: String(raw.name || raw.symbol || 'Tether USD').trim(),
      network: String(raw.network || 'TRC20 (Tron)').trim(),
      networkCode: normalizeNetworkCode(String(raw.networkCode || raw.network || 'TRC20')),
      receivingAddress: '',
      memoRequired: false,
      memoLabel: '',
      memoValue: '',
      minDeposit: 10,
      confirmationsRequired: 19,
      instructions: '',
      explorerTxUrlTemplate: '',
      enabled: false,
      settlementEnabled: false,
      sortOrder: 99,
      updatedAt: new Date().toISOString(),
    };

  const symbol = String(raw.symbol || base.symbol).toUpperCase().trim();
  const networkCode = normalizeNetworkCode(String(raw.networkCode || base.networkCode || base.network));
  const receivingAddress =
    typeof raw.receivingAddress === 'string' ? raw.receivingAddress.trim() : base.receivingAddress;
  const validation = receivingAddress
    ? validatePaymentMethodAddress(networkCode, receivingAddress)
    : { valid: false, normalizedAddress: '' };

  const safeReceivingAddress = validation.valid ? validation.normalizedAddress : '';
  const requestedEnabled = typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled;
  const memoRequired = typeof raw.memoRequired === 'boolean' ? raw.memoRequired : base.memoRequired;
  const memoValue = typeof raw.memoValue === 'string' ? raw.memoValue.trim() : (base.memoValue || '');

  // Track address rotation when an existing non-empty address is replaced by a different address
  let previousReceivingAddress =
    typeof raw.previousReceivingAddress === 'string'
      ? raw.previousReceivingAddress.trim()
      : base.previousReceivingAddress;
  let addressRotatedAt =
    typeof raw.addressRotatedAt === 'string' ? raw.addressRotatedAt : base.addressRotatedAt;

  if (
    base.receivingAddress &&
    safeReceivingAddress &&
    base.receivingAddress.toLowerCase() !== safeReceivingAddress.toLowerCase()
  ) {
    previousReceivingAddress = base.receivingAddress;
    addressRotatedAt = new Date().toISOString();
  }

  // Non-USDT assets (BTC, ETH, SOL, LTC) remain disabled for real-money settlement by default
  const isUsdtMethod = symbol === 'USDT';
  const settlementEnabled =
    typeof raw.settlementEnabled === 'boolean'
      ? raw.settlementEnabled
      : isUsdtMethod
      ? true
      : Boolean(base.settlementEnabled);

  // A payment method can ONLY be enabled if it has a valid non-empty receivingAddress,
  // settlementEnabled is true, AND if memoRequired is true, memoValue must also be non-empty.
  const canBeEnabled =
    Boolean(safeReceivingAddress) &&
    validation.valid &&
    settlementEnabled &&
    (!memoRequired || memoValue.length > 0);

  const defaultConfirmations = DEFAULT_CONFIRMATIONS_BY_NETWORK[networkCode] || 12;
  const rawConfirmations = Number(raw.confirmationsRequired ?? base.confirmationsRequired ?? defaultConfirmations);
  const confirmationsRequired =
    Number.isFinite(rawConfirmations) && rawConfirmations >= 1
      ? Math.floor(rawConfirmations)
      : defaultConfirmations;

  return {
    id: normalizedId || base.id,
    symbol,
    name: String(raw.name || base.name).trim(),
    network: String(raw.network || base.network).trim(),
    networkCode,
    receivingAddress: safeReceivingAddress,
    ...(previousReceivingAddress ? { previousReceivingAddress } : {}),
    ...(addressRotatedAt ? { addressRotatedAt } : {}),
    memoRequired,
    memoLabel:
      typeof raw.memoLabel === 'string' ? raw.memoLabel.trim() : (base.memoLabel || 'Memo / Destination Tag'),
    memoValue,
    minDeposit:
      Number.isFinite(Number(raw.minDeposit)) && Number(raw.minDeposit) > 0
        ? Number(raw.minDeposit)
        : base.minDeposit,
    confirmationsRequired,
    instructions: typeof raw.instructions === 'string' ? raw.instructions.trim() : (base.instructions || ''),
    explorerTxUrlTemplate:
      typeof raw.explorerTxUrlTemplate === 'string'
        ? raw.explorerTxUrlTemplate.trim()
        : (base.explorerTxUrlTemplate || ''),
    enabled: requestedEnabled && canBeEnabled,
    settlementEnabled,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : base.sortOrder,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : base.updatedAt,
    ...(raw.updatedBy ? { updatedBy: String(raw.updatedBy) } : base.updatedBy ? { updatedBy: base.updatedBy } : {}),
  };
}

/**
 * Merges stored Firestore payment method documents with the default catalog.
 */
export function mergePaymentMethodsWithCatalog(
  storedDocs: Array<Record<string, any>>
): ManualPaymentMethodConfig[] {
  const byId = new Map<string, ManualPaymentMethodConfig>();
  for (const item of DEFAULT_PAYMENT_METHODS_CATALOG) {
    byId.set(item.id, structuredClone(item));
  }

  for (const raw of storedDocs) {
    if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) continue;
    const id = normalizePaymentMethodId(raw.id);
    const fallback = byId.get(id);
    try {
      const sanitized = sanitizePaymentMethodConfig({ ...raw, id }, fallback);
      byId.set(sanitized.id, sanitized);
    } catch {
      // Ignore malformed stored records and keep safe disabled fallback
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Filters only enabled, settlement-ready, validated payment methods safe to display to end users.
 */
export function filterEnabledUserPaymentMethods(
  methods: ManualPaymentMethodConfig[]
): ManualPaymentMethodConfig[] {
  return methods.filter((m) => {
    if (!m.enabled || !m.settlementEnabled || !m.receivingAddress) return false;
    const check = validatePaymentMethodAddress(m.networkCode, m.receivingAddress);
    if (!check.valid) return false;
    if (m.memoRequired && (!m.memoValue || m.memoValue.trim().length === 0)) return false;
    return true;
  });
}

/**
 * Builds a blockchain explorer transaction URL if the payment method defines a template or network code.
 */
export function buildExplorerTxUrl(
  methodOrNetwork:
    | Pick<ManualPaymentMethodConfig, 'explorerTxUrlTemplate' | 'networkCode'>
    | ManualPaymentMethodConfig['networkCode']
    | string
    | undefined
    | null,
  txHash: string
): string | null {
  const cleanHash = String(txHash || '').trim();
  if (!cleanHash || cleanHash.length < 8) return null;

  if (
    typeof methodOrNetwork === 'object' &&
    methodOrNetwork !== null &&
    methodOrNetwork.explorerTxUrlTemplate &&
    methodOrNetwork.explorerTxUrlTemplate.includes('{txHash}')
  ) {
    return methodOrNetwork.explorerTxUrlTemplate.replace('{txHash}', encodeURIComponent(cleanHash));
  }

  const net =
    typeof methodOrNetwork === 'string'
      ? methodOrNetwork.trim().toUpperCase()
      : methodOrNetwork?.networkCode;
  if (net === 'TRC20') return `https://tronscan.org/#/transaction/${encodeURIComponent(cleanHash)}`;
  if (net === 'ERC20') return `https://etherscan.io/tx/${encodeURIComponent(cleanHash)}`;
  if (net === 'BEP20') return `https://bscscan.com/tx/${encodeURIComponent(cleanHash)}`;
  if (net === 'BTC') return `https://mempool.space/tx/${encodeURIComponent(cleanHash)}`;
  if (net === 'SOL') return `https://solscan.io/tx/${encodeURIComponent(cleanHash)}`;
  if (net === 'LTC') return `https://blockchair.com/litecoin/transaction/${encodeURIComponent(cleanHash)}`;
  return null;
}
