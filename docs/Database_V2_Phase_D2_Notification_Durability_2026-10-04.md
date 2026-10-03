# Database V2 Phase D2 — Notification durability

Completed 2026-10-04 (Asia/Karachi), on `development` from `afb9108`.

## Durable intent and immutable payload

SAMPLE_COLLECTED intent now belongs to the sample collection transaction with
SampleEvent and audit. REPORT_READY intent belongs to the authoritative clinical
release/report-version transaction. An intent or notification audit insert failure
rolls back the clinical mutation. No provider/network call runs inside these
transactions. Existing administrator-owned wording and event policy are retained:
one SAMPLE_COLLECTED per Booking, one REPORT_READY per Invoice using the existing
`Report`/invoiceId identity. Direct amendment keeps its previous no-new-SMS policy;
printing, payment and reads do not queue messages.

The Notification owns the frozen recipient, rendered local body, approved provider
template ID, mapped variables, message type, part count and event/patient identity.
Native guards reject payload/key mutation and deletion/truncation, preserving
idempotency even after failure. A later template or phone edit cannot retarget an
old intent. Disabled/missing configured events or no consent create no sendable
intent; invalid mapped payload creates a retained FAILED intent with a reason.

## Queue, lease, retries and evidence

PostgreSQL is the queue. NotificationDispatcher starts with the API, performs an
immediate recovery cycle and polls every 10 seconds without overlapping its own
cycles. Each cycle claims at most ten sends individually with `FOR UPDATE SKIP
LOCKED`; each claim receives a random owner and 120-second lease. Network I/O
runs after all database transactions end. Shutdown stops new work and awaits the
current cycle. No second PrismaClient/pool, broker or scheduling dependency was
introduced.

Before calling SENDPK, a second fenced transaction rechecks consent/readiness,
increments attempts and commits `dispatchStartedAt`. Ordinary QUEUED/due RETRYING
rows survive restart. An expired claim with no dispatch-start marker is safely
requeued. An expired marked claim is held as RECONCILIATION_REQUIRED and gets an
UNKNOWN attempt; it is never automatically resent. Owner checks fence obsolete
workers' completions. Historical SENDING rows without a lease also enter the hold,
without inventing historical provider-attempt evidence.

Automatic transient retries wait 1, 5 and 15 minutes, with four sends maximum.
Definite connection failures, rate limiting and explicit insufficient credit can
retry. Permanent recipient/template/variable defects stop; provider rejection also
stops automatic retry. Admin-only `GET /notifications/abandoned` lists at most 100
failed/abandoned/uncertain intents with ordered attempt evidence;
`POST /notifications/:id/retry` uses the same queue and frozen payload, retains the
attempt cap and refuses SENT, active SENDING and uncertain holds. It cannot repair
an invalid frozen payload or implement general resend. Existing request audit
context attributes human retries; background outcomes explicitly use system actor.

NotificationAttempt is append-only and unique per notification/attempt number.
While a provider call is in flight, its durable start marker/count live on the
Notification. Completion or expired-start recovery inserts the immutable attempt
with original start, completion, outcome, bounded provider ID/status and sanitized
summary; no attempt row is updated. The completion and Notification outcome/audit
commit together. Crashing or losing that transaction conservatively leaves the
marked lease recoverable as unknown. Attempts do not duplicate body/variables.
Database guards reject evidence updates/deletes/truncation, invalid outcomes,
negative/zero attempt numbers, reversed times and oversized summaries/errors.
Meaningful queued/sent/failed/abandoned/uncertain/delivered events use D1 audit;
minor retries remain in technical attempt history.

## Provider uncertainty and consent

Timeouts, uncertain HTTP/network failures and unrecognized replies preserve
RECONCILIATION_REQUIRED; provider acceptance is not inferred from HTTP 200 alone.
This prevents uncontrolled duplicate dispatch; it does **not** promise exactly-once
external SMS. A crash after marking dispatch but before actual I/O can also hold a
message that was never accepted. No-ID uncertainty requires future explicit
reconciliation; manual retry does not bypass the hold.

