import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { CryptoMarket } from '../../types';
import {
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Pickaxe,
  X,
  Zap,
  BarChart2,
  Maximize2,
  Wifi,
  WifiOff,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { CoinIcon } from '../ui/CoinIcon';
import { CandlestickChart } from '../ui/CandlestickChart';
import { formatCryptoPrice, formatCompactVolume } from '../../services/marketService';

export const MarketsScreen: React.FC = () => {
  const {
    markets,
    isMarketsLive,
    marketConnectionStatus,
    marketError,
    lastMarketUpdate,
    refreshMarkets,
    setActiveTab,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'POW' | 'GAINERS'>('ALL');
  const [sortBy, setSortBy] = useState<'VOLUME' | 'PRICE' | 'CHANGE'>('VOLUME');
  const [refreshing, setRefreshing] = useState(false);

  // Active pair shown in the inline terminal chart above the table
  const [activeTerminalSymbol, setActiveTerminalSymbol] = useState<string>('BTC');
  // Modal detail sheet coin (opened when clicking Expand or "Detail View")
  const [modalCoinSymbol, setModalCoinSymbol] = useState<string | null>(null);

  useEffect(() => {
    if (markets.length > 0 && !markets.some((m) => m.symbol === activeTerminalSymbol)) {
      setActiveTerminalSymbol(markets[0].symbol);
    }
  }, [markets, activeTerminalSymbol]);

  const activeTerminalCoin: CryptoMarket | null =
    markets.find((m) => m.symbol === activeTerminalSymbol) || markets[0] || null;

  const modalCoin: CryptoMarket | null = modalCoinSymbol
    ? markets.find((m) => m.symbol === modalCoinSymbol) || null
    : null;

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
        coin.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        coin.pair.toLowerCase().includes(searchQuery.toLowerCase());

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
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#F4F7FC] tracking-tight flex items-center gap-2 flex-wrap">
            <span>Binance Spot Terminal</span>
            <span
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold border ${
                marketConnectionStatus === 'CONNECTED'
                  ? 'bg-[#00D6A3]/10 text-[#00D6A3] border-[#00D6A3]/30'
                  : isMarketsLive
                  ? 'bg-[#25B9F3]/10 text-[#25B9F3] border-[#25B9F3]/30'
                  : 'bg-[#FF647C]/10 text-[#FF647C] border-[#FF647C]/30'
              }`}
            >
              {marketConnectionStatus === 'CONNECTED' ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span>WebSocket Live</span>
                </>
              ) : isMarketsLive ? (
                <>
                  <Activity className="w-3 h-3" />
                  <span>REST Snapshot</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Disconnected</span>
                </>
              )}
            </span>
          </h1>
          <p className="text-xs text-[#98A6BA] mt-1">
            Official Binance Spot real-time 24h tickers, OHLCV candlesticks & proof-of-work mineability
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
            <span>Sync Snapshot</span>
          </button>
        </div>
      </div>

      {/* Explicit Error Banner when Binance feed is unreachable and no data is loaded */}
      {marketError && markets.length === 0 && (
        <div className="rounded-3xl p-6 bg-[#121925] border border-[#FF647C]/40 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-[#FF647C] mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-[#F4F7FC]">Binance Market Feed Unavailable</h3>
            <p className="text-xs text-[#98A6BA] mt-1 max-w-md mx-auto">{marketError}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded-xl bg-[#00D6A3] text-[#080B12] font-bold text-xs inline-flex items-center gap-1.5 hover:bg-[#19C784] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* INLINE INTERACTIVE TERMINAL PANEL */}
      {activeTerminalCoin && (
        <div className="rounded-3xl border border-[#253144] bg-[#121925] p-4 sm:p-5 shadow-xl space-y-4">
          {/* Terminal Coin Header & 24h Stats Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#253144]">
            <div className="flex items-center justify-between sm:justify-start gap-3.5">
              <div className="flex items-center gap-3">
                <CoinIcon symbol={activeTerminalCoin.symbol} size="lg" />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-extrabold text-[#F4F7FC] tracking-tight">
                      {activeTerminalCoin.displayPair}
                    </h2>
                    <span className="text-xs text-[#98A6BA] font-medium">
                      {activeTerminalCoin.name}
                    </span>
                    {activeTerminalCoin.isPoW && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                        PoW • {activeTerminalCoin.algorithm}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2.5 mt-0.5">
                    <span
                      className={`text-xl sm:text-2xl font-black font-mono transition-colors ${
                        activeTerminalCoin.tickDirection === 'up'
                          ? 'text-[#19C784]'
                          : activeTerminalCoin.tickDirection === 'down'
                          ? 'text-[#FF647C]'
                          : 'text-[#F4F7FC]'
                      }`}
                    >
                      ${formatCryptoPrice(activeTerminalCoin.price)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-mono font-bold ${
                        activeTerminalCoin.change24h >= 0
                          ? 'bg-[#19C784]/15 text-[#19C784] border border-[#19C784]/30'
                          : 'bg-[#FF647C]/15 text-[#FF647C] border border-[#FF647C]/30'
                      }`}
                    >
                      {activeTerminalCoin.change24h >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      <span>
                        {activeTerminalCoin.change24h >= 0 ? '+' : ''}
                        {activeTerminalCoin.change24h.toFixed(2)}%
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalCoinSymbol(activeTerminalCoin.symbol)}
                className="lg:hidden p-2 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#98A6BA] hover:text-[#F4F7FC] border border-[#253144] text-xs font-semibold flex items-center gap-1"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Expand</span>
              </button>
            </div>

            {/* 24h Exchange Telemetry Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-[#0D121C] border border-[#253144]">
                <span className="text-[10px] text-[#98A6BA] uppercase block">24h High</span>
                <span className="font-mono font-bold text-[#F4F7FC] mt-0.5 block">
                  ${formatCryptoPrice(activeTerminalCoin.high24h)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0D121C] border border-[#253144]">
                <span className="text-[10px] text-[#98A6BA] uppercase block">24h Low</span>
                <span className="font-mono font-bold text-[#F4F7FC] mt-0.5 block">
                  ${formatCryptoPrice(activeTerminalCoin.low24h)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0D121C] border border-[#253144]">
                <span className="text-[10px] text-[#98A6BA] uppercase block">
                  24h Vol ({activeTerminalCoin.symbol})
                </span>
                <span className="font-mono font-bold text-[#F4F7FC] mt-0.5 block">
                  {formatCompactVolume(activeTerminalCoin.baseVolume24h, '')} {activeTerminalCoin.symbol}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0D121C] border border-[#253144]">
                <span className="text-[10px] text-[#98A6BA] uppercase block">24h Vol (USDT)</span>
                <span className="font-mono font-bold text-[#00D6A3] mt-0.5 block">
                  {formatCompactVolume(activeTerminalCoin.volume24h, '$')}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Pair Selector Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {markets.map((coin) => {
              const isSelected = coin.symbol === activeTerminalCoin.symbol;
              const isUp = coin.change24h >= 0;
              return (
                <button
                  key={coin.pair}
                  type="button"
                  onClick={() => setActiveTerminalSymbol(coin.symbol)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-[#182232] text-[#F4F7FC] border-[#00D6A3] shadow-sm'
                      : 'bg-[#0D121C] text-[#98A6BA] border-[#253144] hover:border-[#36465D] hover:text-[#F4F7FC]'
                  }`}
                >
                  <span>{coin.symbol}</span>
                  <span className={`text-[10px] ${isUp ? 'text-[#19C784]' : 'text-[#FF647C]'}`}>
                    {isUp ? '+' : ''}
                    {coin.change24h.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>

          {/* Interactive Candlestick + Volume Chart */}
          <CandlestickChart
            pair={activeTerminalCoin.pair}
            symbol={activeTerminalCoin.symbol}
            defaultInterval="1h"
            height={360}
            onExpandClick={() => setModalCoinSymbol(activeTerminalCoin.symbol)}
          />
        </div>
      )}

      {/* Search, Filter & Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A6BA]" />
          <input
            type="text"
            placeholder="Search trading pair or asset (e.g. BTC, ETH, SOL, ADA, AVAX)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121925] border border-[#253144] rounded-xl py-2.5 pl-9 pr-3 text-xs text-[#F4F7FC] placeholder-[#98A6BA]/60 focus:outline-none focus:border-[#00D6A3] transition-colors"
          />
        </div>

        {/* Tab Filters & Sort */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              filterTab === 'ALL'
                ? 'bg-[#00D6A3] text-[#080B12] shadow-md shadow-[#00D6A3]/20 font-bold'
                : 'bg-[#121925] border border-[#253144] text-[#98A6BA] hover:text-[#F4F7FC]'
            }`}
          >
            All Pairs ({markets.length})
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
            <span>24h Gainers</span>
          </button>

          <button
            onClick={() =>
              setSortBy((prev) =>
                prev === 'VOLUME' ? 'CHANGE' : prev === 'CHANGE' ? 'PRICE' : 'VOLUME'
              )
            }
            className="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap bg-[#121925] border border-[#253144] text-[#98A6BA] hover:text-[#F4F7FC] transition-all flex items-center gap-1.5"
            title="Cycle Sort Order"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-[#00D6A3]" />
            <span>Sort: {sortBy}</span>
          </button>
        </div>
      </div>

      {/* Markets Table / Cards */}
      <div className="rounded-3xl border border-[#253144] bg-[#121925] overflow-hidden shadow-xl">
        <div className="hidden sm:grid grid-cols-12 px-5 py-3 border-b border-[#253144] text-[11px] font-bold text-[#98A6BA] uppercase tracking-wider bg-[#0D121C]">
          <div className="col-span-4">Spot Pair</div>
          <div className="col-span-2 text-right">Last Price</div>
          <div className="col-span-2 text-right">24h Change</div>
          <div className="col-span-2 text-right">24h High / Low</div>
          <div className="col-span-2 text-right">24h Volume (USDT)</div>
        </div>

        <div className="divide-y divide-[#253144]/60">
          {filteredMarkets.length > 0 ? (
            filteredMarkets.map((coin) => {
              const isPositive = coin.change24h >= 0;
              const isSelectedInTerminal = coin.symbol === activeTerminalSymbol;

              return (
                <div
                  key={coin.pair}
                  onClick={() => {
                    setActiveTerminalSymbol(coin.symbol);
                  }}
                  onDoubleClick={() => setModalCoinSymbol(coin.symbol)}
                  className={`p-4 sm:px-5 sm:py-3.5 flex flex-col sm:grid sm:grid-cols-12 items-start sm:items-center gap-3 sm:gap-0 cursor-pointer transition-colors ${
                    isSelectedInTerminal
                      ? 'bg-[#182232]/90 border-l-2 border-l-[#00D6A3]'
                      : 'hover:bg-[#182232]/60'
                  }`}
                >
                  {/* Coin Name & Algorithm */}
                  <div className="sm:col-span-4 flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                    <div className="flex items-center gap-3">
                      <CoinIcon symbol={coin.symbol} size="md" glow={isSelectedInTerminal} />
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
                        <span className="text-[11px] text-[#98A6BA] block">
                          {coin.name} • {coin.algorithm}
                        </span>
                      </div>
                    </div>

                    {/* Mobile Price Display */}
                    <div className="text-right sm:hidden flex items-center gap-2.5">
                      <div>
                        <div
                          className={`font-mono font-bold text-sm ${
                            coin.tickDirection === 'up'
                              ? 'text-[#19C784]'
                              : coin.tickDirection === 'down'
                              ? 'text-[#FF647C]'
                              : 'text-[#F4F7FC]'
                          }`}
                        >
                          ${formatCryptoPrice(coin.price)}
                        </div>
                        <div
                          className={`text-xs font-mono font-semibold ${
                            isPositive ? 'text-[#19C784]' : 'text-[#FF647C]'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {coin.change24h.toFixed(2)}%
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalCoinSymbol(coin.symbol);
                        }}
                        className="p-2 rounded-xl bg-[#0D121C] border border-[#253144] text-[#98A6BA] hover:text-[#00D6A3]"
                        title="Open Coin Terminal Modal"
                      >
                        <BarChart2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Desktop Price */}
                  <div
                    className={`hidden sm:block sm:col-span-2 text-right font-mono font-bold text-sm transition-colors ${
                      coin.tickDirection === 'up'
                        ? 'text-[#19C784]'
                        : coin.tickDirection === 'down'
                        ? 'text-[#FF647C]'
                        : 'text-[#F4F7FC]'
                    }`}
                  >
                    ${formatCryptoPrice(coin.price)}
                  </div>

                  {/* 24h Change */}
                  <div className="hidden sm:block sm:col-span-2 text-right">
                    <span
                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-mono font-semibold ${
                        isPositive
                          ? 'bg-[#19C784]/15 text-[#19C784] border border-[#19C784]/30'
                          : 'bg-[#FF647C]/15 text-[#FF647C] border border-[#FF647C]/30'
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      <span>
                        {isPositive ? '+' : ''}
                        {coin.change24h.toFixed(2)}%
                      </span>
                    </span>
                  </div>

                  {/* 24h High / Low */}
                  <div className="hidden sm:block sm:col-span-2 text-right font-mono text-[11px]">
                    <div className="text-[#F4F7FC]">H: ${formatCryptoPrice(coin.high24h)}</div>
                    <div className="text-[#98A6BA]">L: ${formatCryptoPrice(coin.low24h)}</div>
                  </div>

                  {/* Volume + Expand Modal Button */}
                  <div className="hidden sm:flex sm:col-span-2 items-center justify-end gap-2.5 text-right">
                    <div>
                      <div className="font-mono text-xs font-bold text-[#F4F7FC]">
                        {formatCompactVolume(coin.volume24h, '$')}
                      </div>
                      <div className="text-[10px] font-mono text-[#98A6BA]">
                        {formatCompactVolume(coin.baseVolume24h, '')} {coin.symbol}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalCoinSymbol(coin.symbol);
                      }}
                      className="p-1.5 rounded-xl bg-[#0D121C] border border-[#253144] hover:border-[#00D6A3] text-[#98A6BA] hover:text-[#00D6A3] transition-colors"
                      title={`Expand ${coin.displayPair} Chart Modal`}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-[#98A6BA]">
              {markets.length === 0
                ? 'Connecting to Binance Spot market feed...'
                : 'No cryptocurrency matching your criteria was found.'}
            </div>
          )}
        </div>
      </div>

      {/* Expandable Coin Detail & Candlestick Modal */}
      {modalCoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-[#121925] border border-[#253144] rounded-3xl p-4 sm:p-6 shadow-2xl my-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#253144]">
              <div className="flex items-center gap-3">
                <CoinIcon symbol={modalCoin.symbol} size="lg" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-[#F4F7FC] text-base sm:text-lg">
                      {modalCoin.name} ({modalCoin.displayPair})
                    </h3>
                    {modalCoin.isPoW && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#F3B64B]/15 text-[#F3B64B] border border-[#F3B64B]/30">
                        PoW
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[#98A6BA] font-mono">
                    Consensus: {modalCoin.algorithm} • Binance Spot Feed
                  </span>
                </div>
              </div>
              <button
                onClick={() => setModalCoinSymbol(null)}
                className="p-2 text-[#98A6BA] hover:text-[#F4F7FC] rounded-xl hover:bg-[#182232] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Spot Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#0D121C] border border-[#253144]">
                <span className="text-[#98A6BA] text-[10px] uppercase block">Last Price</span>
                <span className="text-base sm:text-lg font-black text-[#F4F7FC] font-mono mt-0.5 block">
                  ${formatCryptoPrice(modalCoin.price)}
                </span>
                <span
                  className={`text-[11px] font-mono font-bold ${
                    modalCoin.change24h >= 0 ? 'text-[#19C784]' : 'text-[#FF647C]'
                  }`}
                >
                  {modalCoin.change24h >= 0 ? '+' : ''}
                  {modalCoin.change24h.toFixed(2)}% (24h)
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#0D121C] border border-[#253144]">
                <span className="text-[#98A6BA] text-[10px] uppercase block">24h High / Low</span>
                <span className="font-mono text-[#F4F7FC] font-bold mt-0.5 block">
                  H: ${formatCryptoPrice(modalCoin.high24h)}
                </span>
                <span className="font-mono text-[#98A6BA] text-[11px] block">
                  L: ${formatCryptoPrice(modalCoin.low24h)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#0D121C] border border-[#253144]">
                <span className="text-[#98A6BA] text-[10px] uppercase block">
                  24h Base Volume ({modalCoin.symbol})
                </span>
                <span className="font-mono text-[#F4F7FC] font-bold mt-0.5 block">
                  {formatCompactVolume(modalCoin.baseVolume24h, '')} {modalCoin.symbol}
                </span>
                <span className="text-[10px] text-[#98A6BA] font-mono block">Spot Traded</span>
              </div>

              <div className="p-3 rounded-xl bg-[#0D121C] border border-[#253144]">
                <span className="text-[#98A6BA] text-[10px] uppercase block">
                  24h Quote Volume (USDT)
                </span>
                <span className="font-mono text-[#00D6A3] font-bold mt-0.5 block">
                  {formatCompactVolume(modalCoin.volume24h, '$')}
                </span>
                <span className="text-[10px] text-[#98A6BA] font-mono block">
                  Updated {new Date(modalCoin.lastUpdated).toLocaleTimeString()}
                </span>
              </div>
            </div>

            {/* Interactive Candlestick Chart in Modal */}
            <CandlestickChart
              pair={modalCoin.pair}
              symbol={modalCoin.symbol}
              defaultInterval="1h"
              height={380}
            />

            {modalCoin.isPoW && (
              <div className="p-3 rounded-xl bg-[#00D6A3]/10 border border-[#00D6A3]/20 text-xs text-[#00D6A3] flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#00D6A3] shrink-0" />
                <span>
                  Supported for direct cloud hash contracts on Nexora Stratum pools.
                </span>
              </div>
            )}

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => {
                  setModalCoinSymbol(null);
                  setActiveTab('mining');
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#00D6A3] hover:bg-[#19C784] text-[#080B12] font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Pickaxe className="w-4 h-4" />
                <span>Mine {modalCoin.symbol}</span>
              </button>
              <button
                onClick={() => {
                  setModalCoinSymbol(null);
                  setActiveTab('wallet');
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] font-bold text-xs transition-colors border border-[#253144]"
              >
                Wallet Deposit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
