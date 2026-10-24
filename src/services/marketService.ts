import { CryptoMarket, KlineCandle, KlineInterval, MarketConnectionStatus } from '../types';

export interface SupportedPairMeta {
  symbol: string;
  pair: string;
  displayPair: string;
  name: string;
  isPoW: boolean;
  algorithm: string;
}

export const SUPPORTED_BINANCE_PAIRS: SupportedPairMeta[] = [
  {
    symbol: 'BTC',
    pair: 'BTCUSDT',
    displayPair: 'BTC/USDT',
    name: 'Bitcoin',
    isPoW: true,
    algorithm: 'SHA-256',
  },
  {
    symbol: 'ETH',
    pair: 'ETHUSDT',
    displayPair: 'ETH/USDT',
    name: 'Ethereum',
    isPoW: false,
    algorithm: 'Proof of Stake',
  },
  {
    symbol: 'BNB',
    pair: 'BNBUSDT',
    displayPair: 'BNB/USDT',
    name: 'BNB',
    isPoW: false,
    algorithm: 'PoSA',
  },
  {
    symbol: 'SOL',
    pair: 'SOLUSDT',
    displayPair: 'SOL/USDT',
    name: 'Solana',
    isPoW: false,
    algorithm: 'Proof of History',
  },
  {
    symbol: 'XRP',
    pair: 'XRPUSDT',
    displayPair: 'XRP/USDT',
    name: 'XRP',
    isPoW: false,
    algorithm: 'XRPL Consensus',
  },
  {
    symbol: 'DOGE',
    pair: 'DOGEUSDT',
    displayPair: 'DOGE/USDT',
    name: 'Dogecoin',
    isPoW: true,
    algorithm: 'Scrypt AuxPoW',
  },
  {
    symbol: 'ADA',
    pair: 'ADAUSDT',
    displayPair: 'ADA/USDT',
    name: 'Cardano',
    isPoW: false,
    algorithm: 'Ouroboros PoS',
  },
  {
    symbol: 'AVAX',
    pair: 'AVAXUSDT',
    displayPair: 'AVAX/USDT',
    name: 'Avalanche',
    isPoW: false,
    algorithm: 'Snowman PoS',
  },
  {
    symbol: 'LINK',
    pair: 'LINKUSDT',
    displayPair: 'LINK/USDT',
    name: 'Chainlink',
    isPoW: false,
    algorithm: 'Oracle Network',
  },
  {
    symbol: 'TRX',
    pair: 'TRXUSDT',
    displayPair: 'TRX/USDT',
    name: 'TRON',
    isPoW: false,
    algorithm: 'Delegated PoS',
  },
  {
    symbol: 'LTC',
    pair: 'LTCUSDT',
    displayPair: 'LTC/USDT',
    name: 'Litecoin',
    isPoW: true,
    algorithm: 'Scrypt',
  },
  {
    symbol: 'ETC',
    pair: 'ETCUSDT',
    displayPair: 'ETC/USDT',
    name: 'Ethereum Classic',
    isPoW: true,
    algorithm: 'Etchash',
  },
];

const BINANCE_REST_ENDPOINTS = [
  'https://data-api.binance.vision/api/v3',
  'https://api.binance.com/api/v3',
  'https://api1.binance.com/api/v3',
];

const BINANCE_WS_ENDPOINTS = [
  'wss://data-stream.binance.vision',
  'wss://stream.binance.com:9443',
  'wss://stream.binance.com:443',
];

