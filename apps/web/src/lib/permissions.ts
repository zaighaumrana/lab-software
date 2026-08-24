/**
 * Mirrors apps/api/src/common/auth/permissions.ts exactly. This is UX
 * only — hiding a nav item or blocking a route here makes the app
 * pleasant to use, it does not make anything secure. The real boundary
 * is PermissionGuard on the server; every route protected here is also
 * independently protected there, and a determined user bypassing this
 * file entirely (calling the API directly) still gets a real 403. See
 * docs/12_RBAC_and_Operator_Dashboard.md.
 *
 * Keep this list in sync with the backend's permissions.ts by hand —
 * there's no shared package wiring the two together yet (see
 * packages/shared, currently unused scaffolding). If a permission is
 * added on one side and not the other, the symptom is either a nav item
 * that shows but 403s when clicked (frontend ahead of backend) or a
 * feature that's reachable on the backend but has no way to navigate to
 * it (backend ahead of frontend) — neither is a security issue, both are
 * worth fixing promptly since they mean this file has drifted.
 */
export enum Permission {
  PATIENT_VIEW = 'PATIENT_VIEW',
  PATIENT_CREATE = 'PATIENT_CREATE',
  PATIENT_UPDATE = 'PATIENT_UPDATE',

  BOOKING_VIEW = 'BOOKING_VIEW',
  BOOKING_CREATE = 'BOOKING_CREATE',
  BOOKING_MANAGE = 'BOOKING_MANAGE',

  BILLING_VIEW = 'BILLING_VIEW',
  BILLING_CREATE_INVOICE = 'BILLING_CREATE_INVOICE',
  PAYMENT_RECORD = 'PAYMENT_RECORD',

  LAB_SAMPLE_VIEW = 'LAB_SAMPLE_VIEW',
  LAB_SAMPLE_MANAGE = 'LAB_SAMPLE_MANAGE',
  RESULT_ENTER = 'RESULT_ENTER',
  RESULT_FINALIZE = 'RESULT_FINALIZE',

  REPORT_VIEW = 'REPORT_VIEW',
  REPORT_PRINT = 'REPORT_PRINT',

  DOCTOR_REFERENCE_VIEW = 'DOCTOR_REFERENCE_VIEW',
  DOCTOR_MANAGE = 'DOCTOR_MANAGE',

  CATALOG_VIEW = 'CATALOG_VIEW',
  CATALOG_MANAGE = 'CATALOG_MANAGE',

  ANALYTICS_VIEW = 'ANALYTICS_VIEW',

  SETTINGS_MANAGE = 'SETTINGS_MANAGE',
  USER_MANAGE = 'USER_MANAGE',

  DASHBOARD_OPERATOR_VIEW = 'DASHBOARD_OPERATOR_VIEW',

  CASH_SHIFT_MANAGE = 'CASH_SHIFT_MANAGE',
}

/** Mirrors apps/api/src/common/auth/role-permissions.ts. */
const ROLE_PERMISSIONS: Partial<Record<string, Permission[]>> = {
  LAB_OPERATOR: [
    Permission.PATIENT_VIEW,
    Permission.PATIENT_CREATE,
    Permission.PATIENT_UPDATE,
    Permission.BOOKING_VIEW,
    Permission.BOOKING_CREATE,
    Permission.BOOKING_MANAGE,
    Permission.BILLING_VIEW,
    Permission.BILLING_CREATE_INVOICE,
    Permission.PAYMENT_RECORD,
    Permission.LAB_SAMPLE_VIEW,
    Permission.LAB_SAMPLE_MANAGE,
    Permission.RESULT_ENTER,
    Permission.RESULT_FINALIZE,
    Permission.REPORT_VIEW,
    Permission.REPORT_PRINT,
    Permission.DOCTOR_REFERENCE_VIEW,
    Permission.CATALOG_VIEW,
    Permission.DASHBOARD_OPERATOR_VIEW,
    Permission.CASH_SHIFT_MANAGE,
  ],
};

export function isAdminRole(role: string | undefined | null): boolean {
  return role === 'ADMIN';
}

export function hasPermission(role: string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  const bundle = ROLE_PERMISSIONS[role];
  return bundle ? bundle.includes(permission) : false;
}
