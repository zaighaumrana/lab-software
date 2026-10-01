# 12 — RBAC & Operator Dashboard

**Purpose:** documents the centralized authorization system (roles → permissions → server-side enforcement) and the new Operator Dashboard, and the reasoning behind the boundary between what `ADMIN` and `LAB_OPERATOR` can each see and do.
**Why it exists:** authorization was previously ad hoc (a single inline role check in `settings.service.ts`, nothing else) — this document exists so a third role introduced later reuses this exact structure instead of the boundary being re-derived, or worse, re-guessed, per feature.
**Read this:** before adding a new route, a new role, or changing what either active role can access.

---

## 1. The business rule this implements

**ADMIN owns and controls the laboratory. LAB_OPERATOR runs it day to day.** Concretely:

- `ADMIN` — the lab owner. Full access to everything: the existing Admin Dashboard, all operational work, all financial/business data, doctor management and financials, catalog administration, analytics, settings, user management.
- `LAB_OPERATOR` — day-to-day staff (this deployment's combined Reception + Sample Collector + Lab Tech role, per the `Role` enum comment in `schema.prisma`). Full access to the operational workflow — patients, bookings, a patient's own invoice/payment, the full lab/results/report pipeline — and nothing that's business/administrative in nature.

The recurring distinction that decides which side of the line something falls on:

> **"This patient still owes Rs. X" is operational. "Lab revenue this month is Rs. X" is not.** Same shape of question, different audience — the former is what makes the current patient's workflow work, the latter is how the owner tracks the business.

That one sentence is what separates `BILLING_VIEW`/`PAYMENT_RECORD` (LAB_OPERATOR has both) from `ANALYTICS_VIEW` (LAB_OPERATOR has neither), and it's the lens to apply to any future ambiguous case too.

---

## 2. Architecture: authentication → session → role → permission → route

```text
Authentication (login)
        ↓
Session (SessionGuard) — who is this, request.user populated
        ↓
Role (on the session — ADMIN | LAB_OPERATOR | ...)
        ↓
Permission (role-permissions.ts — what can this role do)
        ↓
Route (@RequirePermissions(...) — what does THIS endpoint need)
```

Each layer is a separate concept on purpose:

- **Roles are named bundles of permissions**, not something checked directly anywhere except one place (`role-permissions.ts`). No controller anywhere does `if (user.role === 'ADMIN')` — that pattern is exactly what this system replaces, and reintroducing it defeats the point.
- **Permissions are granular and reusable.** A future `RECEPTION` role doesn't need new authorization plumbing — it needs one new array in `ROLE_PERMISSIONS` built from the existing permission list.
- **Routes declare what they need, not who can access them.** `@RequirePermissions(Permission.LAB_SAMPLE_MANAGE)` reads the same regardless of how many roles end up with that permission later.

### The files

| File | Purpose |
|---|---|
| `apps/api/src/common/auth/permissions.ts` | The full `Permission` enum — the granular vocabulary every check is built from. |
| `apps/api/src/common/auth/role-permissions.ts` | `ROLE_PERMISSIONS` — the one place mapping a role to its bundle. `ADMIN` is a superuser bypass (`isAdminRole`), not an exhaustively-listed bundle — see that file's comment for why. |
| `apps/api/src/common/decorators/require-permissions.decorator.ts` | `@RequirePermissions(...)` — route metadata. |
| `apps/api/src/common/guards/permission.guard.ts` | The actual enforcement. Runs after `SessionGuard` (needs `request.user`), reads the route's declared permission(s) via `Reflector.getAllAndOverride` (checks method-level metadata first, falls back to class-level), and throws `403` if the role doesn't have it. |
| `apps/web/src/lib/permissions.ts` | Frontend mirror of the same enum/bundle — **UX only, see §3.** |

### Fails closed, deliberately

`PermissionGuard` denies any route with no `@RequirePermissions` metadata at all, rather than defaulting to "any authenticated user." This is a direct response to how the original vulnerability happened: several controllers ran for a while with effectively no authorization because nothing forced every route to be explicitly considered (see `docs/11_Core_Handoff_and_Non_Divergence_Guide.md`). An unannotated route now fails loudly in testing instead of silently working for everyone.

`auth.controller.ts` is intentionally exempt from `PermissionGuard`: login is unauthenticated by nature; `me`/`logout` just need a valid session, no permission concept applies. Internal LabFlow booking and reporting endpoints require a valid session and their declared permissions.

`settings.controller.ts`'s `GET /settings` is a narrower exception — see that file's own comment: it must work pre-login (branding on the login screen itself), so it keeps its original header-based tenant resolution and has no guard, but it also only ever returns non-sensitive display config.

---

## 3. Frontend enforcement is UX, backend enforcement is security

`apps/web/src/lib/permissions.ts` mirrors the backend's permission list and role bundle by hand (no shared package wiring the two together yet — `packages/shared` is currently unused scaffolding, see `06_Dependencies_and_Tooling.md`). It backs two things:

- `components/RequirePermission.tsx` — wraps a route element, renders `pages/errors/ForbiddenPage.tsx` instead of the page if the current role lacks the permission (so manually typing `/settings` as `LAB_OPERATOR` doesn't reach it).
- `layouts/AppLayout.tsx`'s `visibleNav()` — filters the sidebar/nav so items the role can't use don't even appear.

**Neither of these is the real security boundary.** A `LAB_OPERATOR` who bypasses the UI entirely and calls `PATCH /settings/branding` directly still gets a real `403` from `PermissionGuard` — the frontend check and the backend check are two independent implementations of the same policy, not one delegating to the other. If they ever drift (a permission added to one side and not the other), the failure mode is a confusing UX (a nav item that 403s, or a feature with no way to navigate to it) — annoying, but never a security gap, because the backend never trusts the frontend's decision.

---

## 4. The permission set and what each role gets

| Permission | ADMIN | LAB_OPERATOR | What it gates |
|---|---|---|---|
| `PATIENT_VIEW` / `_CREATE` / `_UPDATE` | ✓ | ✓ | Patient search, registration, edits |
| `BOOKING_VIEW` / `_CREATE` / `_MANAGE` | ✓ | ✓ | Bookings — find, create, confirm/check-in/cancel |
| `BILLING_VIEW` / `_CREATE_INVOICE` | ✓ | ✓ | A patient's own invoice — view, create |
| `PAYMENT_RECORD` | ✓ | ✓ | Recording a payment against an invoice |
| `LAB_SAMPLE_VIEW` / `_MANAGE` | ✓ | ✓ | Sample queue, collect/receive/accept/reject/start-testing/outsource, "Ready for Collection" |
| `RESULT_ENTER` | ✓ | ✓ | Entering a result |
| `RESULT_FINALIZE` | ✓ | ✓ | Finalize / reopen / amend a result |
| `REPORT_VIEW` / `_PRINT` | ✓ | ✓ | Finding, viewing, printing a report (existing payment/finalization eligibility rules from `report-eligibility.util.ts` still apply underneath — RBAC adds a layer, it doesn't touch that logic) |
| `DOCTOR_REFERENCE_VIEW` | ✓ (implied) | ✓ | The referring-doctor picker in patient registration — name/specialty only, see §5 |
| `CATALOG_VIEW` | ✓ (implied) | ✓ | The test/package picker embedded in patient registration |
| `DASHBOARD_OPERATOR_VIEW` | ✓ (implied) | ✓ | `GET /dashboard/operator` |
| `DOCTOR_MANAGE` | ✓ | ✗ | Full doctor records, shares/commissions, dashboard, statements, create/update |
| `CATALOG_MANAGE` | ✓ | ✗ | Redefining tests, parameters, reference ranges, packages, pricing |
| `ANALYTICS_VIEW` | ✓ | ✗ | The entire `/analytics/*` surface — financial overview, doctor share, test analytics, business insights, outsourcing. One permission for all of it: none of it is operational. |
| `SETTINGS_MANAGE` | ✓ | ✗ | Branding, print layout |
| `USER_MANAGE` | ✓ | ✗ | Creating/editing staff accounts |

`ADMIN` doesn't literally hold every permission in a list — see `role-permissions.ts`'s `isAdminRole` — it's a superuser bypass checked first in `PermissionGuard`, which is the direct code expression of "the owner has control over the entire system" rather than an approximation that has to be kept in sync every time a new permission is added.

---

## 5. Two routes with mixed access — why they're not one flat permission each

Two places needed something more precise than "this role can/can't hit this route":

**`GET /doctors`** — `LAB_OPERATOR` needs it (patient registration's referring-doctor dropdown, confirmed by checking `VisitPage.tsx` actually calls it), but the `Doctor` model has `shareType`/`shareValue` (commission fields) directly on it — real financial data, not something a picker needs. Rather than blocking the route entirely (breaking the dropdown) or exposing financials to `LAB_OPERATOR` (violating the whole point of this task), `doctors.service.ts#list()` takes a `stripFinancials` flag; the controller decides which shape to return based on whether the caller has `DOCTOR_MANAGE` or only `DOCTOR_REFERENCE_VIEW`. Access to the route itself is declared via `@RequireAnyPermission(Permission.DOCTOR_REFERENCE_VIEW, Permission.DOCTOR_MANAGE)` — see §10 for why this wasn't always the case, and why a manual in-body check is never a safe substitute for a real decorator on this or any route.

**The Operator Dashboard's data** — `GET /dashboard/operator` (permission: `DASHBOARD_OPERATOR_VIEW`) needs several of the same numbers `AnalyticsController`'s `/analytics/dashboard/operational` already computes (patients today, samples collected, tests in progress, pending results, reports ready, critical results, average turnaround — see `analytics/queries/operational.queries.ts`). Rather than granting `LAB_OPERATOR` access to `/analytics/*` (which is otherwise entirely `ANALYTICS_VIEW`/`ADMIN`-only) just for this one query, the new `dashboard.service.ts` imports `getOperationalOverview` directly as a function and calls it from a completely separate, new controller. One implementation, two independently-authorized entry points — `LAB_OPERATOR` gets the data without gaining access to the analytics surface itself.

---

## 6. The Operator Dashboard

A new page (`apps/web/src/pages/dashboard/OperatorDashboardPage.tsx`), not a reskin of the existing Admin Dashboard with widgets hidden. Routing decides which page loads at `/` per role (`App.tsx`'s `RoleHome`) — `ADMIN` gets the existing `DashboardPage`, everyone else (currently just `LAB_OPERATOR`) gets this one. Two separate components, not one component branching internally, so a future contributor can't accidentally leak an admin-only widget into the operator's view by editing the "wrong" branch of a shared file.

**What it answers:** "what do I need to know and do today to run the lab" — not "how is the business doing." No revenue/profit/commission charts, no business intelligence — see the Non-Goals in `01_Product_Specification.md`'s general design philosophy, applied here specifically.

**Content, and where each number actually comes from:**
- Patients today, samples collected, tests in progress, results pending, reports ready, critical-awaiting-review, average turnaround — `getOperationalOverview()`, reused from the analytics module (see §5).
- Pending payments — a new, small, honest query: invoices with `amountDue > 0` and not voided. Deliberately the operational framing ("how many patients still owe money"), not a revenue figure.
- Recent activity — merges the last several result entries/finalizations, sample collections, and completed reports into one timeline, sourced from real timestamps already on those records (`enteredAt`/`releasedAt`, `collectedAt`, `generatedAt`). No new schema, no activity-log table — this reconstructs a reasonable feed from what already exists rather than adding infrastructure this task didn't call for.
- Quick actions — New Patient, Patients, Laboratory, Pending Payments, Reports. Each is a direct link to the existing page for that workflow, not a new screen.

**What was deliberately left out, and why:** "Reports printed today" was requested but doesn't exist as a derivable metric — there's no printed/collected timestamp anywhere in the schema (a report has `generatedAt`, not a separate print event). Rather than fake it or add new schema for a metric this task didn't strictly require, it's simply not on the dashboard. If print tracking becomes worth having later, that's a deliberate future addition, not something to backfill quietly.

**Reusability for future roles:** the page is structured as summary cards → recent activity → quick actions, a generic shape, not hardcoded to `LAB_OPERATOR` specifically in its structure. A future `RECEPTION` or `LAB_TECH` role reusing this pattern would mean a different card/quick-action set calling the same kind of dashboard endpoint — not a rewrite of the page's architecture. Those roles are explicitly not implemented here (see `role-permissions.ts`'s comment on the reserved-but-inactive `Role` enum values).

---

## 7. What was deliberately not touched

- **`report-eligibility.util.ts`'s existing business rules** (finalized + paid before a report can print) — untouched. RBAC adds a permission check in front of the route; it doesn't replace or weaken the eligibility logic underneath. A `LAB_OPERATOR` with `REPORT_PRINT` still can't print an unpaid report — that's `report-eligibility.util.ts`'s job, unaffected by this work.
- **Tenant/branch scoping** — every route continues to derive `tenantId`/`branchId` from the verified session (`@CurrentUser()`), exactly as fixed in the auth-guard pass documented in `docs/11_Core_Handoff_and_Non_Divergence_Guide.md`. This task added a permission check on top of that, not a replacement for it.
- **Actor tracking** (`enteredById`, `releasedById`, etc.) — untouched; still populated from `user.userId` off the session, same as before this task.
- **The Prisma schema and existing migrations** — no changes. The `Role` enum already had `LAB_OPERATOR` and every other reserved-for-later role; nothing needed adding, so nothing was.
- **Future roles** (`RECEPTION`, `SAMPLE_COLLECTOR`, `LAB_TECH`, `CASHIER`, `PATHOLOGIST`, `ACCOUNTANT`, `DOCTOR_PORTAL`, `CORPORATE_MANAGER`, `WEBSITE_CONTENT_MANAGER`) — the enum values exist in the schema, but none of them has a bundle in `ROLE_PERMISSIONS`, and `PermissionGuard` denies by default for any role with no entry. Introducing one later means adding one array to `role-permissions.ts` — the architecture this task built is exactly what makes that a small, contained change instead of another repo-wide sweep.

---

## 8. Follow-up (post-initial-rollout): print tracking added

A later pass added `Report.printedAt` / `Report.printCount` (migration `20260822000000_add_report_print_tracking`) — a genuinely additive, non-destructive schema change, not a redesign. `printing.controller.ts`'s report-PDF route now calls `reportingService.markPrinted()` after a successful render, which is what "printed" means in this app (there's no separate physical-printer signal to hook into; PDF generation is the honest proxy).

This unblocked something §6 originally couldn't do honestly for lack of data:
- **"Reports Printed Today"** is now a real Operator Dashboard metric (`getReportsPrintedToday`), alongside two more real additions: **"Tests Completed Today"** (`getTestsCompletedToday`) and **"Cash Collected Today"** (reuses `getCashReceived` from `financial.queries.ts` directly — no duplicate implementation). The Operator Dashboard now groups cards into "Today's Totals" (daily counters) vs. "Right Now" (queue-depth snapshots) explicitly, rather than mixing the two kinds of number in one undifferentiated grid.
- **The Reports list** now defaults to unprinted-only for non-admin roles (`GET /reports?unprinted=true`) — "what still needs attention today" — with a "Show all" toggle and search both overriding it; a search always looks across every report regardless of print status, since the point of searching is usually finding something to reprint. ADMIN's default is unchanged (sees everything).

## 9. Follow-up: cash shift reconciliation

A further pass added `CashShift` (migration `20260822010000_add_cash_shifts`) — a cashier's working session for reconciling physical cash against what the system recorded, matching the "shift close" behavior any real POS system has. New `Permission.CASH_SHIFT_MANAGE`, granted to `LAB_OPERATOR` (and `ADMIN` via the usual superuser bypass).

**Deliberately CASH-only.** `cash-shifts.service.ts`'s `sumCashReceived` filters strictly to `PaymentMethod.CASH` — bank transfers, EasyPaisa, JazzCash never touch a physical drawer, so they're excluded from `expectedCash` entirely. This surfaced a real accuracy issue in the Operator Dashboard's "Cash Collected Today" card from the previous pass: it reused `getCashReceived` from `financial.queries.ts`, which sums *every* payment method despite the misleading label. Renamed that card to "Payments Collected Today" to be accurate, and left it as-is otherwise (a broader daily-totals figure is still useful) — it is intentionally a different number from anything on the Cash Shift page, not a duplicate of it.

**v1 scope, worth knowing before extending this:** `expectedCash` is a time-window calculation (CASH payments received within `[shift.openedAt, closedAt ?? now]`), not attributed to which specific user recorded each payment — `Payment` has no actor field yet. Fine for this deployment's one-cashier-at-a-time reality; if multiple concurrent shifts at the same branch become a real need later, `Payment` would need a `recordedById` field to attribute cash correctly per shift. Only one `OPEN` shift is allowed per tenant/branch at a time by design — opening a second one while one is already open is rejected outright, the standard POS rule.

## 10. Follow-up: the doctors.controller.ts list() bug, and the fix that closes this class of bug entirely

`GET /doctors`'s `list()` route was written with no `@RequirePermissions` decorator at all, on the theory that a manual `roleHasPermission()` check inside the method body could substitute for one. This was wrong in a way that broke the route completely: `PermissionGuard` still runs on every route in a `@UseGuards(SessionGuard, PermissionGuard)` controller regardless of what's in the method body, and its fail-closed default rejects any route with no declared permission — before the handler ever executes. The manual check was dead code from the moment it shipped; `GET /doctors` 403'd unconditionally, for every role including ADMIN, since guards don't distinguish by role when the failure is "no permission was declared" rather than "the role lacks the permission." Confirmed via direct code inspection, not inferred from symptoms.

**The real fix:** a new `@RequireAnyPermission(...)` decorator (`require-any-permission.decorator.ts`), the OR-counterpart to `@RequirePermissions`'s AND-only semantics, plus an updated `PermissionGuard` that checks both. `list()` now declares `@RequireAnyPermission(Permission.DOCTOR_REFERENCE_VIEW, Permission.DOCTOR_MANAGE)` — real, guard-enforced OR logic — instead of an unreachable in-body check. **The rule going forward, stated plainly in both decorators' comments now:** every route must be declared via one of these two decorators. A manual in-body permission check is never a valid substitute for either, because the guard runs first and doesn't know what the method body would have decided.

**A second, independent bug this surfaced:** `VisitPage.tsx` fetches tests, packages, and doctors together via one `Promise.all()` with no `.catch()`. Since `Promise.all` rejects entirely the moment any one of its promises rejects, the permanently-403ing doctors call was silently wiping out the tests and packages data too — even though `catalog.controller.ts` was completely correct and unaffected. A repo-wide audit found the same missing-`.catch()` shape in eight more places (`CatalogPage.tsx`, `DashboardPage.tsx`, `InsightsPage.tsx`, `CashShiftPage.tsx`, `DoctorsPage.tsx`, `InvoicesPage.tsx`, `LaboratoryPage.tsx`, `ReportsPage.tsx`) — none of them had a broken sibling endpoint at the time, but every one had the identical latent risk: a single failing call silently leaving the whole page's data empty with no visible error. All nine now catch and surface a visible error message, matching the pattern `PatientsPage.tsx` and `SettingsPage.tsx` already used correctly. **Lesson for any future data-loading code in this app:** every `Promise.all()` combining multiple fetches, and every single fetch on an initial page load, needs a `.catch()` (or `try/catch`) that sets a visible error state — a `try { ... } finally { ... }` with no `catch` block looks like it handles the loading state correctly and completely hides an actual failure.

## 11. Known gap: no automated test suite yet

`apps/api` currently has no test files and no `test` script (confirmed by inspection, not assumed). The verification for this task was done by direct code inspection — tracing each controller's routes against `role-permissions.ts`'s bundle, and confirming the guard's fail-closed behavior by reading `permission.guard.ts` and `Reflector.getAllAndOverride`'s semantics — not by running an automated `ADMIN → allowed / LAB_OPERATOR → 403` suite, because there's no test harness in this repo to run one in yet. Setting up `apps/api` test infrastructure (Jest is NestJS's default, already implied by `@nestjs/cli`'s scaffolding conventions, but not installed here) is real, separate scope — worth doing before this authorization system gets much larger, but it's infrastructure work, not something this task should have silently bundled in on top of everything else.
