import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  Time,
} from 'lightweight-charts';
import { KlineCandle, KlineInterval, MarketConnectionStatus } from '../../types';
import {
  fetchKlines,
  subscribeKlineWebSocket,
  formatCryptoPrice,
  formatCompactVolume,
} from '../../services/marketService';
import { RefreshCw, Maximize2, RotateCcw, Wifi, WifiOff, AlertTriangle } from 'lucide-react';

const KLINE_INTERVALS: { label: string; value: KlineInterval }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
];

interface CandlestickChartProps {
  pair: string; // e.g., 'BTCUSDT'
  symbol: string; // e.g., 'BTC'
  defaultInterval?: KlineInterval;
  height?: number;
  compact?: boolean;
  onExpandClick?: () => void;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  pair,
  symbol,
  defaultInterval = '1h',
  height = 340,
  compact = false,
  onExpandClick,
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const candlesMapRef = useRef<Map<number, KlineCandle>>(new Map());

  const [interval, setIntervalState] = useState<KlineInterval>(defaultInterval);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<MarketConnectionStatus>('CONNECTING');
  const [hoveredCandle, setHoveredCandle] = useState<KlineCandle | null>(null);
  const [latestCandle, setLatestCandle] = useState<KlineCandle | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  const pricePrecision = useCallback((price: number) => {
    if (price >= 1000) return { precision: 2, minMove: 0.01 };
    if (price >= 1) return { precision: 3, minMove: 0.001 };
    return { precision: 5, minMove: 0.00001 };
  }, []);

