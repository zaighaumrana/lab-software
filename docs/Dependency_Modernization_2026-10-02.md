# Dependency Modernization Results — 2026-10-02

Recorded 2026-10-02 03:25 +05:00, Asia/Karachi. Branch `development`, HEAD `e90bb10`. No commit, push, staging, branch change or database business-data writes.

## Executive result

Safe modernization completed with documented Prisma/Tailwind major-version deferrals. Root developer node_modules decreased from **818.37 MiB to 494.64 MiB** (323.72 MiB logical reduction, 39.6%). Actual login JS fell from **945,073 to 337,450 bytes**; bootstrap/static-import JS is 335,893 bytes. Security findings fell from **57 to 1**; one high Prisma CLI/config advisory remains. All builds, four type checks and 43 tests pass. A production installer and matched managed Chrome provisioning are not implemented by this task.

## Packages upgraded

Before/after are actual resolved versions. Full direct usage/retained/removed inventory is in [Doc 06](06_Dependencies_and_Tooling.md).

| Package | Before | After | Usage and reason |
|---|---|---|---|
| `@nestjs/cli` | 11.0.24 | 12.0.8 | UPGRADE: build/watch CLI; default tsc backend, no optional webpack/SWC/Rspack packages required. |
| `@nestjs/common` | 11.1.28 | 12.1.2 | UPGRADE: framework decorators, exceptions and DI; migrate Nest packages together. |
| `@nestjs/config` | 4.0.4 | 12.0.1 | UPGRADE: ConfigModule environment loading; existing configuration path retained. |
| `@nestjs/core` | 11.1.28 | 12.1.2 | UPGRADE: API bootstrap, DI and Reflector; verified compiled server startup. |
| `@nestjs/mapped-types` | 2.1.1 | 12.0.0 | UPGRADE: DTO PartialType; compatible Nest 12 validation integration. |
| `@nestjs/platform-express` | 11.1.28 | 12.1.2 | UPGRADE: HTTP adapter; existing Express Response PDF endpoints make a Fastify migration unnecessary. |
| `@nestjs/platform-socket.io` | 11.1.29 | 12.1.2 | UPGRADE: laboratory gateway Socket.IO adapter, with Nest 12 peers. |
| `@nestjs/schematics` | 11.1.0 | 12.0.6 | UPGRADE: scaffolding collection referenced by nest-cli.json and Nest CLI. |
| `@nestjs/testing` | 11.2.1 | 12.1.2 | UPGRADE: DI/controller integration tests; Jest VM module support enables Nest 12 ESM. |
| `@nestjs/websockets` | 11.1.29 | 12.1.2 | UPGRADE: gateway decorators and lifecycle contracts; existing session/tenant logic retained. |
| `@types/bcrypt` | 5.0.2 | 6.0.0 | UPGRADE: v6 native hash API declarations; development only. |
| `@types/jest` | 29.5.14 | 30.0.0 | UPGRADE: test globals/types matching Jest 30; development only. |
| `@types/node` | 22.20.1 | 24.19.0 | UPGRADE/ADD: Node 24 API and Vite config declarations; target the documented Node 24 deployment runtime rather than newer Node type generations. |
| `@types/react` | 19.2.18 | 19.3.0 | UPGRADE: stable React 19 declarations; development only. |
| `@types/react-dom` | 19.2.4 | 19.3.0 | UPGRADE: React DOM/createRoot declarations; development only. |
| `@types/supertest` | 6.0.3 | 7.2.1 | UPGRADE: HTTP integration-test declarations; development only. |
| `@vitejs/plugin-react` | 4.7.0 | 6.1.1 | UPGRADE: Vite 8-compatible React transform/HMR, current stable 6.1.1. |
| `autoprefixer` | 10.5.4 | 10.6.1 | UPGRADE: existing Tailwind 3 PostCSS chain still requires browser-prefix processing. |
| `axios` | 1.19.0 | 1.20.0 | UPGRADE: shared API client with session/tenant/branch headers, global 401 clearing and blob responses; retain to avoid rewriting established error semantics. |
| `bcrypt` | 5.1.1 | 6.0.0 | UPGRADE: API password hashes and database seed tooling; v6 includes Windows prebuilds, removes node-pre-gyp. Legacy hashes and fixture login verified. |
| `class-validator` | 0.14.4 | 0.15.1 | UPGRADE: validation decorators throughout DTOs; no changed IsIBAN options used. |
| `jest` | 29.7.0 | 30.5.2 | UPGRADE: existing API/shared unit and controller tests; retain readable mocks/assertions. |
| `lucide-react` | 0.469.0 | 1.49.0 | UPGRADE: named SVG icon imports throughout pages/layout; current stable exports compile. |
| `postcss` | 8.5.25 | 8.5.28 | UPGRADE: Tailwind 3 plugin pipeline; retain until a separately verified Tailwind 4 migration. |
| `puppeteer` | 23.11.1 | 25.12.0 | UPGRADE: three HTML/CSS PDF templates; asynchronous ESM import and explicit network-idle wait migrated. |
| `react` | 19.2.8 | 19.3.0 | UPGRADE: JSX, hooks and context; stable 19.3.0, no canary. |
| `react-dom` | 19.2.8 | 19.3.0 | UPGRADE: createRoot rendering; matched React 19.3.0. |
| `recharts` | 2.15.4 | 3.10.1 | UPGRADE: bar, line, donut and stacked-bar widgets; route lazy loading removes chart cost from login. Disable new legend sorting to preserve supplied order. |
| `socket.io` | 4.8.3 | 4.8.4 | UPGRADE: laboratory push transport, tenant rooms and session handshake; server/client updated together. |
| `socket.io-client` | 4.8.3 | 4.8.4 | UPGRADE: laboratory session-authenticated live updates; matched server version. |
| `supertest` | 7.2.2 | 7.3.0 | UPGRADE: existing catalog HTTP integration tests; maintained compatible version. |
| `ts-jest` | 29.4.12 | 29.4.14 | UPGRADE: TypeScript decorators/metadata in tests; current release supports Jest 30 and TS <7. Transform config updated; isolated test compilation removes hybrid-module warning. |
| `tsx` | 4.23.1 | 4.23.15 | UPGRADE: TypeScript database seed runner, development/installation tool only; seed not executed. |
| `typescript` | 5.9.3 | 6.0.3 | UPGRADE: all workspace builds/type checks; stable 6.0.3 is compatible with Nest CLI and ts-jest, unlike available stable 7.0.2. |
| `vite` | 6.4.3 | 8.3.2 | UPGRADE: Vite 8 Rolldown/Oxc production build/dev server; ESM-native config alias repaired. |

