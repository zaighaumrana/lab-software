# Dependencies & Tooling Reference

**Purpose of this document:** a complete inventory of every third-party package, database tool, and system-level tool this repo relies on Ã¢â‚¬â€ what it's for, why it was chosen, and what it means for building a distributable/packaged bundle later (installer size, native binaries, offline requirements, licensing). Written so packaging work doesn't require re-deriving "wait, why do we even have this?" for each dependency.

This is a living document Ã¢â‚¬â€ update it in the same PR/commit whenever a dependency is added, removed, or upgraded for a new reason.

---

## 1. Repo Layout & Package Manager

This is a **pnpm workspace monorepo** (`pnpm-workspace.yaml`):

```
packages:
  - 'apps/*'      Ã¢â€ â€™ apps/api, apps/web, apps/website
  - 'packages/*'  Ã¢â€ â€™ packages/database, packages/shared
```

| Tool | Version pin | Why |
|---|---|---|
| **pnpm** | `11.18.0` (pinned via `packageManager` field in root `package.json`) | Workspace/monorepo package manager. Chosen over npm/yarn for disk-efficient shared dependency storage (single content-addressable store, hard-linked into each `node_modules`) Ã¢â‚¬â€ matters on a small self-hosted server where disk space is a real constraint, not just a dev-machine nicety. |
| **Node.js** | `>=20` (root `package.json` `engines`) | Runtime for the API (NestJS) and build tooling for both frontends. Node 20 is the minimum LTS supporting the ESM/tooling versions used across the workspace (Vite 6, Next 15). |

**Packaging note:** `pnpm-workspace.yaml` also declares an `allowBuilds` allowlist (`@prisma/client`, `@prisma/engines`, `bcrypt`, `esbuild`, `prisma`, `puppeteer`, `sharp`). These are packages with **native/postinstall build steps** Ã¢â‚¬â€ pnpm blocks arbitrary postinstall scripts by default for supply-chain safety, so this list is the explicit opt-in. Any new dependency that needs a native compile or downloads a binary (Chromium, image libs, etc.) will silently fail to build unless added here first Ã¢â‚¬â€ check this list first if a fresh `pnpm install` produces a package that "doesn't work."

---

## 2. `apps/api` Ã¢â‚¬â€ NestJS Backend

The local server: REST API, business logic, PDF/print generation, WebSocket push, auth. Runs on the client's own machine (offline-first design Ã¢â‚¬â€ see `02_Technical_Architecture.md`).

### Runtime dependencies

| Package | Version | Purpose | Why this one |
|---|---|---|---|
| `@nestjs/common`, `@nestjs/core` | ^11.0.0 | NestJS framework core Ã¢â‚¬â€ DI container, decorators, module system, exception filters. | The whole API is built on Nest's module/DI architecture; this is the foundation everything else plugs into. |
| `@nestjs/config` | ^4.0.0 | Loads `.env` files into a typed config service (`ConfigModule.forRoot`). | Centralizes environment variable access instead of raw `process.env` scattered through the codebase. |
| `@nestjs/platform-express` | ^11.0.0 | Express adapter Ã¢â‚¬â€ Nest needs an underlying HTTP server implementation, and Express is the default/most battle-tested choice. | Handles the actual HTTP request/response plumbing under Nest's abstractions. |
| `@nestjs/websockets`, `@nestjs/platform-socket.io` | ^11.0.0 | WebSocket gateway support (`@WebSocketGateway`) backed by socket.io. | Powers the live Laboratory-screen updates (`laboratory.gateway.ts`) Ã¢â‚¬â€ pushes result changes to connected staff instead of polling. |
| `socket.io` | ^4.8.1 | The actual WebSocket/long-polling transport library the gateway sits on top of. | Handles reconnection, room-based broadcast (used to scope events per tenant), and transport fallback. |
| `@lms/database` | workspace:* | Internal package Ã¢â‚¬â€ Prisma client + schema (see Ã‚Â§5). | Every module that touches the DB imports the generated Prisma client from here rather than each app generating its own. |
| `bcrypt` | ^5.1.1 | Password hashing for user login (`auth.service.ts`) and any other stored credentials. | Industry-standard slow hash for password storage Ã¢â‚¬â€ never store or compare plaintext passwords. |
| `class-validator`, `class-transformer` | ^0.14.1 / ^0.5.1 | Decorator-based DTO validation (`@IsString()`, `@IsEmail()`, etc.) and plain-object Ã¢â€ â€ class transformation. | Paired with Nest's `ValidationPipe` (see `main.ts`) to reject malformed requests before they reach business logic Ã¢â‚¬â€ this is the app's primary input-validation layer. |
| `puppeteer` | ^23.9.0 | Headless Chromium Ã¢â‚¬â€ renders HTML templates (invoice, report, doctor statement) to PDF (`printing.service.ts`, `printing.controller.ts`). | Chosen over a pure-JS PDF library because reports need real CSS layout (tables, print stylesheets) Ã¢â‚¬â€ rendering the same HTML/CSS the browser preview uses guarantees the PDF matches what staff already see on screen. |
| `reflect-metadata` | ^0.2.2 | Enables TypeScript decorator metadata reflection at runtime. | Required by both NestJS's DI system and `class-validator`/`class-transformer` Ã¢â‚¬â€ without it, decorators can't read parameter/property types. |
| `rxjs` | ^7.8.1 | Reactive extensions Ã¢â‚¬â€ NestJS's internal request pipeline (interceptors, some lifecycle hooks) is built on RxJS Observables. | Peer dependency of NestJS itself, not used directly in application code today. |

