import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { REQUIRE_ANY_PERMISSION_KEY } from '../decorators/require-any-permission.decorator';
import { Permission } from '../auth/permissions';
import { roleHasPermission } from '../auth/role-permissions';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Enforces @RequirePermissions() (AND — needs all) and
 * @RequireAnyPermission() (OR — needs at least one) on a route. This is
 * the actual security boundary — a role that lacks the required
 * permission(s) gets a real 403 from the server, not just a hidden menu
 * item. The frontend's role-aware navigation/routing
 * (apps/web/src/lib/permissions.ts) is UX on top of this, never a
 * substitute for it; see docs/12_RBAC_and_Operator_Dashboard.md.
 *
 * Must run AFTER SessionGuard on the same route (`@UseGuards(SessionGuard,
 * PermissionGuard)`) — it reads `request.user`, which SessionGuard is
 * what populates.
 *
 * Fails closed: a route with NEITHER decorator present is denied, not
 * allowed. Every route on every controller this guard is applied to is
 * expected to be explicitly annotated with one or the other — an
 * unannotated route is far more likely to be an oversight than an
 * intentional "open to any authenticated role," and failing open here is
 * exactly the kind of gap that let laboratory/billing/patients/etc. run
 * with effectively no authorization for a while before it was caught
 * (see docs/11_Core_Handoff_and_Non_Divergence_Guide.md).
 *
 * This is also the guard that once made a manual in-body permission
 * check in doctors.controller.ts's list() route completely unreachable —
 * fails-closed means a route declaring nothing is rejected before its
 * handler body ever runs, no matter what that body would have decided.
 * @RequireAnyPermission exists specifically so "either of these
 * permissions is enough" can be declared instead of worked around with
 * logic the guard can't see. Controllers that are intentionally
 * permission-free (auth.controller.ts's login/me/logout,
 * public.controller.ts's unauthenticated routes) simply don't have this
 * guard applied to them at all — that's a controller-level decision, not
 * something this guard should infer route-by-route.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireAll = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requireAny = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRE_ANY_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const hasAllDeclaration = !!requireAll && requireAll.length > 0;
    const hasAnyDeclaration = !!requireAny && requireAny.length > 0;

    if (!hasAllDeclaration && !hasAnyDeclaration) {
      throw new ForbiddenException(
        'This route has no declared permission — access denied by default.',
      );
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) {
      // SessionGuard should already have thrown before this guard ever
      // runs; this is a defensive fallback, not the expected path.
      throw new ForbiddenException('Authentication required');
    }

    if (hasAllDeclaration) {
      const missing = requireAll!.filter((p) => !roleHasPermission(user.role, p));
      if (missing.length > 0) {
        throw new ForbiddenException(
          `Your role (${user.role}) does not have permission to perform this action.`,
        );
      }
    }

    if (hasAnyDeclaration) {
      const satisfiesAny = requireAny!.some((p) => roleHasPermission(user.role, p));
      if (!satisfiesAny) {
        throw new ForbiddenException(
          `Your role (${user.role}) does not have permission to perform this action.`,
        );
      }
    }

    // Both decorators present on the same route (uncommon, but valid):
    // both checks above must pass — this is a conjunction of the two
    // rules, not an alternative to either.
    return true;
  }
}
