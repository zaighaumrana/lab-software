# Database V2 Phase F1 — durable one-way public sync backbone

2026-10-04 (Asia/Karachi). Branch `development`, committed E2 baseline `6928f02`.

## Authority and scope

Local PostgreSQL remains the only clinical, financial and operational authority.
F1 writes an explicit read-only public projection; there is no cloud-to-local
patient/result/payment write, conflict resolution or public inbound connection.
Neither the LAN/API nor local PostgreSQL is exposed. No public website repository,
Supabase schema/storage or live cloud adapter is changed. No dependency upgrade.

The API binds an **unconfigured transport**, so this release cannot contact a cloud
provider. `MemoryPublicSyncTransport` is an explicit deterministic test receiver,
not an operational cloud or an alternative queue. All tests use synthetic local
data, restricted disposable PostgreSQL logins and loopback HTTP where necessary.

## Existing outbox assessment and additive migration

The original `SyncOutbox`/`sync_outbox` dates to the initial migration. It has id,
tenantId, status (QUEUED/SYNCING/SYNCED/FAILED/RETRYING/ABANDONED), eventType,
aggregateType/id, payload, attempts, lastError, syncedAt and createdAt/updatedAt.
Targeted source searches found no existing application producer or dispatcher.
The inspected operational table has zero rows. This supports “not operational in
the inspected installation”; it cannot establish usage in every historical deployment.

F1 reuses that table, adding nullable projectionKey/revision, nextAttemptAt,
claimedBy, claimExpiresAt, dispatchStartedAt and failureCode. Report gains a
nullable random UUID publicSyncKey and a zero-default integer publicSyncRevision.
Revision increments are serialized by invoice then report row locks. Integer
overflow fails the transaction rather than wrapping; the wire uses decimal strings
and the queue uses bigint. A report would require over two billion distinct
publications to reach this ceiling; no timestamp or clinical identifier conversion.

New migration `20261004030000_f1_public_sync` is additive. Fourteen prior SQL
migrations and migration_lock.toml remain byte-for-byte unchanged. There is no
DROP/CASCADE, reset, seed, db push, historical payload rewrite or event backfill.
Existing generic outbox rows have null F1 fields and are ignored by this dispatcher.
Native guards retain F1 intent identity/payload/creation time, prevent deletion and
decreasing attempts, and prevent projection identity/revision moving backwards.
Unique indexes reject duplicate key/revision and more than one active lease per key.
New trigger functions are SECURITY INVOKER with PUBLIC execution revoked; E1
restricted-runtime behavior is preserved without new elevated application grants.

## Explicit public-report/v1 allowlist

The only wire fields are:

| Field | Meaning |
| --- | --- |
| schemaVersion | `public-report/v1` |
| projectionKey | Random opaque UUID for one report projection |
| projectionRevision | Monotonically increasing positive decimal string |
| trackingId | Existing public lookup locator; **not access authorization** |
| reportReady | An approved immutable current B2 version exists |
| onlineEligible | Current Phase C delivery rule permits online access |
| currentVersion | Approved current version number, or null |
| artifact | Logical key, SHA-256 and size, or null |

No patient name, phone, CNIC, DOB, address, labNumber/mrcNumber, internal tenant,
branch/invoice/report/version IDs, financial totals/movements, notes, commissions,
audit/notification evidence, users/sessions, credentials or whole entities enter
the payload. Internal tenant/aggregate IDs remain local queue-routing metadata.
There is no weak identifier hash or browser-only verifier. F2 must implement
server-side authorization, rate limiting, safe report lookup and private PDF
delivery; knowing trackingId/projectionKey never suffices to read a medical PDF.

The producer names every allowed field. Dispatcher and mock receiver reject extra
top-level or nested fields, inconsistent eligibility/version/artifact identities,
unsupported contracts and same-revision/different-content conflicts.

## Transaction coupling and convergence

