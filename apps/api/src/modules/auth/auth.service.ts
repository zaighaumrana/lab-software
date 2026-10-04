import { Injectable, UnauthorizedException, BadRequestException, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { appendAudit, auditContext } from '../../common/audit';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { recoveryMode } from '../../common/recovery-mode';

const TTL = 12 * 60 * 60 * 1000;
const WINDOW = 15 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private cleaning = false;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    if(recoveryMode())return;
    this.cleanupTimer = setInterval(() => void this.cleanup(), 60_000);
    this.cleanupTimer.unref();
  }
  onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }
  private async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      // Bounded work; deletion does not determine validity. Retain revocations for one day.
      await this.prisma.$executeRaw`DELETE FROM auth_sessions WHERE id IN
        (SELECT id FROM auth_sessions WHERE "expiresAt" < clock_timestamp() - interval '1 day'
        OR "revokedAt" < clock_timestamp() - interval '1 day' LIMIT 200)`;
      await this.prisma.$executeRaw`DELETE FROM login_attempts WHERE "attemptKey" IN
        (SELECT "attemptKey" FROM login_attempts WHERE "updatedAt" < clock_timestamp() - interval '1 day'
        AND ("lockedUntil" IS NULL OR "lockedUntil" < clock_timestamp()) LIMIT 200)
        AND "updatedAt" < clock_timestamp() - interval '1 day'
        AND ("lockedUntil" IS NULL OR "lockedUntil" < clock_timestamp())`;
    } catch { Logger.warn('Authentication housekeeping failed; durable validity checks remain active', 'AuthService'); }
    finally { this.cleaning = false; }
  }
  async login(dto: LoginDto) {
    const key = hash(dto.username.trim().toLowerCase());
    // Authentication failures return a result so counters/audits commit before throwing.
    const result = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO login_attempts ("attemptKey") VALUES (${key})
        ON CONFLICT ("attemptKey") DO UPDATE SET "updatedAt"=clock_timestamp()`;
      await tx.$queryRaw`SELECT "attemptKey" FROM login_attempts WHERE "attemptKey"=${key} FOR UPDATE`;
      const attempt = await tx.loginAttempt.findUniqueOrThrow({ where: { attemptKey: key } });
      const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      const found = await tx.user.findFirst({ where: { username: dto.username.trim() } });
      // Anonymous attempts belong to this installation's default tenant.
      const tenant = found ? await tx.tenant.findUnique({ where: { id: found.tenantId } }) :
        await tx.tenant.findFirst({ where: process.env.DEFAULT_TENANT_ID ? { id: process.env.DEFAULT_TENANT_ID } : {}, orderBy: { id: 'asc' } });
      if (!tenant) throw new UnauthorizedException('Authentication is unavailable');
      const auditFailure = (action: string, failures: number) => appendAudit(tx, { tenantId: tenant.id, actorId: null,
        action, entityType: 'LoginAttempt', entityId: key, after: { failures } });
      if (attempt.lockedUntil && attempt.lockedUntil > now) {
        await auditFailure('LOGIN_LOCKOUT', attempt.failures);
        return { error: 'Too many failed attempts. Try again later.' };
      }
      if (found) await tx.$queryRaw`SELECT id FROM users WHERE id=${found.id} AND "tenantId"=${tenant.id} FOR UPDATE`;
      const user = found ? await tx.user.findUnique({ where: { id: found.id } }) : null;
      const valid = user?.isActive && tenant.isActive && await bcrypt.compare(dto.password, user.passwordHash);
      if (!valid || !user) {
        const failures = now.getTime() - attempt.windowStartedAt.getTime() > WINDOW ? 1 : attempt.failures + 1;
        await tx.loginAttempt.update({ where: { attemptKey: key }, data: { failures, updatedAt: now,
          windowStartedAt: failures === 1 ? now : attempt.windowStartedAt,
          lockedUntil: failures >= 5 ? new Date(now.getTime() + WINDOW) : null } });
        await auditFailure('LOGIN_FAILURE', failures);
        if (failures >= 5) await auditFailure('LOGIN_LOCKOUT', failures);
        return { error: 'Invalid username or password' };
      }
      await tx.loginAttempt.update({ where: { attemptKey: key }, data: { failures: 0, lockedUntil: null, windowStartedAt: now, updatedAt: now } });
      const sessionId = randomBytes(32).toString('hex');
      const session = await tx.authSession.create({ data: { tenantId: user.tenantId, userId: user.id, tokenHash: hash(sessionId),
        createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + TTL) } });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      await appendAudit(tx, { tenantId: user.tenantId, actorId: user.id, action: 'LOGIN_SUCCESS', entityType: 'AuthSession', entityId: session.id });
      return { sessionId, user: { id: user.id, username: user.username, fullName: user.fullName,
        role: user.role, tenantId: user.tenantId, branchId: user.branchId } };
    }, { timeout: 15_000 });
    if ('error' in result) throw new UnauthorizedException(result.error);
    return result;
  }
  async logout(sessionId: string) {
    await this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string; tenantId: string; userId: string }[]>`
        SELECT id,"tenantId","userId" FROM auth_sessions WHERE "tokenHash"=${hash(sessionId)} AND "revokedAt" IS NULL FOR UPDATE`;
      const session = rows[0];
      if (!session) return;
      await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), revocationReason: 'LOGOUT' } });
      await appendAudit(tx, { tenantId: session.tenantId, actorId: session.userId, action: 'LOGOUT', entityType: 'AuthSession', entityId: session.id });
    });
    return { ok: true };
  }
  async validateSession(sessionId: string | undefined): Promise<(AuthUser & { sessionRecordId: string }) | null> {
    if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null;
    const tokenHash = hash(sessionId);
    const rows = await this.prisma.$queryRaw<(AuthUser & { sessionRecordId: string })[]>`
      SELECT s.id AS "sessionRecordId",u.id AS "userId",u."tenantId",u."branchId",u.role,u."fullName",u.username
      FROM auth_sessions s JOIN users u ON u.id=s."userId" AND u."tenantId"=s."tenantId"
      JOIN tenants t ON t.id=s."tenantId"
      WHERE s."tokenHash"=${tokenHash} AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp()
      AND u."isActive" AND t."isActive"`;
    const session = rows[0];
    if (!session) return null;
    // One-minute idle-touch throttle. Never revive expired/revoked sessions.
    if(!recoveryMode())await this.prisma.$executeRaw`UPDATE auth_sessions SET "lastSeenAt"=clock_timestamp(),
      "expiresAt"=clock_timestamp()+interval '12 hours' WHERE "tokenHash"=${tokenHash}
      AND "revokedAt" IS NULL AND "expiresAt">clock_timestamp() AND "lastSeenAt"<clock_timestamp()-interval '1 minute'`;
    return session;
  }
  async getSession(sessionId: string) {
    const session = await this.validateSession(sessionId);
    if (!session) throw new UnauthorizedException('Session expired or invalid');
    const { sessionRecordId: _record, ...user } = session;
    return user;
  }
  async updateOwnProfile(userId: string, tenantId: string, dto: UpdateOwnProfileDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} AND "tenantId"=${tenantId} FOR UPDATE`;
      const user = await tx.user.findFirst({ where: { id: userId, tenantId, isActive: true } });
      if (!user) throw new UnauthorizedException('User not found');
      const data: { fullName?: string; passwordHash?: string } = {};
      if (dto.fullName !== undefined) data.fullName = dto.fullName;
      if (dto.newPassword) {
        if (!dto.currentPassword || !await bcrypt.compare(dto.currentPassword, user.passwordHash)) throw new BadRequestException('Current password is incorrect');
        data.passwordHash = await bcrypt.hash(dto.newPassword, 10);
        const currentId = auditContext.getStore()?.sessionRecordId;
        await tx.authSession.updateMany({ where: { tenantId, userId, revokedAt: null, ...(currentId ? { id: { not: currentId } } : {}) },
          data: { revokedAt: new Date(), revocationReason: 'PASSWORD_CHANGE' } });
        await appendAudit(tx, { tenantId, actorId: userId, action: 'PASSWORD_CHANGE', entityType: 'User', entityId: userId,
          after: { otherSessionsRevoked: true, currentSessionRetained: !!currentId } });
      }
      const updated = await tx.user.update({ where: { id: user.id }, data });
      if (data.fullName !== undefined && data.fullName !== user.fullName) await appendAudit(tx, { tenantId, actorId: userId,
        action: 'PROFILE_CHANGE', entityType: 'User', entityId: userId, after: { nameChanged: true } });
      return { userId: updated.id, username: updated.username, fullName: updated.fullName,
        role: updated.role, tenantId: updated.tenantId, branchId: updated.branchId };
    });
  }
}