### Present but currently unused (candidates for removal before packaging)

| Package | Status |
|---|---|
| `@nestjs/jwt` | No `JwtModule`/JWT usage found anywhere in `apps/api/src`. Auth is a custom in-memory session-token scheme (`auth.service.ts`), not JWT. |
| `@nestjs/passport`, `passport`, `passport-local`, `@types/passport-local` | No `PassportModule` or passport strategy registered anywhere. Same reason Ã¢â‚¬â€ auth doesn't use Passport. |

**Packaging note:** these five packages add dead weight to the bundled `node_modules` for no runtime benefit. Worth pruning from `apps/api/package.json` before building the distributable Ã¢â‚¬â€ smaller install, fewer things to audit for CVEs, faster `pnpm install` on the client's server during setup/reinstall.

### Dev dependencies

| Package | Purpose |
|---|---|
| `@nestjs/cli`, `@nestjs/schematics` | Nest's build/scaffolding CLI (`nest build`, `nest start --watch`). |
| `@types/bcrypt`, `@types/express`, `@types/node`, `@types/passport-local` | TypeScript type definitions Ã¢â‚¬â€ dev-time only, not shipped in the production build. |
| `typescript` | Compiler for the whole API. |

### Packaging implications specific to this app

- **Puppeteer bundles Chromium** (~170Ã¢â‚¬â€œ280 MB depending on platform) unless configured otherwise. This is by far the largest single dependency in the repo and the biggest driver of install size/time. Before packaging:
  - Decide whether to ship the bundled Chromium (simplest, works offline out of the box, largest install) or point Puppeteer at a system-installed Chrome/Chromium via `PUPPETEER_EXECUTABLE_PATH` (smaller package, but the target machine needs Chrome pre-installed Ã¢â‚¬â€ a real constraint for an offline-first, vendor-installed deployment).
  - If bundling, the download happens at `pnpm install` time and needs internet access on the build machine (not the client's machine, since offline-first only applies to runtime, not build time) Ã¢â‚¬â€ plan the build pipeline accordingly.
- **`bcrypt`** is a native (C++) module Ã¢â‚¬â€ it compiles against the target platform's Node ABI at install time. This is why it's in the `allowBuilds` list. If the packaged bundle is built on one OS/architecture and deployed to another (e.g. built in CI on Linux x64, deployed to a different CPU architecture), `bcrypt` needs a matching prebuilt binary or a rebuild on the target machine Ã¢â‚¬â€ this is a common source of "works on my machine" install failures for native modules.

---

## 3. `apps/web` Ã¢â‚¬â€ Staff-Facing React App

The internal application used by reception, lab technicians, and admins on LAN workstations.

### Runtime dependencies

| Package | Version | Purpose | Why this one |
|---|---|---|---|
| `react`, `react-dom` | ^19.0.0 | UI framework. | Standard choice; v19 for the latest concurrent-rendering/compiler-friendly features. |
| `react-router-dom` | ^7.1.0 | Client-side routing between pages (Laboratory, Reports, Invoices, etc.). | Standard SPA router for React; drives the whole page structure without full reloads. |
| `axios` | ^1.7.0 | HTTP client for all REST calls to the API (`api/client.ts`). | Chosen over the native `fetch` for its interceptor support Ã¢â‚¬â€ the app uses request interceptors to attach the session token/tenant headers automatically and a response interceptor to handle 401s globally (see `api/client.ts`). |
| `socket.io-client` | ^4.8.1 | Client half of the live-update WebSocket connection (`lib/labSocket.ts`). | Must match the server's `socket.io` transport/protocol version. |
| `clsx` | ^2.1.1 | Tiny utility for conditionally joining CSS class name strings. | Used in components with multiple conditional Tailwind classes (e.g. `StatusBadge`) to keep the JSX readable instead of manual template-string concatenation. |
| `lucide-react` | ^0.469.0 | Icon component library. | Provides the UI icons (search, etc.) as tree-shakeable React components instead of an icon font or raw SVG files. |
| `recharts` | ^2.15.0 | Charting library Ã¢â‚¬â€ bar/line/pie/stacked-bar widgets on the analytics dashboard. | Declarative, React-native charting API (as opposed to wrapping a canvas/D3 library directly) Ã¢â‚¬â€ fits the component-driven dashboard widget structure. |

### Dev dependencies

| Package | Purpose |
|---|---|
| `vite` | Dev server + production bundler for the SPA. |
| `@vitejs/plugin-react` | Vite's React plugin (JSX transform, Fast Refresh). |
| `typescript` | Type checking (`tsc -b` runs before `vite build`). |
| `tailwindcss`, `postcss`, `autoprefixer` | Utility-first CSS framework and its build pipeline (Tailwind generates CSS via PostCSS; Autoprefixer adds vendor prefixes). |
| `@types/react`, `@types/react-dom` | Type definitions for React. |

### Packaging implications specific to this app

- `vite build` produces static assets (`dist/`) Ã¢â‚¬â€ no Node runtime needed to *serve* this app in production, just a static file server (or the API itself can serve it). This is the lightest piece of the bundle.
- No native/binary dependencies here Ã¢â‚¬â€ this app packages cleanly on any platform without cross-compilation concerns.

---

## 4. Public Website - Separate Repository

The public website is no longer part of this pnpm workspace.

It was extracted on 2026-10-01 and is maintained separately at:

`zaighaumrana/labwebsitedemo`

Next.js, the website-specific Tailwind toolchain, and website-only transitive dependencies such as `sharp` are therefore no longer dependencies of the local LabFlow repository.

The local LabFlow workspace now consists of:

- `apps/api`
- `apps/web`
- `packages/database`
- `packages/shared`

See `07_Website_Separation_and_Offline_Online_Hybrid.md` for the architectural boundary between the local application and future online services.

---
## 5. `packages/database` Ã¢â‚¬â€ Prisma Schema & Client

Shared internal package: the single source of truth for the database schema, migrations, and generated client. Imported by `apps/api` as `@lms/database`.

### Database engine

| Tool | Purpose | Why |
|---|---|---|
| **PostgreSQL** | The actual database engine (`datasource db { provider = "postgresql" }` in `schema.prisma`). | Chosen over SQLite/MySQL for a self-hosted, offline-first single-server deployment because it gives full transactional integrity, proper decimal/numeric types (critical for money Ã¢â‚¬â€ see all the `Decimal` usage in billing), and JSON column support, while still being trivial to run on a single small server (no separate DB server needed at this scale). |

### Dependencies

| Package | Purpose | Why |
|---|---|---|
| `@prisma/client` (runtime dep) | The type-safe query client generated from `schema.prisma`. Every DB read/write in `apps/api` goes through this. | Prisma over a raw query builder or plain SQL for compile-time type safety on every query Ã¢â‚¬â€ schema changes that break a query show up as TypeScript errors, not runtime surprises. |
| `prisma` (dev dep) | The CLI Ã¢â‚¬â€ `generate` (build the client), `migrate dev`/`migrate deploy` (schema migrations), `studio` (visual DB browser), `db push`. | Standard Prisma tooling; `migrate deploy` specifically is the non-interactive, production-safe migration command (as opposed to `migrate dev`, which is dev-only and can prompt/reset). |
| `tsx` (dev dep) | Runs the TypeScript seed script (`prisma/seed.ts`) directly without a separate compile step. | Lets the seed script (which creates default users, message templates, etc. Ã¢â‚¬â€ see `seed.ts`) stay in TypeScript and run via `pnpm db:seed` without maintaining a compiled JS copy. |
| `bcrypt`, `@types/bcrypt` (dev deps here too) | Used by `seed.ts` to hash the seeded default user passwords. | Same reasoning as the `apps/api` copy Ã¢â‚¬â€ never seed plaintext passwords, even for dev/demo data. |

### Packaging implications specific to this package

- **Prisma's query engine is itself a native binary**, downloaded/generated per-platform by `prisma generate` (hence `@prisma/client` and `@prisma/engines` both being in the `allowBuilds` allowlist). If the packaged installer is built on a different OS/architecture than the target deployment machine, `prisma generate` needs to run (or be re-run) on the target, or the correct engine binary needs to be bundled for that platform.
- The client's server needs a running PostgreSQL instance Ã¢â‚¬â€ this is a system-level prerequisite outside the pnpm dependency tree entirely. The packaged installer/setup process needs to either bundle a PostgreSQL install step or document it as a pre-requisite the vendor sets up during on-site installation (see `02_Technical_Architecture.md Ã‚Â§ Deployment Model` for the target hardware spec this assumes).
- `DATABASE_URL` is read from environment (`.env`) Ã¢â‚¬â€ the packaging/installer process needs to generate or prompt for this on first setup rather than shipping a hardcoded connection string.

---

## 6. `packages/shared` Ã¢â‚¬â€ Shared Types/Constants

| Package | Purpose |
|---|---|
| `typescript` (dev dep only) | This package currently has no runtime dependencies Ã¢â‚¬â€ it's pure TypeScript types/constants/validators shared between apps, compiled via `tsc` to `dist/` and consumed as `@lms/shared` (per its `main`/`types` fields). |

Nothing packaging-relevant here beyond standard TS compilation Ã¢â‚¬â€ it produces plain JS + `.d.ts` files, no native code, no runtime deps to worry about.

---

## 7. Quick-Reference: Everything With a Native/Binary Component

Pulling these together in one place since they're the packages that actually complicate cross-platform packaging (as opposed to pure-JS packages, which "just work" wherever Node runs):

| Package | Where | Native component | Packaging concern |
|---|---|---|---|
| `bcrypt` | `apps/api`, `packages/database` (seed) | C++ addon, compiled per Node ABI/platform | Needs matching prebuilt binary or a rebuild step on the target machine/architecture. |
| `puppeteer` | `apps/api` | Bundles a full Chromium binary per platform | Largest dependency by far; decide bundle-vs-system-Chrome before building the installer. |
| `@prisma/client` / `prisma` engines | `packages/database` | Native query engine binary, per platform | Must be generated for (or bundled for) the deployment target's OS/architecture. |
| `sharp` | `apps/website` (transitive, via Next.js) | Native image-processing bindings | Same class of concern as the above; relevant only if `apps/website` is containerized/deployed cross-platform. |
| `esbuild` | Transitive (Vite's bundler dependency) | Native Go-based bundler binary, per platform | Dev/build-time only Ã¢â‚¬â€ doesn't ship in the final `dist/` output, so it's a build-machine concern, not a deployment-machine one. |

**General packaging takeaway:** anything in this table needs either (a) the packaging/build step to run on a machine matching the deployment target's OS + CPU architecture, or (b) a documented cross-compilation/prebuilt-binary strategy per platform you intend to ship for. Everything else in the dependency tree is pure JS/TS and will run unmodified wherever Node.js runs.

---

## 8. Summary Table Ã¢â‚¬â€ All Direct Dependencies at a Glance

| App/Package | Direct runtime deps | Direct dev deps |
|---|---|---|
| `apps/api` | 15 (incl. 4 unused Ã¢â‚¬â€ see Ã‚Â§2) | 6 |
| `apps/web` | 7 | 7 |
| `apps/website` | 3 | 7 |
| `packages/database` | 1 | 5 |
| `packages/shared` | 0 | 1 |

*(Counts as of this document's last update Ã¢â‚¬â€ re-check `package.json` files directly if this doc is stale relative to recent dependency changes.)*
