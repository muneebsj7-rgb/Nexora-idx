import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CryptoMarket } from '../../types';
import {
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Pickaxe,
  ExternalLink,
  X,
  Zap,
  Info
} from 'lucide-react';
import { CoinIcon } from '../ui/CoinIcon';
import { GradientIcon } from '../ui/GradientIcon';

export const MarketsScreen: React.FC = () => {
  const { markets, isMarketsLive, lastMarketUpdate, refreshMarkets, setActiveTab } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'POW' | 'GAINERS'>('ALL');
  const [sortBy, setSortBy] = useState<'VOLUME' | 'PRICE' | 'CHANGE'>('VOLUME');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<CryptoMarket | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshMarkets();
    setTimeout(() => setRefreshing(false), 600);
  };

  // Filter & Search Logic
  const filteredMarkets = markets
    .filter((coin) => {
      const matchesSearch =
        coin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        coin.symbol.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterTab === 'POW') return coin.isPoW;
      if (filterTab === 'GAINERS') return coin.change24h > 0;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'PRICE') return b.price - a.price;
      if (sortBy === 'CHANGE') return b.change24h - a.change24h;
      return b.volume24h - a.volume24h;
    });

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 px-4 sm:px-6 pt-2 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            Crypto Markets
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold ${
              isMarketsLive
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {isMarketsLive ? 'Binance Ticker Feed' : 'Local Fallback'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time cryptocurrency quotes, 24h volumes & proof-of-work mineability
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
            Updated: {lastMarketUpdate.toLocaleTimeString()}
          </span>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search coin or symbol (e.g. BTC, ETH, LTC)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              filterTab === 'ALL'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Coins
          </button>
          <button
            onClick={() => setFilterTab('POW')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              filterTab === 'POW'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Pickaxe className="w-3.5 h-3.5" />
            <span>Mineable (PoW)</span>
          </button>
          <button
            onClick={() => setFilterTab('GAINERS')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              filterTab === 'GAINERS'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Top Gainers</span>
          </button>
        </div>
      </div>

      {/* Markets Table / Cards */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-xl">
        <div className="hidden sm:grid grid-cols-12 px-5 py-3 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          <div className="col-span-4">Market Asset</div>
          <div className="col-span-3 text-right">Price (USD)</div>
          <div className="col-span-2 text-right">24h Change</div>
          <div className="col-span-3 text-right">24h Volume / Cap</div>
        </div>

        <div className="divide-y divide-slate-800/60">
          {filteredMarkets.length > 0 ? (
            filteredMarkets.map((coin) => {
              const isPositive = coin.change24h >= 0;
              return (
                <div
                  key={coin.symbol}
                  onClick={() => setSelectedCoin(coin)}
                  className="p-4 sm:px-5 sm:py-3.5 flex flex-col sm:grid sm:grid-cols-12 items-start sm:items-center gap-3 sm:gap-0 hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  {/* Coin Name & Algorithm */}
                  <div className="sm:col-span-4 flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                    <div className="flex items-center gap-3">
                      <CoinIcon symbol={coin.symbol} size="md" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-sm">{coin.symbol}</span>
                          <span className="text-xs text-slate-400 font-mono">/USDT</span>
                          {coin.isPoW && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              PoW
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 block">{coin.name}</span>
                      </div>
                    </div>

                    {/* Mobile Price Display */}
                    <div className="text-right sm:hidden">
                      <div className="font-mono font-bold text-white text-sm">
                        ${coin.price.toLocaleString('en-US', { minimumFractionDigits: coin.price < 10 ? 4 : 2 })}
                      </div>
                      <div className={`text-xs font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? '+' : ''}{coin.change24h.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Desktop Price */}
                  <div className="hidden sm:block sm:col-span-3 text-right font-mono font-bold text-sm text-white">
                    ${coin.price.toLocaleString('en-US', { minimumFractionDigits: coin.price < 10 ? 4 : 2 })}
                  </div>

                  {/* 24h Change */}
                  <div className="hidden sm:block sm:col-span-2 text-right">
                    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-mono font-semibold ${
                      isPositive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}>
                      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span>{isPositive ? '+' : ''}{coin.change24h.toFixed(2)}%</span>
                    </span>
                  </div>

                  {/* Volume / Market Cap */}
                  <div className="hidden sm:block sm:col-span-3 text-right">
                    <div className="font-mono text-xs text-slate-200">
                      ${(coin.volume24h / 1000000).toFixed(1)}M
                    </div>
                    <div className="text-[10px] text-slate-500">
                      24h Vol
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              No cryptocurrency matching your criteria was found.
            </div>
          )}
        </div>
      </div>

      {/* Selected Coin Modal Sheet */}
      {selectedCoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <CoinIcon symbol={selectedCoin.symbol} size="lg" />
                <div>
                  <h3 className="font-bold text-white text-base">
                    {selectedCoin.name} ({selectedCoin.symbol})
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">Algorithm: {selectedCoin.algorithm}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCoin(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-baseline">
                <div>
                  <span className="text-xs text-slate-400 block">Spot Price:</span>
                  <span className="text-2xl font-black text-white font-mono">
                    ${selectedCoin.price.toLocaleString('en-US', { minimumFractionDigits: selectedCoin.price < 10 ? 4 : 2 })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">24h Net:</span>
                  <span className={`text-sm font-mono font-bold ${selectedCoin.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selectedCoin.change24h >= 0 ? '+' : ''}{selectedCoin.change24h.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400 block">24h High</span>
                  <span className="font-mono text-white font-bold mt-0.5 block">${selectedCoin.high24h.toLocaleString()}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-400 block">24h Low</span>
                  <span className="font-mono text-white font-bold mt-0.5 block">${selectedCoin.low24h.toLocaleString()}</span>
                </div>
              </div>

              {selectedCoin.isPoW && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Supported for direct cloud hash contracts on Nexora Stratum pools.
                  </span>
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => {
                    setSelectedCoin(null);
                    setActiveTab('mining');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Pickaxe className="w-4 h-4" />
                  <span>Mine {selectedCoin.symbol}</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedCoin(null);
                    setActiveTab('wallet');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
                >
                  Wallet Deposit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