async function fetchFromBinanceRest<T>(pathWithQuery: string): Promise<T> {
  let lastError: Error | null = null;
  for (const baseUrl of BINANCE_REST_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${baseUrl}${pathWithQuery}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Binance REST returned HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error('Unable to reach Binance public market data endpoints.');
}

interface Binance24hrTickerRaw {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  closeTime?: number;
}

/**
 * Fetches an authentic 24hr ticker snapshot for all 12 supported pairs from Binance Spot REST API.
 * Strictly returns only real exchange data—never fabricates prices or volumes.
 */
export async function fetchLiveMarketTickers(): Promise<{
  markets: CryptoMarket[];
  isLive: boolean;
  lastUpdated: Date;
  error?: string;
}> {
  const symbols = SUPPORTED_BINANCE_PAIRS.map((p) => p.pair);
  const query = encodeURIComponent(JSON.stringify(symbols));
  const rawTickers = await fetchFromBinanceRest<Binance24hrTickerRaw[]>(`/ticker/24hr?symbols=${query}`);

  if (!Array.isArray(rawTickers) || rawTickers.length === 0) {
    throw new Error('Binance returned an empty or unexpected ticker response.');
  }

  const nowIso = new Date().toISOString();
  const markets: CryptoMarket[] = [];

  for (const meta of SUPPORTED_BINANCE_PAIRS) {
    const ticker = rawTickers.find((t) => t.symbol === meta.pair);
    if (!ticker) continue;

    const price = parseFloat(ticker.lastPrice);
    const priceChange24h = parseFloat(ticker.priceChange);
    const change24h = parseFloat(ticker.priceChangePercent);
    const high24h = parseFloat(ticker.highPrice);
    const low24h = parseFloat(ticker.lowPrice);
    const baseVolume24h = parseFloat(ticker.volume);
    const volume24h = parseFloat(ticker.quoteVolume);

    if (!Number.isFinite(price)) continue;

    markets.push({
      symbol: meta.symbol,
      pair: meta.pair,
      displayPair: meta.displayPair,
      name: meta.name,
      price,
      priceChange24h: Number.isFinite(priceChange24h) ? priceChange24h : 0,
      change24h: Number.isFinite(change24h) ? change24h : 0,
      high24h: Number.isFinite(high24h) ? high24h : price,
      low24h: Number.isFinite(low24h) ? low24h : price,
      baseVolume24h: Number.isFinite(baseVolume24h) ? baseVolume24h : 0,
      volume24h: Number.isFinite(volume24h) ? volume24h : 0,
      lastUpdated: ticker.closeTime ? new Date(ticker.closeTime).toISOString() : nowIso,
      tickDirection: 'neutral',
      isPoW: meta.isPoW,
      algorithm: meta.algorithm,
    });
  }

  if (markets.length === 0) {
    throw new Error('No valid Binance Spot ticker records found.');
  }

  return {
    markets,
    isLive: true,
    lastUpdated: new Date(),
  };
}

export interface BinanceTickerWsUpdate {
  pair: string;
  price: number;
  priceChange24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  baseVolume24h: number;
  volume24h: number;
  eventTime: string;
}

/**
 * Subscribes to a single multiplexed Binance Spot WebSocket stream for all 12 pairs:
 * `<symbol>@ticker` combined stream. Automatically reconnects with exponential backoff.
 */
export function subscribeMarketTickersWebSocket(
  onTickerBatch: (updates: Record<string, BinanceTickerWsUpdate>) => void,
  onStatusChange: (status: MarketConnectionStatus) => void
): () => void {
  let ws: WebSocket | null = null;
  let isDisposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let endpointIndex = 0;

  // Buffer incoming ticks and flush every 250ms to prevent excessive React re-renders
  let pendingUpdates: Record<string, BinanceTickerWsUpdate> = {};
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleFlush = () => {
    if (flushTimer || isDisposed) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (isDisposed) return;
      const batch = pendingUpdates;
      pendingUpdates = {};
      if (Object.keys(batch).length > 0) {
        onTickerBatch(batch);
      }
    }, 250);
  };

  const streamsParam = SUPPORTED_BINANCE_PAIRS.map((p) => `${p.pair.toLowerCase()}@ticker`).join('/');

  const connect = () => {
    if (isDisposed) return;
    onStatusChange('CONNECTING');

    const wsHost = BINANCE_WS_ENDPOINTS[endpointIndex % BINANCE_WS_ENDPOINTS.length];
    const url = `${wsHost}/stream?streams=${streamsParam}`;

    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      if (isDisposed) {
        ws?.close();
        return;
      }
      reconnectAttempt = 0;
      onStatusChange('CONNECTED');
    };

    ws.onmessage = (event) => {
      if (isDisposed) return;
      try {
        const parsed = JSON.parse(event.data);
        const payload = parsed?.data || parsed;
        if (!payload || payload.e !== '24hrTicker' || !payload.s) return;

        const pair = String(payload.s).toUpperCase();
        const price = parseFloat(payload.c);
        if (!Number.isFinite(price)) return;

        pendingUpdates[pair] = {
          pair,
          price,
          priceChange24h: parseFloat(payload.p) || 0,
          change24h: parseFloat(payload.P) || 0,
          high24h: parseFloat(payload.h) || price,
          low24h: parseFloat(payload.l) || price,
          baseVolume24h: parseFloat(payload.v) || 0,
          volume24h: parseFloat(payload.q) || 0,
          eventTime: payload.E ? new Date(Number(payload.E)).toISOString() : new Date().toISOString(),
        };
        scheduleFlush();
      } catch {
        // Ignore malformed frame
      }
    };

    ws.onerror = () => {
      if (isDisposed) return;
      endpointIndex++;
    };

    ws.onclose = () => {
      if (isDisposed) return;
      onStatusChange('DISCONNECTED');
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (isDisposed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delayMs = Math.min(1000 * Math.pow(1.6, reconnectAttempt), 15000);
    reconnectAttempt++;
    reconnectTimer = setTimeout(() => {
      connect();
    }, delayMs);
  };

  connect();

  return () => {
    isDisposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (flushTimer) clearTimeout(flushTimer);
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
  };
}

