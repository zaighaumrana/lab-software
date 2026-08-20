import { SetMetadata } from '@nestjs/common';
import { Permission } from '../auth/permissions';

export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';

/**
 * Declares which permission(s) a route requires. Read by PermissionGuard
 * (common/guards/permission.guard.ts), which must run after SessionGuard
 * on the same route so `request.user` is already populated.
 *
 * A route with more than one permission requires ALL of them — there's
 * no current use case for "any of," and adding that distinction before
 * it's needed would be speculative. If a route needs OR semantics later,
 * extend the guard then, against a real example.
 *
 * Usage:
 *   @Get('samples/pending')
 *   @RequirePermissions(Permission.LAB_SAMPLE_VIEW)
 *   async listPending(...) { ... }
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
