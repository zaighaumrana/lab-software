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
    const now=new Date();
    let revoked=false;
    const activeUser={...user,isActive:true};
    const prisma:any={
      user:{findFirst:jest.fn().mockResolvedValue(activeUser),findUnique:jest.fn().mockResolvedValue(activeUser),update:jest.fn().mockResolvedValue(activeUser)},
      tenant:{findUnique:jest.fn().mockResolvedValue({id:user.tenantId,isActive:true})},
      loginAttempt:{findUniqueOrThrow:jest.fn().mockResolvedValue({failures:0,windowStartedAt:now}),update:jest.fn()},
      authSession:{create:jest.fn().mockResolvedValue({id:'fixture-session'}),update:jest.fn().mockImplementation(()=>{revoked=true;})},
      auditLog:{create:jest.fn()},$executeRaw:jest.fn(),
      $queryRaw:jest.fn().mockImplementation((parts:TemplateStringsArray)=>{
        const sql=parts.join('');
        if(sql.includes('AS now')) return [{now}];
        if(sql.includes('JOIN users')) return revoked?[]:[{sessionRecordId:'fixture-session',userId:user.id,...user}];
        if(sql.includes('FROM auth_sessions')) return [{id:'fixture-session',tenantId:user.tenantId,userId:user.id}];
        return [];
      }),
    };
    prisma.$transaction=async (fn:any)=>fn(prisma);
    const auth = new AuthService(prisma as PrismaService);
    const result = await auth.login({ username: user.username, password });
    expect((await auth.getSession(result.sessionId)).userId).toBe(user.id);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { lastLoginAt: expect.any(Date) } });
    await auth.logout(result.sessionId);
    expect(await auth.validateSession(result.sessionId)).toBeNull();
  });

  it('rejects an incorrect login without updating the fixture user', async () => {
    const now=new Date();
    const user={id:'invalid-fixture',tenantId:'fixture-tenant',isActive:true,passwordHash:legacyHash};
    const prisma:any={user:{findFirst:jest.fn().mockResolvedValue(user),findUnique:jest.fn().mockResolvedValue(user),update:jest.fn()},
      tenant:{findUnique:jest.fn().mockResolvedValue({id:user.tenantId,isActive:true})},
      loginAttempt:{findUniqueOrThrow:jest.fn().mockResolvedValue({failures:0,windowStartedAt:now}),update:jest.fn()},
      auditLog:{create:jest.fn()},$executeRaw:jest.fn(),$queryRaw:jest.fn().mockResolvedValue([{now}])};
    prisma.$transaction=async (fn:any)=>fn(prisma);
    const auth = new AuthService(prisma as unknown as PrismaService);
    await expect(auth.login({ username: 'upgrade-invalid-fixture', password: 'wrong-password' })).rejects.toThrow('Invalid username or password');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
