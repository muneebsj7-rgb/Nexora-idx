# Implementation Plan: Nexora Cloud Mining — App Cleanup & Unnecessary Feature Removal

## 1. Overview
This plan updates the user-facing branding from **Nexora Mine** to **Nexora Cloud Mining** and removes unnecessary technical labels, provider branding, and fake hardware controls across the interface while preserving the existing dark aesthetic, Firebase authentication, wallet security, live market feeds, admin desk, and the five authoritative BTC mining contracts.

---

## 2. Application Rebranding (`Nexora Mine` → `Nexora Cloud Mining`)
Update all user-visible occurrences of the app name without altering Firebase project IDs, Firestore collection paths, environment variables, or internal authentication identifiers:
- **`/index.html`**:
  - Update `<title>` to `Nexora Cloud Mining — Bitcoin Cloud Mining`.
  - Update `<meta property="og:title">` and `<meta name="description">` to reference `Nexora Cloud Mining`.
- **`/src/components/Navigation.tsx`**:
  - Update top desktop sidebar brand header from `NEXORA MINE` (`Cloud Pool Stratum`) to `NEXORA CLOUD MINING` (`Bitcoin Cloud Mining`).
- **`/src/components/screens/HomeScreen.tsx`**:
  - Update mobile top header brand title from `NEXORA MINE` (`PRO POOL`) to `NEXORA CLOUD MINING`.
- **`/src/components/modals/AuthModal.tsx`**:
  - Update sign-in modal heading from `Sign In to Nexora Mine` to `Sign In to Nexora Cloud Mining`.
- **`/src/components/screens/ProfileScreen.tsx`**:
  - Update appearance description copy from `Nexora Mine control terminal` to `Nexora Cloud Mining terminal`.

---

## 3. Removal of Specific Labels, Provider Branding & Unnecessary Features

### A. `Pool Frankfurt 01` & `SHA-256 Bitcoin Cloud Contracts • Pool Node: Nexora Global Stratum - FRA01`
- **`/src/components/screens/HomeScreen.tsx`**:
  - Remove the `Pool: Frankfurt 01` header status pill.
  - Remove the `Stratum Pool: {miningSession.poolName}` subtitle line from the mining status card.
- **`/src/components/screens/MiningScreen.tsx`**:
  - Remove the subtitle `SHA-256 Bitcoin Cloud Contracts • Pool Node: {miningSession.poolName}` and replace with clean, accurate contract copy (`Bitcoin Cloud Mining Contracts`).
- **`/src/components/modals/NotificationDrawer.tsx`**:
  - Replace `SHA-256 Nexora Stratum Pool` and `Cluster FRA01 operating at 99.8% efficiency...` with clean cloud mining status descriptions (`Bitcoin Cloud Mining` / `Cloud mining session operating normally.`).
- **`/src/services/miningService.ts` & `/src/services/settlementEngine.ts`**:
  - Update default `poolName` fallback from `'Nexora Global Stratum - FRA01'` to `'Bitcoin Cloud Hashrate'` so no `FRA01` or `Nexora Global Stratum` identifier is surfaced.

### B. `Binance WebSocket` & `Binance` Branding
Keep live market prices, 24h ticker cards, and candlestick charts functioning seamlessly while removing all user-visible `Binance` provider references:
- **`/src/components/screens/HomeScreen.tsx`**:
  - Change `Binance Spot Market Snapshot` to `Live Market Snapshot`.
  - Replace `Binance market feed error` and `Connecting to Binance Spot market stream...` with `Market data temporarily unavailable` and `Connecting to live market stream...`.
- **`/src/components/screens/MarketsScreen.tsx`**:
  - Change badge `Binance Spot Terminal` to `Live Market Terminal`.
  - Change subtitle `Official Binance Spot real-time 24h tickers, OHLCV candlesticks & proof-of-work mineability` to `Real-time 24h market tickers, OHLCV candlesticks & digital assets`.
  - Change `Binance Market Feed Unavailable` and `Connecting to Binance Spot market feed...` to `Market Data Temporarily Unavailable` and `Loading live market data...`.
  - Remove `• Binance Spot Feed` from the coin detail modal header.
