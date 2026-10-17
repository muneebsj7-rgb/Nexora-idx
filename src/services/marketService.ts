import { CryptoMarket } from '../types';

const DEFAULT_MARKETS: CryptoMarket[] = [
  {
    symbol: 'BTC',
    pair: 'BTC/USDT',
    name: 'Bitcoin',
    price: 94250.00,
    change24h: 2.85,
    high24h: 95100.00,
    low24h: 91800.00,
    volume24h: 28410920000,
    marketCap: 1850000000000,
    sparkline: [91800, 92200, 93100, 92800, 93500, 94100, 94250],
    isPoW: true,
    algorithm: 'SHA-256',
  },
  {
    symbol: 'ETH',
    pair: 'ETH/USDT',
    name: 'Ethereum',
    price: 3340.50,
    change24h: 1.42,
    high24h: 3390.00,
    low24h: 3260.00,
    volume24h: 14205000000,
    marketCap: 402000000000,
    sparkline: [3260, 3290, 3310, 3280, 3320, 3360, 3340.5],
    isPoW: false,
    algorithm: 'Proof of Stake',
  },
  {
    symbol: 'SOL',
    pair: 'SOL/USDT',
    name: 'Solana',
    price: 182.40,
    change24h: -0.92,
    high24h: 189.50,
    low24h: 178.20,
    volume24h: 4980000000,
    marketCap: 86000000000,
    sparkline: [186, 188, 189.5, 183, 181, 180, 182.4],
    isPoW: false,
    algorithm: 'Proof of History',
  },
  {
    symbol: 'LTC',
    pair: 'LTC/USDT',
    name: 'Litecoin',
    price: 112.80,
    change24h: 4.15,
    high24h: 115.40,
    low24h: 107.90,
    volume24h: 890000000,
    marketCap: 8400000000,
    sparkline: [108, 109, 110, 112, 111, 114, 112.8],
    isPoW: true,
    algorithm: 'Scrypt',
  },
  {
    symbol: 'DOGE',
    pair: 'DOGE/USDT',
    name: 'Dogecoin',
    price: 0.224,
    change24h: 5.62,
    high24h: 0.235,
    low24h: 0.211,
    volume24h: 2150000000,
    marketCap: 32800000000,
    sparkline: [0.211, 0.215, 0.218, 0.222, 0.228, 0.224],
    isPoW: true,
    algorithm: 'Scrypt AuxPoW',
  },
  {
    symbol: 'ETC',
    pair: 'ETC/USDT',
    name: 'Ethereum Classic',
    price: 28.60,
    change24h: 3.12,
    high24h: 29.80,
    low24h: 27.40,
    volume24h: 340000000,
    marketCap: 4200000000,
    sparkline: [27.4, 27.9, 28.1, 28.4, 29.1, 28.6],
    isPoW: true,
    algorithm: 'Etchash',
  },
  {
    symbol: 'BNB',
    pair: 'BNB/USDT',
    name: 'BNB Chain',
    price: 645.20,
    change24h: 0.78,
    high24h: 652.00,
    low24h: 638.00,
    volume24h: 1100000000,
    marketCap: 94000000000,
    sparkline: [638, 642, 646, 644, 649, 645.2],
    isPoW: false,
    algorithm: 'PoSA',
  },
  {
    symbol: 'XRP',
    pair: 'XRP/USDT',
    name: 'XRP',
    price: 1.48,
    change24h: -1.25,
    high24h: 1.54,
    low24h: 1.44,
    volume24h: 3100000000,
    marketCap: 82000000000,
    sparkline: [1.51, 1.53, 1.54, 1.47, 1.45, 1.48],
    isPoW: false,
    algorithm: 'Consensus',
  }
];

export async function fetchLiveMarketTickers(): Promise<{ markets: CryptoMarket[]; isLive: boolean; lastUpdated: Date }> {
  try {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'LTCUSDT', 'DOGEUSDT', 'ETCUSDT', 'BNBUSDT', 'XRPUSDT'];
    const query = JSON.stringify(symbols);
    const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Binance API returned ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Invalid format from market feed');
    }

    const updatedMarkets: CryptoMarket[] = DEFAULT_MARKETS.map((base) => {
      const ticker = data.find((t: { symbol: string }) => t.symbol === `${base.symbol}USDT`);
      if (!ticker) return base;

      const price = parseFloat(ticker.lastPrice);
      const change24h = parseFloat(ticker.priceChangePercent);
      const high24h = parseFloat(ticker.highPrice);
      const low24h = parseFloat(ticker.lowPrice);
      const volume24h = parseFloat(ticker.quoteVolume);

      // generate slightly refreshed sparkline
      const currentSparkline = [...base.sparkline];
      currentSparkline.shift();
      currentSparkline.push(price);

      return {
        ...base,
        price,
        change24h,
        high24h,
        low24h,
        volume24h,
        sparkline: currentSparkline,
      };
    });

    return {
      markets: updatedMarkets,
      isLive: true,
      lastUpdated: new Date(),
    };
  } catch {
    // If public API is rate-limited or blocked, generate realistic micro-ticks on default markets
    const jitteredMarkets = DEFAULT_MARKETS.map((m) => {
      const deltaPercent = (Math.random() - 0.49) * 0.4;
      const newPrice = Number((m.price * (1 + deltaPercent / 100)).toFixed(m.price < 1 ? 4 : 2));
      return {
        ...m,
        price: newPrice,
      };
    });

    return {
      markets: jitteredMarkets,
      isLive: false,
      lastUpdated: new Date(),
    };
  }
}
