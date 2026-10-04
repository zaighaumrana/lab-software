import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { appendAudit } from '../../common/audit';
import { recoveryMode } from '../../common/recovery-mode';
import { enqueuePublicReport, lockPublicReport, PUBLIC_REPORT_SCHEMA, PUBLIC_SYNC_CONFIG, publicSyncConfig } from './public-projection';
import { PUBLIC_SYNC_TRANSPORT, PublicSyncTransport } from './public-sync.transport';

@Injectable()
export class PublicSyncService {
  constructor(private readonly prisma: PrismaService, @Inject(PUBLIC_SYNC_TRANSPORT) private readonly transport: PublicSyncTransport) {}
  private admin(role: string) { if (role !== 'ADMIN') throw new ForbiddenException('Administrator required'); }
  async status(tenantId: string, role: string) {
    this.admin(role);
    const where = { tenantId, eventType: PUBLIC_REPORT_SCHEMA };
    const [config, pending, failed, oldest, success] = await Promise.all([
      publicSyncConfig(this.prisma, tenantId),
      this.prisma.syncOutbox.count({ where: { ...where, status: { in: ['QUEUED','RETRYING','SYNCING'] } } }),
      this.prisma.syncOutbox.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.syncOutbox.findFirst({ where: { ...where, status: { in: ['QUEUED','RETRYING','SYNCING'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      this.prisma.syncOutbox.aggregate({ where, _max: { syncedAt: true } }),
    ]);
    return { enabled: config.enabled, effectiveEnabled: config.enabled && !config.recoveryHold && !recoveryMode()
      && process.env.PUBLIC_SYNC_ENABLED === 'true' && this.transport.isConfigured(), recoveryHold: config.recoveryHold,
      recoveryMode: recoveryMode(), transportConfigured: this.transport.isConfigured(), pendingCount: pending, failedCount: failed,
      oldestPendingAgeSeconds: oldest ? Math.max(0, Math.floor((Date.now() - oldest.createdAt.getTime()) / 1000)) : null,
      lastSuccessfulSyncAt: success._max.syncedAt };
  }
  async configure(tenantId: string, role: string, actorId: string, enabled: boolean) {
    this.admin(role);
    if (typeof enabled !== 'boolean') throw new BadRequestException('enabled must be boolean');
    if (recoveryMode()) throw new BadRequestException('Recovery review required');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId} FOR UPDATE`;
      const config = await publicSyncConfig(tx, tenantId);
      if (enabled && (config.recoveryHold || !this.transport.isConfigured() || process.env.PUBLIC_SYNC_ENABLED !== 'true')) {
        throw new BadRequestException('Transport/master enablement or recovery reconciliation required');
      }
      await tx.configuration.upsert({ where: { tenantId_key: { tenantId, key: PUBLIC_SYNC_CONFIG } },
        create: { tenantId, key: PUBLIC_SYNC_CONFIG, value: { enabled, recoveryHold: config.recoveryHold } },
        update: { value: { enabled, recoveryHold: config.recoveryHold } } });
      await appendAudit(tx, { tenantId, actorId, action: 'PUBLIC_SYNC_CONFIG', entityType: 'Configuration', entityId: PUBLIC_SYNC_CONFIG,
        after: { enabled, pendingPolicy: 'RETAIN' } });
      return { enabled, recoveryHold: config.recoveryHold };
    });
  }
  /** Explicit bounded current-state scan. A repeated page creates no duplicate unchanged intents. */
  async bootstrap(tenantId: string, role: string, actorId: string, limit = 25, afterId?: string) {
    this.admin(role);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (afterId && !/^[A-Za-z0-9_-]{1,128}$/.test(afterId))) {
      throw new BadRequestException('Invalid bootstrap page');
    }
    if (recoveryMode() || (await publicSyncConfig(this.prisma, tenantId)).recoveryHold) throw new BadRequestException('Recovery reconciliation required');
    const reports = await this.prisma.report.findMany({ where: { tenantId, currentVersionId: { not: null }, ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: 'asc' }, take: limit, select: { id: true } });
    let enqueued = 0;
    for (const report of reports) {
      const changed = await this.prisma.$transaction(async tx => {
        await lockPublicReport(tx, tenantId, report.id);
        const before = await tx.report.findUniqueOrThrow({ where: { id: report.id }, select: { publicSyncRevision: true } });
        await enqueuePublicReport(tx, tenantId, report.id);
        const after = await tx.report.findUniqueOrThrow({ where: { id: report.id }, select: { publicSyncRevision: true } });
        if (before.publicSyncRevision !== after.publicSyncRevision) {
          await appendAudit(tx, { tenantId, actorId, action: 'PUBLIC_SYNC_BOOTSTRAP', entityType: 'Report', entityId: report.id,
            after: { projectionRevision: after.publicSyncRevision.toString() } });
          return true;
        }
        return false;
      });
      if (changed) enqueued++;
    }
    return { scanned: reports.length, enqueued, nextAfterId: reports.length === limit ? reports[reports.length - 1].id : null };
  }
}
