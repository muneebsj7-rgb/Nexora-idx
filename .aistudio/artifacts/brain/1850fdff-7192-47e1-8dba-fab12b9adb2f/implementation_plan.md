# Nexora Cloud Mining — Complete A–Z Audit, Security Hardening & Bug Fixes

Deliver a full-stack security, financial integrity, authentication, and UI audit of **Nexora Cloud Mining**, resolving verified defects across login navigation, Firestore Security Rules, real-vs-demo wallet isolation, and atomic backend settlement while preserving the existing dark aesthetic, five BTC contract plans, and live market feeds.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and security decisions were confirmed during interactive clarification and govern all code changes:

- **Confirmed Decision 1 — Real-User Deposit Address Isolation**: Show an honest "Payment Provider Not Configured" state inside the Deposit Modal for real authenticated Firebase accounts so sample strings are never presented as live custodial addresses, while preserving interactive sample addresses exclusively in Sandbox Demo Mode.
- **Confirmed Decision 2 — Fail-Closed Real-User Withdrawals**: Require server-side atomic balance reservation (`lockedBalance` escrow via the backend settlement engine) for all real-user withdrawal requests. Remove the client-side unreserved fallback when server Admin SDK credentials are missing so concurrent requests can never double-spend available balances.
- **Confirmed Decision 3 — Server-Only Administrative Settlement & Rules Hardening**: Enforce all balance-affecting and administrative approvals strictly through server-side Firebase Admin SDK transactions verified by Firebase ID tokens, verified email status, custom claims, and an `/admins/{uid}` authorization lookup.

---

## 1. Overview & Core Concept

- **What It Does**: Audits every layer of Nexora Cloud Mining (UI, state context, authentication, Firestore schema/rules, Express backend, Cloud Functions, and settlement engine), fixes verified bugs and security gaps, and produces an evidence-backed completion and readiness report.
- **Target Audience / Persona**: Cryptocurrency cloud mining users managing BTC hashrate contracts (`Genesis Shaft`, `Blockfoundry`, `Stratum Yard`, `Halving Bench`, `Epoch Vault`), portfolio balances, and daily streak rewards, alongside platform administrators reviewing pending financial requests.
- **Key Value**: Eliminates authentication race conditions and post-login screen jumps, prevents real users from sending funds to hardcoded demo addresses, blocks unescrowed client withdrawals, synchronizes Firestore Security Rules with the actual data model, and verifies all guarantees with automated tests.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Consistent Post-Login Home Navigation**: Whether signing in from the header button, the logged-out Profile screen prompt, or a protected action modal, successful login, registration, and demo entry deterministically route to the **Home** dashboard without race conditions or ghost clicks opening Profile Settings.
  2. **Honest Deposit Address Experience**:
     - *Sandbox Demo Mode*: Displays the simulated QR code and sample address (`[DEMO]`) for testing the interface.
     - *Real Authenticated Users*: Displays a clear **Custodial Deposit Gateway Not Configured** notice in place of the hardcoded sample address and disables copying fake addresses until a live payment provider or verified treasury address is provisioned.
  3. **Atomic Withdrawal & Contract Purchase Flow**: Real users submit withdrawals and BTC contract orders through authenticated backend endpoints that atomically verify server-confirmed balances, reserve escrow or deduct USDT, and update the ledger immediately.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Utilitarian dark fintech & cloud mining terminal (`#080B12` primary canvas, `#121925` structural cards, `#253144` 1px borders).
  - *Color Palette & Mood*: 60% deep obsidian slate canvas (`#080B12` / `#0D121C`), 30% structural dark navy surfaces (`#121925`), and 10% high-intent emerald (`#00D6A3`), cyan (`#25B9F3`), and gold (`#F3B64B`) accents for active states and semantic alerts.
  - *Typography & Hierarchy*: Crisp geometric sans headings paired with tabular monospace numerals (`font-mono tabular-nums`) across all balances, hashrates (`GH/s`, `TH/s`, `MH/s`), prices, and timestamps.
  - *Component Styling & Layout*: Responsive mobile-first touch targets ($\ge 44\text{px}$) with full desktop multi-column expansion (`max-w-7xl`), single-elevation card depth, and clean status indicators.
- **Interactive Feedback & Motion**: Deterministic loading spinners on auth and settlement actions, immediate state cleanup on account switch/logout, and clear toast notifications distinguishing server-confirmed settlements from offline cache states.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Eliminating the Login Navigation & Profile Race Condition**
  - *Chosen Approach*: Deduplicate concurrent profile initialization calls in the authentication service per UID, track explicit authentication transitions in application state so transitioning from logged-out (`null`) to an authenticated session while on the logged-out Profile screen (or via `AuthModal`) always lands on `'home'`, and guard header profile buttons against click-through events during modal dismissal.
  - *Why*: Previously, `login()` and `onAuthStateChanged` both invoked profile initialization concurrently; if a user initiated login from the logged-out Profile view or if `onAuthStateChanged` resolved asynchronously out of order, the active tab could remain on or switch to `'profile'`.
  - *Alternatives Considered*: Forcing `'home'` on every `onAuthStateChanged` callback was rejected because token refreshes or page reloads on other tabs should not disrupt an already-authenticated user's manual navigation.
- **Decision 2: Strict Real-User vs. Demo-User Deposit & Withdrawal Isolation**
  - *Chosen Approach*: Strip sample deposit addresses from real-user wallet state (`depositAddress: ''` when `!user.isDemo`) and render an explicit "Custodial Deposit Gateway Not Configured" panel in the Deposit Modal for real users. For withdrawals, require the `/api/wallet/withdraw` atomic escrow endpoint to succeed and fail closed if server Admin SDK credentials are unavailable.
  - *Why*: Showing sample strings as "Your Dedicated Address" to real users is a critical financial safety hazard, and allowing client-side unreserved withdrawal documents permits concurrent requests to exceed available balance.
  - *Alternatives Considered*: Hiding the Deposit Modal entirely was passed over in favor of showing an explicit configuration status inside the modal so users understand why live deposits are unavailable.
