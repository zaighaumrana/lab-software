import { PrismaClient } from '@lms/database';
import type { DateRange } from './financial.queries';

function rangeWhere(range: DateRange) {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}

async function outsourcedSamplesInRange(prisma: PrismaClient, tenantId: string, range: DateRange) {
  return prisma.sample.findMany({
    where: { tenantId, isOutsourced: true, createdAt: rangeWhere(range) },
    include: {
      invoice: {
        select: {
          lines: { select: { testId: true, lineTotal: true, test: { select: { name: true, code: true } } } },
        },
      },
    },
  });
}

export async function getTotalOutsourcedTests(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  return prisma.sample.count({
    where: { tenantId, isOutsourced: true, createdAt: rangeWhere(range) },
  });
}

export async function getOutsourcingCost(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const result = await prisma.sample.aggregate({
    where: { tenantId, isOutsourced: true, createdAt: rangeWhere(range) },
    _sum: { outsourcingCost: true },
  });
  return Number(result._sum.outsourcingCost ?? 0);
}

/**
 * Revenue attributed to outsourced samples — sums the invoice line totals
 * for tests billed on invoices that have at least one outsourced sample.
 * An invoice can mix in-house and outsourced tests; this counts the whole
 * invoice's line revenue for lines whose test appears on an outsourced
 * sample's invoice, which is an approximation (see note in
 * getOutsourcingOverview) since Sample doesn't link to specific
 * InvoiceLines, only to the Invoice as a whole.
 */
export async function getOutsourcedRevenue(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const samples = await outsourcedSamplesInRange(prisma, tenantId, range);
  let revenue = 0;
  for (const s of samples) {
    for (const line of s.invoice.lines) {
      revenue += Number(line.lineTotal);
    }
  }
  return revenue;
}

export interface OutsourcedTestRow {
  testId: string;
  testName: string;
  testCode: string;
  count: number;
}

export async function getTopOutsourcedTests(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
  limit = 10,
): Promise<OutsourcedTestRow[]> {
  const samples = await outsourcedSamplesInRange(prisma, tenantId, range);
  const counts = new Map<string, { name: string; code: string; count: number }>();
  for (const s of samples) {
    for (const line of s.invoice.lines) {
      if (!line.testId) continue;
      const entry = counts.get(line.testId) ?? {
        name: line.test?.name ?? 'Unknown',
        code: line.test?.code ?? '—',
        count: 0,
      };
      entry.count += 1;
      counts.set(line.testId, entry);
    }
  }
  return Array.from(counts.entries())
    .map(([testId, v]) => ({ testId, testName: v.name, testCode: v.code, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface ExternalLabRow {
  labName: string;
  sampleCount: number;
  totalCost: number;
}

export async function getTopExternalLabs(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
  limit = 10,
): Promise<ExternalLabRow[]> {
  const samples = await prisma.sample.findMany({
    where: { tenantId, isOutsourced: true, createdAt: rangeWhere(range) },
    select: { externalLabName: true, outsourcingCost: true },
  });

  const byLab = new Map<string, { count: number; cost: number }>();
  for (const s of samples) {
    const lab = s.externalLabName?.trim() || 'Unspecified';
    const entry = byLab.get(lab) ?? { count: 0, cost: 0 };
    entry.count += 1;
    entry.cost += Number(s.outsourcingCost ?? 0);
    byLab.set(lab, entry);
  }

  return Array.from(byLab.entries())
    .map(([labName, v]) => ({ labName, sampleCount: v.count, totalCost: v.cost }))
    .sort((a, b) => b.sampleCount - a.sampleCount)
    .slice(0, limit);
}

export interface InHouseVsOutsourcedRow {
  label: 'In-House' | 'Outsourced';
  count: number;
}

/** Backs the Outsourced vs In-House Tests pie chart. */
export async function getInHouseVsOutsourced(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
): Promise<InHouseVsOutsourcedRow[]> {
  const [totalSamples, outsourcedSamples] = await Promise.all([
    prisma.sample.count({ where: { tenantId, createdAt: rangeWhere(range) } }),
    prisma.sample.count({
      where: { tenantId, isOutsourced: true, createdAt: rangeWhere(range) },
    }),
  ]);

  return [
    { label: 'In-House', count: totalSamples - outsourcedSamples },
    { label: 'Outsourced', count: outsourcedSamples },
  ];
}

/**
 * Net margin = revenue attributed to outsourced tests − what we paid the
 * external lab for them. Uses the same revenue approximation documented on
 * getOutsourcedRevenue.
 */
export async function getOutsourcingOverview(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const [
    totalOutsourcedTests,
    outsourcingCost,
    revenue,
    topOutsourcedTests,
    topExternalLabs,
    inHouseVsOutsourced,
  ] = await Promise.all([
    getTotalOutsourcedTests(prisma, tenantId, range),
    getOutsourcingCost(prisma, tenantId, range),
    getOutsourcedRevenue(prisma, tenantId, range),
    getTopOutsourcedTests(prisma, tenantId, range),
    getTopExternalLabs(prisma, tenantId, range),
    getInHouseVsOutsourced(prisma, tenantId, range),
  ]);

  return {
    totalOutsourcedTests,
    outsourcingCost,
    revenue,
    netMargin: revenue - outsourcingCost,
    topOutsourcedTests,
    topExternalLabs,
    inHouseVsOutsourced,
  };
}
