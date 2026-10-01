import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

// Generated with the repository's former bcrypt 5.1.1 before upgrading.
const legacyHash = '$2b$10$wPJxOfs0BIs5A3LIVh0B8enJJJKLXKbWeJm5MoVFoDjciUbekKX3.';
const password = 'labflow-upgrade-fixture';

describe('stored bcrypt password compatibility', () => {
  it.each(['$2a$', '$2b$'])('verifies a legacy %s hash', async (prefix) => {
    expect(await bcrypt.compare(password, prefix + legacyHash.slice(4))).toBe(true);
  });

  it('rejects a wrong password against a legacy hash', async () => {
    expect(await bcrypt.compare('wrong-password', legacyHash)).toBe(false);
  });

  it('keeps bcrypt hashing and verification for new passwords', async () => {
    const hash = await bcrypt.hash(password, 10);
    expect(bcrypt.getRounds(hash)).toBe(10);
    expect(await bcrypt.compare(password, hash)).toBe(true);
  });

  it('creates and revokes a session using a legacy password hash', async () => {
    const user = {
      id: 'upgrade-fixture', username: 'upgrade-fixture', fullName: 'Upgrade Fixture',
      tenantId: 'fixture-tenant', branchId: null, role: 'ADMIN', passwordHash: legacyHash,
    };
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue(user) } };
    const auth = new AuthService(prisma as unknown as PrismaService);
    const result = await auth.login({ username: user.username, password });
    expect(auth.getSession(result.sessionId).userId).toBe(user.id);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { lastLoginAt: expect.any(Date) } });
    auth.logout(result.sessionId);
    expect(auth.validateSession(result.sessionId)).toBeNull();
  });

  it('rejects an incorrect login without updating the fixture user', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ passwordHash: legacyHash }), update: jest.fn() } };
    const auth = new AuthService(prisma as unknown as PrismaService);
    await expect(auth.login({ username: 'upgrade-invalid-fixture', password: 'wrong-password' })).rejects.toThrow('Invalid username or password');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
