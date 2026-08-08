import { PrismaClient, InvoiceStatus } from '@lms/database';

export interface DateRange {
  from?: Date;
  to?: Date;
}

function rangeWhere(range: DateRange) {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}

/** Non-draft, non-voided invoices are what actually counts as "billed". */
const BILLED_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.CLOSED,
  InvoiceStatus.REFUNDED,
];

/**
 * Sum of everything actually billed to patients in the range (post-discount
 * grand total, not the pre-discount catalog price — see getDiscountGiven for
 * the pre-discount comparison).
 */
export async function getInvoicedRevenue(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const result = await prisma.invoice.aggregate({
    where: {
      tenantId,
      status: { in: BILLED_STATUSES },
      createdAt: rangeWhere(range),
    },
    _sum: { grandTotal: true },
  });
  return Number(result._sum.grandTotal ?? 0);
}

/** Actual cash collected, regardless of which invoice(s) it applies to — this
 * is the number that answers "how much money did we actually take in". */
export async function getCashReceived(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const result = await prisma.payment.aggregate({
    where: {
      invoice: { tenantId },
      status: { in: ['FULLY_RECEIVED', 'PARTIALLY_RECEIVED'] },
      receivedAt: rangeWhere(range),
    },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

/** What's billed but not yet collected — snapshot as of now, not
 * date-ranged (an outstanding balance doesn't belong to a single day). */
export async function getOutstanding(prisma: PrismaClient, tenantId: string) {
  const result = await prisma.invoice.aggregate({
    where: { tenantId, status: InvoiceStatus.ISSUED },
    _sum: { amountDue: true },
  });
  return Number(result._sum.amountDue ?? 0);
}

export async function getDiscountGiven(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const result = await prisma.invoice.aggregate({
    where: {
      tenantId,
      status: { in: BILLED_STATUSES },
      createdAt: rangeWhere(range),
    },
    _sum: { discountTotal: true },
  });
  return Number(result._sum.discountTotal ?? 0);
}

export async function getRefunds(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const result = await prisma.payment.aggregate({
    where: {
      invoice: { tenantId },
      refundedAt: { not: null, ...(rangeWhere(range) ?? {}) },
    },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

/** Doctor share actually paid out, in range — used to derive Net Revenue. */
async function getDoctorSharePaid(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const result = await prisma.doctorShare.aggregate({
    where: {
      tenantId,
      paidAt: { not: null, ...(rangeWhere(range) ?? {}) },
    },
    _sum: { paidAmount: true },
  });
  return Number(result._sum.paidAmount ?? 0);
}

/**
 * Net Revenue = cash actually received − refunds − doctor share paid out.
 * Does NOT subtract outsourcing cost yet (that field doesn't exist in the
 * schema — see docs/05_Analytics_Architecture.md section 2). Once it does,
 * this is the one function that needs updating; nothing upstream changes.
 */
export async function getNetRevenue(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const [cashReceived, refunds, doctorSharePaid] = await Promise.all([
    getCashReceived(prisma, tenantId, range),
    getRefunds(prisma, tenantId, range),
    getDoctorSharePaid(prisma, tenantId, range),
  ]);
  return cashReceived - refunds - doctorSharePaid;
}

/** Everything a "Financial Overview" widget page needs, in one round trip. */
export async function getFinancialOverview(
  prisma: PrismaClient,
  tenantId: string,
  range: DateRange,
) {
  const [invoicedRevenue, cashReceived, outstanding, discountGiven, refunds, netRevenue] =
    await Promise.all([
      getInvoicedRevenue(prisma, tenantId, range),
      getCashReceived(prisma, tenantId, range),
      getOutstanding(prisma, tenantId),
      getDiscountGiven(prisma, tenantId, range),
      getRefunds(prisma, tenantId, range),
      getNetRevenue(prisma, tenantId, range),
    ]);

  return {
    invoicedRevenue,
    cashReceived,
    outstanding,
    discountGiven,
    refunds,
    netRevenue,
  };
}