## Removed and replaced

| Package | Decision | Benefit |
|---|---|---|
| @nestjs/jwt | Removed: no JWT usage | Removes dead authentication implementation and transitive attack surface |
| @nestjs/passport | Removed: no Passport module/strategies | Removes dead Nest integration |
| passport | Removed: sessions use AuthService | Removes unused middleware |
| passport-local | Removed: no local Passport strategy | Removes unused authentication strategy |
| @types/passport-local | Removed with unused strategy | Removes unused development declarations |
| react-router-dom | Replaced by react-router 7.18.4 | Official direct API; removes compatibility wrapper and migrates 19 import sites |

Added react-is 19.3.0 explicitly for Recharts' peer and @types/node 24.19.0 for Vite config typing. Direct declarations 60 → 57; runtime declarations 30 → 27; dev declarations 30 → 30. Individual removal savings are not attributed without an isolated benchmark. Framework upgrades and removal of inherited optional webpack tooling account for additional graph/installation reductions.

## Deliberately retained decisions

- Express: existing Response/PDF/controller behavior, no measured LAN throughput bottleneck requiring Fastify.
- Native bcrypt 6: bundled Windows prebuilds, existing hash compatibility and hashing performance; bcryptjs would trade native binaries for slower hashing.
- Full Puppeteer 25: preserve HTML/CSS fidelity and a matched managed Chrome option. Skip only unused headless-shell download. No hardcoded executable path in source; explicitly configured system Chrome used for this task's tests.
- Recharts 3: retain all four widgets and React/SVG behavior; Chart.js canvas replacement needs unproven redesign. Lazy routes address startup loading; total bundle does not decrease.
- Axios: preserve interceptor/header/401/error/blob behavior; no measured equivalent fetch-wrapper benefit.
- Socket.IO 4: preserve reconnection, tenant rooms and session handshake.
- Prisma/client 6.19.3 pinned together: v7.10.0 stable requires generator/import/driver/pooling migration plus transaction/Decimal regression coverage. Registry latest 8.0.0-rc.19 is deliberately excluded. Schema/migrations unchanged; config moved to supported prisma.config.ts only.
- Tailwind 3.4.19: v4.3.3 defaults/browser floor/@apply migration deferred until visual/browser coverage exists; PostCSS and Autoprefixer remain necessary for v3.
- Jest/ts-jest: preserve existing Nest decorator metadata and mocks without a new runner/native transformer. TypeScript 6.0.3 selected because ts-jest supports TS below 7; stable 7.0.2 deliberately excluded.

