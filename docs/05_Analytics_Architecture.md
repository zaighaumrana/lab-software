# Admin Analytics Dashboard — Architecture (Planning Only, Not Implemented)

Status: **design only**. Nothing in this document has been built. It exists so
implementation can start from an agreed shape instead of ad hoc endpoints per
widget.

## 1. The core problem this dashboard has to solve

A lab's books have (at least) three different "revenue" numbers, and mixing
them up is the single most common way financial dashboards mislead people:

| Concept | Definition | Existing field(s) |
|---|---|---|
| **Invoiced Revenue** | Full price of everything billed, before any discount | `InvoiceLine.basePrice` summed, or `Invoice.subtotal` |
| **Discount Given** | What was knocked off the invoiced price | `Invoice.discountTotal` / `InvoiceLine.discountAmount` |
| **Net Invoiced (Grand Total)** | What the patient actually owes after discount | `Invoice.grandTotal` |
| **Cash Received** | What has actually been collected, ever | `sum(Payment.amount where status = COMPLETED)` |
| **Outstanding / Pending Collections** | Billed but not yet collected | `Invoice.amountDue`, summed |
| **Refunds** | Cash given back | `Payment.refundedAt IS NOT NULL`, `Invoice.status = REFUNDED` |
| **Doctor Share Payable/Paid** | Money owed to / paid to referring doctors | `DoctorShare.calculatedAmount` / `.paidAmount` |
| **Net Revenue** | Cash received − refunds − doctor share paid (− outsourcing cost once that exists) | *derived, not stored* |

Every "Financial Overview" card in the request maps to one row above. This
matters architecturally because **it means the analytics layer is mostly
aggregation over data that already exists** — it is not a new source of
truth. The exceptions (flagged below) are the only places new schema is
actually required.

## 2. What already exists vs. what's missing

**Fully supported by current schema, zero new fields needed:**
- Invoiced revenue, discounts, net invoiced, cash received, outstanding
  balance, refunds (`Invoice`, `InvoiceLine`, `Payment`).
- Doctor share payable/paid/pending, top referring doctors, doctor share
  trend (`DoctorShare`, already built for the Doctor Dashboard — this admin
  dashboard's "Doctor Share" section is the same aggregation shape, just
  fleet-wide instead of per-doctor).
- Most/least performed tests, highest revenue tests, average test price,
  test category distribution, average daily tests/patients, repeat vs new
  patient percentage (`Test.category`, `InvoiceLine`, `Booking`, `Patient`).
- Operational dashboard: today's patients, samples collected, tests in
  progress, pending verification, reports ready/delivered, critical results
  awaiting review, average turnaround time (`Booking`, `Sample`, `Result`,
  `Report` all have the status/timestamp fields this needs).
- Business insights: top referring doctors, highest revenue patients, most
  popular packages, peak visit hours, weekly/monthly trends, growth rate,
  repeat patient rate, cancellation rate (`Booking.status` includes
  cancellation states already).

**Missing — needs schema work before that section can be built:**
- **Outsourced Tests section entirely.** There is currently no concept of
  "this test was sent to an external lab" anywhere in the schema — no
  `isOutsourced` flag, no external-lab reference, no outsourcing cost field.
  This needs new fields before *any* outsourcing metric (cost, margin, top
  external labs, in-house vs outsourced split) can be computed. Proposed:
  a new `outsourced Boolean @default(false)` + `externalLabName String?` +
  `outsourcingCost Decimal?` on `Sample` (outsourcing happens at the sample
  level, since a single invoice can have a mix of in-house and outsourced
  tests) — this is a schema/migration task for the *implementation* phase,
  not something this planning pass should silently assume exists.
- **Inventory Forecast section.** Explicitly marked "Future Ready" in the
  request, and correctly so — there is no inventory/reagent/consumable
  module in this codebase at all yet (no `Reagent`, `StockLevel`, or
  `TestReagentUsage` model). The forecast can only ever be a projection
  based on **test volume** (which we do have) until an actual inventory
  module exists to define reagent-per-test consumption rates. This section
  should be built in two phases: Phase 1 (buildable now) = "predicted test
  volume next month" derived from historical booking trends; Phase 2
  (blocked on a real inventory module) = translating that into actual
  reagent/consumable quantities.
- **Profit Estimate.** Explicitly marked "(future)" in the request. Real
  profit requires a cost side (reagent costs, staff costs, overhead) that
  doesn't exist in the schema at all. Placeholder widget only, greyed out
  until a costing module exists.

## 3. Backend architecture — one reusable analytics layer, not per-widget endpoints

