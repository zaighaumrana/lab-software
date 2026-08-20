import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, type Permission } from '../lib/permissions';
import { ForbiddenPage } from '../pages/errors/ForbiddenPage';

/**
 * Frontend route protection — UX, not security (see lib/permissions.ts).
 * Wrap a route element: <RequirePermission permission={Permission.X}><Page/></RequirePermission>.
 * Renders ForbiddenPage instead of the page if the current user's role
 * lacks the permission, so manually typing a URL doesn't reach an
 * admin-only screen.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!hasPermission(user?.role, permission)) {
    return <ForbiddenPage />;
  }
  return <>{children}</>;
}
