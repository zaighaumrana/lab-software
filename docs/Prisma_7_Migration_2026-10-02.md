# Prisma 7 migration — 2026-10-02 (Asia/Karachi)

## Result and scope

LabFlow migrated from Prisma CLI/client 6.19.3 to exact stable 7.10.0, with
@prisma/adapter-pg 7.10.0 and pg 8.23.1. Node 24.21.0, TypeScript 6.0.3,
pnpm 11.23.0 and Nest 12 remain in place. The npm CLI `latest` tag advertised
8.0.0-rc.19; it was deliberately ignored. No Prisma 8 packages occur in the
resolved lockfile. This is ORM infrastructure work on development/1579be8;
no commit, push, branch creation, main/tag/website change or PostgreSQL upgrade.

Generation, validation, frozen installation, all workspace builds/typechecks,
all tests and isolated runtime checks passed. The security audit is **not clean**:
the old deepmerge finding remains, with two additional CLI MySQL findings.
Fresh-process memory/cold-query measurements also increased; see below.

## Research and decisions

Reviewed current official sources before implementation, using the versioned
v7 pages where unversioned URLs now describe Prisma 8:

- [6 → 7 upgrade](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7):
  adapter requirement, env/config changes, middleware removal and migration commands.
- [PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)
  and [drivers](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers):
  PrismaPg with direct PostgreSQL connectivity, preserving normal driver TLS validation.
- [Generator](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators):
  explicit output and supported `moduleFormat = "cjs"`; compile generated TypeScript
  with `.js` imports instead of running those imports directly in tsx.
- [Config](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference)
  and [migration deployment](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/deploy-database-changes-with-prisma-migrate):
  URL in config, explicit seed/generation, deployment applies recorded migrations.
