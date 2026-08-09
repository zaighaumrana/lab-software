import { PrismaClient, InvoiceStatus } from '@lms/database';
import type { DateRange } from './financial.queries';
import { getNewVsRepeatPatients, getCancellationRate } from './test-analytics.queries';

function rangeWhere(range: DateRange) {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}

const BILLED_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.CLOSED,
  InvoiceStatus.REFUNDED,
];

export interface PatientRevenueRow {
  patientId: string;
  patientName: string;
  invoiceCount: number;
  totalRevenue: number;
}

export async function getHighestRevenuePatients(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
  limit = 10,
): Promise<PatientRevenueRow[]> {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, status: { in: BILLED_STATUSES }, createdAt: rangeWhere(range) },
    select: {
      grandTotal: true,
      booking: { select: { patientId: true, patient: { select: { fullName: true } } } },
    },
  });

  const byPatient = new Map<string, { name: string; count: number; revenue: number }>();
  for (const inv of invoices) {
    const pid = inv.booking?.patientId;
    if (!pid) continue;
    const entry = byPatient.get(pid) ?? {
      name: inv.booking?.patient?.fullName ?? 'Unknown',
      count: 0,
      revenue: 0,
    };
    entry.count += 1;
    entry.revenue += Number(inv.grandTotal);
    byPatient.set(pid, entry);
  }

  return Array.from(byPatient.entries())
    .map(([patientId, v]) => ({
      patientId,
      patientName: v.name,
      invoiceCount: v.count,
      totalRevenue: v.revenue,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);
}

export interface PackagePopularityRow {
  packageId: string;
  packageName: string;
  count: number;
}

export async function getMostPopularPackages(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
  limit = 10,
): Promise<PackagePopularityRow[]> {
  const lines = await prisma.invoiceLine.findMany({
    where: {
      packageId: { not: null },
      invoice: { tenantId, createdAt: rangeWhere(range) },
    },
    select: { packageId: true, quantity: true, package: { select: { name: true } } },
  });

  const counts = new Map<string, { name: string; count: number }>();
  for (const l of lines) {
    if (!l.packageId) continue;
    const entry = counts.get(l.packageId) ?? { name: l.package?.name ?? 'Unknown', count: 0 };
    entry.count += l.quantity;
    counts.set(l.packageId, entry);
  }

  return Array.from(counts.entries())
    .map(([packageId, v]) => ({ packageId, packageName: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface HourlyVisitRow {
  hour: number; // 0-23, local server time
  count: number;
}

export async function getPeakVisitHours(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
): Promise<HourlyVisitRow[]> {
  const bookings = await prisma.booking.findMany({
    where: { tenantId, createdAt: rangeWhere(range) },
    select: { createdAt: true },
  });

  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const b of bookings) {
    buckets[b.createdAt.getHours()].count += 1;
  }
  return buckets;
}

export interface TrendPoint {
  period: string; // label — day (yyyy-mm-dd), ISO week (yyyy-Www), or month (yyyy-mm)
  patientCount: number;
  revenue: number;
}

function isoWeekLabel(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Shared trend bucketing for Weekly / Monthly / Seasonal views. "Seasonal"
 * is interpreted as calendar quarter (Q1–Q4) — the request doesn't define
 * seasons precisely, and quarters are the standard business-reporting
 * stand-in absent a lab-specific definition (documented here rather than
 * silently assumed).
 */
export async function getBookingTrend(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
  granularity: 'day' | 'week' | 'month' | 'quarter',
): Promise<TrendPoint[]> {
  const bookings = await prisma.booking.findMany({
    where: { tenantId, createdAt: rangeWhere(range) },
    select: { createdAt: true, patientId: true, invoice: { select: { grandTotal: true } } },
  });

  const buckets = new Map<string, { patients: Set<string>; revenue: number }>();
  for (const b of bookings) {
    let label: string;
    if (granularity === 'day') {
      label = b.createdAt.toISOString().slice(0, 10);
    } else if (granularity === 'week') {
      label = isoWeekLabel(b.createdAt);
    } else if (granularity === 'month') {
      label = `${b.createdAt.getFullYear()}-${String(b.createdAt.getMonth() + 1).padStart(2, '0')}`;
    } else {
      const quarter = Math.floor(b.createdAt.getMonth() / 3) + 1;
      label = `${b.createdAt.getFullYear()}-Q${quarter}`;
    }
    const entry = buckets.get(label) ?? { patients: new Set<string>(), revenue: 0 };
    entry.patients.add(b.patientId);
    entry.revenue += Number(b.invoice?.grandTotal ?? 0);
    buckets.set(label, entry);
  }

  return Array.from(buckets.entries())
    .map(([period, v]) => ({ period, patientCount: v.patients.size, revenue: v.revenue }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export interface GrowthRateResult {
  currentRevenue: number;
  previousRevenue: number;
  revenueGrowthPercent: number | null;
  currentPatients: number;
  previousPatients: number;
  patientGrowthPercent: number | null;
}

/**
 * Growth rate compares the selected range against the immediately
 * preceding period of equal length (e.g. "this month" vs "last month",
 * "this week" vs "last week") — requires both `from` and `to`.
 */
export async function getGrowthRate(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
): Promise<GrowthRateResult | null> {
  if (!range.from || !range.to) return null;

  const lengthMs = range.to.getTime() - range.from.getTime();
  const previousTo = new Date(range.from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - lengthMs);

  async function totals(from: Date, to: Date) {
    const bookings = await prisma.booking.findMany({
      where: { tenantId, createdAt: { gte: from, lte: to } },
      select: { patientId: true, invoice: { select: { grandTotal: true } } },
    });
    return {
      patients: new Set(bookings.map((b) => b.patientId)).size,
      revenue: bookings.reduce((sum, b) => sum + Number(b.invoice?.grandTotal ?? 0), 0),
    };
  }

  const [current, previous] = await Promise.all([
    totals(range.from, range.to),
    totals(previousFrom, previousTo),
  ]);

  const pct = (curr: number, prev: number) =>
    prev === 0 ? null : Math.round(((curr - prev) / prev) * 1000) / 10;

  return {
    currentRevenue: current.revenue,
    previousRevenue: previous.revenue,
    revenueGrowthPercent: pct(current.revenue, previous.revenue),
    currentPatients: current.patients,
    previousPatients: previous.patients,
    patientGrowthPercent: pct(current.patients, previous.patients),
  };
}

export async function getBusinessInsightsOverview(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const [
    highestRevenuePatients,
    mostPopularPackages,
    peakVisitHours,
    dailyTrend,
    weeklyTrend,
    monthlyTrend,
    seasonalTrend,
    growthRate,
    newVsRepeat,
    cancellationRate,
  ] = await Promise.all([
    getHighestRevenuePatients(prisma, tenantId, range),
    getMostPopularPackages(prisma, tenantId, range),
    getPeakVisitHours(prisma, tenantId, range),
    getBookingTrend(prisma, tenantId, range, 'day'),
    getBookingTrend(prisma, tenantId, range, 'week'),
    getBookingTrend(prisma, tenantId, range, 'month'),
    getBookingTrend(prisma, tenantId, range, 'quarter'),
    getGrowthRate(prisma, tenantId, range),
    getNewVsRepeatPatients(prisma, tenantId, range),
    getCancellationRate(prisma, tenantId, range),
  ]);

  return {
    highestRevenuePatients,
    mostPopularPackages,
    peakVisitHours,
    dailyTrend,
    weeklyTrend,
    monthlyTrend,
    seasonalTrend,
    growthRate,
    repeatPatientRate: newVsRepeat.repeatPercentage,
    cancellationRate,
  };
}
