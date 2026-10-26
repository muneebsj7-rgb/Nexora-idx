# Fix Firestore `FAILED_PRECONDITION` Missing Index Error in Admin Endpoints

## Root Cause
The backend endpoints `GET /api/admin/pending-requests`, `GET /api/admin/pending-deposits`, and `POST /api/admin/reconcile-settlements` execute Firestore `collectionGroup('transactions')` queries filtering on both `type` and `status`. Because a `COLLECTION_GROUP` composite index (`status` ASC, `type` ASC) has not yet been provisioned in the remote `nexora-mine` Firebase project, Firestore rejects the query with `Error: 9 FAILED_PRECONDITION: The query requires an index`.

## Proposed Changes

### 1. Automatic Index-Free Subcollection Fallback (`/server.ts`)
- Add a shared helper `queryTransactionsWithFallback(db, filters, limitCount)` in `/server.ts`:
  - First attempts the `collectionGroup('transactions')` query if composite collection-group indexes are available.
  - When Firestore returns `FAILED_PRECONDITION` (`code === 9` or message containing `requires an index`), remembers that the collection-group index is not yet provisioned and transparently falls back to scanning `users/{uid}/transactions` subcollections across registered users (`db.collection('users')`), filtering matching `status` and `type` records in memory.
  - Single-collection queries on `users/{uid}/transactions` use Firestore's built-in automatic collection indexes and never require manual composite or collection-group index creation.
- Apply `queryTransactionsWithFallback` to:
  - `GET /api/admin/pending-requests`
  - `GET /api/admin/pending-deposits`
  - `POST /api/admin/reconcile-settlements`

### 2. Sync Composite Index Definitions (`/firestore.indexes.json`)
- Add the (`status` ASC, `type` ASC) `COLLECTION_GROUP` composite index definition alongside (`type` ASC, `status` ASC) in `/firestore.indexes.json` so both field orderings are covered when indexes are deployed.

### 3. Verification
- Add a regression test in `/tests/adminAuthorization.test.ts` verifying that `GET /api/admin/pending-requests` succeeds and returns matching pending deposits, rewards, and withdrawals even when `db.collectionGroup('transactions')` throws `9 FAILED_PRECONDITION: The query requires an index`.
- Run the test suite, `compile_applet`, and `lint_applet`.