  // Initialize Lightweight Charts instance
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth || 600,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0D121C' },
        textColor: '#98A6BA',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(37, 49, 68, 0.45)' },
        horzLines: { color: 'rgba(37, 49, 68, 0.45)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#36465D',
          width: 1,
          style: 2,
          labelBackgroundColor: '#182232',
        },
        horzLine: {
          color: '#36465D',
          width: 1,
          style: 2,
          labelBackgroundColor: '#182232',
        },
      },
      rightPriceScale: {
        borderColor: '#253144',
        scaleMargins: {
          top: 0.08,
          bottom: 0.24,
        },
      },
      timeScale: {
        borderColor: '#253144',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: compact ? 6 : 8,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#19C784',
      downColor: '#FF647C',
      borderUpColor: '#19C784',
      borderDownColor: '#FF647C',
      wickUpColor: '#19C784',
      wickDownColor: '#FF647C',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#25B9F3',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoveredCandle(null);
        return;
      }
      const timeSec = Number(param.time);
      const found = candlesMapRef.current.get(timeSec);
      if (found) {
        setHoveredCandle(found);
      }
    });

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0 && chartApiRef.current) {
          chartApiRef.current.applyOptions({ width });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      chart.remove();
    };
  }, [height, compact]);

  // Fetch historical klines + subscribe to live kline WebSocket when pair or interval changes
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    setHoveredCandle(null);

    const cleanPair = pair.replace('/', '').toUpperCase();

    async function loadAndStream() {
      try {
        const history = await fetchKlines(cleanPair, interval, compact ? 120 : 200);
        if (isCancelled) return;

        candlesMapRef.current.clear();
        for (const c of history) {
          candlesMapRef.current.set(c.time, c);
        }

        const last = history[history.length - 1] || null;
        setLatestCandle(last);

        if (candleSeriesRef.current && volumeSeriesRef.current && last) {
          const fmt = pricePrecision(last.close);
          candleSeriesRef.current.applyOptions({
            priceFormat: {
              type: 'price',
              precision: fmt.precision,
              minMove: fmt.minMove,
            },
          });

          candleSeriesRef.current.setData(
            history.map((c) => ({
              time: c.time as Time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
          );

          volumeSeriesRef.current.setData(
            history.map((c) => ({
              time: c.time as Time,
              value: c.volume,
              color: c.close >= c.open ? 'rgba(25, 199, 132, 0.32)' : 'rgba(255, 100, 124, 0.32)',
            }))
          );

          chartApiRef.current?.timeScale().fitContent();
        }

        setLoading(false);
      } catch (err: any) {
        if (isCancelled) return;
        setError(err?.message || 'Unable to load candlestick data from Binance.');
        setLoading(false);
        setStreamStatus('ERROR');
      }
    }

    loadAndStream();

    const unsubscribeWs = subscribeKlineWebSocket(
      cleanPair,
      interval,
      (liveCandle) => {
        if (isCancelled) return;
        candlesMapRef.current.set(liveCandle.time, liveCandle);
        setLatestCandle(liveCandle);

        if (candleSeriesRef.current && volumeSeriesRef.current) {
          try {
            candleSeriesRef.current.update({
              time: liveCandle.time as Time,
              open: liveCandle.open,
              high: liveCandle.high,
              low: liveCandle.low,
              close: liveCandle.close,
            });
            volumeSeriesRef.current.update({
              time: liveCandle.time as Time,
              value: liveCandle.volume,
              color:
                liveCandle.close >= liveCandle.open
                  ? 'rgba(25, 199, 132, 0.38)'
                  : 'rgba(255, 100, 124, 0.38)',
            });
          } catch {
            // Ignore out-of-order timestamp race during initial history load
          }
        }
      },
      (status) => {
        if (!isCancelled) {
          setStreamStatus(status);
        }
      }
    );

    return () => {
      isCancelled = true;
      unsubscribeWs();
    };
  }, [pair, interval, compact, reloadNonce, pricePrecision]);

  const handleResetZoom = () => {
    chartApiRef.current?.timeScale().fitContent();
  };

  const activeCandle = hoveredCandle || latestCandle;
  const isBullish = activeCandle ? activeCandle.close >= activeCandle.open : true;
  const candleChangePct =
    activeCandle && activeCandle.open > 0
      ? ((activeCandle.close - activeCandle.open) / activeCandle.open) * 100
      : 0;

  return (
    <div className="rounded-2xl bg-[#0D121C] border border-[#253144] overflow-hidden flex flex-col">
      {/* Top Toolbar: Timeframe Selector + Stream Status + Controls */}
      <div className="px-3.5 py-2.5 border-b border-[#253144] bg-[#121925]/70 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {KLINE_INTERVALS.map((tf) => {
            const isSelected = interval === tf.value;
            return (
              <button
                key={tf.value}
                type="button"
                onClick={() => setIntervalState(tf.value)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all ${
                  isSelected
                    ? 'bg-[#00D6A3] text-[#080B12] shadow-xs'
                    : 'text-[#98A6BA] hover:text-[#F4F7FC] hover:bg-[#182232]'
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Stream Connection Indicator */}
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
              streamStatus === 'CONNECTED'
                ? 'bg-[#00D6A3]/10 text-[#00D6A3] border-[#00D6A3]/30'
                : streamStatus === 'CONNECTING'
                ? 'bg-[#F3B64B]/10 text-[#F3B64B] border-[#F3B64B]/30'
                : 'bg-[#FF647C]/10 text-[#FF647C] border-[#FF647C]/30'
            }`}
          >
            {streamStatus === 'CONNECTED' ? (
              <>
                <Wifi className="w-2.5 h-2.5" />
                <span>WS LIVE</span>
              </>
            ) : streamStatus === 'CONNECTING' ? (
              <>
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                <span>SYNCING</span>
              </>
            ) : (
              <>
                <WifiOff className="w-2.5 h-2.5" />
                <span>RECONNECTING</span>
              </>
            )}
          </span>

          <button
            type="button"
            onClick={handleResetZoom}
            className="p-1.5 rounded-lg bg-[#182232] hover:bg-[#253144] text-[#98A6BA] hover:text-[#F4F7FC] border border-[#253144] transition-colors"
            title="Reset Chart Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {onExpandClick && (
            <button
              type="button"
              onClick={onExpandClick}
              className="p-1.5 rounded-lg bg-[#182232] hover:bg-[#253144] text-[#98A6BA] hover:text-[#F4F7FC] border border-[#253144] transition-colors"
              title="Open Full Terminal Modal"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Live OHLCV Crosshair / Latest Candle Header */}
      {activeCandle && !error && (
        <div className="px-3.5 py-2 border-b border-[#253144]/60 bg-[#0D121C] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono">
          <span className="text-[#98A6BA] font-semibold">
            {symbol}/USDT • {interval.toUpperCase()}
          </span>
          <span>
            <span className="text-[#98A6BA]">O </span>
            <span className={isBullish ? 'text-[#19C784]' : 'text-[#FF647C]'}>
              {formatCryptoPrice(activeCandle.open)}
            </span>
          </span>
          <span>
            <span className="text-[#98A6BA]">H </span>
            <span className="text-[#F4F7FC]">{formatCryptoPrice(activeCandle.high)}</span>
          </span>
          <span>
            <span className="text-[#98A6BA]">L </span>
            <span className="text-[#F4F7FC]">{formatCryptoPrice(activeCandle.low)}</span>
          </span>
          <span>
            <span className="text-[#98A6BA]">C </span>
            <span className={`font-bold ${isBullish ? 'text-[#19C784]' : 'text-[#FF647C]'}`}>
              {formatCryptoPrice(activeCandle.close)}
            </span>
          </span>
          <span>
            <span className="text-[#98A6BA]">Chg </span>
            <span className={isBullish ? 'text-[#19C784]' : 'text-[#FF647C]'}>
              {candleChangePct >= 0 ? '+' : ''}
              {candleChangePct.toFixed(2)}%
            </span>
          </span>
          <span>
            <span className="text-[#98A6BA]">Vol({symbol}) </span>
            <span className="text-[#F4F7FC]">{formatCompactVolume(activeCandle.volume, '')}</span>
          </span>
        </div>
      )}

      {/* Chart Canvas Area */}
      <div className="relative w-full" style={{ height: `${height}px` }}>
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-[#0D121C]/85 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 z-10">
            <RefreshCw className="w-6 h-6 text-[#00D6A3] animate-spin" />
            <span className="text-xs font-mono text-[#98A6BA]">
              Loading {symbol}/USDT ({interval}) candlesticks from Binance...
            </span>
          </div>
        )}

        {/* Explicit Error Overlay (Zero fabricated data) */}
        {error && !loading && (
          <div className="absolute inset-0 bg-[#0D121C]/95 flex flex-col items-center justify-center p-6 text-center z-10">
            <AlertTriangle className="w-7 h-7 text-[#FF647C] mb-2" />
            <p className="text-xs font-bold text-[#F4F7FC]">Binance Candlestick Stream Unavailable</p>
            <p className="text-[11px] text-[#98A6BA] max-w-sm mt-1">{error}</p>
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="mt-3 px-3.5 py-1.5 rounded-xl bg-[#00D6A3] text-[#080B12] font-bold text-xs flex items-center gap-1.5 hover:bg-[#19C784] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Connection</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
