# Nexora Cloud Mining — Phase 4: Automatic Deposit Settlement Fix, Replay Protection & Live Verification Plan

This plan details the surgical backend, Cloud Function, Admin Settlement Console, and test-suite improvements required to ensure that unsettled deposits marked `CONFIRMED` or `APPROVED` in the Firebase Console are safely validated, deduplicated by payment reference, and atomically credited to the user's Available Balance once and only once.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Phase 4 Decisions**:
> - **Confirmed Decision 1 (Admin Settlement Console & Auto-Reconciliation)**: When an administrator opens the Settlement Console, unsettled `CONFIRMED` or `APPROVED` deposits with valid, unused payment references will be automatically reconciled via the trusted backend engine, while also surfacing an explicit manual **Approve / Reconcile** action for full operator control.
> - **Confirmed Decision 2 (Production Deployment & CLI Commands)**: All 18 settlement and security test suites, TypeScript checks, and production builds will be executed locally first; for external targets (`firebase deploy --only functions`, `firestore:rules`, and GitHub push) where live tokens or `.git` remotes are not mounted in the container, exact copy-paste CLI commands and live verification steps will be provided alongside verified runtime checks.

---

## 1. Overview & Core Concept

- **What It Does**: Eliminates the settlement dead-end when an administrator edits a deposit document's `status` to `CONFIRMED` or `APPROVED` in the Firebase Console, while adding deterministic global payment-reference (`txHash`) uniqueness so no transaction hash can ever be credited twice across the platform.
- **Target Audience / Persona**: Authenticated Nexora Cloud Mining users depositing supported digital assets (`USDT`, `BTC`, `ETH`, `BNB`) and authorized platform administrators (`muneebsj7@gmail.com` and `procurement.initialsaudi@gmail.com`) auditing and settling financial requests.
- **Key Value**: Guarantees atomic, single-credit wallet settlement (`users/{uid}/wallet/{assetSymbol}.balance`) with real-time frontend Available Balance synchronization (`onSnapshot`), zero client-side balance manipulation, and cryptographic-grade replay prevention.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **User Deposit Submission**: An authenticated user submits a deposit with a valid asset (`USDT`, `BTC`, `ETH`, `BNB`), amount $\ge$ minimum threshold, and transaction reference (`txHash`). The transaction is recorded in `PENDING_CONFIRMATION` state with zero wallet credit.
  2. **Console or Admin Approval**: Whether an administrator changes `status` to `CONFIRMED` in the Firebase Console or clicks **Approve** in the in-app Admin Settlement Console, the trusted settlement engine validates all invariants, locks the global payment reference (`paymentReferences/txhash_<normalized>`), increments `wallet/{assetSymbol}.balance`, and marks the transaction `COMPLETED` (`walletCredited: true`).
  3. **Live Available Balance Sync**: The active Firestore `onSnapshot` listener immediately streams the updated `balance` into the user's Home and Wallet screens, recalculating Available Balance in tabular numerals (`tabular-nums`) while keeping `lockedBalance` strictly isolated for pending withdrawals.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-precision dark institutional fintech console (`#05070A` canvas, `#0D111A` single-elevation cards, `1px` subtle slate borders).
  - *Typography & Hierarchy*: Crisp geometric sans display headers paired with `font-mono tabular-nums` for all cryptocurrency quantities, USD valuations, and transaction hashes.
  - *Interactive Feedback*: Instant status transitions in the Admin Settlement Console showing whether a deposit is `PENDING_CONFIRMATION` or `CONFIRMED (Unsettled — Ready to Reconcile)`, with clear error banners if a duplicate `txHash` or invalid amount is detected.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Authorized Reconciliation Policy (`allowManualCompletedStatus`)**
  - *Chosen Approach*: Restrict settlement of `CONFIRMED`, `APPROVED`, and `COMPLETED` (unsettled) statuses exclusively to authenticated admin reconciliation and verified backend triggers (`allowManualCompletedStatus: true`), while ordinary non-reconciliation calls continue to accept only `PENDING_CONFIRMATION` and `PENDING_REVIEW`.
  - *Why*: Prevents accidental or unauthorized status transitions from triggering wallet credits while ensuring intentional Firebase Console `CONFIRMED` edits by administrators can be reconciled cleanly.
  - *Alternatives Considered*: Globally permitting any status string in all settlement calls was rejected because it weakens state-machine discipline.
