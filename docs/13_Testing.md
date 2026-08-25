# 13 — Testing

**Purpose:** explains what this repo's automated test suite actually covers, how to run it, and how to add to it. Written after a real incident (see `docs/11_Core_Handoff_and_Non_Divergence_Guide.md` and `docs/12_RBAC_and_Operator_Dashboard.md`'s revision history) where the *absence* of any automated check turned a "does the code even work" question into a multi-day manual investigation.
**Why it exists:** before this, `apps/api` had no test files and no `test` script at all — confirmed by inspection, not assumed. This is the starting suite, not a finished one.
**Read this:** before touching `common/auth/`, `common/guards/permission.guard.ts`, or adding a new controller — and before assuming "the tests pass" means more than they actually check (see §4).

---

## 1. What this does NOT show up as

**Nothing here appears anywhere in the LMS application itself.** No patient, receptionist, lab tech, or the lab owner will ever see this — it's a developer tool, not a product feature. It only ever shows up in two places:

- **Your terminal**, when you run it manually (`pnpm --filter @lms/api test`) — a pass/fail readout you'd check before/after making a change.
- **CI, if you wire it up later** (not done yet — see §5) — a green/red check next to a commit on GitHub, still developer-facing, never inside the app.

If you were expecting a "system health" or "test status" panel inside LabFlow, that's a different, legitimate idea — closer to the "Server Status" admin utility floated in `08_Windows_Packaging_and_Installer_Roadmap.md` §7 — and would be a separate feature, not this.

---

## 2. How to run it

From the repo root:

```powershell
pnpm --filter @lms/api test
```

or from inside `apps/api`:

```powershell
pnpm test
```

**First time only:** since this added new dev dependencies (`jest`, `ts-jest`, `@nestjs/testing`, `supertest`, and their `@types`), run `pnpm install` from the repo root first, same as after any other dependency change — see `docs/11_Core_Handoff_and_Non_Divergence_Guide.md`'s pnpm-from-root rule.

No database, no running API server, no Vite dev server needed to run these — see §4 for why.

---

## 3. What's actually in the starting suite

Three files, each demonstrating a different level of testing — copy whichever pattern fits what you're adding:

| File | What it tests | Needs a DB/server? |
|---|---|---|
| `common/auth/role-permissions.spec.ts` | The actual `ROLE_PERMISSIONS` map and `roleHasPermission()`/`isAdminRole()` — the data every permission check ultimately reads from. | No |
| `common/guards/permission.guard.spec.ts` | `PermissionGuard`'s decision logic directly — including its fail-closed default (a route with no declared permission is denied, not allowed) and rejecting when a role is missing even one of several required permissions. | No |
| `modules/catalog/catalog.controller.spec.ts` | A real HTTP request hitting a real controller, with `SessionGuard` overridden (not mocked away — replaced with a stub that reads a test header) and `CatalogService` mocked. Chosen because `CatalogController` has both `CATALOG_VIEW` (both active roles) and `CATALOG_MANAGE` (ADMIN-only) routes in one file, making the RBAC boundary visible in one test file. | No — see §4 |

Between them, these three files answer the two questions that matter most for this system: "is the permission *data* correct" and "does the permission *enforcement* actually apply at the HTTP layer." Neither of the first two needs Nest's dependency injection at all — they're plain function/class tests. The third uses `@nestjs/testing`'s `Test.createTestingModule` to wire up a real controller instance and send it real HTTP requests via `supertest`, without booting the whole app.

---

## 4. What this suite deliberately does NOT cover yet

Being direct about the gap, not just the coverage:

- **No live-database integration tests.** Nothing here touches Postgres. `SessionGuard` is overridden with a stub in the controller test (§3) specifically to avoid needing `AuthService.validateSession()` to hit a real session store. This means these tests can't catch a bug in the *actual* login/session flow, Prisma queries, or business logic inside services — they only prove the permission-enforcement layer itself is correct.
- **Only one controller has an integration test.** `CatalogController` was chosen as the representative example (§3). The other nine guarded controllers (`laboratory`, `patients`, `bookings`, `billing`, `reporting`, `doctors`, `printing`, `settings`, `analytics`) have no dedicated test file yet — copying `catalog.controller.spec.ts`'s pattern to each is exactly the kind of small, mechanical follow-up this starting suite is meant to make easy, not something this pass did exhaustively.
- **No frontend tests at all.** `apps/web`'s `lib/permissions.ts` mirror, `RequirePermission.tsx`, and `visibleNav()` filtering have no automated coverage — they're currently only verified by the manual byte-for-byte parity check described in `docs/12_RBAC_and_Operator_Dashboard.md` §3.
- **No test for the printing/PDF pipeline, the WebSocket gateway, or the cash-shift reconciliation math.** All real, all currently only manually verified.

None of this means the suite isn't useful — it means "the tests pass" currently answers a narrower question than "the app works." Treat it as that narrower, still-valuable signal, not a substitute for actually running the app.

---

## 5. Not yet done: CI

Nothing runs these automatically on push yet — that's a separate, small follow-up (a GitHub Action running `pnpm --filter @lms/api test` on every push/PR) mentioned alongside this suggestion but not built as part of this pass. Worth doing once there's more than a handful of tests to make automatic enforcement worthwhile.

---

## 6. Conventions for adding a new test

- **New permission added to `role-permissions.ts`?** Add it to the relevant `it()` blocks in `role-permissions.spec.ts` — either the "has" or "does NOT have" list depending on which role should get it.
- **New guarded controller, or adding routes to an existing one?** Copy `catalog.controller.spec.ts`'s shape: override `SessionGuard` with the same test-header stub, mock the service, write one `it()` per meaningfully-different permission boundary in that controller (at minimum: one allowed case, one rejected case). Don't test every single route exhaustively — test the boundary, the same way `catalog.controller.spec.ts` only covers `listTests` (view) and `createTest` (manage), not all eight of `CatalogController`'s routes.
- **Bug fixed that involved a permission or role check?** Add a regression test for it in the relevant `.spec.ts` file before considering the fix done — this is what would have caught the original vulnerability class described in `docs/11_Core_Handoff_and_Non_Divergence_Guide.md`, and it's cheap to keep doing.
