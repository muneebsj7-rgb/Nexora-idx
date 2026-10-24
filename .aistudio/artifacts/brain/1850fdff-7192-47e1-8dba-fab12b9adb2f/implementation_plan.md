# Nexora Mine — Admin Security Hardening, Firestore Index Configuration & Verification Plan

This plan covers verifying the existing nine bug fixes across the Nexora Mine cloud mining platform, hardening all administrative endpoints and authentication flows against information disclosure and unauthorized token bypasses, configuring the required Firestore composite collection-group index for pending deposit queries, and running full build and runtime validation.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and security decisions were confirmed during Phase 1 clarification and govern the execution of this plan:

- **Confirmed Decision 1 — Admin Setup Status Endpoint Security**: The admin setup-status endpoint will be protected by the admin authentication middleware and scoped to return only minimal, non-sensitive boolean status flags (`isConfigured` and `functionsDeployed`), eliminating unauthenticated exposure of administrator email allowlists, project identifiers, and service-account credential presence.
- **Confirmed Decision 2 — Removal of Demo Admin Token Bypass**: The `demo-admin-token` fallback will be completely removed from the server authentication middleware so that administrative endpoints exclusively accept cryptographically verified Firebase ID tokens belonging to verified administrators.
- **Confirmed Decision 3 — Non-Destructive Local Index Configuration**: The composite collection-group index for pending deposits will be defined in the local Firestore index configuration and linked in the Firebase project configuration without deploying to production or altering live data.

---

## 1. Overview & Core Concept

- **What It Does**: Audits and verifies the nine previously applied bug fixes, locks down the administrative deposit settlement API against unauthenticated reconnaissance and token bypasses, defines the exact Firestore collection-group index required for cross-user pending deposit review, and validates the complete TypeScript and Cloud Functions build pipeline.
- **Target Audience / Persona**: Platform administrators reviewing pending cryptocurrency deposit requests and miners using the simulated cloud mining dashboard, multi-chain custodial wallet, market tickers, and daily reward center.
- **Key Value**: Enforces zero-trust backend administrative authorization, prevents leakage of privileged administrator identities or server environment metadata, ensures cross-account deposit queries are backed by a valid composite index definition, and provides evidence-based verification of every build and runtime check.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Logged-Out & Authenticated Navigation**: Visitors start on a clean zero-balance dashboard; signing in, registering, entering Sandbox Demo Mode, or signing out reliably routes the user to the Home dashboard while gating protected actions behind authentication.
  2. **Admin Deposit Verification Desk**: When an authenticated user with a verified administrator email opens the Wallet view, the Admin Deposit Verification & Settlement Desk loads pending deposit requests using the user's Firebase ID token and displays sanitized server readiness status without exposing raw email allowlists or service-account environment internals.
  3. **Custodial Wallet & Modals**: Users inspect available vs. locked balances (computed without double-subtraction), open Deposit, Withdrawal, and Hashrate Contract modals that synchronize with the selected asset or plan, and inspect formatted timestamps in transaction receipts.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-contrast dark fintech and cloud-mining telemetry console with clean hairline borders and structured tabular data grids.
  - *Color Palette & Mood*: Deep obsidian canvas (`#080B12`, `--background`), elevated slate cards (`#121925`, `--card`), subtle structural borders (`#253144`, `--border`), emerald matrix primary accent (`#00D6A3`, `--primary`), cyan secondary accent (`#25B9F3`, `--accent`), and semantic status indicators (`#19C784` nominal, `#F3B64B` warning/pending, `#FF4D4D` error/rejected).
  - *Typography & Hierarchy*: `Plus Jakarta Sans` for crisp UI headings and navigation paired with `JetBrains Mono` (`tabular-nums`) for all cryptocurrency balances, hash rates, USD valuations, and transaction identifiers.
  - *Component Styling & Layout*: Responsive mobile-first and desktop container layout with single-elevation cards, segmented transaction filter controls, and accessible modal dialogs.
- **Interactive Feedback & Motion**: Smooth 200ms state transitions, spinning refresh indicators on queue and market sync actions, and contextual toast notifications for deposit approvals, rejections, and validation errors.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Strict Token-Only Admin Authorization & Setup Status Redaction**
  - *Chosen Approach*: Require verified Firebase ID token authentication on `/api/admin/setup-status`, pass the caller's Bearer token from the frontend admin service, deduplicate the server's administrator email list, require `email_verified === true` on all email-based admin checks, and return only `{ isConfigured, functionsDeployed, notes }` without `adminEmails`, `projectId`, or `hasServiceAccount`.
  - *Why*: Eliminates unauthenticated reconnaissance of administrator email addresses and server credential state while preserving the Admin Desk's ability to display whether backend settlement is ready.
  - *Alternatives Considered*: Keeping `/api/admin/setup-status` public with redacted fields was passed over in favor of requiring admin authentication as confirmed by the user.