- **Decision 2: Global Payment Reference Locking (`paymentReferences/txhash_<normalized>`)**
  - *Chosen Approach*: Normalize every deposit `txHash` (`trim().toLowerCase()`, rejecting internal/placeholder markers or malformed strings) and atomically check/create `paymentReferences/txhash_<normalized>` inside the same Firestore `runTransaction` block that updates the wallet and transaction.
  - *Why*: Per-transaction idempotency (`deposit_approval_<uid>_<txId>`) only stops the *same* document from being credited twice; global reference locking prevents a user (or two colluding accounts) from submitting the same blockchain `txHash` across multiple deposit requests.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Settlement Data Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   Deposit Submission & Admin Trigger                       │
│  • Client Deposit Request (status: PENDING_CONFIRMATION, walletCredited:0) │
│  • Firebase Console Edit (status -> CONFIRMED / APPROVED)                  │
│  • In-App Admin Settlement Console (Auto-Reconcile + Manual Approve CTA)   │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│             Trusted Backend & Cloud Function Settlement Engine             │
│  1. Verify Admin Auth (Verified ID Token + Email + Admin Registry/Claim)   │
│  2. Validate Invariants (type=DEPOSIT, uid match, asset, minDeposit, hash) │
│  3. Atomic Firestore Transaction (READ ALL -> WRITE ALL):                  │
│     ├─ Read: transactions/{txId}, settlements/{id}, wallet/{asset}         │
│     ├─ Read: paymentReferences/txhash_{normalizedHash} (Global Uniqueness) │
│     ├─ Write 1: Lock paymentReferences/txhash_{normalizedHash}             │
│     ├─ Write 2: Increment users/{uid}/wallet/{asset}.balance (+ metadata)  │
│     ├─ Write 3: Mark transactions/{txId} COMPLETED & walletCredited: true  │
│     └─ Write 4: Record immutable users/{uid}/settlements/{settlementId}    │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                 Real-Time Client Subscription (onSnapshot)                 │
│  • WalletFirestoreService streams users/{uid}/wallet/{assetSymbol}         │
│  • HomeScreen & WalletScreen compute Available Balance (excluding locked)  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Atomic Invariants
- **Global Payment Reference Document (`paymentReferences/txhash_<normalized>`)**:
  - Stores `txHash`, `normalizedHash`, `userId`, `txId`, `settlementId`, `asset`, `amount`, and `settledAt`. If an existing document has a different `txId` or `userId`, the transaction aborts with `409 DUPLICATE_PAYMENT_REFERENCE` without modifying any wallet balance.
- **Authoritative Wallet Asset Document (`users/{uid}/wallet/{assetSymbol}`)**:
  - Stores `symbol`, `name`, `balance`, `lockedBalance`, `priceUSD`, `change24h`, and `updatedAt` in both the server engine and Cloud Function trigger so new and existing wallet documents remain 100% schema-aligned.
- **18-Suite Automated Verification Matrix**:
  - Covers valid pending deposit settlement, authorized `CONFIRMED` reconciliation, unauthorized status rejection, duplicate trigger idempotency, concurrent `Promise.all` approvals, cross-deposit duplicate `txHash` rejection, zero/negative amounts, below-minimum amounts, unsupported assets, missing/malformed references, non-deposit transactions, mismatched user IDs, rejected deposits, non-admin access rejection, client write blocks, withdrawal escrow/lock/unlock invariants, wallet metadata consistency, and unverified payment non-crediting.
