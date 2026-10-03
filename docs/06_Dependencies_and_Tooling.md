# Dependencies and Tooling Reference

Updated 2026-10-02 (Asia/Karachi). This is the local offline-first LabFlow workspace: API, internal web, database and shared packages. The public website remains in its separate repository. See [the Prisma 7 migration](Prisma_7_Migration_2026-10-02.md) for the current ORM boundary and [the modernization results](Dependency_Modernization_2026-10-02.md) for measured footprint, bundle, security and validation results.

## Runtime and workspace

- Node.js **24.15.0 or newer**, with Node 24 LTS recommended. Tested on 24.21.0. Nest 12 is ESM; compiled API/shared code remains CommonJS using NodeNext resolution and modern Node's ESM interoperability. Puppeteer 25 requires asynchronous dynamic import.
- pnpm **11.23.0**, pinned in root `package.json`. Preserve `pnpm-lock.yaml` and install with `pnpm install --frozen-lockfile`.
- Workspace paths: `apps/api`, `apps/web`, `packages/database`, `packages/shared`.
- Root `pnpm typecheck` checks all four packages. The former lint script referenced an absent ESLint installation/configuration and has been removed; this task adds no lint framework.
- Native/postinstall allowance: `@parcel/watcher`, `@prisma/client`, `@prisma/engines`, `bcrypt`, `esbuild`, `prisma`, `puppeteer`, `unrs-resolver`. Watcher/resolver belong to Jest 30; development only. Vite 8 uses native Rolldown/Oxc binaries; esbuild remains a transitive build dependency elsewhere.
- A narrow `minimumReleaseAgeExclude` entry allows reviewed stable `vite@8.3.2`; the general supply-chain age policy remains enabled.

## Every direct dependency: usage, version and decision

Versions below are the **actual resolved versions**, not the older lower bounds originally written in manifests. Repeated workspace declarations are grouped; each declaration's runtime/development scope is shown. Registry stable versions were researched during this task; future upgrades must repeat that research. The manifest/lockfile remain authoritative.