Invoice creation records a NOT_READY projection. The central laboratory report
recomputation wrapper records initial release, approved amendments and other
changes, including the legacy amendment path. Phase C `reconcileInvoice` records
payment/refund/charge/discount/write-off/void eligibility changes. B2 canonical
artifact metadata publication now records its intent inside the same transaction.
Rendering and filesystem publication remain outside that transaction.

Each relevant transaction contains its domain mutation, existing audit and required
outbox insertion. An insertion failure rolls everything back; no error is swallowed.
The helper rereads invoice/report/current version under the established lock order.
It uses the existing authoritative `canDeliverReport` rule over Phase C's committed
invoice projection, with no second financial calculation or frontend truth.

Unchanged projection bodies are idempotent and create no revision/event. Changed
bodies increment the report revision and insert a frozen queue row. Obsolete
QUEUED/RETRYING rows become ABANDONED/SUPERSEDED, retaining payload/timestamps and
attempt evidence; active rows are retained. No queue cleanup deletes audit evidence.
These are current-state upserts, not an event-sourced cloud copy of internal tables.

## Dispatcher, transport and bounded failure

API startup registers a 10-second timer only when master enablement, normal mode
and configured transport permit it. A local running promise prevents overlapping
cycles; shutdown stops the timer and awaits the running cycle. Each cycle recovers
at most ten expired leases and dispatches at most ten intents. PostgreSQL holds all
correctness state; independent connections use FOR UPDATE SKIP LOCKED, a short
aggregate advisory claim lock and the unique active-key index. Claims have a
random owner and a 120-second lease. The dispatch-start marker and attempt count
commit before transport begins.

During a transport attempt, a **queue-only transaction** holds that outbox row lock,
with a 30-second transaction timeout and 20-second AbortSignal transport deadline.
Recovery uses SKIP LOCKED, so even an expired lease cannot cause a second live
attempt on the same aggregate. This transaction locks no clinical/invoice/report
rows and performs no business mutation. Domain transactions can keep inserting
newer intents while it runs. Every future live adapter must honor the supplied
AbortSignal, including aborting its underlying request; it must not detach work or
continue network requests after its promise settles. F1's local mock obeys it.

Completion is owner fenced; success also requires the unexpired lease. A dead
process releases its row lock, and an expired durable lease returns to retry.
Crash after remote apply but before acknowledgement replays the identical immutable
revision. The receiver must atomically ignore older revisions, accept identical
same revisions, reject conflicting same revisions and apply newer revisions.
Private content-addressed artifact upload is also idempotent. Arrival order is
never authoritative. A newer revision supersedes the previous public pointer and
eligibility; retained bytes are not a public access grant.

Transient network/timeout/rate-limit/5xx failures use 1/5/15/60-minute backoff and
at most five attempts. Permanent payload/schema/auth/artifact/conflict failures
become FAILED immediately. Crash recovery is also bounded by the attempt ceiling.
Only allowlisted error codes are persisted/logged, never raw responses, secrets,
HTML, medical data or provider request bodies. Rows retain attempts, created/updated
times, lease/start metadata while active, last bounded error and successful time;
this is intentionally not a full per-attempt provider-response ledger.

Offline failure happens after the clinical/financial transaction has committed.
Registration, billing, results, reports and printing remain local; pending sync
accumulates. The only synchronous dependency is the local PostgreSQL intent write.
Cloud availability never determines whether local laboratory work succeeds.

## Artifact and eligibility mapping

An unpaid/partial/ineligible approved report has reportReady=true,
onlineEligible=false and artifact=null: future public lookup may show collection
readiness but cannot download a PDF. Paid/financially eligible reports have
onlineEligible=true; actual online availability additionally requires artifact.
Refunds/charges/voids create a new revoking projection as appropriate. Eligibility
revocation is eventually propagated; an offline cloud cannot receive immediate
revocations. F2 must define access/expiry behavior for that boundary explicitly.

