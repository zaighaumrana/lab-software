# 04 — Application Modules

**Purpose:** describes the user-facing surface of the product — screens, roles, and module-by-module behavior.
**Why it exists:** translates the domain rules in `03_Core_Domain_Design.md` into what an actual user sees and does.
**Read this:** when building or reviewing any screen, or when deciding which role should see which action.

---

## Executive Summary

Every workstation runs the same browser-based web app, landing on a role-specific home screen rather than a generic dashboard. The public website is a separate, lighter-weight surface for patients and visitors, sharing no direct database access with the lab system (see `02_Technical_Architecture.md § Website Architecture`).

## UI/UX Principles

- **Speed over decoration.** Staff use this for hours daily — minimize clicks per common action; register → book → collect payment should be one continuous flow, not separate screens requiring re-navigation.
- **Keyboard/scanner-friendly.** Barcode scanners act as keyboard input — every scan-driven screen (sample collection, result entry) supports scan-to-focus without the mouse.
- **Status at a glance.** Color-coded badges for payment status (paid/partial/pending) and sample status (collected/pending/rejected) in list views, not buried in detail pages.
- **Critical values impossible to miss.** Visually distinct on-screen and on the printed report — not just a number in a table.
- **Fast, low-bandwidth public site.** Works on low-end phones and slow mobile connections; avoid heavy JS bundles.
- **Branding — decided.** Website matches the client's existing branding; internal staff software uses a neutral, modern UI rather than mirroring the client's brand. English-only for v1; the architecture supports localization later, but bilingual Urdu/English is not built now.

## Reception Workflow

*In this v1 build, this workflow and the Laboratory Workflow below are performed by the same person on the same lab PC (the Lab Operator role) — described separately here because the underlying actions and screens are logically distinct, even though one person does both.*

Home screen: registration/payment queue (no booking queue in this v1 — no online booking).

Screens:
- **Patient search/register** — phone/CNIC-first search; one-click "book again" for repeat patients pulling their last visit's tests/package.
- **Booking** — walk-in creation or Booking-ID lookup (for patients arriving from an online booking); home-collection scheduling (collector, address, route, time window).
- **Invoice & payment** — line-item selection (tests/packages), pricing engine applies discounts automatically, payment recording (full/partial), refund/void requests routed to Admin approval.
- **Booking review queue** — incoming online `PendingReview` bookings awaiting confirm/reject.

## Laboratory Workflow

### Sample Collection (home screen: today's pending samples)
- Scan/confirm sample against booking; label printing via Print Manager; quality-check gate at receipt (Accept/Reject with reason); recollection flow re-entry point.

### Lab Tech (home screen: pending result-entry queue)
- Result entry against reference ranges (auto-highlighted, gender/age-aware); single-step release (per confirmed workflow — no separate authorization screen); amendment flow for corrections, always producing a new versioned result, never an in-place edit.

## Admin Portal

Home screen: financial + operational dashboard.

- **User management** — roles/permissions. **Confirmed for this v1 build:** only two logins exist — **Admin** (owner, office PC) and a single combined **Lab Operator** role (lab PC) covering registration, result entry, and printing. The full RBAC role list (Cashier, Pathologist/Supervisor, Accountant, Doctor, Corporate Manager, Website Content Manager, and separate Reception/Sample Collector/Lab Tech) exists in the system for future use but isn't split out for this deployment. Aligned to `02_Technical_Architecture.md § Authorization Matrix`.
- **Laboratory settings** — test catalog, reference ranges, packages, pricing rules, critical-value thresholds.
- **SMS settings** — provider configuration, message templates.
- **Website settings** — CMS content management.
- **Doctor management** — commission type/rate configuration, payout/clawback processing.
- **Corporate/company management** — account setup, employee linking, billing mode, monthly statement generation.
- **Finance** — invoice void/refund approval, payment reconciliation.
- **Reports** (system reports, not patient reports) — financial and operational dashboards.
- **Logs** — audit log viewer.
- **Backups** — trigger/verify backup, restore procedure access.
- **System health** — sync status ("last synced at"), abandoned notification/sync job alerts, feature flag toggles.

