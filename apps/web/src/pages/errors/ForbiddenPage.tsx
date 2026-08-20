import { EmptyState } from '../../components/EmptyState';

/**
 * Shown by RequirePermission (components/RequirePermission.tsx) when a
 * logged-in user navigates to a page their role doesn't have permission
 * for — e.g. LAB_OPERATOR manually entering /settings. This is UX only;
 * the same request would also get a real 403 from the API if attempted
 * directly (see apps/api's PermissionGuard) — this page exists so the
 * in-app experience is a clear message instead of a broken/blank screen.
 */
export function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-lg py-12">
      <EmptyState
        title="You don't have access to this page"
        description="If you think this is a mistake, ask an admin to check your account's role."
      />
    </div>
  );
}
