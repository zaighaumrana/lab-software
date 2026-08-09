import { PrismaClient, BookingStatus } from '@lms/database';
import type { DateRange } from './financial.queries';

function rangeWhere(range: DateRange) {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}

function daysInRange(range: DateRange) {
  if (!range.from || !range.to) return 1;
  const ms = range.to.getTime() - range.from.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
}

/** Billed invoice line items with a testId, scoped to invoices created in
 * range — the shared base every test-volume/revenue metric below groups. */
async function testLinesInRange(prisma: PrismaClient, tenantId: string, range: DateRange) {
  return prisma.invoiceLine.findMany({
    where: {
      testId: { not: null },
      invoice: { tenantId, createdAt: rangeWhere(range) },
    },
    select: { testId: true, quantity: true, unitPrice: true, lineTotal: true },
  });
}

export interface TestVolumeRow {
  testId: string;
  testName: string;
  testCode: string;
  count: number;
}

export interface TestRevenueRow {
  testId: string;
  testName: string;
  testCode: string;
  revenue: number;
}

async function testNameMap(prisma: PrismaClient, tenantId: string) {
  const tests = await prisma.test.findMany({
    where: { tenantId },
    select: { id: true, name: true, code: true },
  });
  return new Map(tests.map((t) => [t.id, t]));
}