| Package | Used by | Resolved before | Resolved after | Highest stable researched | Decision and actual usage |
|---|---|---|---|---|---|
| `@lms/database` | api | link:../../packages/database | link:../../packages/database | internal | KEEP: API imports Prisma client; internal workspace package, no registry version. |
| `@lms/shared` | api, web | link:../../packages/shared | link:../../packages/shared | internal | KEEP: shared domain constants, notification definitions and permission contracts. |
| `@nestjs/cli` | api (dev) | 11.0.24 | 12.0.8 | 12.0.8 | UPGRADE: build/watch CLI; default tsc backend, no optional webpack/SWC/Rspack packages required. |
| `@nestjs/common` | api | 11.1.28 | 12.1.2 | 12.1.2 | UPGRADE: framework decorators, exceptions and DI; migrate Nest packages together. |
| `@nestjs/config` | api | 4.0.4 | 12.0.1 | 12.0.1 | UPGRADE: ConfigModule environment loading; existing configuration path retained. |
| `@nestjs/core` | api | 11.1.28 | 12.1.2 | 12.1.2 | UPGRADE: API bootstrap, DI and Reflector; verified compiled server startup. |
| `@nestjs/jwt` | api | 11.0.2 | removed | 12.0.2 | REMOVE: no JwtModule/JWT signing or verification usage; custom session authentication. |
| `@nestjs/mapped-types` | api | 2.1.1 | 12.0.0 | 12.0.0 | UPGRADE: DTO PartialType; compatible Nest 12 validation integration. |
| `@nestjs/passport` | api | 11.0.5 | removed | 12.0.0 | REMOVE: no PassportModule or registered strategies; custom session authentication. |
| `@nestjs/platform-express` | api | 11.1.28 | 12.1.2 | 12.1.2 | UPGRADE: HTTP adapter; existing Express Response PDF endpoints make a Fastify migration unnecessary. |
| `@nestjs/platform-socket.io` | api | 11.1.29 | 12.1.2 | 12.1.2 | UPGRADE: laboratory gateway Socket.IO adapter, with Nest 12 peers. |
| `@nestjs/schematics` | api (dev) | 11.1.0 | 12.0.6 | 12.0.6 | UPGRADE: scaffolding collection referenced by nest-cli.json and Nest CLI. |
| `@nestjs/testing` | api (dev) | 11.2.1 | 12.1.2 | 12.1.2 | UPGRADE: DI/controller integration tests; Jest VM module support enables Nest 12 ESM. |
| `@nestjs/websockets` | api | 11.1.29 | 12.1.2 | 12.1.2 | UPGRADE: gateway decorators and lifecycle contracts; existing session/tenant logic retained. |
| `@prisma/client` | database | 6.19.3 | 7.10.0 | 7.10.0 | UPGRADE: exact stable v7; runtime for package-local generated client, public facade hides implementation. |
| `@prisma/adapter-pg` | database | — | 7.10.0 | 7.10.0 | ADD: supported direct PostgreSQL adapter, created only by src/client.ts. |
| `@types/bcrypt` | api (dev), database (dev) | 5.0.2 | 6.0.0 | 6.0.0 | UPGRADE: v6 native hash API declarations; development only. |
| `@types/express` | api (dev) | 5.0.6 | 5.0.6 | 5.0.6 | KEEP: Express 5 Response declarations for PDF endpoints; current stable version already resolved. |
| `@types/jest` | api (dev), shared (dev) | 29.5.14 | 30.0.0 | 30.0.0 | UPGRADE: test globals/types matching Jest 30; development only. |
| `@types/node` | api (dev), web (dev), database (dev) | 22.20.1 | 24.19.0 | 26.6.3 | UPGRADE/ADD: Node 24 API, Vite config and database tooling declarations; target the documented Node 24 deployment runtime rather than newer Node type generations. |
| `@types/passport-local` | api (dev) | 1.0.38 | removed | 1.0.38 | REMOVE: no remaining Passport source/types. |
| `@types/react` | web (dev) | 19.2.18 | 19.3.0 | 19.3.0 | UPGRADE: stable React 19 declarations; development only. |
| `@types/react-dom` | web (dev) | 19.2.4 | 19.3.0 | 19.3.0 | UPGRADE: React DOM/createRoot declarations; development only. |
| `@types/supertest` | api (dev) | 6.0.3 | 7.2.1 | 7.2.1 | UPGRADE: HTTP integration-test declarations; development only. |
| `@vitejs/plugin-react` | web (dev) | 4.7.0 | 6.1.1 | 6.1.1 | UPGRADE: Vite 8-compatible React transform/HMR, current stable 6.1.1. |
| `autoprefixer` | web (dev) | 10.5.4 | 10.6.1 | 10.6.1 | UPGRADE: existing Tailwind 3 PostCSS chain still requires browser-prefix processing. |
| `axios` | web | 1.19.0 | 1.20.0 | 1.20.0 | UPGRADE: shared API client with session/tenant/branch headers, global 401 clearing and blob responses; retain to avoid rewriting established error semantics. |
| `bcrypt` | api, database (dev) | 5.1.1 | 6.0.0 | 6.0.0 | UPGRADE: API password hashes and database seed tooling; v6 includes Windows prebuilds, removes node-pre-gyp. Legacy hashes and fixture login verified. |
| `class-transformer` | api | 0.5.1 | 0.5.1 | 0.5.1 | KEEP: ValidationPipe DTO conversion; current stable 0.5.1 remains compatible. |
| `class-validator` | api | 0.14.4 | 0.15.1 | 0.15.1 | UPGRADE: validation decorators throughout DTOs; no changed IsIBAN options used. |
| `clsx` | web | 2.1.1 | 2.1.1 | 2.1.1 | KEEP: conditional UI class names; tiny maintained current stable 2.1.1. |
| `jest` | api (dev), shared (dev) | 29.7.0 | 30.5.2 | 30.5.2 | UPGRADE: existing API/shared unit and controller tests; retain readable mocks/assertions. |
| `lucide-react` | web | 0.469.0 | 1.49.0 | 1.49.0 | UPGRADE: named SVG icon imports throughout pages/layout; current stable exports compile. |
| `passport` | api | 0.7.0 | removed | 0.7.0 | REMOVE: no Passport authentication calls; custom session authentication. |
| `passport-local` | api | 1.0.0 | removed | 1.0.0 | REMOVE: no local Passport strategy; custom session authentication. |
| `postcss` | web (dev) | 8.5.25 | 8.5.28 | 8.5.28 | UPGRADE: Tailwind 3 plugin pipeline; retain until a separately verified Tailwind 4 migration. |
| `prisma` | database (dev) | 6.19.3 | 7.10.0 | 7.10.0 | UPGRADE: exact stable v7 CLI; ignore advertised v8 RC. Config owns datasource URL and seed command. |
| `pg` | database | — | 8.23.1 | 8.23.1 | ADD: direct local PostgreSQL driver; max 10, connection/acquisition timeout 5 seconds. |
| `@types/pg` | database (dev) | — | 8.23.1 | 8.23.1 | ADD: typed integration harness and driver configuration. |
| `puppeteer` | api | 23.11.1 | 25.12.0 | 25.12.0 | UPGRADE: three HTML/CSS PDF templates; asynchronous ESM import and explicit network-idle wait migrated. |
| `react` | web | 19.2.8 | 19.3.0 | 19.3.0 | UPGRADE: JSX, hooks and context; stable 19.3.0, no canary. |
| `react-dom` | web | 19.2.8 | 19.3.0 | 19.3.0 | UPGRADE: createRoot rendering; matched React 19.3.0. |
| `react-is` | web | — | 19.3.0 | 19.3.0 | ADD: explicit Recharts 3 peer matching React 19.3.0. |
| `react-router` | web | — | 7.18.4 | 8.4.0 | REPLACE: officially supported direct v7 declarative routing API; imports migrated from react-router-dom. |
| `react-router-dom` | web | 7.18.2 | removed | 7.18.4 | REPLACE: compatibility re-export wrapper removed; use react-router directly. |
| `recharts` | web | 2.15.4 | 3.10.1 | 3.10.1 | UPGRADE: bar, line, donut and stacked-bar widgets; route lazy loading removes chart cost from login. Disable new legend sorting to preserve supplied order. |
| `reflect-metadata` | api | 0.2.2 | 0.2.2 | 0.2.2 | KEEP: Nest decorator metadata runtime requirement; current stable 0.2.2. |
| `rxjs` | api | 7.8.2 | 7.8.2 | 7.8.2 | KEEP: Nest request/interceptor peer dependency; current stable 7.8.2 already resolved in baseline. |
| `socket.io` | api | 4.8.3 | 4.8.4 | 4.8.4 | UPGRADE: laboratory push transport, tenant rooms and session handshake; server/client updated together. |
| `socket.io-client` | web | 4.8.3 | 4.8.4 | 4.8.4 | UPGRADE: laboratory session-authenticated live updates; matched server version. |
| `supertest` | api (dev) | 7.2.2 | 7.3.0 | 7.3.0 | UPGRADE: existing catalog HTTP integration tests; maintained compatible version. |
| `tailwindcss` | web (dev) | 3.4.19 | 3.4.19 | 4.3.3 | KEEP: current stable 3.4.19 within v3. Defer v4.3.3 because existing @apply/utilities and older LAN browsers need visual regression coverage. |
| `ts-jest` | api (dev), shared (dev) | 29.4.12 | 29.4.14 | 29.4.14 | UPGRADE: TypeScript decorators/metadata in tests; current release supports Jest 30 and TS <7. Transform config updated; isolated test compilation removes hybrid-module warning. |
| `tsx` | database (dev) | 4.23.1 | 4.23.15 | 4.23.15 | UPGRADE: TypeScript database seed runner, development/installation tool only; seed not executed. |
| `typescript` | api (dev), database (dev), shared (dev), web (dev) | 5.9.3 | 6.0.3 | 7.0.2 | UPGRADE: all workspace builds/type checks; stable 6.0.3 is compatible with Nest CLI and ts-jest, unlike available stable 7.0.2. |
| `vite` | web (dev) | 6.4.3 | 8.3.2 | 8.3.2 | UPGRADE: Vite 8 Rolldown/Oxc production build/dev server; ESM-native config alias repaired. |