- [Transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions),
  [Decimal](https://www.prisma.io/docs/orm/v7/prisma-client/special-fields-and-types)
  and [pool defaults](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool).
- [Deployment](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/deploy-prisma):
  a long-running bare-metal Node server remains appropriate.
- [7 → 8 PostgreSQL migration](https://www.prisma.io/docs/guides/upgrade-prisma-orm/postgresql):
  current guidance describes RC CLI/runtime, a different contract/query architecture,
  incremental route conversion and a separate migration-ownership handoff.
  This task implements none of those Prisma 8 APIs.

The generator's explicit CommonJS option and successful built runtime checks justify
retaining Nest's current CommonJS output despite the general guide's ESM-oriented
examples. No wholesale application ESM conversion was necessary.

## Boundary before and after

```text
Before: API → @lms/database index.js/src/index.ts → @prisma/client 6
                                             → native query engine → PostgreSQL

After:  API → @lms/database root export (dist/index.js)
             ├─ generated public model/query types, Prisma namespace, Decimal
             └─ client.ts → package-local generated client 7
                          → PrismaPg → owned pg pool → local PostgreSQL
```

`src/client.ts` validates the URL without echoing credentials, preserves its schema
option (default public), constructs the adapter and client, and offers an explicit
connection override for tests/tooling. Its small PrismaClient subclass preserves
existing PrismaService inheritance; no model repository classes or speculative
Prisma 8 compatibility layer were added. `createDatabaseClient` shares that path.
`src/index.ts` exposes generated public types/enums, Prisma and its Decimal class;
the package exports only `.` and rejects imports into generated/internal subpaths.

`prisma/schema.prisma` now uses prisma-client, output `../src/generated/prisma`,
CommonJS and `.js` import extensions. Generated source and dist remain ignored.
`generate` also builds the facade, so existing setup/root generate commands make
the runtime exports available. Recursive builds compile database before the API.
The obsolete root CommonJS shim and private runtime/library Decimal import are gone.

No API business module required an import change. Before/after inventory found
no direct @prisma/client, adapter or generated-path imports outside the database
package. Implementation files are schema, src/client.ts, src/index.ts,
prisma7.config.ts, src/environment.ts, package.json and seed/tooling/tests. The API
contains only its existing global PrismaService lifecycle integration.

## Environment, lifecycle and offline deployment

| Context | Ownership |
|---|---|
| Prisma CLI | prisma7.config.ts calls the shared loader; package-local .env, then datasource.url. Externally supplied values take precedence. Config requires DATABASE_URL even for generation; generation does not connect. |
| API runtime | Existing Nest ConfigModule loads API .env/database .env. Client consumes process.env and fails clearly if URL is missing/invalid. No client-side hidden dotenv loading. |
| Installer/seed | Installer creates package .env and runs generation/build, then migrate:deploy against reviewed history. Seed explicitly loads through the same helper and compiles first. Seed was typechecked, never executed here. |
| Tests | Unit tests need no server. The integration harness creates a guarded random local database, overrides URLs only in child processes, deploys existing migrations there, and drops only that newly created database in finally. CREATE DATABASE privilege is required. |

One global Nest provider owns one application pool. PrismaService retains connect
and disconnect hooks; main enables Nest shutdown hooks. Runtime testing exposed
the existing auth cleanup interval's missing teardown, so AuthService now clears
it on destruction without changing session logic. Full fixture startup/close
completed naturally; the administrative check found **zero** remaining fixture
connections. Parallel reads verified the conservative maximum of ten connections.

Defaults: max 10 (pg's default, replacing v6's CPU-based pool sizing), explicit
connection/acquisition timeout 5000ms (pg otherwise waits indefinitely), unchanged
pg idle timeout 10000ms (v6 default 300s), no lifetime tuning. Prisma interactive
transaction defaults remain maxWait 2000ms/timeout 5000ms with database isolation
unchanged. The current operational URL has only a schema query option; v6 URL
pool parameters would need an explicit review if introduced later. TLS validation
was not disabled and no cloud, Accelerate or Data Proxy path was introduced.

Runtime queries use direct local PostgreSQL. Fixture smoke forbids external HTTP,
including during billing/laboratory operations. Real SMS delivery and the actual
offline Windows installer/staging directory are outside this validation. Package
API/database/shared dist, Prisma runtime/query-compiler JS/WASM, adapter/pg and the
other runtime dependencies; do not ship generated TS alone. The CLI still contains
a schema/migration engine, so this is not a claim that every Prisma binary vanished.

## Schema, migration and data proof

Before: Prisma 6 generation, validation and migration status passed; all five
migrations were applied. After: Prisma 7 generation/validation/status passed;
the same operational database remains up to date. No operational migration was run.

SHA-256 of the domain schema after removing only generator/datasource blocks is
unchanged: `c0aaf5ed2b0f4c0e09d364987011cbc2231607b53227f9656e1b12b1d80bb806`.
Full schema hashes differ only because the generator/output/module-format/import
extension and datasource URL placement changed. No model, field, relation, index,
enum, native Decimal precision or other business-schema change appears in the diff.

All five migration.sql SHA-256 hashes and migration_lock.toml match byte for byte.
`git diff -- packages/database/prisma/migrations` is empty. Existing migrations
successfully replayed in disposable databases without editing SQL or history.

Read-only transactions captured sorted row-content fingerprints/counts for all
30 operational tables, including _prisma_migrations; every fingerprint/count
matches afterward. No reset, push, reseed, destructive operational migration or
business-data write occurred. Login's lastLoginAt update was tested only on a
synthetic user in a disposable database. Temporary fixture databases were removed.

Full hashes and sanitized measurements are in
[migration evidence](prisma7-migration-2026-10-02.json). The complete baseline
[import inventory](prisma7-import-inventory-before-2026-10-02.txt) is retained.

## Decimal, transaction and error validation

Audited billing/catalog/laboratory/doctor/analytics Decimal conversions and all
eight existing interactive transaction call sites. Monetary persistence retains
Decimal arithmetic. Existing doctor-dashboard/analytics presentation conversions
to Number are unchanged; this migration does not certify arbitrary-precision
JavaScript totals or fix pre-existing rounding/concurrency behavior.

Verified exact 0.1 + 0.2, quantity/pricing, discounts, partial payment/due, percentage
and per-test commission arithmetic, JSON string serialization, Decimal identity
and reference comparisons. Database round trips preserve price scale 12,2,
reference range 12,4 and raw numeric 16,6. Full API fixture: 100.10 × 3 − 0.30 =
300.00, 12.50% share = 37.50, payment 100.10 leaves 199.90; rejected overpayment
leaves one payment. Result 0.123399 persists at six decimals and flags LOW against
0.1234; releasing the invoice marks its result RELEASED and report COMPLETE.

Interactive dependent-write commit and exception rollback passed, as did ordered
batch create/update and unique-failure rollback. The actual duplicate error remains
an instance of public Prisma.PrismaClientKnownRequestError with code P2002, matching
notification idempotency handling. TransactionClient and update/where input types
compile through the facade. No transaction semantics were changed for typing.

pg 8.23.1 emits a deprecation warning during the multi-record nested-write API
fixture. Trace locates queued queries inside PrismaPg/Prisma's executor. Current
pg 8 supports it; all atomicity checks pass. Recheck adapter support before pg 9;
the warning was documented rather than suppressed or patched in node_modules.

## Validation results

| Check | Result |
|---|---|
| pnpm install --frozen-lockfile | Pass |
| pnpm db:generate | Pass; explicit source output and compiled facade |
| prisma validate / migrate status via pinned workspace CLI | Pass; 5 migrations, up to date |
| pnpm -r build | All 4 packages pass: database, shared, API, web; web 2610 modules |
| pnpm typecheck | All 4 pass; database additionally checks CLI config, seed and TS tests |
| API Jest | 5 suites, 25 tests passed; 0 failed |
| Shared Jest | 3 suites, 19 tests passed; 0 failed |
| Database node:test unit file | 4 tests passed; 0 failed, 0 skipped; includes config discovery |
| Database node:test integration file | 5 tests passed; 0 failed, 0 skipped |
| Built API node:test fixture smoke | 1 test passed; 0 failed, 0 skipped |
| Total | 54 tests passed, 0 failed; 8 Jest suites plus 3 node:test files (no suite blocks) |
| Diff safety | Whitespace clean; migration diff empty; generator/datasource-only schema diff |

Operational local SELECT/read, migration status, API startup, public settings,
auth guard rejection and graceful shutdown are **verified** with PostgreSQL
enforcing default_transaction_read_only=on for the operational API smoke. API startup,
auth/login/session, patient/booking/invoice/report/settings reads, billing/payment/
doctor-share transactions, sample receive/accept, result entry/release, report
finalization, Socket.IO and pool shutdown are **fixture-verified** against built
code. Singleton lifecycle is unit-verified. Seed is **compile-verified** only.
PDF rendering, real SMS, every amendment/reopen branch, sustained load and the
separate production staging/installer are **not tested** in this ORM task.
Existing Jest VM Modules warning remains a tooling limitation.

## Audit and footprint

Before: one high, zero moderate/critical. After: two high, one moderate, zero
critical. The previous [deepmerge-ts advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
still affects 7.1.5 through Prisma CLI/config. CLI also pins mysql2 3.15.3, flagged
by [authentication downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr)
and [compressed protocol DoS](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3).
LabFlow's PostgreSQL query path uses pg, but optional Prisma peer resolution can
retain CLI packages in a production graph. No unsafe overrides or false production
exclusion claim. Audit endpoint counted 765 → 849 resolved dependencies.

Comparable package-owned files for Prisma-named packages plus deepmerge-ts:
184.03 → 201.85 MiB. This excludes other transitives and generated output, skips
symlinks/stale contexts and is not total node_modules or an installer measurement.
Generated output: v6 JS/types/native query engine 25.52 MiB → v7 TS source 3.02 MiB;
compiled complete database package is 3.19 MiB. File sets differ: no universal disk
saving claim. pnpm retains unreferenced old contexts locally; no shared cache or
installation cleanup was performed or credited as a saving.

Three fresh child-process samples per version, same local SELECT 1, first query
separate then 30 warm reads; measurements are indicative, not a load benchmark:

| Metric | Prisma 6 | Prisma 7 |
|---|---:|---:|
| Per-process warm median, ms | 0.908 / 0.354 / 0.304 | 0.614 / 0.485 / 0.579 |
| Connect calls, ms | 153.0 / 66.8 / 67.4 | 156.5 / 138.7 / 156.4 |
| First SELECT, ms | 33.5 / 3.5 / 3.8 | 89.1 / 79.2 / 94.9 |
| RSS after reads, MiB | 51.0 / 51.0 / 50.7 | 124.2 / 112.1 / 121.4 |

The higher cold-read/connect cost and ~61–73 MiB higher process RSS are real
observations to budget/test on deployment hardware. Connect does different work
between engines; these are not HTTP server startup timings. No throughput or
speedup claim. Warm latency remained sub-millisecond for this small query.

## Prisma 8 migration readiness

Infrastructure changes should concentrate in:

- packages/database/package.json and pnpm-lock.yaml
- packages/database/prisma7.config.ts
- packages/database/src/client.ts
- packages/database/src/index.ts
- packages/database/prisma/schema.prisma or a future contract/schema layer
- packages/database/tsconfig.json and tsconfig.tools.json if emission changes
- packages/database/prisma/seed.ts and packages/database/test/*
- apps/api/src/common/prisma/prisma.service.ts and its lifecycle spec if client construction/lifecycle changes
- .gitignore, setup.ps1, README.md and database/tooling documentation as workflows change

Generated path, adapter/pool creation, connection options, namespace/Decimal/error/
transaction type exports, CLI config and scripts are localized. src/environment.ts
is a reusable env seam and changes only if the loading contract changes.

Readiness is **not Prisma 8 compatibility**. Current RC guidance changes query
shape and migration ownership; a future migration may require adapting business
queries/types in billing, catalog, laboratory, doctors, patients, notifications,
analytics and other query consumers despite their facade-only imports. The report
does not promise replacement of four files will preserve every query. Reassess
stable Prisma 8 APIs then; keep existing v7 migration ownership/history until a
deliberate tested handoff. No guessed APIs or repository-pattern boilerplate added.

## Git and follow-up

All requested changes remain unstaged/untracked on development at 1579be8. No
commit or push. Review audit findings, cold-start/RSS budget and eventual offline
packaging before deployment. Suggested eventual commit:
`refactor: migrate database layer to Prisma 7`.

## Final hardening — 2026-10-02, Asia/Karachi

Renamed `packages/database/prisma.config.ts` to
`packages/database/prisma7.config.ts`; config contents and environment/schema/
migration ownership are unchanged. Prisma 7.10+ automatically discovers the
versioned filename, as documented in the official
[PostgreSQL quickstart](https://www.prisma.io/docs/v7/prisma-orm/quickstart/postgresql).
No Prisma 8 config or alias/package was created. Kept the exactly pinned v7 CLI
and its `prisma/config` import. Workspace scripts continue to use automatic
discovery; added `validate` and `migrate:status` scripts, updated tooling typecheck,
README/setup guidance and current documentation references. Historical log entries,
baseline import inventory and earlier modernization reports retain their original
filenames as historical evidence.

Confirmed `Loaded Prisma config from prisma7.config.ts` for generation, validation,
operational read-only migration status and migration deployment in the disposable
integration database. Added a regression test that launches the pinned CLI's
validate command with a synthetic URL, without `--config` or a running database,
and asserts automatic discovery plus absence of the old config. No installer
execution or operational migration deployment was needed.

### Full audit versus production closure

| Audit | High | Moderate | Critical | Reported dependency count |
|---|---:|---:|---:|---:|
| `pnpm audit` | 2 | 1 | 0 | 849 |
| `pnpm audit --prod` | 2 | 1 | 0 | 354 |

`pnpm why -r deepmerge-ts`, `pnpm why -r mysql2` and production-filtered why
commands confirm these exact chains. All CLI/config/client nodes below are 7.10.0:

```text
Development/tooling declarations:
@lms/database (devDependency)
  → prisma@7.10.0 → @prisma/config@7.10.0 → deepmerge-ts@7.1.5
@lms/database (devDependency)
  → prisma@7.10.0 → mysql2@3.15.3

Resolved production dependency closure:
@lms/api → @lms/database → @prisma/client@7.10.0
  → prisma@7.10.0 (optional peer)
    → @prisma/config@7.10.0 → deepmerge-ts@7.1.5
@lms/api → @lms/database → @prisma/client@7.10.0
  → prisma@7.10.0 (optional peer) → mysql2@3.15.3
```

| Advisory | Dependency/version | Severity | Production closure classification |
|---|---|---|---|
| [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), recursive merge stack exhaustion | deepmerge-ts 7.1.5 | High | Present through optional CLI peer/config; not development-only |
| [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), MySQL auth downgrade | mysql2 3.15.3 | High | Present through optional CLI peer; not development-only |
| [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), compressed MySQL protocol DoS | mysql2 3.15.3 | Moderate | Present through optional CLI peer; not development-only |

These are Prisma CLI/tooling-origin dependencies **present in the current resolved
production package closure**. Declaring Prisma as devDependency alone does not
remove them: the production audit reports only the client → optional CLI peer
path. Separately, normal LabFlow PostgreSQL query code uses generated client runtime
→ PrismaPg → pg, not CLI/config/MySQL. A built-facade read-only SELECT probe found
none of prisma CLI, @prisma/config, deepmerge-ts or mysql2 loaded in the CJS module
cache. That is evidence about the exercised query path, not a guarantee against
every possible CLI invocation or proof that these packages are absent from a
production installation. Production staging/exclusion has not been implemented
or certified. No overrides, forced installs, dependency upgrades or unsupported
resolutions were used; audit findings remain unresolved.

### Revalidation and deliberately unchanged limits

Frozen install, all four workspace builds/typechecks, CLI commands, API 5 suites/
25 tests, shared 3 suites/19 tests, database unit 4 tests, integration 5 tests and
built API smoke 1 test passed: **54 passed, 0 failed/skipped**. Installer syntax
parsed successfully. The renamed config is typechecked, and all five migration
files replayed only in a guarded disposable database. All 30 operational table
fingerprints still match the original Prisma 6 baseline. Migration SQL/lock hashes
match; business schema semantics are unchanged and the schema file did not change
at all during hardening. CLI/client/adapter remain exactly 7.10.0, pg 8.23.1;
no Prisma 8 lockfile entry or physical package directory was found.

The measured Prisma 7 RSS increase (112–124 MiB versus about 51 MiB) remains in the
report. No new client/pool, leak or duplicate provider was identified; fixture pool
shutdown again left zero connections. Runtime/client implementation was not
redesigned. Existing pg deprecation/Jest VM warning, untested installer/staging,
real SMS/PDF and load-test limitations remain. Final Git whitespace check passes;
no migration diff, no staging/commit/push. Sanitized audit/validation results are
also appended to the migration evidence JSON under `hardening`.