Artifact metadata comes exclusively from the current immutable ReportVersion.
Dispatcher reads canonical B2 bytes through ReportArtifactStore, validating path
scope, size and SHA before transfer. The public logical key uses opaque projection
identity/version/content SHA, never a local filesystem path or internal tenant ID.
No cloud rendering, temporary PDF, or legacy live-result PDF is introduced. A
missing/corrupt recorded artifact fails permanently; it is never regenerated.
Initial metadata not yet generated means artifact=null. Creation remains the
existing local B2 workflow; F1 does not render in the sync worker.

Open corrections preserve the prior approved B2 current version. An approved new
amendment changes the public current version immediately and clears the old artifact
reference until its new canonical artifact is recorded. Historical local versions
are retained. F2 storage must remain private and authorize every download against
the latest receiver projection, rather than expose permanent public blob URLs.

## Enablement, observability and bootstrap

Master `PUBLIC_SYNC_ENABLED` defaults false. Per-tenant `public-sync` Configuration
defaults disabled. Both must be true, recoveryHold false, recovery mode false and
transport configured to dispatch. Disabling retains unsynced rows; it does not
cancel local work or discard intents. No live credentials/configuration were added.

ADMIN-only, session/permission guarded routes use the authenticated tenant:

- GET `/public-sync/status`: pending/failed count, oldest pending age, latest success,
  effective enablement and recovery/configured flags; no patient or queue payloads.
- PUT `/public-sync/configuration` with `{ "enabled": false }` or true. Enabling
  requires the master and configured transport, and cannot clear a recovery hold.
- POST `/public-sync/bootstrap` with optional limit (1–50, default 25) and afterId:
  current approved report projections, bounded keyset pages, serialized idempotent
  writes and audit. Response provides counts and nextAfterId for maintenance only.

Bootstrap works without internet/transport and never runs at startup. Repeat pages
do not fabricate events for unchanged state or historical timestamps. Existing
unversioned legacy reports are conservatively excluded until approved B2 versions
exist. F1 proof uses disposable data only; no operational bootstrap was performed.
Failed/recovery-held intents require deliberate maintenance, not an automatic resend
UI or silent unbounded attempt reset.

## Backup, recovery and F2 cutover boundary

SyncOutbox and publication identity/revisions are ordinary database state included
in E2 backups; no new backup stream or secrets in manifests. LABFLOW_RECOVERY_MODE
blocks startup/cycles/claims/recovery/direct dispatch, including with enabled
configuration and an injected configured receiver. Exact restored comparisons and
read-only E2 smoke happen before any cutover changes.

Explicit owner E2 cutover then holds unresolved F1 rows as ABANDONED/RECOVERY_HOLD,
clears lease/due metadata, retains frozen evidence, sets tenant config disabled
with recoveryHold=true and audits held counts. Existing SMS reconciliation/session
revocation remains intact. Turning recovery mode off cannot clear that durable hold.

An old backup may contain revision counters below cloud state, or the same revision
with different post-disaster facts. **Do not blindly replay or enable it.** F2 must
implement an explicit administrator-reviewed reconciliation of receiver high-water
revisions and fresh authoritative local projections, safely advancing publication
metadata above previously accepted revisions before clearing recoveryHold. No
medical or financial truth is imported from cloud. F1 intentionally provides no
hold-clearing bypass because the receiver/cutover protocol does not yet exist.

The previously blocked operational backup still requires a user-selected suitable
external/NAS destination; no application/source-drive backup is created or guessed.

## Validation and operational result

Focused F1 groups A–L prove required rollback (payment, release and artifact),
offline durability, independent worker claims/live lease expiry, crash fencing,
revision ordering/conflicts, lost-ack idempotence, financial grant/revocation,
amendment current version, exact canonical bytes/corruption rejection, recovery and
disable switches, bounded/idempotent bootstrap, allowlist/immutable evidence and
actual ADMIN-only HTTP authorization. Restricted-runtime privilege checks and zero
remaining fixture connections are part of the harness.

