import { Permission } from './permissions';

/**
 * Maps each active role to its permission bundle. This is the single
 * place that decides what a role can do — controllers only ever declare
 * *which* permission a route needs (@RequirePermissions), never which
 * role. Adding a new role later means adding one new array here, not
 * touching every controller again.
 *
 * ADMIN is treated as a superuser in PermissionGuard (see
 * common/guards/permission.guard.ts) rather than listed exhaustively
 * here — the business rule is "the owner has control over the entire
 * system," and a superuser bypass is the direct expression of that,
 * not an approximation of a long permission list that has to be kept in
 * sync with every new permission added later.
 *
 * Only roles with an entry here are active in this deployment. The
 * Prisma `Role` enum has several more values (RECEPTION,
 * SAMPLE_COLLECTOR, LAB_TECH, CASHIER, PATHOLOGIST, ACCOUNTANT,
 * DOCTOR_PORTAL, CORPORATE_MANAGER, WEBSITE_CONTENT_MANAGER) reserved
 * for future roles — they exist in the schema so introducing them later
 * doesn't need a migration, but none of them have a bundle here yet and
 * PermissionGuard denies by default for any role with no entry. Do not
 * add entries for them speculatively; that was explicitly out of scope
 * for this pass (see docs/12_RBAC_and_Operator_Dashboard.md).
 */
export const ROLE_PERMISSIONS: Partial<Record<string, Permission[]>> = {
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
  ],
};

/** True if `role` is the superuser role — see the class-level comment above. */
export function isAdminRole(role: string): boolean {
  return role === 'ADMIN';
}

/** True if `role` has `permission`, either via superuser bypass or its bundle. */
export function roleHasPermission(role: string, permission: Permission): boolean {
  if (isAdminRole(role)) return true;
  const bundle = ROLE_PERMISSIONS[role];
  return bundle ? bundle.includes(permission) : false;
}
