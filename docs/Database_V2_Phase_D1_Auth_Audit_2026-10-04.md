# Database V2 Phase D1 — Authentication, Audit and Invoice Discounts

Completed 2026-10-04 (Asia/Karachi) on `development`, starting at `e78b0bd`.

## Durable authentication

`AuthSession` stores only a SHA-256 digest of an opaque, cryptographically random
32-byte token. Its tenant/user composite foreign key enforces ownership. Sessions
record creation, last activity, expiry and durable revocation with a reason; roles,
branches and names are never stored as authorization snapshots.

Each protected HTTP request asynchronously joins the session to the current active
User and Tenant and checks PostgreSQL's current time. The unchanged PermissionGuard
uses that fresh role. WebSocket handshakes also await durable validation. Existing
connections carry change hints only; protected reads/actions still require fresh
authorization. This does not add a distributed notification adapter.

The idle lifetime remains 12 hours, with last-seen/expiry writes throttled to one
minute (idle expiry can be up to one minute earlier than the last request). Expired
or revoked tokens cannot be extended. A non-overlapping timer deletes at most 200
eligible sessions and 200 stale attempt records per minute, retaining them for at
least one day. Validity does not depend on the timer or successful housekeeping.

Logout durably revokes and audits once. Deactivation revokes every session in the
same user-update transaction; reactivation cannot revive old sessions. Role and
branch changes preserve sessions but affect the next request. Self password change
verifies the current bcrypt password, retains the authenticated requesting session
and revokes other sessions. Administrative password resets revoke all sessions. A
direct/system profile call without an authenticated session context revokes all.
Existing hashes remain compatible and are not rewritten during migration.

`LoginAttempt` is keyed by SHA-256 of the trimmed, lower-case attempted username,
including nonexistent names. A row-locking upsert and transaction serialize failed
increments and successful resets across instances: five failures within 15 minutes
cause a 15-minute lockout. Generic failures and lockout responses do not distinguish
whether an account exists. Anonymous attempts belong to the configured default
tenant, or the first existing tenant in this single-tenant installation when no
default is configured. No tenant is invented when the database is uninitialized.

## Transactional audit

The existing `AuditLog` is reused. The following high-level events are wired inside
the corresponding business transaction:

| Area | Events |
| --- | --- |
| Authentication | LOGIN_SUCCESS, LOGIN_FAILURE, LOGIN_LOCKOUT, LOGOUT |
| Users | USER_CREATE, USER_DEACTIVATE/REACTIVATE, ROLE_CHANGE, BRANCH_ASSIGNMENT_CHANGE, PASSWORD_CHANGE, profile change flags |
| Clinical | RESULT_RELEASE, RESULT_REOPEN (legacy), CORRECTION_CREATED, AMENDMENT_RELEASE, REPORT_VERSION_RELEASE |
| Financial | INVOICE_ISSUED, PAYMENT_RECORDED, REFUND, ADJUSTMENT, INVOICE_VOID |
| Configuration/catalog | SETTINGS_CHANGE for branding, print, discount mode and SMS configuration; catalog create/update/parameter replacement |

Audit insertion failure rolls back the business write, including session
revocations. Financial idempotent retries and unchanged report-version captures
do not create duplicate movement/release audits. Result values remain in immutable
clinical evidence rather than being copied into audit JSON.

Request-scoped AsyncLocalStorage supplies the authenticated actor, IP and bounded
user-agent when available. Login/logout and clinical/financial services also pass
their known actor explicitly. System/anonymous events have a nullable actor and an
explicit `SYSTEM_OR_UNAUTHENTICATED` context. Metadata is limited to 20 scalar
fields per snapshot and 1,000 characters per string; credential/token/hash/logo/PDF
and result-value keys are excluded. SMS wording and provider credentials are not
copied. Existing historical audit rows are not changed.

PostgreSQL rejects audit UPDATE, DELETE and TRUNCATE. A database owner can alter
triggers; the separate least-privilege runtime-role rollout remains deferred.
`GET /settings/audit` is ADMIN-only, tenant-scoped and read-only. Filters:
`entityType`, `entityId`, `actorId`, `action`, inclusive ISO `from`/`to` instants,
`page` (1–10,000), `limit` (1–100; default 50). No audit frontend was added.

## Invoice discount modes