## Direct declaration counts

Counts include internal workspace links; repeated declarations are counted in their respective packages.

| Workspace | Runtime | Development |
|---|---:|---:|
| `@lms/api` | 16 | 12 |
| `@lms/web` | 10 | 9 |
| `@lms/database` | 3 | 7 |
| `@lms/shared` | 0 | 4 |

Before dependency modernization: 60 declarations (30 runtime, 30 development). After modernization: 57 (27 runtime, 30 development). After the dedicated Prisma 7 migration: 61 (29 runtime, 32 development). No TypeScript compiler, bundler, test runner, typings, Nest CLI, Prisma CLI or seed runner was moved into runtime dependencies. The production audit still includes Prisma CLI through the client's optional peer dependency; do not mistake a devDependency declaration for guaranteed exclusion from the resolved production graph.

## Architectural decisions

**Express retained.** Controllers use Express `Response` for PDFs, normal Nest guards/validation/CORS and a Socket.IO adapter. No measured LAN bottleneck justifies rewriting transport-specific behavior for Fastify. Keep the upgraded maintained Nest Express adapter; Fastify benchmark throughput alone does not establish an application benefit. [Nest guidance](https://docs.nestjs.com/techniques/performance).

**bcrypt 6 retained.** Native Windows x64/arm64 prebuilds use node-gyp-build instead of the deprecated node-pre-gyp download stack. Existing `$2a$`/`$2b$` hashes are compatible and tested. bcryptjs avoids native addons but its documented hashing speed is about 30% slower; introducing another algorithm would require backward-compatible verification and is outside this modernization. Build/package for the deployment OS/architecture; unsupported platforms may still need compilation. [bcrypt](https://github.com/kelektiv/node.bcrypt.js), [bcryptjs](https://github.com/dcodeIO/bcrypt.js).

**Full Puppeteer 25 retained.** It provides a matched managed Chrome and preserves the three current HTML/CSS templates. `.puppeteerrc.cjs` skips only the separate chrome-headless-shell download: this service launches `headless: true`, which uses regular Chrome. `puppeteer-core` would transfer versioning, discovery and offline provisioning responsibility to our installer. Playwright can add browser/driver weight; replacing browser layout with a simpler PDF library would require template redesign. A deliberate `PUPPETEER_EXECUTABLE_PATH` override remains supported; no developer machine path is embedded in source. [Configuration](https://pptr.dev/guides/configuration), [v25 changelog](https://pptr.dev/CHANGELOG).

The managed browser was absent before this task. Downloading the new managed Chrome did not complete successfully here; installation validation used temporary `PUPPETEER_SKIP_DOWNLOAD=true`, and PDF/browser smoke tests used an explicitly configured installed Chrome 154.0.8037.58. The task-created partial ZIP was removed. A normal online build must provision the matched Chrome, then bundle it and set `PUPPETEER_CACHE_DIR` appropriately for offline deployment, or deliberately provision/configure a supported executable. Never ship a production installation with no usable browser and no executable configuration. No browser-cache savings are claimed.

**Recharts 3 retained.** All four widget types still use React/SVG and their current typed props. Chart.js is a maintained tree-shakeable canvas alternative, but would require rewriting widget rendering, interaction, legends and accessibility; no equivalent-production benchmark established a net benefit. Recharts' old react-smooth/recharts-scale tree is gone; newer internals add other code. Lazy routes resolve the observed startup cost without chart redesign. Total application JS grew slightly; initial JS is substantially smaller. Legend input order is explicitly retained. [Migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide), [Chart.js integration](https://www.chartjs.org/docs/latest/getting-started/integration).

**Axios retained.** Auth/tenant/branch injection, global 401 redirects, persisted-session clearing, normalized errors and PDF/blob responses already use its interface. Native fetch would need its own equivalent wrapper and migration of callers; Axios was a smaller contributor than charts/framework/application code. No replacement-size saving is claimed. Its upgraded behavior was tested with browser request fixtures.

**Socket.IO retained.** The laboratory screen uses reconnection, session authentication, tenant rooms and push events. Native WebSocket would need reconnection/room/protocol logic. Updated server/client remain on the compatible 4.8 series; invalid-session rejection was verified against the running gateway.

**Prisma 7.10.0 pinned.** The database package generates TypeScript into ignored `src/generated/prisma`, then compiles its CommonJS facade and client to `dist`. Only the root package export is public. `src/client.ts` owns runtime URL validation, schema selection, PrismaPg and one owned pg pool per client. Nest provides one global PrismaService and calls connect/disconnect; shutdown hooks and auth timer cleanup allow graceful exit. Pool max is 10, connection/acquisition timeout 5 seconds, driver idle timeout remains 10 seconds; transaction defaults remain 2s maxWait/5s timeout. CLI/seed share package-local env loading; runtime uses existing Nest ConfigModule, with external variables taking precedence. Generate after schema changes, before starting API/seed or building a fresh checkout. No domain or migration SQL change; operational data fingerprints match. Prisma 8 migration readiness localizes infrastructure, but its different query API may still need business query changes. See [the report](Prisma_7_Migration_2026-10-02.md) for tests, memory increase and three unresolved audit advisories. [Upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

**Tailwind 3 retained.** v4 changes browser requirements, CSS setup and defaults for utilities/rings/borders/shadows. Existing reusable `@apply` classes and print styling need visual regression coverage before that migration. Keep current v3.4.19 and its PostCSS/Autoprefixer pipeline. This is an explicit deferral, not a claim that v3 is the latest major. [Upgrade guide](https://tailwindcss.com/docs/upgrade-guide).

**Jest/ts-jest retained.** Existing mocks, Supertest integration and Nest decorator metadata work with the upgraded stack. Vitest would introduce a new runner/configuration and a metadata-compatible transform; SWC adds another native transform/configuration. No measured test performance problem warrants those migrations for this small suite. ts-jest supports TypeScript below 7, so TS 6.0.3 is intentionally selected. Nest 12 ESM tests use `node --experimental-vm-modules`; Node still emits its honest experimental VM Modules warning. The packages themselves are stable releases. [Jest ESM](https://jestjs.io/docs/ecmascript-modules), [Nest migration](https://docs.nestjs.com/migration-guide), [ts-jest](https://github.com/kulshekhar/ts-jest).

## Prisma 7 final hardening and security exposure (2026-10-02)

The package-local CLI config is now `packages/database/prisma7.config.ts`, following [Prisma 7.10+ filename/discovery guidance](https://www.prisma.io/docs/v7/prisma-orm/quickstart/postgresql). Existing workspace commands automatically discover it; validate/migrate:status scripts and the tooling typecheck explicitly cover this workflow. The regression test validates discovery without --config or a running database. setup.ps1 still invokes the pinned workspace generator and migrate:deploy; it creates no Prisma 8 config.

Both full and production audits report **2 high + 1 moderate**, zero critical. Development/tooling chains are database devDependency → prisma 7.10.0 → @prisma/config 7.10.0 → deepmerge-ts 7.1.5, and database devDependency → prisma 7.10.0 → mysql2 3.15.3. The production closure also contains both packages: database runtime dependency → @prisma/client 7.10.0 → optional peer prisma 7.10.0 → those same config/deepmerge or mysql2 chains. deepmerge-ts has GHSA-ggr8-5vv4-36mx (high); mysql2 has GHSA-3f6p-5ww8-9rcr (high) and GHSA-rgwj-5xj2-c3m3 (moderate). These are CLI-origin findings, **not development-only dependencies under this lockfile**.

The exercised PostgreSQL runtime path uses generated client runtime/PrismaPg/pg and did not load CLI/config/deepmerge/mysql2 in the read-only module-cache probe. Presence in production packages and execution by runtime queries are separate facts. No production staging exclusion is certified, no overrides or forced/unsupported resolutions were applied, and the vulnerabilities remain unresolved. Exact chains/advisory links and audit counts are in [the migration report](Prisma_7_Migration_2026-10-02.md).

All four builds/typechecks and **54 tests** passed, including the added config-discovery regression. Operational fingerprints and migration hashes match; schema bytes did not change in hardening. Keep the measured RSS increase (about 51 MiB v6 → 112–124 MiB v7) documented; one global provider/owned pool and zero fixture connections after close give no evidence of an obvious leak or duplicate instance. Actual offline staging, real SMS/PDF/load tests and existing pg/Jest warnings remain limitations.

## Windows/offline production boundary

The source checkout, development installation, shared pnpm cache, production runtime and downloaded browser assets are different size measurements. Do not ship the development `node_modules` tree or copy a Linux native installation onto Windows.

Build on matching Windows architecture: install from the lockfile, provision Chrome, generate Prisma client, build shared/API/web, run checks, then assemble a **separate staging directory** with API dist, compiled database facade/generated client and Prisma 7 runtime/query compiler with PostgreSQL adapter/pg, shared CJS dist, required production dependency closure, static web dist, Node runtime, browser and PostgreSQL prerequisite/configuration. Browser clients receive static web assets; React/Vite development dependencies do not need a server runtime installation.

`pnpm install --prod --frozen-lockfile` can reduce a staging installation but cannot replace the preceding generation/build steps. Do not prune the working development installation as a packaging test. With pnpm 11, evaluate a filtered `pnpm deploy --legacy` staging workflow and workspace-package inclusion before adopting it: the default deploy mode may require injected workspace packages. Preserve all internal links as actual packaged files and smoke-test that independent directory offline. This task does not implement or measure a final installer/production directory. Never run seed or destructive schema commands merely to validate dependency changes. Shared pnpm store pruning affects other projects and was not performed.

PostgreSQL is a system dependency outside npm; the API smoke test used a running local PostgreSQL 18 instance. Do not bundle credentials from development `.env` files.


## E1 runtime and migration connections (2026-10-04)

Prisma CLI remains on owner `DATABASE_URL` through `prisma7.config.ts`. API
`PrismaService` uses `RUNTIME_DATABASE_URL` and read-only catalog privilege checks
in hardened/production mode. `apps/api/.env.runtime` contains runtime/provider
values only; `packages/database/.env` is for owner/admin tools. Explicit local
`DB_RUNTIME_MODE=development` permits owner fallback outside production only.
`NODE_ENV=production` always enforces isolation. Explicit fixture connection
strings and owner seed tooling remain supported. Dependencies, adapter and
Prisma 7 RSS observations are unchanged.

After owner migrations, run `scripts/provision-runtime-db.ps1 -GrantsOnly` to
reapply current table/function policy and verify the runtime login. Default
ordinary table/sequence privileges support new objects; function EXECUTE is an
explicit allowlist. See [E1 report](Database_V2_Phase_E1_Runtime_DB_Security_2026-10-04.md)
for provisioning, focused tests and production service-file separation.
