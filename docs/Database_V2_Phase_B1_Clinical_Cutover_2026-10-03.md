# Database V2 Phase B1 — Clinical Cutover

Completed 2026-10-03, Asia/Karachi, on `development` from `b8149c4`. No commit or push.

## Schema and migration

New migration: `20261003010000_b1_clinical_cutover`. All nine prior SQL migrations and the migration lock remain byte-identical.

- Added immutable `TestVersionParameter`, `TestVersionParameterChoice` and `TestVersionReferenceRange` tables, normalized from retained Phase A JSON snapshots. An insert trigger captures prospective versions; native guards reject later definition changes or inserts inconsistent with the snapshot. Original snapshots/hashes remain authoritative capture evidence, without inventing approval or historical definitions.
- Added nullable Result occurrence/version/revision and structured correction reason/actor fields. Scoped FKs require the frozen version and actual SampleTest assignment. Partial unique indexes allow one draft and one release per occurrence, and one successor per revision.
- Added nullable ResultValue frozen parameter/range and evaluation instant/gender/age fields. Legacy parameter references remain. Released revisions/values cannot be edited or deleted; deferred checks require complete required values and an atomically finalized successor before supersession.
- The backfill adopts only isolated, unambiguously evidenced Phase A mappings whose values map to the frozen definition. Ambiguous rows stay nullable. It never recalculates old flags or invents historical range/context.

Generation, validation, pending status and SQL review preceded normal operational deploy. All ten migrations are now applied; zero unfinished failures; supported Prisma schema diff is empty. Operational bookings, invoices/lines, payments, shares, specimens, results/values, reports, Visits, occurrences and assignments remained at zero before/after. Existing eight TestVersions and one PackageVersion remained. Only normalized definition rows and migration metadata were added. No operational seed, fixture, reset or db push.

## Code paths

- Billing calls the existing materializer in its invoice transaction, links Report to Visit, and bases report creation on actual occurrences, including package-only work. Booking conversion and existing financial calculations remain atomic.
- Collection requires explicit occurrence IDs for Visit-based work and validates tenant/branch/Visit. Assignment and SampleEvent writes commit with specimen creation. Catalog replacement locks the same parent used by definition capture.
- `clinical-results.ts` derives source identity from the assigned occurrence, validates frozen parameter/type/choice/unit, excludes incompatible ranges before ranking, and saves selected range and evaluation context. Age uses the collection event instant; unavailable historical instants yield unknown age rather than today's age.
- Reopen creates a successor draft and preserves the old release. Finalize atomically supersedes the old revision and releases the new one. Direct amendment uses the same mechanics and structured reason/actor.
- Readiness and previews count occurrences independently. Current report and tracking reads include RELEASED revisions only and project frozen test/parameter labels. Superseded evidence remains stored; an open correction still leaves its predecessor as the current released projection.
- Existing Visit/Laboratory callers use explicit specimen selection and frozen occurrence parameters. Payment and collection are separate actions so another specimen can be collected without recording payment again. No styling redesign.

## Validation

| Check | Final result |
| --- | --- |
| Nine focused B1 tests | 9 passed, 0 failed/skipped |
| API / shared / database unit | 25 / 19 / 4 passed |
| Existing ORM / built API smoke | 5 / 1 passed |
| Total executed tests | 63 passed, 0 failed/skipped |
| Prisma generate / validate | Passed, stable 7.10.0 unchanged |
| Four workspace builds / typechecks | Passed |
| Fresh disposable migration and pool cleanup | Passed; zero remaining connections |
| Operational migrate status / supported schema diff | Up to date / empty |
| Prior migration byte hashes / git diff --check | Unchanged / passed |

The focused tests cover activation/retry/packages, cross-Visit assignment, result ownership/substitution, catalog freezing, range eligibility, immutable correction/finalization/direct amendment, duplicate readiness, current reporting and genuine legacy readability. The initial legacy fixture omitted required basePrice; it was corrected. The full typecheck found a legacy Phase A test's now-nullable relation assumption; an explicit assertion preserves that fixture guarantee. Final runs pass. The large Phase A scenario harness was not rerun.

## Compatibility and deferrals

Genuine old invoices without a Visit retain an isolated catalog-based path. Historical rows/values and their original fields are retained. Backfilled values can retain their legacy catalog FK, so existing restrictions on replacing referenced historical catalog parameters remain. Unresolved Visit-era legacy work requires explicit reconciliation; it is not silently matched by Test ID to satisfy occurrences.

ReportVersion persistence, PDF/history artifacts and all B2/C/D work remain deferred. Financial concurrency/redesign, runtime roles, the 82 legacy timestamp columns, dependency versions and the centralized single-pool timestamp workaround are unchanged. Existing Prisma RSS observations remain in prior documentation; no new benchmark or memory redesign was introduced. Existing pg/Jest/build warnings remain; successful disposable shutdown found no pool leak.