Configuration key `invoice_discount_mode` holds `mode: PER_LINE | INVOICE_LEVEL`.
Absent configuration defaults to PER_LINE. The small Admin setting affects new
invoices only. Invoice creation locks the tenant and reads the current setting
inside its transaction; configuration changes take the same lock.

Invoice `discountMode`, `invoiceDiscountAmount` and optional reason are permanent
sale snapshots. Historical rows receive PER_LINE/zero defaults; no historical
discounts or totals are recalculated. PER_LINE preserves test/package discounts.
INVOICE_LEVEL requires zero line discounts and accepts one nonnegative fixed
amount, with at most two decimal places and no greater than subtotal:

`grandTotal = subtotal - invoiceDiscountAmount + taxTotal`.

`discountTotal` reflects this initial discount for existing consumers. No initial
InvoiceAdjustment is created, so the Phase C projection cannot count it twice.
Native checks reject mixed discounts, and issued discount snapshots are immutable.
Existing invoice locks, Decimal balances, refunds, voids and idempotency remain in
use. The Visit screen hides line discount fields in invoice mode and previews
subtotal/discount/grand total near one Invoice Discount input. Print templates use
the Invoice snapshot, remove the line discount column for invoice mode and print
one totals discount row. PER_LINE print presentation is preserved. Settings
refresh on return to the window and after creation errors; the server remains
authoritative even when another workstation's display is stale.

## Migration and validation

New additive migration: `20261004010000_d1_auth_audit_discount`. SQL was reviewed,
tested on fresh disposable databases, then deployed normally to local PostgreSQL.
No reset, seed, db push, credential mutation, enum replacement or data deletion.
The 12 prior migration SQL files and migration lock file match their pre-pass
SHA-256 hashes. All 13 migrations are applied; supported Prisma schema diff is
empty. Native constraints/triggers were verified by the disposable tests.

Focused suite `pnpm --filter @lms/database test:d1`: **18/18 passed**. D1 A–L cover
restart/independent clients, logout, deactivation, fresh role/branch, expiry without
cleanup, persistent lockout for known/unknown usernames, concurrent increments and
successful resets, self/admin password policies, audit failure rollback, native
append-only enforcement and audit secrecy/bounded ADMIN listing. Six discount
checks cover both modes, one initial deduction, mixed-input rejection, historical
snapshots, one printed discount row and concurrent discounted payment/refund.

Existing checks: API 25, shared 19, database unit 4, B1 9, B2 9, Phase C 11, ORM 5,
built API smoke 1; **83/83 passed**, **101 total** with focused tests. All four
workspace builds/typechecks pass. Prisma generate/validate and ordinary
`git diff --check` pass. Fresh test databases/artifact fixtures were removed and
shutdown checks left zero connections. No Phase A exhaustive suite was rerun.

Operational before/after counts: users **2 → 2**, audit_logs **0 → 0**,
auth_sessions **0 → 0**, login_attempts **0 → 0**. Existing invoice/payment/
adjustment/result/report/version/configuration counts remain zero. The existing
row fingerprint is unchanged; no operational account was used for login tests.
Evidence/docs contain counts and digests, not operational PII or credentials.
Focused credentials/tokens are generated at runtime and not printed. The existing
tracked bcrypt compatibility fixture remains; no new fixed credential fixture was
introduced.

Prisma CLI/client/adapter remain **7.10.0**, pg **8.23.1**, with unchanged lockfile,
`prisma7.config.ts` and client/pool ownership. The prior measured Prisma 7 RSS
increase (112–124 MiB versus about 51 MiB for the small ORM process) remains an
observation. This pass's larger built API smoke measured 271.69 MiB RSS and
558.12 ms startup; different workflows are not directly comparable. No duplicate
runtime PrismaClient/pool or leaked shutdown connection was identified. Existing
pg concurrent-query deprecation and Node VM Modules warnings remain; no dependency
upgrade or memory redesign was attempted.

## Deliberate deferrals

D2 notification retries/polling, cloud sync, runtime DB-role rollout, settlement,
backup/restore, financial correction/report-history UI, timestamp/identifier
conversions and dependency upgrades remain out of scope. Existing in-memory v1
tokens cannot be imported and require login after API restart. A browser can still
display cached identity/settings briefly; PostgreSQL decides protected actions.
No commit, staging, push, branch change or production service restart was performed.