The existing delivery endpoint accepts a returned provider ID. SENDPK documents
GET/POST support but no concrete delivery response schema/numeric status mapping.
Send and delivery calls use POST and a 15-second timeout covering headers/body.
Only exact descriptive DELIVERED/FAILED/PENDING replies (plain text or recognized
JSON fields) are interpreted. Other replies stay UNKNOWN; no numeric guesses.
Accepted or uncertain intents with an ID receive at most three read-only lookups,
after roughly 1, 5 and 15 minutes, with DB leases. DELIVERED sets deliveredAt;
lookup failure never resends. SENT denotes acceptance, including when a later
carrier lookup reports FAILED. See [official SENDPK API](https://sendpk.com/api.php).

Arbitrary response bodies/errors, URLs, headers and credentials are not persisted
or logged. Stored send summaries whitelist classification and bounded provider ID;
API-key echoes are excluded by the provider parser.

Consent is checked at intent creation under the scoped Patient lock and rechecked
immediately before the durable dispatch-start decision. Withdrawal before that
decision abandons with CONSENT_WITHDRAWN and no provider attempt. Consent cannot
recall a request already authorized/in flight. New intents retain a scoped patient
FK; legacy Booking and Report/invoice relationships are resolved conservatively.
Missing safe patient context abandons rather than guessing consent. Independent
workers share DB locks/leases, so process-local timers are not correctness authority.

## Migration and validation

Only new additive migration `20261004020000_d2_notification_durability` adds the
holding enum value, nullable intent/lease fields, delivery counter, attempt table,
scoped keys, due/lease/lookup indexes and critical native guards. Lease/counter
checks use NOT VALID for historical compatibility. No historical Notification
rewrite, DROP/CASCADE, destructive enum recreation or unresolved mandatory FK.
The 13 previous SQL files and migration lock remain byte-identical by SHA-256.
Reviewed SQL passed fresh disposable deploys before normal local deploy. All 14
migrations are applied; supported Prisma schema diff is empty. Native guards are
covered by focused tests, rather than inferred from Prisma's supported diff.

`pnpm --filter @lms/database test:d2`: **11/11 focused groups A–K passed**:
transaction/notification audit failure rollback; replacement dispatcher startup;
two-worker/overlapping-cycle race; pre-dispatch lease recovery/owner fencing;
persisted retry/backoff; permanent failures/attempt cap/mocked provider parsing;
frozen template payload; consent withdrawal; duplicate sample/report actions and
amendment behavior; append-only/scoped/bounded/secret-free evidence; expired marked
and legacy SENDING recovery, timeout hold and bounded delivery lookups.

Existing suites run once after focused success: API 25, shared 19, database unit 4,
B1 9, B2 9, C 11, D1 18, ORM 5, built API smoke 1: **101/101**, **112 total**,
zero failures/skips. Prisma generate/validate, all four workspace builds/typechecks
and ordinary `git diff --check` pass. The focused fixture mapping was corrected
and the plain numeric provider error parser fixed during focused validation; only
affected focused checks were rerun. Disposable runs closed all pools and removed
their databases/artifact fixtures, including the interrupted first fixture. The
harness explicitly blanks SMS credentials before child processes; provider tests
mock HTTP and dispatch tests mock the gateway. No real SMS was sent.

Operational counts before/after: notifications **0 → 0**, sms_templates **2 → 2**,
notification_attempts **0 → 0**. Patients/specimens/events/results/reports/versions
and audits remain zero. The checked existing-row SHA-256 fingerprint remains
`9ac7880897238af178e31e586ab5e6cd0f8e1b6f9eae1da91d5d52fc3c2178c0`.
No operational consent/template change, login fixture, reset, seed or db push.
No running operational API was restarted for validation.

## Retained limitations and deferrals

Prisma CLI/client/adapter remain 7.10.0, pg 8.23.1; config/dependencies/lockfile and
client/pool ownership are unchanged. Prior small-process Prisma 7 RSS observation
(112–124 MiB versus about 51 MiB) remains documented. This larger API smoke measured
255.41 MiB RSS and 759.81 ms startup; workflows differ and are not directly
comparable. No obvious leak or duplicate runtime client/pool was found; shutdown
checks report zero remaining connections. Existing pg concurrency deprecation and
Node VM warning remain.

Database-owner DDL can disable native guards; runtime least-privilege rollout is
deferred. Unknown provider response formats, no-ID/manual uncertainty reconciliation,
general resend, retention/purge UI and cross-instance notification dashboards are
not implemented. Cloud/public bridge, backup/restore, financial correction UI,
doctor settlement, frontend redesign, additional messaging/events,
timezone/identifier conversion and dependency upgrades remain outside D2.
No staging, commit, push or branch change.