See [Doc 06](06_Dependencies_and_Tooling.md) for official guides, alternatives, use sites, stable-version research and per-package decisions.

## Disk footprint

Bytes below are apparent logical file sizes. Traversal excludes symlinks/junctions; nested subset rows must not be summed. The source row covers tracked files at the measurement point, before this final report/log addition; it excludes new untracked files.

| Component | Before bytes | After bytes | Difference |
|---|---:|---:|---:|
| Tracked source snapshot | 1,376,493 | 1,342,079 | -34,414 |
| Root node_modules | 858,120,790 | 518,671,067 | -339,449,723 |
| Virtual store (subset of root) | 857,824,882 | 518,417,778 | -339,407,104 |
| API workspace node_modules (links excluded) | 62,320 | 36,228 | -26,092 |
| Web workspace node_modules (links excluded) | 12,412,479 | 13,471,308 | +1,058,829 |
| Database workspace node_modules (links excluded) | 21,206,438 | 21,207,135 | +697 |
| Shared workspace node_modules (links excluded) | 30,528 | 24,118 | -6,410 |
| Puppeteer browser cache | 0 | 0 | +0 |
| Puppeteer JS packages (subset of root) | 9,047,632 | 6,485,775 | -2,561,857 |
| Prisma binaries (subset of root) | 134,013,848 | 112,830,872 | -21,182,976 |
| Web dist | 974,322 | 991,948 | +17,626 |
| API dist | 1,130,774 | 888,434 | -242,340 |
| Shared dist | 51,379 | 51,379 | +0 |
| Vite cache (subset of web modules) | 12,352,367 | 13,435,182 | +1,082,815 |
| Coverage | 0 | 0 | +0 |
| External shared pnpm store | 748,037,213 | 955,010,486 | +206,973,273 |
| Git metadata | 9,663,249 | 9,663,249 | +0 |

Root node_modules unique file bytes (NTFS file-ID deduplication) are **826,618,283 → 504,849,363** (788.32 → 481.46 MiB). GetCompressedFileSizeW stored-file data values equal those unique bytes here. This is not a cluster-allocation measurement or proof of that many bytes freed from the volume: pnpm hardlinks share storage with its external content-addressable store, which grew by 206,973,273 bytes as maintained versions were fetched. It serves other projects and was not pruned.

Updating in place accumulated stale package versions; before the final measurement, only the five verified workspace node_modules directories were recreated from the reviewed frozen lockfile. The task-created 144,476,508-byte interrupted Chrome ZIP was removed. No source/data/migration/shared-store deletion occurred. Browser cache baseline/final are both zero; no managed-browser storage reduction is claimed.

Source, development installation, production runtime and browser bundle are separate. The production staging/installer footprint is **not measured**. A production-only audit resolves 252 graph entries here (including platform optional packages), but this is not an installer or disk-size estimate. Build/generate first, assemble a separate production closure and static web dist, provision Windows Node/PostgreSQL/Prisma engine/Chrome, then validate that independent directory offline. Packaging details and caveats are in Doc 06.

## Frontend bundle

Final emitted file sizes; Node gzip default level 6, same compression method before/after. Initial bootstrap means entry plus recursively static imports; login is a dynamic page. The production browser requested entry, shared runtime and login page, with no chart chunk.

| Metric | Before bytes | After bytes | Difference |
|---|---:|---:|---:|
| Entry + static imports JS | 945,073 | 335,893 | -609,180 (-64.5%) |
| Entry + static imports gzip | 264,383 | 108,610 | -155,773 (-58.9%) |
| All JS chunks | 945,073 | 964,331 | +19,258 (+2.0%) |
| Sum of gzip of every JS chunk | 264,383 | 293,155 | +28,772 (+10.9%) |
| Largest JS chunk | 945,073 | 391,225 | -553,848 (-58.6%) |

Actual login graph: **337,450 JS bytes / 109,341 gzip bytes**. All 37 JS chunks total 964,331 / 293,155 gzip bytes: +2.0% raw and +10.9% summed gzip. Splitting loses some cross-page compression and newer chart internals add code; this work improves initial loading, not total downloadable bytes. Largest chunk is 391,225 bytes, below the unchanged 500 KB warning threshold.