- **`/src/components/ui/CandlestickChart.tsx`**:
  - Update loading and error messages (`Loading ... candlesticks from Binance...`, `Binance Candlestick Stream Unavailable`, `Unable to load candlestick data from Binance.`) to provider-neutral messages (`Loading ... candlestick chart...`, `Market Chart Temporarily Unavailable`, `Market chart data temporarily unavailable.`).
- **`/src/components/screens/ProfileScreen.tsx`**:
  - Change `Active (Binance Public Tickers)` to `Active (Real-Time Market Stream)`.
- **`/src/context/AppContext.tsx` & `/src/services/marketService.ts`**:
  - Sanitize user-facing error strings to neutral messages (`Market data temporarily unavailable.`) while preserving the underlying REST/WebSocket market data pipeline.

### C. `Cloud Rig Active` & `Simulated Mining`
- **`/src/components/screens/HomeScreen.tsx`**:
  - Replace `Cloud Rig Active` with `Mining Active` (or `Mining Standby` when paused) to accurately reflect contract session state without claiming physical rig telemetry.
  - Replace the fake `Shares / Health` (`°C`) card in the Home mining bar with an accurate `Allocated Hashrate` / `Contract Status` summary.
- **`/src/components/screens/MiningScreen.tsx`**:
  - Remove the `Simulated Mining` badge in the Mining screen header.
  - Remove the `Simulated Mining` pill inside the circular hashrate gauge.
  - Replace the fake hardware telemetry card (`Rig Core / Power` with fabricated `°C` and `W/TH` numbers) with an accurate **Active Contracts** summary card (`{activeContracts.length} Active` and allocated contract hashrate).
  - Update the bottom disclosure heading from `Simulated Mining Notice:` to `Contract Terms Notice:` while keeping clear, honest language that displayed returns are contract terms and estimated projections rather than guaranteed payouts.

### D. `Tuning Mode`
- **`/src/components/screens/MiningScreen.tsx`**:
  - Remove the `Tuning Mode:` control bar (`Eco`, `Balanced`, `Turbo Overclock` buttons), unused `Sliders` / `Thermometer` icon imports, and `setHardwareProfile` UI controls from the Mining screen so users only interact with real contract plans and session controls.

### E. `Multi-Sig`, `Firestore Synced`, and `Tier Multiplier`
- **`/src/components/screens/WalletScreen.tsx`**:
  - Remove the `Multi-Sig Vault` badge and the `Firestore Synced` badge from the Wallet header.
  - Remove the `FIRESTORE` tag on pending transaction rows and change `Firestore Synced Record` in the transaction receipt modal to `Verified Ledger Record`.
- **`/src/components/screens/ProfileScreen.tsx`**:
  - Remove `and multi-sig security` from the email verification notice.
- **`/src/components/screens/EarnScreen.tsx`**:
  - Remove the `Tier Multipliers` and `Firestore Synced (UTC)` badges from the Rewards header.

---

## 4. Verification & Git Workflow
1. Work on dedicated feature branch `feat/nexora-cloud-mining-cleanup`.
2. Verify all five BTC mining plans (`Genesis Shaft` $10, `Blockfoundry` $48, `Stratum Yard` $135, `Halving Bench` $510, `Epoch Vault` $1,480) remain intact across frontend and backend.
3. Run a full codebase search to confirm zero remaining user-facing occurrences of `Nexora Mine`, `Pool Frankfurt 01`, `FRA01`, `Binance`, `Cloud Rig Active`, `Simulated Mining`, `Tuning Mode`, `Multi-Sig`, `Firestore Synced`, or `Tier Multiplier`.
4. Run TypeScript typechecking (`lint_applet`), production build (`compile_applet`), and the automated settlement test suite (`npx tsx tests/settlementEngine.test.ts`).
