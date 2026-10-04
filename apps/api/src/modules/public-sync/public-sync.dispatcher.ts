import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { recoveryMode } from '../../common/recovery-mode';
import { ReportArtifactStore, persistentReportRoot } from '../printing/report-artifact.store';
import { PUBLIC_REPORT_SCHEMA, PUBLIC_SYNC_CONFIG, publicSyncConfig } from './public-projection';
import { PUBLIC_SYNC_TRANSPORT, PublicSyncTransport, PublicSyncFailure, validatePublicProjection } from './public-sync.transport';

const BATCH = 10;
const MAX_ATTEMPTS = 5;
const BACKOFF = [60_000, 300_000, 900_000, 3_600_000];
const clearLease = { claimedBy: null, claimExpiresAt: null, dispatchStartedAt: null };
const allowedErrors = new Set(['NETWORK_UNAVAILABLE','TIMEOUT','RATE_LIMITED','TEMPORARY_REMOTE_FAILURE',
  'INVALID_PAYLOAD','UNSUPPORTED_SCHEMA','AUTH_REJECTED','ARTIFACT_INVALID','REVISION_CONFLICT']);

@Injectable()
export class PublicSyncDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running: Promise<void> | null = null;
  private stopping = false;
  private store?: ReportArtifactStore;
  constructor(private readonly prisma: PrismaService, @Inject(PUBLIC_SYNC_TRANSPORT) private readonly transport: PublicSyncTransport) {}
  private allowed() { return !this.stopping && !recoveryMode() && process.env.PUBLIC_SYNC_ENABLED === 'true' && this.transport.isConfigured(); }
  onModuleInit() {
    if (!this.allowed()) return;
    this.timer = setInterval(() => void this.runOnce().catch(() => Logger.warn('Public sync cycle failed; durable intents retained', 'PublicSync')), 10_000);
    this.timer.unref();
    void this.runOnce().catch(() => Logger.warn('Public sync startup failed; durable intents retained', 'PublicSync'));
  }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); await this.running; }
  async runOnce() {
    if (!this.allowed()) return;
    if (this.running) return this.running;
    this.running = this.cycle();
    try { await this.running; } finally { this.running = null; }
  }
  private async cycle() {
    await this.recoverExpired();
    for (let i = 0; i < BATCH && this.allowed(); i++) {
      const claim = await this.claimDue(); if (!claim) break;
      await this.dispatchClaim(claim.id, claim.owner);
    }
  }
  async claimDue(): Promise<{id: string; owner: string} | null> {
    if (!this.allowed()) return null;
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{id: string}[]>`SELECT s.id FROM sync_outbox s
        JOIN configurations c ON c."tenantId"=s."tenantId" AND c.key=${PUBLIC_SYNC_CONFIG}
        WHERE s."eventType"=${PUBLIC_REPORT_SCHEMA} AND s.status IN ('QUEUED','RETRYING')
        AND s.attempts < ${MAX_ATTEMPTS} AND c.value->>'enabled'='true' AND COALESCE(c.value->>'recoveryHold','false') <> 'true'
        AND (s."nextAttemptAt" IS NULL OR s."nextAttemptAt" <= (clock_timestamp() AT TIME ZONE 'UTC'))
        AND NOT EXISTS (SELECT 1 FROM sync_outbox active WHERE active."projectionKey"=s."projectionKey" AND active.status='SYNCING')
        AND pg_try_advisory_xact_lock(hashtextextended(s."projectionKey", 701))
        ORDER BY s."nextAttemptAt" NULLS FIRST,s."createdAt",s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED`;
      if (!rows.length) return null;
      const owner = randomUUID();
      await tx.$executeRaw`UPDATE sync_outbox SET status='SYNCING',"claimedBy"=${owner},
        "claimExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC')+interval '120 seconds',
        "updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE id=${rows[0].id}`;
      return { id: rows[0].id, owner };
    });
  }
  async recoverExpired() {
    if (!this.allowed()) return;
    await this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{id: string; attempts: number}[]>`SELECT id,attempts FROM sync_outbox
        WHERE "eventType"=${PUBLIC_REPORT_SCHEMA} AND status='SYNCING'
        AND "claimExpiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC')
        ORDER BY "claimExpiresAt",id LIMIT ${BATCH} FOR UPDATE SKIP LOCKED`;
      for (const row of rows) await tx.syncOutbox.update({ where: { id: row.id }, data: {
        ...clearLease, status: row.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'RETRYING',
        failureCode: 'LEASE_EXPIRED', lastError: 'LEASE_EXPIRED', nextAttemptAt: new Date() } });
    });
  }
  async dispatchClaim(id: string, owner: string) {
    if (!this.allowed()) return;
    // Durable marker commits before I/O. Unknown acknowledgements can safely replay this immutable revision.
    const started = await this.prisma.syncOutbox.updateMany({ where: { id, claimedBy: owner, status: 'SYNCING',
      claimExpiresAt: { gt: new Date() }, dispatchStartedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 }, dispatchStartedAt: new Date() } });
    if (!started.count) return;
    await this.prisma.$transaction(async tx => {
      const owned = await tx.$queryRaw<{id: string}[]>`SELECT id FROM sync_outbox WHERE id=${id} AND "claimedBy"=${owner}
        AND status='SYNCING' AND "claimExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC') FOR UPDATE SKIP LOCKED`;
      if (!owned.length) return;
      const row = await tx.syncOutbox.findUniqueOrThrow({ where: { id } });
      const config = await publicSyncConfig(tx, row.tenantId);
      if (!this.allowed() || !config.enabled || config.recoveryHold) {
        await tx.syncOutbox.update({ where: { id }, data: { ...clearLease, status: 'RETRYING' } }); return;
      }
      const report = await tx.report.findFirst({ where: { id: row.aggregateId, tenantId: row.tenantId }, include: { currentVersion: true } });
      if (!report || report.publicSyncRevision > row.projectionRevision!) {
        await tx.syncOutbox.update({ where: { id }, data: { ...clearLease, status: 'ABANDONED', failureCode: 'SUPERSEDED', lastError: 'SUPERSEDED' } }); return;
      }
      // This queue-only row lock spans the bounded attempt. Recovery uses SKIP LOCKED, so an expired
      // lease cannot start a second transport while the first worker is alive. No domain row is locked.
      const signal = AbortSignal.timeout(20_000);
      try {
        const payload = row.payload;
        validatePublicProjection(payload);
        if (payload.projectionKey !== row.projectionKey || payload.projectionRevision !== row.projectionRevision?.toString()) {
          throw new PublicSyncFailure('INVALID_PAYLOAD', false);
        }
        if (payload.artifact) {
          const v = report.currentVersion;
          if (!v || v.versionNo !== payload.currentVersion?.versionNo || v.pdfSha256 !== payload.artifact.sha256 || v.pdfByteSize !== payload.artifact.size || !v.pdfPath) {
            throw new PublicSyncFailure('ARTIFACT_INVALID', false);
          }
          let bytes: Buffer;
          try { bytes = await (this.store ??= new ReportArtifactStore(persistentReportRoot())).read(row.tenantId, row.aggregateId, v.versionNo,
            { pdfPath: v.pdfPath, pdfSha256: v.pdfSha256!, pdfByteSize: v.pdfByteSize! }); }
          catch { throw new PublicSyncFailure('ARTIFACT_INVALID', false); }
          if (!this.allowed()) throw new PublicSyncFailure('NETWORK_UNAVAILABLE', true);
          await this.transport.ensureArtifact(payload.artifact, bytes, signal);
        }
        signal.throwIfAborted();
        const latestConfig = await publicSyncConfig(tx, row.tenantId);
        if (!this.allowed() || !latestConfig.enabled || latestConfig.recoveryHold) throw new PublicSyncFailure('NETWORK_UNAVAILABLE', true);
        await this.transport.upsertProjection(payload, signal);
        await tx.syncOutbox.updateMany({ where: { id, claimedBy: owner, status: 'SYNCING', claimExpiresAt: { gt: new Date() } },
          data: { ...clearLease, status: 'SYNCED', syncedAt: new Date(), nextAttemptAt: null, failureCode: null, lastError: null } });
      } catch (error) {
        const known = error instanceof PublicSyncFailure && allowedErrors.has(error.code);
        const code = signal.aborted ? 'TIMEOUT' : known ? error.code : 'TEMPORARY_REMOTE_FAILURE';
        const retry = (signal.aborted || !known || error.transient) && row.attempts < MAX_ATTEMPTS;
        await tx.syncOutbox.updateMany({ where: { id, claimedBy: owner, status: 'SYNCING' }, data: {
          ...clearLease, status: retry ? 'RETRYING' : 'FAILED', failureCode: code, lastError: code,
          nextAttemptAt: retry ? new Date(Date.now() + BACKOFF[Math.min(row.attempts - 1, BACKOFF.length - 1)]) : null } });
      }
    }, { timeout: 30_000, maxWait: 5_000 });
  }
}
