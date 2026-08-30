import { SetMetadata } from '@nestjs/common';
import { Permission } from '../auth/permissions';

export const REQUIRE_ANY_PERMISSION_KEY = 'requireAnyPermission';

/**
 * Declares that a route requires AT LEAST ONE of the listed permissions
 * — the OR counterpart to @RequirePermissions (which requires ALL of
 * them). Added for exactly the case require-permissions.decorator.ts's
 * comment anticipated: a route where two different permissions each
 * independently justify access, for different reasons.
 *
 * Concrete example this was built for: GET /doctors needs either
 * DOCTOR_REFERENCE_VIEW (the referring-doctor picker in patient
 * registration) or DOCTOR_MANAGE (full doctor administration) — either
 * one is sufficient, and @RequirePermissions can't express that.
 *
 * Before this existed, the only way to handle "either of" was a manual
 * permission check inside the route handler's body — which doesn't
 * work, because PermissionGuard still runs first and denies by default
 * when it finds no declared permission at all (see that guard's
 * comment). A route with no @RequirePermissions and no
 * @RequireAnyPermission is ALWAYS rejected before the handler body ever
 * runs, for every role, regardless of what manual logic is written
 * inside it — this is exactly the bug that shipped in doctors.controller.ts's
 * original list() route. Always declare access via one of these two
 * decorators; never fall back to an in-body check as a substitute.
 *
 * Usage:
 *   @Get()
 *   @RequireAnyPermission(Permission.DOCTOR_REFERENCE_VIEW, Permission.DOCTOR_MANAGE)
 *   async list(...) { ... }
 */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_ANY_PERMISSION_KEY, permissions);