## Reporting Module

Generates the patient-facing Report from linked Results, following the state machine in `03_Core_Domain_Design.md § State Machines: Report` — Pending → PartialReady/Complete → (optionally) Amended → Archived, entirely system-driven. Staff-facing actions here are limited to Print (logged action, not a state change) and viewing report history/versions.

## Notification Module

Internal, system-driven queue viewer for Admin — shows Notification states (Queued/Sending/Sent/Failed/Retrying/Abandoned), with Abandoned entries surfaced as an actionable alert. Staff do not manually trigger notifications; they occur automatically from domain events (`ResultReleased`, `BookingConfirmed`, etc.).

## SMS Module

Configuration surface (Admin) for provider credentials, sender ID, and message templates for each trigger point (booking confirmation, payment reminder, report-ready, critical-value alert, sample rejection/recollection). See `02_Technical_Architecture.md § SMS Architecture` for the underlying gateway abstraction.

## Public Portal (Website)

Modules: general info, About Lab, Services, Rate List, Test List, Contact, Branches, Doctors, News/Announcements — content managed via the Admin CMS.

### Online Test Booking
Patient selects tests/package and a preferred time → Booking ID issued and sent via SMS → patient walks in and presents the Booking ID at reception, which pulls the pre-filled booking instead of re-registering from scratch. No physical/live queue display — this was clarified early on as a naming correction, not a separate feature.

### Report Lookup
Patient enters tracking ID **plus** a secondary verification field (phone/CNIC-last-4/DOB) — required to prevent guessable-ID privacy exposure (see `02_Technical_Architecture.md § Security`). Full payment → view/download PDF. Partial payment → "ready for collection at [branch]" message only, no report content shown. Lookup and booking endpoints are rate-limited.

### Patient Login
Not built for v1 — the tracking-ID + verification model already covers the stated need without the complexity of account/password management. Revisit if the client wants a full historical archive across visits rather than per-visit lookup (see Roadmap Phase 9, Patient Mobile App).

## Patient Journey (cross-reference)

Full workflow diagrams (normal, walk-in, online booking, home collection, repeat patient, and every exception case) live in `03_Core_Domain_Design.md § Business Workflows` — this module document describes the screens; that document describes the business logic behind them.

## Corporate Workflow

Screens: Company account setup and employee linking (Admin), employee-visit billing-mode selection at invoicing (Reception — Company-pays-all vs. split), monthly consolidated statement generation and reconciliation (Admin/Finance). See `03_Core_Domain_Design.md § Business Workflows: Corporate Accounts` for the underlying rules, including the open question on result-sharing policy per company.

## Future Modules

Deferred past v1, designed for via existing interfaces/abstractions but not built (see `01_Product_Specification.md § Non-Goals` and Roadmap):

- **Inventory** — reagents, consumables, expiry, lot numbers, low-stock alerts, suppliers.
- **Report Template Engine** — visual editor for report layout (logo, signatures, QR code, bilingual text) instead of hardcoded templates.
- **Doctor Portal** — doctors log in to see their referred patients, commission history, outstanding balance (Roadmap Phase 8).
- **Patient Mobile App** — native app on top of the existing tracking-ID web portal (Roadmap Phase 9).
- **Analyzer Integration** — automated result entry from lab machines (Roadmap Phase 7); would introduce "System" as an additional authorized actor for `ResultEntered` in the Result state machine.
- **WhatsApp/Email notification channels** — additional Notification module subscribers, no changes needed to the modules that raise the underlying events.

---

**Dependencies:** `03_Core_Domain_Design.md` (business rules these screens implement).
**Related chapters:** `02_Technical_Architecture.md` (Authorization Matrix, Print Manager, SMS gateway underlying these modules).
**Future extensions:** see Future Modules above.
**Remaining open questions:** none from the original list — see `README.md § Decisions Log`. New UI-level questions (e.g., exact screen layouts, specific report template details) will surface during implementation and build.
