# Database V2 Phase B2 — Immutable Report Versions and PDF Artifact History

Completed 2026-10-03 (Asia/Karachi), on `development` from `bcbc462`. No staging, commit or push.

## Schema and release rules

New migration: `20261003020000_b2_report_versions`. Adds `ReportVersion`, `ReportVersionResult`, `ReportVersionKind` and nullable `Report.currentVersionId`. Existing Report identity, generation and aggregate print fields remain.

Each version retains sequential number, predecessor, INITIAL/AMENDMENT kind, release instant/actor, structured amendment reason, compact patient/referrer/report/Visit display snapshot and SHA-256 of deterministically ordered occurrence/result IDs. Membership references exact immutable Result revisions, without copying ResultValue rows. A superseded Result remains valid historical evidence.

The capture function locks invoice then report, matching clinical lock order. It publishes only a complete released occurrence set without open correction drafts. Identical membership is idempotent; finalized corrections append a successor and reuse unchanged revisions. PostgreSQL scoped FKs, uniqueness, checks and triggers enforce complete publication, sequential pointers, immutable clinical fields/membership and retained history. Only one-time artifact metadata and valid print increments may change after release.

Current and tracking reads use pinned membership. Draft corrections preserve the last released pointer; its clinical eligibility remains available while existing payment gates still apply. Report status remains the progress projection. No withdrawal policy was introduced.

## Reads and printing

- `GET /reports/:id/versions` and `/reports/:id/versions/:versionNo`: tenant-scoped history with existing REPORT_VIEW permission. Historical details retain payment redaction, including nested version results.
- `GET /printing/reports/:id`: resolves the current version.
- `GET /printing/reports/:id/versions/:versionNo`: historical printing with existing REPORT_PRINT permission and payment eligibility.

Stable version projections freeze patient/referrer display identity and use each Result's frozen definition labels. Template layout is retained. Version first/last print instants and count update atomically alongside compatibility Report print fields.

## Canonical artifact storage

Set `REPORT_STORAGE_ROOT` to an absolute persistent directory outside temporary storage, Git, source and build directories. Defaults: Windows `%LOCALAPPDATA%\LabFlow`; other platforms `~/.local/share/labflow`. Relative keys are `reports/<tenant-id>/<report-id>/version-<N>/<UUID>.pdf`. Trusted IDs, path containment and nested symlink checks prevent traversal.

First printing renders after clinical commit, outside any clinical transaction. Exclusive staging, file flush and atomic create-only hard-link publication produce a unique candidate. Conditional database metadata publication selects one canonical winner; competing losers remove their own candidates. Metadata stores relative path, SHA-256, byte size, generation instant and compact template/settings/financial-display provenance. The first successful render uses then-current authorized branding/settings and financial display context; its bytes are subsequently frozen.

Later requests verify size/hash and return stored bytes without reloading settings or rendering. Known missing/corrupt artifacts fail clearly and require restoration of the recorded bytes. Rendering failure leaves clinical release intact and permits retry while artifact metadata is pending. Artifacts are created lazily on first print; filesystem/DB crash or ambiguous acknowledgement can leave unreferenced candidates for controlled housekeeping. No recovery/backup worker is included.

## Legacy and migration safety

Backfill captures only a provable current complete B1 occurrence/release set. Display and release capture are explicitly at upgrade time; earlier history is never inferred. Incomplete, ambiguous, draft-containing or unsupported-ID legacy reports remain unversioned and use the isolated legacy read/render path.

Generate, validate, SQL review, fresh disposable migration checks and focused tests preceded normal operational deploy. All 11 migrations are applied, zero unfinished failures, and supported Prisma DDL diff is empty. Before/after checked counts: invoices/payments/results/values/reports zero; TestVersions eight; PackageVersions one. No operational fixture, reset, seed or db push. All ten previous SQL files and the migration lock remain byte-identical, including B1's historical trailing blank line.

## Validation and boundaries

Nine focused B2 groups A–I passed: initial membership; retry/concurrent capture; amendments and simultaneous finalizations; open drafts; pinned current/tracking reads; historical snapshots/native immutability/tenant scope; canonical artifact reuse and print counts; failure/retry/competing publication/corruption rejection; legacy fallback. Test PDFs used guarded temporary roots and were cleaned up; deterministic mocked rendering avoids requiring Chromium.

Existing relevant checks passed: API 25, shared 19, database unit 4, B1 9, ORM 5, built API smoke 1. Including B2: **72 passed, zero failed/skipped**. Prisma generation/validation, all four workspace builds/typechecks and `git diff --check` passed. Existing pg/test warnings remain.

Dependencies/config/lockfile are unchanged: Prisma CLI/client/adapter 7.10.0. Prior observed Prisma 7 RSS increase remains documented; the shared owned pool/client is reused. No memory-only redesign, unrelated benchmark, frontend history UI, finance/auth/sync/notification redesign, runtime-role hardening, backup/restore implementation or legacy timezone conversion. Existing owner-level DDL/TRUNCATE limitations remain; row guards do not protect against a database owner disabling them.