/**
 * Fetches historical OHLCV candlestick (kline) data from Binance Spot REST API.
 * Format returned by Binance `/api/v3/klines`:
 * [
 *   [
 *     1499040000000,      // 0: Open time (ms)
 *     "0.01634790",       // 1: Open
 *     "0.80000000",       // 2: High
 *     "0.01575800",       // 3: Low
 *     "0.01577100",       // 4: Close
 *     "148976.11427815",  // 5: Volume (base)
 *     1499644799999,      // 6: Close time
 *     "2434.19055334",    // 7: Quote asset volume
 *     ...
 *   ]
 * ]
 */
export async function fetchKlines(
  pair: string,
  interval: KlineInterval,
  limit = 200
): Promise<KlineCandle[]> {
  const cleanPair = pair.replace('/', '').toUpperCase();
  const raw = await fetchFromBinanceRest<any[]>(
    `/klines?symbol=${encodeURIComponent(cleanPair)}&interval=${encodeURIComponent(interval)}&limit=${limit}`
  );

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`No historical candlestick data returned for ${cleanPair} (${interval}).`);
  }

  const candles: KlineCandle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 8) continue;
    const timeSec = Math.floor(Number(row[0]) / 1000);
    const open = parseFloat(row[1]);
    const high = parseFloat(row[2]);
    const low = parseFloat(row[3]);
    const close = parseFloat(row[4]);
    const volume = parseFloat(row[5]);
    const quoteVolume = parseFloat(row[7]);

    if (
      !Number.isFinite(timeSec) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }

    candles.push({
      time: timeSec,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
      quoteVolume: Number.isFinite(quoteVolume) ? quoteVolume : 0,
      isFinal: true,
    });
  }

  return candles;
}

/**
 * Subscribes to Binance Spot `<symbol>@kline_<interval>` WebSocket stream for live candlestick updates.
 * Automatically cleans up previous socket when symbol or interval changes.
 */
export function subscribeKlineWebSocket(
  pair: string,
  interval: KlineInterval,
  onCandleUpdate: (candle: KlineCandle) => void,
  onStatusChange?: (status: MarketConnectionStatus) => void
): () => void {
  let ws: WebSocket | null = null;
  let isDisposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let endpointIndex = 0;

  const cleanPair = pair.replace('/', '').toLowerCase();
  const streamName = `${cleanPair}@kline_${interval}`;

  const connect = () => {
    if (isDisposed) return;
    onStatusChange?.('CONNECTING');

    const wsHost = BINANCE_WS_ENDPOINTS[endpointIndex % BINANCE_WS_ENDPOINTS.length];
    const url = `${wsHost}/ws/${streamName}`;

    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      if (isDisposed) {
        ws?.close();
        return;
      }
      reconnectAttempt = 0;
      onStatusChange?.('CONNECTED');
    };

    ws.onmessage = (event) => {
      if (isDisposed) return;
      try {
        const msg = JSON.parse(event.data);
        const k = msg?.k || msg?.data?.k;
        if (!k) return;

        const timeSec = Math.floor(Number(k.t) / 1000);
        const open = parseFloat(k.o);
        const high = parseFloat(k.h);
        const low = parseFloat(k.l);
        const close = parseFloat(k.c);
        const volume = parseFloat(k.v);
        const quoteVolume = parseFloat(k.q);

        if (
          !Number.isFinite(timeSec) ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close)
        ) {
          return;
        }

        onCandleUpdate({
          time: timeSec,
          open,
          high,
          low,
          close,
          volume: Number.isFinite(volume) ? volume : 0,
          quoteVolume: Number.isFinite(quoteVolume) ? quoteVolume : 0,
          isFinal: Boolean(k.x),
        });
      } catch {
        // Ignore malformed frame
      }
    };

    ws.onerror = () => {
      if (isDisposed) return;
      endpointIndex++;
    };

    ws.onclose = () => {
      if (isDisposed) return;
      onStatusChange?.('DISCONNECTED');
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (isDisposed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delayMs = Math.min(1000 * Math.pow(1.6, reconnectAttempt), 12000);
    reconnectAttempt++;
    reconnectTimer = setTimeout(() => {
      connect();
    }, delayMs);
  };

  connect();

  return () => {
    isDisposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
  };
}

/**
 * Formats a crypto price with exchange-grade precision based on magnitude.
 */
export function formatCryptoPrice(price: number): string {
  if (!Number.isFinite(price)) return '0.00';
  if (price >= 1000) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (price >= 1) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

/**
 * Formats 24h volume in compact USD/asset notation (e.g. $1.42B, $340.5M, $820.1K).
 */
export function formatCompactVolume(val: number, prefix = '$'): string {
  if (!Number.isFinite(val) || val <= 0) return `${prefix}0.00`;
  if (val >= 1_000_000_000) {
    return `${prefix}${(val / 1_000_000_000).toFixed(2)}B`;
  }
  if (val >= 1_000_000) {
    return `${prefix}${(val / 1_000_000).toFixed(2)}M`;
  }
  if (val >= 1_000) {
    return `${prefix}${(val / 1_000).toFixed(2)}K`;
  }
  return `${prefix}${val.toFixed(2)}`;
}
