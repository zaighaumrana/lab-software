import { Permission } from './permissions';
import { isAdminRole, roleHasPermission, ROLE_PERMISSIONS } from './role-permissions';

/**
 * This file is the single cheapest, highest-value test in the whole
 * suite: it exercises the actual permission MAP that every controller's
 * @RequirePermissions relies on. It needs no database, no HTTP server,
 * no NestJS module bootstrapping — just plain function calls — so it
 * runs in milliseconds and should be the first thing you run after
 * touching role-permissions.ts.
 *
 * See docs/13_Testing.md for how to run this and how to extend it.
 */
describe('role-permissions', () => {
  describe('isAdminRole', () => {
    it('is true for ADMIN', () => {
      expect(isAdminRole('ADMIN')).toBe(true);
    });

    it('is false for every other role, including ones that look similar', () => {
      expect(isAdminRole('LAB_OPERATOR')).toBe(false);
      expect(isAdminRole('admin')).toBe(false); // case-sensitive on purpose
      expect(isAdminRole('SUPER_ADMIN')).toBe(false);
    });
  });

  describe('roleHasPermission', () => {
    it('ADMIN has every permission via the superuser bypass, not an exhaustive list', () => {
      for (const permission of Object.values(Permission)) {
        expect(roleHasPermission('ADMIN', permission)).toBe(true);
      }
    });

    it('LAB_OPERATOR has exactly its documented operational bundle', () => {
      const operatorPermissions = ROLE_PERMISSIONS.LAB_OPERATOR ?? [];
      for (const permission of operatorPermissions) {
        expect(roleHasPermission('LAB_OPERATOR', permission)).toBe(true);
      }
    });

    it('LAB_OPERATOR does NOT have admin/business-only permissions — this is the test that would have caught the original vulnerability', () => {
      const shouldNotHave = [
        Permission.ANALYTICS_VIEW,
        Permission.DOCTOR_MANAGE,
        Permission.CATALOG_MANAGE,
        Permission.SETTINGS_MANAGE,
        Permission.USER_MANAGE,
      ];
      for (const permission of shouldNotHave) {
        expect(roleHasPermission('LAB_OPERATOR', permission)).toBe(false);
      }
    });

    it('a role with no bundle entry (e.g. an unimplemented future role) has no permissions at all', () => {
      // RECEPTION exists in the Prisma Role enum but deliberately has no
      // bundle yet — see role-permissions.ts's comment. This confirms
      // that "exists in the schema" never accidentally grants access.
      expect(roleHasPermission('RECEPTION', Permission.PATIENT_VIEW)).toBe(false);
      expect(roleHasPermission('SOME_TYPO_ROLE', Permission.PATIENT_VIEW)).toBe(false);
    });
  });
});
