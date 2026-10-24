# Real-Time Binance Spot Market & Candlestick Terminal Plan

## 1. Objective & Data Integrity Policy
Upgrade the cryptocurrency market system from 10-second polling with synthetic fallback data to a **real-time Binance Spot market terminal** powered by official public REST and WebSocket endpoints (`data-api.binance.vision` / `api.binance.com` and `wss://stream.binance.com:9443`).

- **Strict Zero-Fabrication Policy**: Remove all synthetic prices, simulated random price jitter, and fabricated sparklines. Display only genuine exchange data returned by Binance Spot APIs. If the network or exchange stream is unreachable, display an explicit disconnected/error state and retry controls rather than inventing numbers.

---

## 2. Trading Pair Coverage (12 Binance Spot USDT Pairs)
Expand the market catalog to the top 12 Binance Spot USDT pairs with full metadata and icon configurations:
- `BTCUSDT` (Bitcoin) — PoW (SHA-256)
- `ETHUSDT` (Ethereum) — PoS
- `BNBUSDT` (BNB) — PoSA
- `SOLUSDT` (Solana) — PoH / PoS
- `XRPUSDT` (XRP) — RPCA
- `DOGEUSDT` (Dogecoin) — PoW (Scrypt)
- `ADAUSDT` (Cardano) — PoS (Ouroboros)
- `AVAXUSDT` (Avalanche) — PoS (Snowman)
- `LINKUSDT` (Chainlink) — Oracle / PoS
- `TRXUSDT` (TRON) — DPoS
- `LTCUSDT` (Litecoin) — PoW (Scrypt)
- `ETCUSDT` (Ethereum Classic) — PoW (Etchash)

---

## 3. Architecture & Technical Design

### A. Market Data & WebSocket Service (`src/services/marketService.ts`)
1. **24hr Ticker Snapshot (REST)**:
   - Fetch initial 24hr ticker statistics for all 12 symbols from `https://data-api.binance.vision/api/v3/ticker/24hr` (with automatic failover to `https://api.binance.com/api/v3/ticker/24hr`).
   - Map real fields: `lastPrice`, `priceChange`, `priceChangePercent`, `highPrice`, `lowPrice`, `volume` (base asset volume), `quoteVolume` (USDT 24h volume), and `CloseTime`.
2. **Real-Time Multi-Stream Ticker WebSocket**:
   - Connect to `wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/...` for all 12 pairs.
   - Process `24hrTicker` events in real time to update spot price, 24h change, 24h high/low, and 24h volume with flash direction indicators (up/down price tick state).
   - Automatic exponential-backoff reconnection and connection status tracking (`CONNECTING` | `CONNECTED` | `DISCONNECTED` | `ERROR`).
3. **Historical OHLCV Klines (REST) & Live Kline Stream (WebSocket)**:
   - Support timeframes: `1m`, `5m`, `15m`, `1h` (default), `4h`, `1d`, `1w`.
   - Fetch historical candles (`limit=200`) from `/api/v3/klines?symbol=<PAIR>&interval=<INTERVAL>&limit=200`.
   - Subscribe to `wss://stream.binance.com:9443/ws/<symbol_lower>@kline_<interval>` for the active symbol and timeframe so the latest candle and volume bar update live tick-by-tick and roll over seamlessly when a new candle opens.

### B. Interactive Candlestick & Volume Chart Component (`src/components/ui/CandlestickChart.tsx`)
- Install and integrate `lightweight-charts` for high-performance HTML5 Canvas financial charting.
- Render:
  - **Candlestick Series**: Up candles in `#19C784`, down candles in `#FF647C`, matching wicks and borders.
  - **Volume Histogram Series**: Overlaid at the bottom 20% of the chart pane with semi-transparent green/red bars corresponding to candle direction.
  - **Interactive Crosshair Legend**: Live readout of hovered candle's timestamp, Open, High, Low, Close (`O / H / L / C`), net change, and Volume.
  - **Timeframe Selector Bar**: Instant switching between `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, and `1w` with loading skeleton and error/retry state.
  - **Zoom / Pan / Reset View Controls**: Touch and mouse drag-to-pan, scroll/pinch-to-zoom, and a one-click "Reset Chart" button.

### C. Markets Screen Upgrade (`src/components/screens/MarketsScreen.tsx`)
- **Live Connection Status Badge**: Real-time WebSocket status pill (`Live WebSocket`, `Connecting...`, or `Stream Offline` with reconnect action).
- **Inline Interactive Market Terminal Panel**:
  - Positioned above the Markets table, displaying the active pair's header stats (Last Price with real-time tick color flash, 24h Change %, 24h High, 24h Low, 24h Volume in Base & USDT) alongside the interactive `CandlestickChart` (`1h` default).
  - Clicking any row in the Markets table selects that pair in the inline terminal, or opens the expandable full-detail modal via a dedicated expand/detail action.
- **Expandable Coin Detail Modal**:
  - Full-featured modal view with an expanded interactive candlestick + volume chart, timeframe switcher, complete 24h exchange statistics, and quick links to Mining and Wallet.

### D. Home Screen Live Market Snapshot (`src/components/screens/HomeScreen.tsx`)
- Replace the static 7-day Recharts sparkline chart in the "Live Market Snapshot" section with the real-time Binance Spot ticker cards and an embedded live candlestick + volume chart for the selected snapshot coin (`BTC`, `ETH`, `SOL`) with timeframe controls.
