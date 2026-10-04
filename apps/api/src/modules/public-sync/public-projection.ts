import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@lms/database';
import { canDeliverReport, isReportFinalized } from '../../common/report-eligibility.util';

export const PUBLIC_REPORT_SCHEMA = 'public-report/v1';
export const PUBLIC_SYNC_CONFIG = 'public-sync';
export interface PublicReportProjection {
  schemaVersion: 'public-report/v1';
  projectionKey: string;
  projectionRevision: string; // bigint decimal, never a lossy JS number
  trackingId: string; // Lookup locator only; F2 must authorize access independently.
  reportReady: boolean;
  onlineEligible: boolean;
  currentVersion: { versionNo: number } | null;
  artifact: { logicalKey: string; sha256: string; size: number } | null;
}

/** Same invoice -> report lock order as B2 publication and Phase C print authorization. */
export async function lockPublicReport(tx: Prisma.TransactionClient, tenantId: string, reportId: string) {
  const identity = await tx.report.findFirst({ where: { id: reportId, tenantId }, select: { invoiceId: true } });
  if (!identity) return false;
  await tx.$queryRaw`SELECT id FROM invoices WHERE id=${identity.invoiceId} AND "tenantId"=${tenantId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM reports WHERE id=${reportId} AND "tenantId"=${tenantId} FOR UPDATE`;
  return true;
}

/** Required local write only. Call inside the domain transaction, irrespective of transport enablement. */
export async function enqueuePublicReport(tx: Prisma.TransactionClient, tenantId: string, reportId: string) {
  if (!await lockPublicReport(tx, tenantId, reportId)) return null;
  const report = await tx.report.findUniqueOrThrow({ where: { id: reportId }, include: { invoice: true, currentVersion: true } });
  const version = report.currentVersion;
  // Unversioned legacy/live clinical rows are never made into a cloud PDF.
  const reportReady = !!version && isReportFinalized(report);
  const onlineEligible = reportReady && canDeliverReport(report, report.invoice);
  const key = report.publicSyncKey ?? randomUUID();
  const artifact = onlineEligible && version?.pdfPath && version.pdfSha256 && version.pdfByteSize
    ? { logicalKey: `${key}/version-${version.versionNo}/${version.pdfSha256}.pdf`, sha256: version.pdfSha256, size: version.pdfByteSize } : null;
  const body = { schemaVersion: PUBLIC_REPORT_SCHEMA, projectionKey: key, trackingId: report.trackingId,
    reportReady, onlineEligible, currentVersion: version ? { versionNo: version.versionNo } : null, artifact };
  const previous = await tx.syncOutbox.findFirst({ where: { tenantId, aggregateId: reportId, eventType: PUBLIC_REPORT_SCHEMA },
    orderBy: { projectionRevision: 'desc' } });
  if (previous) {
    const { projectionRevision: _revision, ...old } = previous.payload as unknown as PublicReportProjection;
    if (isDeepStrictEqual(old, body)) return previous.id;
  }
  const revision = report.publicSyncRevision + 1;
  await tx.report.update({ where: { id: reportId }, data: { publicSyncKey: key, publicSyncRevision: revision } });
  const row = await tx.syncOutbox.create({ data: { tenantId, eventType: PUBLIC_REPORT_SCHEMA, aggregateType: 'Report', aggregateId: reportId,
    projectionKey: key, projectionRevision: BigInt(revision),
    payload: { ...body, projectionRevision: revision.toString() } as Prisma.InputJsonValue } });
  // Only definitely unsent rows are coalesced; active attempts are fenced by the receiver revision contract.
  await tx.syncOutbox.updateMany({ where: { projectionKey: key, id: { not: row.id }, eventType: PUBLIC_REPORT_SCHEMA,
    status: { in: ['QUEUED', 'RETRYING'] } }, data: { status: 'ABANDONED', failureCode: 'SUPERSEDED', lastError: 'SUPERSEDED', nextAttemptAt: null } });
  return row.id;
}

export async function enqueueInvoicePublicReport(tx: Prisma.TransactionClient, invoiceId: string) {
  const report = await tx.report.findUnique({ where: { invoiceId }, select: { id: true, tenantId: true } });
  return report ? enqueuePublicReport(tx, report.tenantId, report.id) : null;
}

export async function publicSyncConfig(tx: Pick<Prisma.TransactionClient, 'configuration'>, tenantId: string) {
  const row = await tx.configuration.findUnique({ where: { tenantId_key: { tenantId, key: PUBLIC_SYNC_CONFIG } } });
  const value = row?.value as { enabled?: unknown; recoveryHold?: unknown } | undefined;
  return { enabled: value?.enabled === true, recoveryHold: value?.recoveryHold === true };
}