Before-minification rendered module attribution (not directly additive minified network sizes): Recharts 579,617 → 646,161; React DOM 561,283 → 536,987; application 352,754 → 364,872; Axios 151,378 → 110,734; Router 86,271 → 94,920; Lucide 15,455 → 23,696; Socket.IO client 39,927 → 19,202; Engine.IO client 52,692 → 30,606. Old Lodash/react-smooth/recharts-scale modules are gone; new chart state/toolkit helpers remain. No permanent analyzer package was added.

## Deprecated/transitive status

Deprecated resolved versions: **9 → 1**. Removed are are-we-there-yet 2, gauge 3, glob 7, inflight 1, npmlog 5, rimraf 3, tar 6, Puppeteer 23 and Recharts 2. bcrypt 5's node-pre-gyp and Jest 29's old glob tree were the relevant owners.

Remaining glob 10.5.0 is **development-only**: Jest → @jest/transform → babel-plugin-istanbul → test-exclude. Latest reviewed Jest/ts-jest still resolve it. No manually forced transitive overrides, additions or removals. pnpm owns normal lockfile resolution; clean resolution removed inherited Nest 11 optional webpack/fork-ts-checker/tooling and used patched compatible transitives.

## Security audit

| Severity | Before full audit | After full audit | After production audit |
|---|---:|---:|---:|
| Critical | 1 | 0 | 0 |
| High | 37 | 1 | 1 |
| Moderate | 18 | 0 | 0 |
| Low | 1 | 0 | 0 |
| Total | 57 | 1 | 1 |

Graph entries: 904 → 765 in the full audit; current production graph 252. These metadata counts include resolved versions/platform optional dependencies, not direct declarations or loaded runtime modules.

Remaining [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): deepmerge-ts 7.1.5 can exhaust the stack when merging recursive object graphs; fixed in 8+. Path: Prisma 6 → @prisma/config → deepmerge-ts, also included through @prisma/client's optional Prisma CLI peer. This is CLI/configuration code, not proof of an exploitable HTTP handler, but the high advisory is not dismissed. No compatible v6 direct upgrade was available in research; v7 migration and an independently packaged runtime closure remain follow-up work. Audit intentionally exits nonzero until resolved.

## Builds and installation

- pnpm install --frozen-lockfile: passed from a clean installation; 678 Windows-installed packages reused from shared store. Temporary browser-download skip was necessary during clean installation. Subsequent unmodified frozen install passed (already up to date); it does not prove the managed Chrome download succeeded.
- pnpm db:generate: passed, client 6.19.3 generated; no database changes.
- pnpm --filter @lms/database exec prisma validate: passed.
- pnpm -r build: passed for shared (CJS/ESM), API and web. Database intentionally has no build script.
- pnpm typecheck: passed for all four workspaces.
- Deprecated Prisma package.json config and ts-jest hybrid-module warnings removed. Vite __dirname and invalid escaped print:hidden CSS warnings fixed. Oversized-chunk warning gone without raising its threshold.
- Vite occasionally reports PLUGIN_TIMINGS under concurrent build/disk work; this diagnostic is left enabled. Node's ExperimentalWarning for Jest VM Modules remains. Prisma's update notice advertises an RC; no RC installed.

## Tests

API: **4 suites, 24 tests passed** (baseline 3/18). Shared: **3 suites, 19 tests passed** (baseline 3/19). Six new meaningful cases cover old bcrypt 5-generated `$2a$`/`$2b$` hashes, rejection, new hashing, session creation/revocation and rejected login without fixture updates. Database access in login tests is mocked; no stored account or lastLoginAt was modified.

## Runtime smoke testing

| Area | Status | Scope |
|---|---|---|
| Compiled Nest API | Verified | Started isolated port 3100 against local PostgreSQL 18 |
| Database connectivity | Verified, read only | SELECT 1, no migration/seed/business writes |
| HTTP authorization | Verified | Auth/me, patient search, booking lookup, invoices, pending samples, reports, settings/users reject absent sessions with 401 |
| Public settings | Verified, read only | 200 response; source inspected to confirm only configuration reads |
| Login/session | Verified with fixtures | Legacy hash login/logout and wrong-password service tests use mocked Prisma; actual real-account login not run because it updates lastLoginAt |
| Socket.IO server/client | Verified | Updated client completes protocol connection and gateway disconnects invalid session; valid tenant broadcast not exercised |
| Invoice/report/doctor PDFs | Verified with fixtures | Production templates + PrintingService produce real %PDF buffers; Chrome 154.0.8037.58 configured through env; no print endpoint that marks a real report printed was invoked |
| Vite | Verified | Isolated dev server port 5175 starts |
| Web login/routing/API client | Verified with HTTP fixtures | Login, patients/profile navigation, Bearer+tenant injection and 401 clearing/redirect; no browser page errors |
| All four charts | Verified with fixtures | SVG geometry and screenshot inspected under supported reduced-motion preference for deterministic output; default animation timing is not a complete visual regression test |
| Styles | Verified spot checks | Compiled Tailwind CSS and login button color/radius; no screen redesign |
| Production web | Verified | Preview port 5176 login loads, protected patients route redirects, chart chunk not requested; no browser page errors |
| Full operational workflows | Compile-verified, not runtime-tested | Patient/booking/payment/lab-result/report writes, permission permutations, long-running sockets and all print layouts were not exercised |
| Matched managed browser/offline installer | Not runtime-tested | Download/provisioning and independent offline staging validation remain required |

