# Database V2 Phase E2 — verified backup and recovery

2026-10-04 (Asia/Karachi), `development`, committed E1 baseline `6917659`.
No business-schema change or new migration. No operational restore, seed,
report-storage overwrite, real SMS, commit or push.

## Protected state

The backup contains the complete logical PostgreSQL database, including all 45
application tables and Prisma migration history: clinical and financial history,
audit, durable authentication, notification/attempt evidence and configuration.
Branding/logo data is already stored in Configuration JSON and is included there;
no separate uploaded-asset writer exists in the API.

It also contains every canonical B2 PDF referenced by the captured ReportVersion
metadata. These are root-relative `reports/.../version-N/<uuid>.pdf` keys, already
portable across machines. No historical PDF bytes or metadata are regenerated or
rewritten. Legacy Report.pdfPath is not used as canonical storage by the current
printing implementation; the inspected operational database has no such paths.

Excluded: source checkout, dependencies/builds, browser caches, temporary PDFs,
unreferenced rendering candidates, logs, test fixtures and environment files.
PostgreSQL cluster roles/passwords, server configuration and provider secrets are
not copied. Recover application binaries/tooling from a separate trusted release;
recover credentials through protected installation configuration.

## Package and consistency

```text
LabFlow_Backup_<UTC timestamp>_<uuid>/
  manifest.json
  database.dump
  artifact-manifest.json
  report-artifacts/reports/.../*.pdf
```

