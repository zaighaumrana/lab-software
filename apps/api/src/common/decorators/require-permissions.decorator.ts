import { SetMetadata } from '@nestjs/common';
import { Permission } from '../auth/permissions';

export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';

/**
 * Declares which permission(s) a route requires. Read by PermissionGuard
 * (common/guards/permission.guard.ts), which must run after SessionGuard
 * on the same route so `request.user` is already populated.
 *
 * A route with more than one permission requires ALL of them. If a
 * route needs "at least one of several" instead, use
 * @RequireAnyPermission (require-any-permission.decorator.ts) — do NOT
 * fall back to a manual in-body permission check as a substitute for
 * either decorator. PermissionGuard denies by default when a route
 * declares neither one, before the handler body ever runs — an in-body
 * check on an undeclared route is unreachable dead code, not a working
 * alternative. This happened once already (doctors.controller.ts's
 * original list() route), which is why this warning is here now instead
 * of the more speculative one that used to be in its place.
 *
 * Usage:
 *   @Get('samples/pending')
 *   @RequirePermissions(Permission.LAB_SAMPLE_VIEW)
 *   async listPending(...) { ... }
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