Temporary fixture HTML was removed, task-owned server/browser processes stopped. No tests were fabricated for unexercised workflows.

## Files changed

- `.puppeteerrc.cjs`
- `README.md`
- `apps/api/package.json`
- `apps/api/src/modules/auth/password-compatibility.spec.ts`
- `apps/api/src/modules/printing/printing.service.ts`
- `apps/api/tsconfig.json`
- `apps/api/tsconfig.spec.json`
- `apps/web/package.json`
- `apps/web/src/App.tsx`
- `apps/web/src/dashboard/widgets/KpiCard.tsx`
- `apps/web/src/dashboard/widgets/LineChartWidget.tsx`
- `apps/web/src/dashboard/widgets/PieChartWidget.tsx`
- `apps/web/src/dashboard/widgets/StackedBarChartWidget.tsx`
- `apps/web/src/dashboard/widgets/TopDoctorsTable.tsx`
- `apps/web/src/index.css`
- `apps/web/src/layouts/AppLayout.tsx`
- `apps/web/src/pages/auth/LoginPage.tsx`
- `apps/web/src/pages/billing/InvoiceDetailPage.tsx`
- `apps/web/src/pages/billing/InvoicePrintPage.tsx`
- `apps/web/src/pages/billing/InvoicesPage.tsx`
- `apps/web/src/pages/dashboard/DashboardPage.tsx`
- `apps/web/src/pages/dashboard/OperatorDashboardPage.tsx`
- `apps/web/src/pages/doctors/DoctorDashboardPage.tsx`
- `apps/web/src/pages/doctors/DoctorStatementPrintPage.tsx`
- `apps/web/src/pages/doctors/DoctorsPage.tsx`
- `apps/web/src/pages/patients/PatientsPage.tsx`
- `apps/web/src/pages/reports/ReportDocumentPage.tsx`
- `apps/web/src/pages/reports/ReportPrintPage.tsx`
- `apps/web/src/pages/reports/ReportsPage.tsx`
- `apps/web/src/pages/settings/SettingsPage.tsx`
- `apps/web/src/pages/visit/VisitPage.tsx`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `docs/06_Dependencies_and_Tooling.md`
- `docs/Dependency_Modernization_2026-10-02.md`
- `docs/dependency-modernization-2026-10-02.json`
- `package.json`
- `packages/database/package.json`
- `packages/database/prisma.config.ts`
- `packages/shared/package.json`
- `packages/shared/tsconfig.cjs.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `setup.ps1`
- `upgratdaion`

## Remaining risks / future work

Resolve the Prisma CLI/config high advisory through a separately tested stable v7 migration or validated production exclusion. Provision the matched Chrome and test the actual Windows offline staging/installer. Tailwind 4 requires browser/style regression coverage; TS 7 requires ts-jest/toolchain support. glob 10 deprecation and Node VM Modules warning depend on upstream tooling. Total all-route JS/gzip grew, despite improved startup loading. Full business writes and default chart animations were deliberately not certified by these smoke tests.

## Git state

development at e90bb10, modifications/untracked files left for manual inspection. No changes staged; main/tag/history untouched; no commit/push/merge/reset/rebase/branch creation. git diff --check passed after whitespace cleanup; schema/migrations diff is empty. Full final status/stat will be checked after this report/log write. Suggested eventual commit: `refactor: modernize dependencies and reduce startup footprint` (not executed).

Machine-readable measurements: [dependency-modernization-2026-10-02.json](dependency-modernization-2026-10-02.json). Raw temporary command output and fixtures remain under the task's TEMP evidence directory, not runtime dependencies.