One broader completion regression is justified by domain transactions, database
integrity, locking/idempotency, financial/report boundaries and disaster recovery:
B2 report/native guards, Phase C billing/stale-workstation gating and E2 full
backup/restore/cutover. This covers the affected boundaries without rerunning every
historical phase. Required generate/validate, all workspace builds and typechecks
are included. Exact command results and final operational/Git evidence are appended
below after completion.

F2 remains responsible for the real receiver/storage adapter, atomic cloud upsert,
private artifact delivery, secure verification/public lookup, live credential
provisioning and reviewed disaster-recovery publication reconciliation. No website,
booking synchronization, bidirectional sync, SaaS multi-tenancy or public/LAN
deployment work is part of F1.

### Completed evidence

- Focused F1: all twelve distinct A–L groups passed. The initial complete run
  passed A–K; L exposed a fixture expectation of HTTP 201 for the existing HTTP
  200 login route. Corrected the fixture and reran L only. A and K received only
  affected reruns for artifact-metadata rollback and serialized bootstrap evidence.
  No repeated historical full-suite development runs. All fixture connections close.
- One completion regression: B2 9/9, Phase C 11/11, E2 13/13 (33 existing groups).
  B2 covers native database/report membership/artifact integrity, C covers financial
  posting and stale workstation authorization, E2 covers full restoration, exact
  schema/fingerprints, restricted recovery startup and the new persistent sync hold.
  No unrelated Phase A/B1/D1/D2/SMS/E1 catalog rerun for test-count inflation.
- `pnpm db:generate`, `pnpm --filter @lms/database exec prisma validate`,
  `pnpm -r build` and `pnpm typecheck`: passed across all four workspace packages.
  Changed JavaScript syntax checks also passed. Existing pg concurrent-query
  deprecation warnings remain; no dependency upgrade or unrelated fix.
- Reviewed additive operational migrate deploy passed; fifteen migrations are
  current. Post-deploy `prisma migrate diff --from-config-datasource --to-schema
  prisma/schema.prisma --exit-code` reports no difference. Fourteen prior SQL
  files plus migration lock retain pre-change hashes. Schema changes are limited
  to F1 publication/queue metadata and integrity guards; no clinical/financial
  business rules or historical migrations were rewritten.
- Before/after all 45 application-table counts and row contents are unchanged:
  fingerprint `90ee7908c149e9535f5491badb398a9d735f7860daf55d8e1e7cf76f0652ee84`.
  Patients/invoices/reports/payments/results and sync_outbox are zero in the
  inspected operational installation. Only schema and Prisma migration history
  changed. No operational bootstrap, restore, cutover, backup, API restart, real
  SMS or real cloud write. The two F1 guards are SECURITY INVOKER; existing
  restricted operational login passes the read-only privilege self-check.
- Operational public sync master remains false and enabled tenant configurations
  remain zero. The startup adapter is unconfigured. Cloud/outbound recovery proof
  uses deterministic transports, never operational medical data.
- Prisma CLI/client/adapter remain 7.10.0 and pg 8.23.1. Lockfile, timestamp/instant
  workaround and prior security-advisory findings are unchanged, not newly audited
  in F1. Preserve the prior observed Prisma 7 small-process RSS increase
  (112–124 MiB versus about 51 MiB); no comparable new memory benchmark is claimed.
  Dispatcher reuses the existing PrismaService, with no extra operational client/pool.
- AGENTS.md now contains the permanent targeted validation policy and preserves
  all original history-entry requirements, using the explicitly user-requested
  ENGINEERING_HISTORY.md filename. Every original history entry is preserved.
- Git remains development at 6928f02, with no staging/commit/push. Ordinary tracked
  diff stat is 12 files, +119/-635; its old-history deletion is the unstaged rename
  and is paired with the preserved new ENGINEERING_HISTORY.md. Eleven new files
  are additionally untracked (six sync module files, history, F1 document, one
  migration and two tests); Git's ordinary diff stat omits them. All 23 changed
  paths are intentional. Tracked diff whitespace check and targeted credential
  pattern/ignored environment checks pass. Existing line-ending conversion
  warnings are informational, not whitespace failures.