- **Decision 2: Complete Removal of `demo-admin-token`**
  - *Chosen Approach*: Delete the `demo-admin-token` branch from `requireAdminAuth` so no static bearer string can ever grant administrative privileges regardless of `NODE_ENV` configuration.
  - *Why*: Guarantees that a missing or misconfigured `NODE_ENV` variable in any deployment environment can never expose administrative deposit approval or rejection routes.
  - *Alternatives Considered*: Gating the token behind a secondary environment flag was passed over because real admin actions require real Firestore credentials and a verified Firebase identity.
- **Decision 3: Collection-Group Composite Index Definition**
  - *Chosen Approach*: Define a `COLLECTION_GROUP` index on `transactions` for `type` (`ASCENDING`) and `status` (`ASCENDING`) and link it in the Firebase configuration file.
  - *Why*: The pending-deposits endpoint executes `.collectionGroup('transactions').where('type', '==', 'DEPOSIT').where('status', '==', 'PENDING_CONFIRMATION').limit(50)`, which requires a two-field ascending composite collection-group index in Cloud Firestore.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         Client Application (React)                        │
│                                                                           │
│  ┌──────────────────────┐   ┌──────────────────────┐   ┌───────────────┐  │
│  │   AppContext State   │──▶│  Home / Mining /     │──▶│ Deposit /     │  │
│  │  (Auth, Wallet, Tx)  │   │  Earn / Markets UI   │   │ Withdraw /    │  │
│  └──────────┬───────────┘   └──────────────────────┘   │ Plan Modals   │  │
│             │                                          └───────────────┘  │
│             ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │            WalletScreen — Admin Deposit Settlement Desk             │  │
│  │       (Attaches Firebase ID Token via AdminService Client)          │  │
│  └──────────────────────────────────┬──────────────────────────────────┘  │
└─────────────────────────────────────┼─────────────────────────────────────┘
                                      │ Bearer <Firebase ID Token>
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     Express Backend & Admin API                           │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    requireAdminAuth Middleware                      │  │
│  │  • Verifies Firebase ID Token (Admin SDK / Identity Toolkit REST)   │  │
│  │  • Enforces custom claim admin===true OR (allowlist + verified)     │  │
│  │  • Deduplicated ADMIN_EMAILS • Zero demo-admin-token bypass         │  │
│  └──────────┬───────────────────────┬──────────────────────────┬───────┘  │
│             │                       │                          │          │
│             ▼                       ▼                          ▼          │
│  ┌────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐  │
│  │ GET /setup-status  │  │ GET /pending-deposits│  │ POST /approve &   │  │
│  │ (Redacted Status)  │  │ (CollectionGroup Qry)│  │      /reject      │  │
│  └────────────────────┘  └──────────┬───────────┘  └─────────┬─────────┘  │
└─────────────────────────────────────┼────────────────────────┼────────────┘
                                      │                        │
                                      ▼                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   Cloud Firestore & Index Configuration                   │
│                                                                           │
│  • Collection Group Index: transactions (type ASC, status ASC)            │
│  • Atomic Transaction: users/{uid}/wallet/{symbol} & transactions/{txId}  │
│  • Client Security Rules: /wallet/{symbol} allow write: if false          │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **AdminSetupStatus**: Scoped interface containing `isConfigured: boolean`, `functionsDeployed: boolean`, and `notes: string[]` (no sensitive email arrays, project IDs, or credential flags).
  - **UserProfile**: Client-side `isAdmin` is stripped during profile updates so users cannot self-assign administrative status in local state or Firestore documents.
  - **Firestore Composite Index**: Collection group `transactions` indexed on `type` (`ASCENDING`) + `status` (`ASCENDING`) with `COLLECTION_GROUP` query scope.
- **Interactive Component & State Mapping**:
  - **Phase 1 Verification**: Confirm all nine previous fixes in source code (login/logout navigation to Home, logged-out vs. Demo separation, modal prop synchronization, portfolio USD math, 2FA & fee withdrawal validation, Earn task navigation, Firestore timestamp formatting, mining session rule fields, and Cloud Functions v1 compilation), check workspace/Git state, and remove the stray lockfile if present.
  - **Phase 2 Admin Hardening**:
    - Deduplicate `ADMIN_EMAILS` using a normalized `Set` in both the server and Cloud Functions.
    - Enforce `isEmailVerified` alongside custom claims or allowlisted emails in `requireAdminAuth`, and remove the `demo-admin-token` block completely.
    - Protect `GET /api/admin/setup-status` with `requireAdminAuth` and return only minimal safe boolean fields (`isConfigured`, `functionsDeployed`, `notes`).
    - Update the client admin service to send the authenticated user's Bearer token when requesting `/api/admin/setup-status` and update the Wallet Admin Desk setup panel to render the sanitized status fields cleanly.
    - Ensure `isAdmin` is excluded from client-writable profile updates in the authentication service.
  - **Phase 3 Firestore Index Configuration**:
    - Create the Firestore composite collection-group index configuration for `transactions` (`type` ASC, `status` ASC) and link `"indexes": "firestore.indexes.json"` in the Firebase configuration file.
  - **Phase 4 Validation & Reporting**:
    - Execute root TypeScript check (`npm run lint`), production build (`npm run build`), Cloud Functions build (`npm --prefix functions run build`), and runtime HTTP verification of admin endpoints, then present the complete evidence-based report.