- **Decision 3: Aligning Firestore Security Rules with Schema & Admin Governance**
  - *Chosen Approach*:
    - Add `/admins/{adminId}` rule definition and `isAdmin()` helper while keeping all wallet, settlement, and contract writes strictly `allow write: if false` on the client (Admin SDK only).
    - Update `/users/{userId}/mining/{docId}` allowed keys on `create` and `update` to include `hashrateGHs` (as a non-negative number) and preserve immutable server-written contract pointers (`activeContractId`, `activeContractName`) so toggling mining or initializing a session never triggers `permission-denied`.
    - Enforce string length bounds, strict key allowlists, immutable ownership/timestamp checks (`userId`, `createdAt`), and block client-side `WITHDRAWAL` creation now that withdrawals are strictly created by the server-side atomic escrow transaction.
  - *Why*: Ensures zero update-gaps, prevents unescrowed client withdrawal writes at the database rule layer, and fixes the schema mismatch where `hashrateGHs` caused client mining session updates to fail against published rules.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NEXORA CLOUD MINING CLIENT                           │
│                                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │  HomeScreen  │   │ MiningScreen │   │ WalletScreen │   │  EarnScreen  │  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘  │
│         └──────────────────┴─────────┬────────┴──────────────────┘          │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │            AppContext (Deterministic Auth & Tab State)                │  │
│  │  • Routes login/register/logged-out-profile transitions -> Home      │  │
│  │  • Isolates Real User (0.00 balance, no fake address) vs Demo Mode   │  │
│  └───────────────┬───────────────────────────────────────┬───────────────┘  │
└──────────────────┼───────────────────────────────────────┼──────────────────┘
                   │ Client Firestore SDK                  │ Bearer ID Token
                   │ (Read + Safe Pending Requests)        │ (HTTPS REST / RPC)
                   ▼                                       ▼
┌─────────────────────────────────────┐ ┌─────────────────────────────────────┐
│      CLOUD FIRESTORE & RULES        │ │   EXPRESS / CLOUD FUNCTIONS API     │
│                                     │ │                                     │
│ • /users/{uid} (Owner R/W safe)     │ │ • POST /api/mining/purchase-contract│
│ • /users/{uid}/wallet/* (Read-Only) │ │ • POST /api/wallet/withdraw (Escrow)│
│ • /users/{uid}/contracts/* (R-Only) │ │ • POST /api/admin/approve-*         │
│ • /users/{uid}/settlements/* (R-O)  │ │ • POST /api/admin/reject-*          │
│ • /users/{uid}/transactions/*       │ │ • GET  /api/admin/pending-requests  │
│   (Create pending Deposit/Reward)   │ └──────────────────┬──────────────────┘
│ • /users/{uid}/mining/session       │                    │ Firebase Admin SDK
│   (Includes hashrateGHs validation) │                    │ (Atomic Txns)
│ • /users/{uid}/rewards/dailyStreak  │                    ▼
│ • /admins/{uid} (Admin Registry)    │ ◄──────────────────┘
└─────────────────────────────────────┘
```

- **Data Model & State**:
  - **User Profile (`users/{uid}`)**: Stores non-privileged profile attributes (`displayName`, `avatarUrl`, `currency`, `accentTheme`, `twoFactorEnabled`, `referralCode`, `referredBy`). Privileged fields (`isAdmin`, `kycTier`, `id`, `createdAt`) are immutable from the client; `isEmailVerified` is bound to `request.auth.token.email_verified`.
  - **Wallet (`users/{uid}/wallet/{assetSymbol}`)**: Strict `allow write: if false` for clients. Mutated exclusively inside atomic `runTransaction` blocks by the backend settlement engine.
  - **Transactions (`users/{uid}/transactions/{txId}`)**: Clients may only create `DEPOSIT` (`PENDING_CONFIRMATION`) or `TASK_REWARD` (`PENDING_REVIEW`) requests with validated positive amounts and zero approval/settlement flags. `WITHDRAWAL` and `CONTRACT_PURCHASE` documents are created atomically by the backend alongside balance/escrow updates.
  - **Mining Session (`users/{uid}/mining/session`)**: Stores session status (`IDLE`, `ACTIVE`, `PAUSED`, `MAINTENANCE`) and harmless simulation preferences (`hashrateGHs`, `hashrateTHs`, `hardwareProfile`, `temperatureC`, `efficiencyWTH`), while blocking client writes to financial or payout fields.
- **Interactive Component & State Mapping**:
  - **Auth & Tab Synchronization**: Deduplicated `ensureUserProfileDocument` prevents parallel write races during signup/login; `AppContext` guarantees that signing in from any modal or from the unauthenticated Profile screen sets `activeTab = 'home'`.
  - **Deposit Modal**: Checks `user?.isDemo`; for real users, hides fake QR/address strings, renders a clear provider-not-configured notice, and prevents submitting deposit references unless explicitly testing or configured.
  - **Withdrawal Modal & Service**: Calls `POST /api/wallet/withdraw` with the user's Firebase ID token; if the server returns `503 MISSING_ADMIN_CREDENTIALS` or network failure, rejects the withdrawal cleanly instead of writing an unescrowed transaction.
  - **Automated Verification Suite**: Extends the automated test suite to verify settlement engine invariants, Firestore Security Rules structure and field guards (`hashrateGHs`, withdrawal client write block, admin privilege protection, shadow-field rejection), login navigation state transitions, and demo-data isolation.
