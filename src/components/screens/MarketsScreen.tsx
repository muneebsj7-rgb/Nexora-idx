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
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#F4F7FC] tracking-tight flex items-center gap-2">
            Crypto Markets
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold ${
              isMarketsLive
                ? 'bg-[#00D6A3]/10 text-[#00D6A3] border border-[#00D6A3]/30'
                : 'bg-[#182232] text-[#98A6BA] border border-[#253144]'
            }`}>
              {isMarketsLive ? 'Binance Ticker Feed' : 'Local Fallback'}
            </span>
          </h1>
          <p className="text-xs text-[#98A6BA] mt-1">
            Real-time cryptocurrency quotes, 24h volumes & proof-of-work mineability
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11px] font-mono text-[#98A6BA] hidden sm:inline">
            Updated: {lastMarketUpdate.toLocaleTimeString()}
          </span>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-xl bg-[#121925] border border-[#253144] hover:border-[#36465D] text-[#98A6BA] hover:text-[#F4F7FC] transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#00D6A3]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A6BA]" />
          <input
            type="text"
            placeholder="Search coin or symbol (e.g. BTC, ETH, LTC)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121925] border border-[#253144] rounded-xl py-2.5 pl-9 pr-3 text-xs text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] transition-colors"
          />
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              filterTab === 'ALL'
                ? 'bg-[#00D6A3] text-[#080B12] shadow-md shadow-[#00D6A3]/20 font-bold'
                : 'bg-[#121925] border border-[#253144] text-[#98A6BA] hover:text-[#F4F7FC]'
            }`}
          >
            All Coins
          </button>
          <button
            onClick={() => setFilterTab('POW')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              filterTab === 'POW'
                ? 'bg-[#00D6A3] text-[#080B12] shadow-md shadow-[#00D6A3]/20 font-bold'
                : 'bg-[#121925] border border-[#253144] text-[#98A6BA] hover:text-[#F4F7FC]'
            }`}
          >
            <Pickaxe className="w-3.5 h-3.5" />
            <span>Mineable (PoW)</span>
          </button>
          <button
            onClick={() => setFilterTab('GAINERS')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              filterTab === 'GAINERS'
                ? 'bg-[#00D6A3] text-[#080B12] shadow-md shadow-[#00D6A3]/20 font-bold'
                : 'bg-[#121925] border border-[#253144] text-[#98A6BA] hover:text-[#F4F7FC]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Top Gainers</span>
          </button>
        </div>
      </div>

      {/* Markets Table / Cards */}
      <div className="rounded-3xl border border-[#253144] bg-[#121925] overflow-hidden shadow-xl">
        <div className="hidden sm:grid grid-cols-12 px-5 py-3 border-b border-[#253144] text-[11px] font-bold text-[#98A6BA] uppercase tracking-wider bg-[#0D121C]">
          <div className="col-span-4">Market Asset</div>
          <div className="col-span-3 text-right">Price (USD)</div>
          <div className="col-span-2 text-right">24h Change</div>
          <div className="col-span-3 text-right">24h Volume / Cap</div>
        </div>

        <div className="divide-y divide-[#253144]/60">
          {filteredMarkets.length > 0 ? (
            filteredMarkets.map((coin) => {
              const isPositive = coin.change24h >= 0;
              return (
                <div
                  key={coin.symbol}
                  onClick={() => setSelectedCoin(coin)}
                  className="p-4 sm:px-5 sm:py-3.5 flex flex-col sm:grid sm:grid-cols-12 items-start sm:items-center gap-3 sm:gap-0 hover:bg-[#182232] cursor-pointer transition-colors"
                >
                  {/* Coin Name & Algorithm */}
                  <div className="sm:col-span-4 flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                    <div className="flex items-center gap-3">
                      <CoinIcon symbol={coin.symbol} size="md" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#F4F7FC] text-sm">{coin.symbol}</span>
                          <span className="text-xs text-[#98A6BA] font-mono">/USDT</span>
                          {coin.isPoW && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                              PoW
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[#98A6BA] block">{coin.name}</span>
                      </div>
                    </div>

                    {/* Mobile Price Display */}
                    <div className="text-right sm:hidden">
                      <div className="font-mono font-bold text-[#F4F7FC] text-sm">
                        ${coin.price.toLocaleString('en-US', { minimumFractionDigits: coin.price < 10 ? 4 : 2 })}
                      </div>
                      <div className={`text-xs font-mono font-semibold ${isPositive ? 'text-[#19C784]' : 'text-[#FF647C]'}`}>
                        {isPositive ? '+' : ''}{coin.change24h.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Desktop Price */}
                  <div className="hidden sm:block sm:col-span-3 text-right font-mono font-bold text-sm text-[#F4F7FC]">
                    ${coin.price.toLocaleString('en-US', { minimumFractionDigits: coin.price < 10 ? 4 : 2 })}
                  </div>

                  {/* 24h Change */}
                  <div className="hidden sm:block sm:col-span-2 text-right">
                    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-mono font-semibold ${
                      isPositive
                        ? 'bg-[#19C784]/15 text-[#19C784] border border-[#19C784]/30'
                        : 'bg-[#FF647C]/15 text-[#FF647C] border border-[#FF647C]/30'
                    }`}>
                      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span>{isPositive ? '+' : ''}{coin.change24h.toFixed(2)}%</span>
                    </span>
                  </div>

                  {/* Volume / Market Cap */}
                  <div className="hidden sm:block sm:col-span-3 text-right">
                    <div className="font-mono text-xs text-[#F4F7FC]">
                      ${(coin.volume24h / 1000000).toFixed(1)}M
                    </div>
                    <div className="text-[10px] text-[#98A6BA]">
                      24h Vol
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-[#98A6BA]">
              No cryptocurrency matching your criteria was found.
            </div>
          )}
        </div>
      </div>

      {/* Selected Coin Modal Sheet */}
      {selectedCoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-[#121925] border border-[#253144] rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#253144]">
              <div className="flex items-center gap-3">
                <CoinIcon symbol={selectedCoin.symbol} size="lg" />
                <div>
                  <h3 className="font-bold text-[#F4F7FC] text-base">
                    {selectedCoin.name} ({selectedCoin.symbol})
                  </h3>
                  <span className="text-xs text-[#98A6BA] font-mono">Algorithm: {selectedCoin.algorithm}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCoin(null)}
                className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="p-4 rounded-xl bg-[#0D121C] border border-[#253144] flex justify-between items-baseline">
                <div>
                  <span className="text-xs text-[#98A6BA] block">Spot Price:</span>
                  <span className="text-2xl font-black text-[#F4F7FC] font-mono">
                    ${selectedCoin.price.toLocaleString('en-US', { minimumFractionDigits: selectedCoin.price < 10 ? 4 : 2 })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[#98A6BA] block">24h Net:</span>
                  <span className={`text-sm font-mono font-bold ${selectedCoin.change24h >= 0 ? 'text-[#19C784]' : 'text-[#FF647C]'}`}>
                    {selectedCoin.change24h >= 0 ? '+' : ''}{selectedCoin.change24h.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#0D121C] border border-[#253144]">
                  <span className="text-[#98A6BA] block">24h High</span>
                  <span className="font-mono text-[#F4F7FC] font-bold mt-0.5 block">${selectedCoin.high24h.toLocaleString()}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0D121C] border border-[#253144]">
                  <span className="text-[#98A6BA] block">24h Low</span>
                  <span className="font-mono text-[#F4F7FC] font-bold mt-0.5 block">${selectedCoin.low24h.toLocaleString()}</span>
                </div>
              </div>

              {selectedCoin.isPoW && (
                <div className="p-3 rounded-xl bg-[#00D6A3]/10 border border-[#00D6A3]/20 text-xs text-[#00D6A3] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#00D6A3] shrink-0" />
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
                  className="flex-1 py-2.5 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Pickaxe className="w-4 h-4" />
                  <span>Mine {selectedCoin.symbol}</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedCoin(null);
                    setActiveTab('wallet');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] font-bold text-xs transition-colors border border-[#253144]"
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