The request explicitly asks for this ("backend should expose reusable APIs
... without duplication"), so the design leads with it.

### 3.1 Module shape

```
apps/api/src/modules/analytics/
  analytics.module.ts
  analytics.controller.ts
  analytics.service.ts          # orchestrator — resolves a widget request to a query
  queries/
    financial.queries.ts        # revenue, cash, outstanding, discounts, refunds
    doctor-share.queries.ts     # payable/paid/pending, top doctors, trend
    outsourcing.queries.ts      # (built once schema fields above exist)
    test-analytics.queries.ts   # volume, revenue, category distribution
    operational.queries.ts      # today's counts, TAT, pending verification
    business-insights.queries.ts# trends, growth rate, repeat/cancellation rate
  dto/
    widget-request.dto.ts       # { widgetId, from, to, filters, page? }
```

Each `*.queries.ts` file is a set of small, focused Prisma aggregation
functions — one per metric, not one giant query per section. That's what
makes this reusable: `getCashReceived(tenantId, from, to)` is exactly as
usable for the admin dashboard's "Cash Received" card as it is for a future
"cash flow report" PDF, an accountant's monthly export, or the Doctor
Dashboard's revenue figure. **No dashboard-specific SQL lives outside this
folder** — every screen that needs a number calls into these same
functions.

### 3.2 API contract — a single widget-data endpoint, not one route per card

```
GET /analytics/widgets/:widgetId?from=...&to=...&filters=...
GET /analytics/dashboard/:dashboardKey   → returns the full set of widget
                                            results this dashboard needs, in
                                            one round trip (avoids 20 separate
                                            requests on page load)
GET /analytics/widgets                   → registry: list of widgetId →
                                            {label, chartType, requiredFilters}
                                            so the frontend can render new
                                            widgets it doesn't know about yet
```

`widgetId` values map 1:1 to the metrics table below (e.g.
`financial.cashReceived`, `doctorShare.topReferringDoctors`,
`testAnalytics.mostPerformed`). Adding a new metric later means adding one
function to a `*.queries.ts` file and one entry to the widget registry — the
controller and the frontend grid component do not change.

### 3.3 Computation strategy: live query vs. precomputed rollup

Given this is offline-first with a **local Postgres per install** (not a
shared multi-tenant warehouse), most widgets should be **live aggregation
queries** — the data volumes involved (a single lab's invoices/bookings) are
small enough that `GROUP BY` queries with proper indexes stay fast without
needing precomputation. Two specific exceptions:

- **"Today's" operational counters** (today's patients, samples collected,
  etc.) should be cheap `WHERE createdAt >= today` counts — live, no
  precompute needed, but should be short-cache (e.g. 30s) on the frontend
  so rapid page interactions don't hammer the DB.
- **Trend/forecast widgets that scan a full year+ of history** (seasonal
  trends, inventory forecast) are candidates for a nightly precomputed
  rollup table (e.g. `daily_test_counts(tenantId, testId, date, count)`)
  once real usage data volume makes the live query slow — not needed at
  launch, but the query functions should be written so swapping their
  internals for a rollup-table read later doesn't change their signature.

This keeps the offline-first property intact: nothing here depends on a
central server or network connectivity — it's the same local Postgres the
rest of the app already reads from.

## 4. Frontend architecture — widget-based, not a hardcoded page

### 4.1 Component shape

```
apps/web/src/dashboard/
  DashboardGrid.tsx        # renders a list of widget configs in a responsive grid
  widgetRegistry.ts        # widgetId → { Component, defaultSize, chartType }
  widgets/
    KpiCard.tsx             # single-number cards (Cash Received, Outstanding, etc.)
    LineChartWidget.tsx     # Revenue Trend, Daily Patient Count
    BarChartWidget.tsx      # Most Performed Tests, Doctor Referral Contribution
    StackedBarWidget.tsx    # Monthly Revenue Comparison
    DonutChartWidget.tsx    # Payment Status
    PieChartWidget.tsx      # Test Category Distribution, Outsourced vs In-House
    TableWidget.tsx         # Top Referring Doctors, Top Outsourced Tests, etc.
  hooks/
    useWidgetData.ts        # fetches GET /analytics/widgets/:id, handles date range
  pages/
    AdminDashboardPage.tsx  # composes DashboardGrid with the sections below
```

Each dashboard **page** (Financial Overview, Operational, Business Insights,
etc.) is just a config: a list of `widgetId`s and a grid layout, not custom
code per section. `DashboardGrid` doesn't know or care what a widget
contains — it asks `useWidgetData(widgetId, dateRange)`, gets back a typed
envelope (`{ type: 'kpi' | 'line' | 'bar' | 'donut' | 'pie' | 'table',
data }`), and renders the matching component from `widgetRegistry`. Adding a
new widget later means: add the backend query function → add it to the
widget registry (both sides) → add its `widgetId` to whichever dashboard
config wants it. No new page, no new route, no touching `DashboardGrid`.

### 4.2 Charting library

No chart library is installed yet (`apps/web/package.json` has none). Add
**recharts** at implementation time — same library already used elsewhere in
this environment's tooling, well-documented, and covers every chart type
requested (line, bar, stacked bar, donut, pie) with one dependency.

### 4.3 Date-range filtering

One shared `<DateRangeFilter>` component (Today / This Week / This Month /
This Year / Custom) drives every widget on a given dashboard page via shared
state — matches the pattern already built for the Doctor Dashboard's date
filters, so it's a proven pattern, not a new one.

## 5. Section → widget mapping (for implementation planning)

| Section | Widget IDs (proposed) | Backing data | Status |
|---|---|---|---|
| Financial Overview | `financial.invoicedRevenue`, `.cashReceived`, `.outstanding`, `.pendingCollections`, `.todayRevenue`, `.monthlyRevenue`, `.yearlyRevenue`, `.refunds`, `.discountGiven`, `.netRevenue` | `Invoice`, `Payment` | ✅ buildable now |
| Doctor Share | `doctorShare.totalPayable`, `.totalPaid`, `.pending`, `.topReferring`, `.trend` | `DoctorShare` | ✅ buildable now |
| Outsourced Tests | `outsourcing.totalTests`, `.cost`, `.revenue`, `.netMargin`, `.topTests`, `.topExternalLabs` | *new fields needed on `Sample`* | ⛔ blocked on schema |
| Test Analytics | `tests.mostPerformed`, `.leastPerformed`, `.highestRevenue`, `.avgPrice`, `.avgDailyTests`, `.avgPatientsPerDay`, `.repeatPatientPct`, `.newPatientPct` | `InvoiceLine`, `Booking`, `Patient` | ✅ buildable now |
| Inventory Forecast | `inventory.mostFrequentTests`, `.consumptionTrend` (Phase 1) / `.predictedReagentUsage`, `.lowStockWarning` (Phase 2) | `InvoiceLine`/`Booking` (P1) / *no inventory module yet* (P2) | ⚠️ Phase 1 only, now; Phase 2 blocked on a real inventory module |
| Visual Charts | (cross-cutting — each chart pulls from the widget IDs above) | — | ✅ buildable now (once charting lib added) |
| Operational Dashboard | `ops.todayPatients`, `.samplesCollected`, `.testsInProgress`, `.pendingVerification`, `.reportsReady`, `.reportsDelivered`, `.criticalAwaitingReview`, `.pendingOutsourced`, `.avgTAT` | `Booking`, `Sample`, `Result`, `Report` | ✅ buildable now (`.pendingOutsourced` blocked on schema like above) |
| Business Insights | `insights.topDoctors`, `.highestRevenuePatients`, `.popularPackages`, `.peakVisitHours`, `.weeklyTrend`, `.monthlyTrend`, `.seasonalTrend`, `.growthRate`, `.repeatPatientRate`, `.cancellationRate` | `Booking`, `Invoice`, `Patient` | ✅ buildable now |

## 6. Recommended build order

1. **Financial Overview + Operational Dashboard** — fully supported by
   existing schema, highest daily-use value, no blockers.
2. **Doctor Share section** — reuses the exact aggregation logic already
   built for the per-doctor dashboard, just re-scoped fleet-wide.
3. **Test Analytics + Business Insights** — no blockers, more query variety
   but same pattern.
4. **Visual Charts** — really a cross-cutting concern of steps 1–3 (add
   recharts, wire `LineChartWidget`/`BarChartWidget`/etc. to the same
   widget endpoints), not a separate backend effort.
5. **Outsourced Tests** — requires the `Sample` schema addition first
   (small, isolated migration), then the section follows the same pattern
   as everything else.
6. **Inventory Forecast Phase 1** (test-volume-based prediction) — buildable
   whenever, low priority since it's explicitly "future ready" in the
   request.
7. **Inventory Forecast Phase 2 + Profit Estimate** — both explicitly
   deferred in the request itself; both require modules that don't exist
   yet (inventory, costing) and shouldn't be started until those are
   scoped.

## 7. Explicit non-goals for this design

- No central/cloud aggregation — every install's dashboard reads its own
  local Postgres, consistent with the offline-first architecture.
- No new auth/permissions model — this reuses whatever role-gating already
  protects the Settings/Doctors pages.
- No commitment to a specific rollup-table schema yet — Section 3.3
  explains *when* one would be needed, but no rollup tables are being
  designed until a real widget's query proves too slow live.
