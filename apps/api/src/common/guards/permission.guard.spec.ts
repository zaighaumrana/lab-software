import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { Permission } from '../auth/permissions';

/**
 * Mocks Reflector and ExecutionContext directly rather than bootstrapping
 * a real NestJS app — this keeps the test fast (no HTTP server, no DB)
 * while still exercising the guard's actual decision logic. See
 * docs/13_Testing.md for the reasoning behind unit-testing at this level
 * vs. spinning up full controller integration tests.
 */
function makeContext(user: { role: string } | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

describe('PermissionGuard', () => {
  let reflector: Reflector;
  let guard: PermissionGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionGuard(reflector);
  });

  it('denies by default when a route has no @RequirePermissions metadata at all — this is the fail-closed behavior that closes the original vulnerability class', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = makeContext({ role: 'ADMIN' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('denies when required permissions is an empty array', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const ctx = makeContext({ role: 'ADMIN' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('denies when there is no authenticated user on the request (defensive fallback — SessionGuard should have already thrown before this)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.PATIENT_VIEW]);
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows ADMIN through any declared permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.SETTINGS_MANAGE]);
    const ctx = makeContext({ role: 'ADMIN' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows LAB_OPERATOR through a permission it has', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.LAB_SAMPLE_MANAGE]);
    const ctx = makeContext({ role: 'LAB_OPERATOR' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects LAB_OPERATOR from a permission it does not have', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Permission.SETTINGS_MANAGE]);
    const ctx = makeContext({ role: 'LAB_OPERATOR' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when a route requires multiple permissions and the role is missing even one of them', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.LAB_SAMPLE_MANAGE, Permission.SETTINGS_MANAGE]);
    const ctx = makeContext({ role: 'LAB_OPERATOR' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
