# Database V2 Phase C — Financial Integrity and Payment Concurrency

Completed 2026-10-03 (Asia/Karachi) on `development`, baseline `dc837b6`. No staging, commit or push.

## Movements and balance

Payment remains the immutable receipt. New receipts retain tenant, authenticated recorder, operation key/request hash, server posting instant and optional cash-shift attribution. Original amount, method, reference, received time and acceptance status remain historical evidence; refunds never edit/delete the receipt.

New append-only InvoiceAdjustment supports CHARGE, DISCOUNT, WRITE_OFF, REFUND and VOID. Each records amount, reason, actor, server instant and operation identity; REFUND links the exact received Payment in the same invoice. Cash refunds can link the posting cashier's active shift. VOID amount is the remaining effective charge, including zero for an already credited invoice. Normal initial pricing stays in the original invoice/line snapshots.

One Decimal calculation is used by every mutation:

```text
effective charge = original grandTotal + CHARGE - DISCOUNT - WRITE_OFF - VOID
net paid = accepted receipt amounts - REFUND
amountDue = effective charge - net paid
```

Negative balances, overpayments and excessive credits/refunds are rejected and rolled back. Original grandTotal and line prices are retained. PostgreSQL checks/FKs and three small guard functions protect movements, original issued sale snapshots and deferred movement/projection consistency. New payment-positive/evidence checks are NOT VALID to retain pre-existing anomalies without rewriting them; new rows are still checked.

## Locks, retry and states

Every money mutation locks/re-reads the tenant's invoice inside its transaction, validates against accepted history, inserts evidence and reconciles the projection before commit. Lock order is invoice, branch cash advisory lock when applicable, then cash-shift/report rows. Shift close uses the same branch cash lock. This follows [PostgreSQL row-lock and consistent-order guidance](https://www.postgresql.org/docs/current/explicit-locking.html).

Operation keys are required, 8–100 safe characters, unique per tenant within receipts and separately within adjustments. Normalized payload hashes bind invoice, actor and intent; identical retries reuse the movement and return the latest invoice projection, while changed intent is rejected. The browser retains up to 100 ambiguous pending request identities in memory, without storing financial truth. Timeout retries reuse keys during that browser session; callers retaining their own key can retry after reload.

- DRAFT: cannot accept money or adjustments.
- ISSUED: accepts receipts up to the locked current due.
- CLOSED: exact settlement; charges or partial refunds can reopen to ISSUED.
- REFUNDED: all accepted received funds have been returned, net paid zero; remaining original charge is still shown as due. Terminal for new receipts/adjustments except explicit void. Partial refunds with retained funds remain ISSUED unless already settled by credits.
- VOIDED: explicit cancellation evidence, zero net funds and effective charge; no new receipts. Received funds must first be refunded. Actor/reason/time are retained.

Administrative `POST /billing/invoices/:id/refunds`, `/adjustments`, `/voids` require BILLING_ADJUST, currently ADMIN through the existing superuser rule. PAYMENT_RECORD retains its existing operator permission. No refund/adjustment UI or RBAC redesign was added.

## Shares, cash and multiple workstations

Any refund, discount/write-off or void conservatively suspends the original entire doctor liability: CALCULATED/PAYABLE becomes REVERSED; PAID/SETTLED becomes CLAWBACK_PENDING. Original rate, calculated amount and payout evidence remain. Reversal is not automatically undone by repayment; reviewed reinstatement/payout/clawback settlement is deferred. Pending summaries exclude reversed/clawback liabilities and expose clawback paid evidence; affected summary arithmetic uses Decimal with number conversion only for existing response presentation.

One shift remains open per branch. New CASH receipts/refunds are assigned only to the matching branch's opening cashier during the active shift, retaining a single shift ID rather than inferring overlapping time windows. Expected cash is attributed receipts minus attributed refunds. Close locks, re-reads and snapshots exact Decimal totals once; only the opening cashier reconciles it. Other cashiers' cash, bank payments and other branches are excluded. Cash without a qualifying shift remains unassigned. Legacy closed snapshots remain unchanged; unknown historical actors are never guessed. A shift containing qualifying legacy cash with unknown cashier/time requires reviewed reconciliation before close.

Post-commit `invoice:changed` hints reuse the authenticated tenant WebSocket room. Invoice/payment/report pages refetch on hints, reconnect, focus and local payment completion/rejection. Missed hints cannot authorize money operations. Current, tracking and historical report previews re-read current financial eligibility server-side. Printing rechecks under the invoice/report locks after rendering, immediately before recording print authorization and returning bytes. That committed authorization orders printing against refunds/voids; later financial changes cannot revoke bytes already delivered. Clinical versions and canonical PDF bytes never change because of financial mutations.

## Migration and verification

New additive migration `20261003030000_c_financial_integrity` adds nullable legacy Payment metadata, InvoiceAdjustment and supporting keys/guards. No DROP, destructive enum replacement, old-column NOT NULL tightening, data rewrite, reset, seed or db push. All eleven prior SQL files and migration lock remain byte-identical.

Generate/validate, manual SQL review and fresh disposable migration checks preceded normal operational deploy. All 12 migrations are healthy, zero unfinished failures; supported Prisma DDL diff empty. Before/after invoices, lines, payments, shares and shifts remain zero; retained monetary/status projection hash matches. No operational fixtures.

Eleven focused groups A–K passed: concurrent/exact/idempotent receipts; partial/concurrent refunds; unpaid/paid void safety; doctor reversals; cash attribution/close concurrency; receipt/adjustment rollback; stale client payment/report eligibility including refund during rendering and subsequent reuse of identical canonical bytes. PDFs used cleaned temporary roots and mocked rendering.

Existing API 25, shared 19, database unit 4, B1 9, B2 9, ORM 5, built API smoke 1 passed: **83 total including Phase C, zero failed/skipped**. All four builds/typechecks and final whitespace checks pass. Two final server refinements received a targeted rebuild/typecheck and focused rerun; unrelated suites were not repeated. Initial fixture/wrapper and over-restrictive line-insertion guard failures were repaired before deploy.

Deferred: ERP/general ledger, gateways, doctor settlement/reinstatement, legacy reconciliation, cash hardware/drawer redesign, financial correction UI, numbering conversion, role hardening, backups, timestamp conversion, sync/auth/notification redesign and dependency upgrades. Prisma CLI/client/adapter remain 7.10.0; prior RSS/advisory observations and existing pg/test warnings remain. Database-owner DDL/TRUNCATE bypass limitations are unchanged.