An owner connection exports a REPEATABLE READ, READ ONLY PostgreSQL snapshot.
`pg_dump --format=custom --snapshot=... --no-acl` imports the same snapshot.
Counts, migration names/checksums, aggregate/per-table row fingerprints and PDF
references are read from that snapshot, not a later live query. Fingerprinting
uses bounded cursor batches, deterministic ordering and UTC timestamps; no row
contents are written to manifests or logs. Ordinary lab DML continues; avoid
concurrent deployments/schema maintenance during a backup. See official
[pg_dump snapshot behavior](https://www.postgresql.org/docs/18/app-pgdump.html).

The dump is taken first, then only the captured canonical files are copied and
verified. B2 publishes a unique complete file before committing its database
reference. A losing renderer removes only its own unreferenced candidate; native
guards retain committed canonical metadata. Thus a referenced file cannot be
created later than its visible reference, while newer artifacts outside the
snapshot need not be included. Missing bytes, size mismatch or SHA mismatch fail
the backup. Owner/OS deletion is an integrity failure, never silently repaired.

The manifest records format/version, backup ID, UTC snapshot time, PostgreSQL
major, source database name, Git SHA, migration list/count/latest, table counts,
row fingerprints, dump SHA and artifact count/manifest SHA. The artifact manifest
records only relative path, byte size and SHA-256. No URL, password, provider key,
raw session token or patient-level summary is emitted.

Packages are created in a private `.incomplete` directory. Files are flushed,
hashes checked, and `pg_restore --list` must read the nonempty custom archive.
Only then does a same-parent rename publish the completed directory. Failed
packages remain incomplete and are never valid restore inputs. Public restore
cannot bypass the incomplete-folder check. SHA checks detect corruption, not an
untrusted party rewriting the entire package: restore only trusted backups,
since dump restoration executes stored SQL. See
[pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).

## Windows helpers

Requires the installed matching LabFlow release, compiled API/database packages,
Node 24 and matching PostgreSQL-major dump/restore tools. Source, tool and target
major must match; this pass exercised PostgreSQL server/tool major 18. A browser
is needed only to create new reports, not to retrieve restored canonical PDFs.

Owner/admin credentials remain in protected local tooling configuration; runtime
credentials must not be used for backup. Run from the installation/repository
root, substituting existing protected paths:

```powershell
.\scripts\backup-labflow.ps1 -Destination '<existing external backup folder>' -RetentionDays 30
.\scripts\backup-labflow.ps1 -Destination '<existing external backup folder>' -Status
.\scripts\restore-labflow.ps1 -BackupPath '<completed backup>' -VerifyOnly
.\scripts\restore-labflow.ps1 -BackupPath '<completed backup>' `
  -TargetDatabase 'lms_v2_restore_test_<unique suffix>' `
  -TargetArtifactRoot '<new absolute artifact directory>'
```

Use `-PostgresBin '<PostgreSQL bin directory>'` if tools are not on PATH.
VerifyOnly checks format/hashes/archive readability without database changes or
owner/admin access. Parent directories must exist. Symlinks/junctions and unsafe
canonical keys are rejected; backup/report/restore directories cannot overlap.

Restore creates a new database under the configured owner, restores with
`--no-owner --no-acl --single-transaction --exit-on-error`, copies verified PDFs,
compares all counts/rows/migrations/artifact references exactly and requires an
empty supported Prisma schema diff. Existing source role names need not exist.
Configure a new owner's private DATABASE_URL and same-server admin connection on
a new installation; the installation admin must first provision that owner login.
Existing databases and artifact directories are always refused, never dropped.

E1 policy provisions a new randomly named restricted runtime login, verifies its
catalog privileges, and runs the actual Nest application context read-only in
recovery mode. Canonical PDFs are retrieved through existing report/artifact
services without rendering. A second row comparison proves the smoke did not
mutate recovered data. Newly generated credentials go only into private
`<target artifact root>/recovery.env`, not the backup; they are excluded from
future canonical-file backups and ignored by Git.

The default refuses `lms_v2`, the current/source database name and current artifact
storage or overlapping paths. An actual disaster replacement using those names
requires BOTH `-AllowOperationalRestore` and
`-ConfirmOperationalRestore 'RESTORE <target database>'`; even then, an existing
database/directory is never overwritten. Stop services and preserve failed media
before any manually reviewed destructive replacement. None was attempted here.
Partial target databases/directories remain isolated after a failed restore;
inspect/clean those exact targets explicitly, then retry with new targets.

## Recovery and production cutover

The private recovery config sets `LABFLOW_RECOVERY_MODE="true"`, hardened runtime,
blank provider secrets and PostgreSQL read-only transactions. A controlled smoke
uses that environment with no listener. Recovery mode independently blocks
dispatcher startup/cycles/claims/dispatch and all SENDPK HTTP paths, even with
provider credentials supplied; authentication housekeeping/session idle touches
are suspended to preserve exact comparison. It is not an ordinary operational
configuration: login and write workflows cannot run with the read-only URL.

An old queued SMS may have been accepted by the provider after backup time.
Never clear recovery mode and blindly replay restored work. After exact backup
comparison, with API stopped, explicitly run:

```powershell
.\scripts\recovery-cutover.ps1 -BackupPath '<completed backup>' `
  -TargetDatabase '<restored database>' -TargetArtifactRoot '<restored artifact root>' `
  -ConfirmCutover 'CUTOVER <restored database>'
```

The cutover re-verifies exact original rows before one transaction revokes all
restored unrevoked AuthSessions (`DISASTER_RECOVERY`), holds QUEUED/RETRYING/SENDING
SMS as RECONCILIATION_REQUIRED (`RESTORED_BACKUP_UNCERTAIN`), clears due/lease/poll
fields, and appends aggregate tenant recovery audits. Frozen payloads, attempt
history and terminal SENT rows remain unchanged. Existing D2 retry rules prevent
blind manual resend of held messages. Repeated cutover cannot silently mutate an
already changed database because exact comparison then fails.

Operator/provider reconciliation of ambiguous historical messages is separate
from E2; no resend override or reconciliation UI was added. After cutover and
review, privately configure provider credentials and a normal restricted runtime
URL without the read-only option, retain E1 grants, then explicitly disable
recovery mode and start services. All users must log in again. Protected-name
cutover also requires the same two operational override arguments. On an older
backup, use its matching release for verification first; apply later migrations
and E1 grants only after verified recovery, never before integrity comparison.

## Destination, retention and scheduling

Choose external/NAS/another volume explicitly; the destination must already
exist. A same-report-volume warning is emitted; also confirm the PostgreSQL data
volume and physical device are separate. Drive letters/UNC paths cannot prove
physical-device independence. Fixture backups on the same volume are permitted.

Created package/restore directories grant only the current Windows identity,
SYSTEM and Administrators (POSIX fallback mode 0700/0600). ACL failure aborts;
NAS permission compatibility must be checked on the actual destination. Medical
backup media is sensitive: use protected/encrypted storage such as existing
BitLocker-managed media and separately protected credentials. No custom crypto.

Optional RetentionDays only considers fully verified LabFlow-named packages,
never incomplete/foreign directories, and always retains the newest successful
package. It checks resolved containment before deleting an older directory.
Retention failure warns without invalidating a newly completed backup. Status
rescans manifests/hashes to report the newest verified package and timestamp;
no backup database subsystem/dashboard was added.

Windows Task Scheduler can run PowerShell daily under a maintenance identity
authorized to read protected owner configuration and write the destination.
Use an action like `powershell.exe -NoProfile -NonInteractive -File "<installed backup-labflow.ps1>" -Destination "<external folder>" -RetentionDays 30`, with the
installation directory as Start in. Keep passwords out of arguments; configure
Windows task identity through its protected credential mechanism. No task was
registered here. Schedule periodic isolated restore drills as well as backups.

## Verification and operational result

The real disposable drill created a patient, booking/visit, paid invoice,
sample, released result/report version, audit, sessions and notification/attempt
evidence through application paths. Installed Chrome rendered a real canonical
PDF; no downloaded browser or real SMS was needed. The source database AND its
artifact directory were destroyed. Restore used a different database, owner,
runtime login and storage root; source was no longer available. All 46 table
counts/fingerprints (including migration history), 14 migrations, historical
membership and canonical PDF bytes matched. E1 checks, supported schema diff,
actual read-only API context, recovery suppression and cutover passed.

Exactly 13 focused groups cover successful finalization, pg_dump/disk failures,
wrong tools/format, partial packages, corrupt dump, missing/size/hash failures,
destroy/recreate restore, full DB comparison, portable PDFs, E1 smoke, provider
suppression, notification holds, session revocation, target refusal, VerifyOnly,
secret-free metadata, status and retention. Temporary roles/databases/artifacts
are cleaned and no database connections remain. Initial failures identified
missing Puppeteer cache, empty libpq service-name handling and a fixture wrapper
path; corrected without weakening guards or upgrading dependencies.

Final validation: E2 13/13; existing API 25/25, shared 19/19, database unit 4/4,
D2 11/11, SMS 8/8 and E1 10/10: **90 distinct checks**. Base suites ran once after
focused success; affected focused tests were repeated only for fixes/file-flush
and verification refinements. Prisma generate/validate and all four workspace
builds/typechecks pass. No unrelated full Phase A/B1/B2/C/D1 rerun. Existing Node
VM/pg concurrent-query warnings remain; Prisma CLI/client/adapter stay 7.10.0 and
pg 8.23.1. All 14 migration SQL files/lock and business schema remain unchanged.

Operational backup is **blocked pending a safe external destination**, as
explicitly requested by the user. No destination was guessed and no operational
archive was written to the source/application drive. Actual report root is
`C:\Users\ranaz\AppData\Local\LabFlow`; it does not yet exist and the operational
DB references zero canonical/legacy PDFs. No directory was created there.

## Limits and recovery objectives

RPO is the exported snapshot time, so later committed work is absent after
restore. Daily backups can lose up to the time since the last successful backup;
choose frequency based on acceptable loss. RTO includes replacement installation,
database/artifact restore, verification, credential setup and reconciliation;
no guaranteed production RTO or full-disk-failure exercise is claimed. Logical
backup may fail if corruption prevents readable source data. Checksums do not
prove media survives future failure; retain off-device copies and test restores.

WAL/PITR, HA, cloud/S3/replication, full Windows installer/service-account rollout,
new SMS providers and clinical/financial/UI redesign remain deferred. This
restore is database/SQL portable within validated PostgreSQL-major/release
boundaries, not an application-binary or cluster-configuration backup. Prior
Prisma RSS/advisory observations remain unchanged; no memory/dependency redesign.
