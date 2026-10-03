/**
 * The full set of granular permissions the app authorizes against.
 *
 * These are intentionally more specific than "role" — a role is just a
 * named bundle of these (see role-permissions.ts). Keeping the two
 * separate is what lets a future role (RECEPTION, LAB_TECH, CASHIER,
 * etc.) reuse this exact list with a different bundle, instead of every
 * new role needing new scattered `if (role === ...)` checks throughout
 * the codebase.
 *
 * Naming convention: <DOMAIN>_<ACTION>. VIEW is always read-only. Where
 * a domain has both a low-stakes operational action and a
 * higher-stakes/administrative one, they're split into two permissions
 * (e.g. LAB_SAMPLE_VIEW vs LAB_SAMPLE_MANAGE, CATALOG_VIEW vs
 * CATALOG_MANAGE) rather than one permission gating both — this is what
 * lets e.g. a lab operator see the test catalog while registering a
 * patient without being able to redefine a test's reference ranges.
 */
export enum Permission {
  // Patients
  PATIENT_VIEW = 'PATIENT_VIEW',
  PATIENT_CREATE = 'PATIENT_CREATE',
  PATIENT_UPDATE = 'PATIENT_UPDATE',

  // Bookings
  BOOKING_VIEW = 'BOOKING_VIEW',
  BOOKING_CREATE = 'BOOKING_CREATE',
  BOOKING_MANAGE = 'BOOKING_MANAGE', // confirm / check-in / cancel

  // Billing — patient-facing invoice/payment operations. Deliberately
  // separate from ANALYTICS_VIEW: "this patient owes Rs. X" is
  // operational, "lab revenue this month is Rs. X" is not. See
  // docs/12_RBAC_and_Operator_Dashboard.md for the full rationale.
  BILLING_VIEW = 'BILLING_VIEW',
  BILLING_CREATE_INVOICE = 'BILLING_CREATE_INVOICE',
  PAYMENT_RECORD = 'PAYMENT_RECORD',
  BILLING_ADJUST = 'BILLING_ADJUST', // Administrative refunds, credits and voids.

  // Laboratory workflow
  LAB_SAMPLE_VIEW = 'LAB_SAMPLE_VIEW',
  LAB_SAMPLE_MANAGE = 'LAB_SAMPLE_MANAGE', // collect/receive/accept/reject/start-testing/outsource/mark-ready
  RESULT_ENTER = 'RESULT_ENTER',
  RESULT_FINALIZE = 'RESULT_FINALIZE', // finalize/reopen/amend

  // Reports
  REPORT_VIEW = 'REPORT_VIEW',
  REPORT_PRINT = 'REPORT_PRINT',

  // Doctors — DOCTOR_REFERENCE_VIEW is intentionally narrow: it's what
  // backs the referring-doctor dropdown during patient registration, and
  // the service layer strips commission/share fields for anyone who
  // only has this permission (see doctors.service.ts). DOCTOR_MANAGE is
  // the real thing — full doctor records, shares, statements, the
  // doctor dashboard, create/update.
  DOCTOR_REFERENCE_VIEW = 'DOCTOR_REFERENCE_VIEW',
  DOCTOR_MANAGE = 'DOCTOR_MANAGE',

  // Catalog — tests/packages. VIEW backs the test/package picker used
  // while registering a patient; MANAGE is redefining tests, parameters,
  // reference ranges, packages, pricing.
  CATALOG_VIEW = 'CATALOG_VIEW',
  CATALOG_MANAGE = 'CATALOG_MANAGE',

  // Owner/management-level analytics — financial overview, doctor
  // shares, business insights, outsourcing analytics, test analytics.
  // Deliberately one permission for the whole analytics surface: none of
  // it is operational, all of it is "how is the business doing."
  ANALYTICS_VIEW = 'ANALYTICS_VIEW',

  // Settings / user management
  SETTINGS_MANAGE = 'SETTINGS_MANAGE', // branding, print layout
  USER_MANAGE = 'USER_MANAGE',

  // Dashboards
  DASHBOARD_OPERATOR_VIEW = 'DASHBOARD_OPERATOR_VIEW',

  // Cash shift reconciliation — open/close a drawer session, view
  // current and past shifts. One permission for all of it (view and
  // manage aren't meaningfully separate here — the whole point is a
  // cashier managing their own shift).
  CASH_SHIFT_MANAGE = 'CASH_SHIFT_MANAGE',
}
