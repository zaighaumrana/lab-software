import { PrismaClient, SampleStatus, ResultStatus, ReportStatus } from '@lms/database';
import type { DateRange } from './financial.queries';

function rangeWhere(range: DateRange) {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}

function todayRange(): DateRange {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

/** Distinct patients with a booking created in range (defaults to today). */
export async function getPatientCount(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange = todayRange(),
) {
  const bookings = await prisma.booking.findMany({
    where: { tenantId, createdAt: rangeWhere(range) },
    select: { patientId: true },
    distinct: ['patientId'],
  });
  return bookings.length;
}

export async function getSamplesCollected(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange = todayRange(),
) {
  return prisma.sample.count({
    where: { tenantId, collectedAt: { not: null, ...(rangeWhere(range) ?? {}) } },
  });
}

/** Samples actively being processed right now — a point-in-time count, not
 * date-ranged (a sample doesn't stop being "in progress" at midnight). */
export async function getTestsInProgress(prisma: PrismaClient, tenantId: string) {
  return prisma.sample.count({
    where: { tenantId, status: SampleStatus.IN_TESTING },
  });
}

/** Results entered by a technician but not yet released/signed off — also
 * point-in-time, this is a queue depth, not a daily count. */
export async function getPendingVerification(prisma: PrismaClient, tenantId: string) {
  return prisma.result.count({
    where: { tenantId, status: ResultStatus.ENTERED },
  });
}

export async function getReportsReady(prisma: PrismaClient, tenantId: string) {
  return prisma.report.count({
    where: {
      tenantId,
      status: { in: [ReportStatus.COMPLETE, ReportStatus.PARTIAL_READY] },
    },
  });
}

export async function getCriticalAwaitingReview(prisma: PrismaClient, tenantId: string) {
  return prisma.result.count({
    where: { tenantId, isCritical: true, status: ResultStatus.ENTERED },
  });
}

/**
 * Average Turnaround Time = time from invoice creation (i.e. when the visit
 * was billed / samples were ordered) to report generation, for reports
 * generated within the range. Returned in hours.
 *
 * This is a proxy, not a precise "sample received → report out" TAT,
 * because Report links to Invoice, not directly to Sample — if a more
 * exact per-sample TAT is needed later, it would need a report↔sample
 * relation that doesn't exist yet. Documented rather than silently assumed.
 */
export async function getAvgTurnaroundTimeHours(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const reports = await prisma.report.findMany({
    where: {
      tenantId,
      generatedAt: { not: null, ...(rangeWhere(range) ?? {}) },
    },
    select: {
      generatedAt: true,
      invoice: { select: { createdAt: true } },
    },
  });

  if (reports.length === 0) return null;

  const totalHours = reports.reduce((sum, r) => {
    const hours =
      (r.generatedAt!.getTime() - r.invoice.createdAt.getTime()) / (1000 * 60 * 60);
    return sum + hours;
  }, 0);

  return Math.round((totalHours / reports.length) * 10) / 10;
}

/**
 * NOTE: "Reports Delivered" and "Pending Outsourced Results" from the
 * original request are intentionally NOT implemented here:
 *  - Reports Delivered needs a delivery/collection timestamp on Report that
 *    doesn't exist in the schema (only `generatedAt` exists — there's no
 *    tracking of when/if a patient actually collected the printed report).
 *  - Pending Outsourced Results depends on the outsourcing schema fields
 *    that don't exist yet (see docs/05_Analytics_Architecture.md section 2).
 * Both should be added once their backing fields exist, following the exact
 * same pattern as every function above.
 */

export async function getOperationalOverview(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange = todayRange(),
) {
  const [
    todayPatients,
    samplesCollected,
    testsInProgress,
    pendingVerification,
    reportsReady,
    criticalAwaitingReview,
    avgTurnaroundTimeHours,
  ] = await Promise.all([
    getPatientCount(prisma, tenantId, range),
    getSamplesCollected(prisma, tenantId, range),
    getTestsInProgress(prisma, tenantId),
    getPendingVerification(prisma, tenantId),
    getReportsReady(prisma, tenantId),
    getCriticalAwaitingReview(prisma, tenantId),
    getAvgTurnaroundTimeHours(prisma, tenantId, range),
  ]);

  return {
    todayPatients,
    samplesCollected,
    testsInProgress,
    pendingVerification,
    reportsReady,
    criticalAwaitingReview,
    avgTurnaroundTimeHours,
  };
}