export async function getMostPerformedTests(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
  limit = 10,
): Promise<TestVolumeRow[]> {
  const [lines, names] = await Promise.all([
    testLinesInRange(prisma, tenantId, range),
    testNameMap(prisma, tenantId),
  ]);

  const counts = new Map<string, number>();
  for (const l of lines) {
    if (!l.testId) continue;
    counts.set(l.testId, (counts.get(l.testId) ?? 0) + l.quantity);
  }

  return Array.from(counts.entries())
    .map(([testId, count]) => ({
      testId,
      testName: names.get(testId)?.name ?? 'Unknown',
      testCode: names.get(testId)?.code ?? '—',
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Least performed — deliberately includes ACTIVE tests with zero orders in
 * range (not just "lowest of the ones that got ordered at least once"),
 * since the useful signal here is "what's sitting in the catalog unused",
 * which a naive groupBy would silently omit.
 */
export async function getLeastPerformedTests(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
  limit = 10,
): Promise<TestVolumeRow[]> {
  const [lines, allTests] = await Promise.all([
    testLinesInRange(prisma, tenantId, range),
    prisma.test.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const l of lines) {
    if (!l.testId) continue;
    counts.set(l.testId, (counts.get(l.testId) ?? 0) + l.quantity);
  }

  return allTests
    .map((t) => ({
      testId: t.id,
      testName: t.name,
      testCode: t.code,
      count: counts.get(t.id) ?? 0,
    }))
    .sort((a, b) => a.count - b.count)
    .slice(0, limit);
}

export async function getHighestRevenueTests(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
  limit = 10,
): Promise<TestRevenueRow[]> {
  const [lines, names] = await Promise.all([
    testLinesInRange(prisma, tenantId, range),
    testNameMap(prisma, tenantId),
  ]);

  const revenue = new Map<string, number>();
  for (const l of lines) {
    if (!l.testId) continue;
    revenue.set(l.testId, (revenue.get(l.testId) ?? 0) + Number(l.lineTotal));
  }

  return Array.from(revenue.entries())
    .map(([testId, rev]) => ({
      testId,
      testName: names.get(testId)?.name ?? 'Unknown',
      testCode: names.get(testId)?.code ?? '—',
      revenue: rev,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** Average charged price per test line (post-discount unit price), not the
 * catalog base price — reflects what's actually being collected. */
export async function getAverageTestPrice(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const lines = await testLinesInRange(prisma, tenantId, range);
  if (lines.length === 0) return 0;
  const total = lines.reduce((sum, l) => sum + Number(l.unitPrice), 0);
  return Math.round((total / lines.length) * 100) / 100;
}

export async function getAverageDailyTests(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const lines = await testLinesInRange(prisma, tenantId, range);
  const totalTests = lines.reduce((sum, l) => sum + l.quantity, 0);
  return Math.round((totalTests / daysInRange(range)) * 10) / 10;
}

export async function getAveragePatientsPerDay(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const bookings = await prisma.booking.findMany({
    where: { tenantId, createdAt: rangeWhere(range) },
    select: { patientId: true },
    distinct: ['patientId'],
  });
  return Math.round((bookings.length / daysInRange(range)) * 10) / 10;
}

export interface NewVsRepeatResult {
  repeatPatients: number;
  newPatients: number;
  repeatPercentage: number;
  newPercentage: number;
}

/**
 * "Repeat" vs "New" is evaluated per distinct patient seen in range: a
 * patient is Repeat if they had any booking before the range started
 * (an existing patient returning), New if their earliest-ever booking
 * falls inside the range (acquired in this period). This is the standard
 * new-vs-returning cohort definition, not "did they book twice in-range".
 *
 * Requires `range.from` to be meaningful — with no lower bound there's no
 * "before the period" to compare against, so every patient would trivially
 * count as new. Callers should always supply a concrete from-date (every
 * DateRangeFilter preset in the frontend does).
 */
export async function getNewVsRepeatPatients(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
): Promise<NewVsRepeatResult> {
  const bookingsInRange = await prisma.booking.findMany({
    where: { tenantId, createdAt: rangeWhere(range) },
    select: { patientId: true },
    distinct: ['patientId'],
  });
  const patientIds = bookingsInRange.map((b) => b.patientId);

  if (patientIds.length === 0) {
    return { repeatPatients: 0, newPatients: 0, repeatPercentage: 0, newPercentage: 0 };
  }

  const earliestBookings = await prisma.booking.groupBy({
    by: ['patientId'],
    where: { tenantId, patientId: { in: patientIds } },
    _min: { createdAt: true },
  });
  const earliestByPatient = new Map(
    earliestBookings.map((b) => [b.patientId, b._min.createdAt!]),
  );

  let repeatPatients = 0;
  for (const patientId of patientIds) {
    const earliest = earliestByPatient.get(patientId);
    if (range.from && earliest && earliest < range.from) repeatPatients++;
  }
  const newPatients = patientIds.length - repeatPatients;

  return {
    repeatPatients,
    newPatients,
    repeatPercentage: Math.round((repeatPatients / patientIds.length) * 1000) / 10,
    newPercentage: Math.round((newPatients / patientIds.length) * 1000) / 10,
  };
}

export async function getCancellationRate(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const [total, cancelled] = await Promise.all([
    prisma.booking.count({ where: { tenantId, createdAt: rangeWhere(range) } }),
    prisma.booking.count({
      where: { tenantId, createdAt: rangeWhere(range), status: BookingStatus.CANCELLED },
    }),
  ]);
  return total === 0 ? 0 : Math.round((cancelled / total) * 1000) / 10;
}

export interface CategoryDistributionRow {
  category: string;
  count: number;
  revenue: number;
}

/** Test volume/revenue grouped by Test.category — backs the Test Category
 * Distribution pie chart. Tests with no category set are bucketed under
 * "Uncategorized" rather than dropped, so the pie always sums to 100%. */
export async function getTestCategoryDistribution(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
): Promise<CategoryDistributionRow[]> {
  const lines = await prisma.invoiceLine.findMany({
    where: {
      testId: { not: null },
      invoice: { tenantId, createdAt: rangeWhere(range) },
    },
    select: { quantity: true, lineTotal: true, test: { select: { category: true } } },
  });

  const byCategory = new Map<string, { count: number; revenue: number }>();
  for (const l of lines) {
    const category = l.test?.category?.trim() || 'Uncategorized';
    const entry = byCategory.get(category) ?? { count: 0, revenue: 0 };
    entry.count += l.quantity;
    entry.revenue += Number(l.lineTotal);
    byCategory.set(category, entry);
  }

  return Array.from(byCategory.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getTestAnalyticsOverview(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const [
    mostPerformed,
    leastPerformed,
    highestRevenue,
    averageTestPrice,
    averageDailyTests,
    averagePatientsPerDay,
    newVsRepeat,
    categoryDistribution,
  ] = await Promise.all([
    getMostPerformedTests(prisma, tenantId, range),
    getLeastPerformedTests(prisma, tenantId, range),
    getHighestRevenueTests(prisma, tenantId, range),
    getAverageTestPrice(prisma, tenantId, range),
    getAverageDailyTests(prisma, tenantId, range),
    getAveragePatientsPerDay(prisma, tenantId, range),
    getNewVsRepeatPatients(prisma, tenantId, range),
    getTestCategoryDistribution(prisma, tenantId, range),
  ]);

  return {
    mostPerformed,
    leastPerformed,
    highestRevenue,
    averageTestPrice,
    averageDailyTests,
    averagePatientsPerDay,
    newVsRepeat,
    categoryDistribution,
  };
}
