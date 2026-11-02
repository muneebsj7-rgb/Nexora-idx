# Nexora Mine — Phase 5.4: Independent Nile Contract & Endpoint Validation Plan

Independently authenticates the TRON Nile Testnet USDT (TRC20) smart contract (`TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` / `41eca9bc828a3005b9a3b909f2cc5c2a54794de05f`) and all 5 TronGrid Nile endpoints using strictly read-only live queries before any testnet funds are sent.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Phase 1 Decisions**
> - **Decision 1 (Live Probe + Admin Endpoint)**: Execute the live read-only Nile contract & endpoint validation now, and expose a read-only `GET /api/admin/tron-contract-check` route (plus a button in the Admin **Cloud Setup** drawer) so you can re-verify contract & endpoint health from your iPhone anytime.
> - **Decision 2 (Public Read-Only Contract Probe vs. Deposit Verification Key Requirement)**: Allow the read-only contract/endpoint metadata probe (`verifyTronContractAndEndpointsReadOnly`) to query `https://nile.trongrid.io` even if `TRONGRID_API_KEY` is not set in the current container, while keeping `TRONGRID_API_KEY` strictly mandatory for deposit verification (`verifyTrc20TransferOnChain`).

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Independent Reference Authentication**: Verifies `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` against official TRON Nile Testnet documentation (`nileex.io` faucet & official TRON developer docs) and distinguishes it from deprecated/unused testnet contracts.
  2. **Live Read-Only On-Chain Contract Inspection (`https://nile.trongrid.io`)**:
     - Queries `/wallet/getcontract` to confirm `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` (`41eca9bc828a3005b9a3b909f2cc5c2a54794de05f`) exists on Nile, has deployed TVM bytecode, and exposes the standard TRC20 `Transfer(address,address,uint256)` event in its ABI.
     - Queries `/wallet/triggerconstantcontract` (`decimals()`, `symbol()`, `name()`) to prove on-chain that the contract returns `decimals = 6` and `symbol = "USDT"`.
  3. **Live Read-Only Endpoint & Parser Validation**:
     - Queries `/wallet/getnowblock`, `/walletsolidity/getnowblock`, `/v1/contracts/TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf/events?event_name=Transfer&limit=1`, and tests `/wallet/gettransactionbyid`, `/wallet/gettransactioninfobyid`, and `/v1/transactions/{txID}/events` against a real Nile on-chain USDT transfer to confirm every endpoint URL and response parser works safely.
  4. **Zero Side Effects**: Sends zero funds, writes zero `verifiedPayments` or `depositAttributions` records, settles zero deposits, deploys nothing, and keeps mainnet disabled.

---

## 2. User Experience & Visual Design

- **Key User Flows (iPhone Admin Console — Cloud Setup Drawer)**:
  - Inside **Admin Financial Verification & Settlement Desk → Cloud Setup**, an administrator can view the pinned network (`nile`), Base58 contract (`TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf`), verified Hex41 (`41eca9bc828a3005b9a3b909f2cc5c2a54794de05f`), and tap **Probe Nile Contract & Endpoints (Read-Only)** to view live on-chain confirmation of bytecode presence, `symbol() === "USDT"`, `decimals() === 6`, `Transfer` ABI signature, and latest/solidified Nile block heights.
- **Visual Identity & Theme**: Matches the existing dark obsidian/emerald Admin Desk (`#080B12` panel, `#00D6A3` verified indicators, `#25B9F3` monospace telemetry).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: On-Chain Constant Calls (`triggerconstantcontract`) + ABI Inspection (`getcontract`)**
  - *Chosen Approach*: Combine `/wallet/getcontract` (to inspect deployed bytecode and the `Transfer(address,address,uint256)` ABI event descriptor) with `/wallet/triggerconstantcontract` calls to `decimals()` and `symbol()`.
  - *Why*: Proves directly from the Nile TVM state that `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` is an active 6-decimal USDT TRC20 token contract emitting the exact `Transfer` event signature expected by our verifier.
- **Decision 2: Strict Separation Between Read-Only Contract Probe and Deposit Verification**
  - *Chosen Approach*: `verifyTronContractAndEndpointsReadOnly()` never accesses Firestore and can use public read-only TronGrid access if `TRONGRID_API_KEY` is absent, whereas `verifyAndRecordTrc20Deposit()` continues to require `TRONGRID_API_KEY` (`requireApiKey: true`) and fails closed on any missing credential.
  - *Why*: Allows immediate live verification of the Nile contract and endpoints from the current environment without weakening deposit verification security.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌────────────────────────────────────────────────────────────────────────────┐
│            GET /api/admin/tron-contract-check (Strictly Read-Only)         │
│                   verifyTronContractAndEndpointsReadOnly()                 │
└───────────────────┬───────────────────────────────────────┬────────────────┘
                    │                                       │
                    ▼                                       ▼
┌─────────────────────────────────────────┐ ┌────────────────────────────────┐
│   Nile Contract Authenticity Probes     │ │  Nile Endpoint & Parser Probes │
│ • POST /wallet/getcontract              │ │ • POST /wallet/getnowblock     │
│   -> bytecode length > 0                │ │ • POST /walletsolidity/getnow… │
│   -> ABI has Transfer(address,address,  │ │ • GET  /v1/contracts/.../events│
│      uint256) event                     │ │ • POST /wallet/gettransaction… │
│ • POST /wallet/triggerconstantcontract  │ │ • POST /wallet/gettransaction… │
│   -> decimals() === 6                   │ │   infobyid (log topic0 & data) │
│   -> symbol()   === "USDT"              │ │                                │
└─────────────────────────────────────────┘ └────────────────────────────────┘
```

- **Zero-Write Guarantee**:
  - `verifyTronContractAndEndpointsReadOnly()` takes no `FirestoreLike` instance and performs zero database reads or writes.
  - `GET /api/admin/setup-status` and `GET /api/admin/tron-contract-check` are strictly read-only `GET` routes protected by `requireAdminAuth`.
