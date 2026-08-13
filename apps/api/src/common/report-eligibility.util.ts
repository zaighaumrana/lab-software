/**
 * Single source of truth for "is this report allowed to be seen/printed".
 * Every surface that touches report delivery — the front-desk report
 * endpoint, the public tracking-ID lookup, and the Puppeteer print/PDF
 * routes — imports these functions rather than each writing its own
 * (potentially drifting) version of the same check.
 */

export interface ReportLike {
  status: string; // ReportStatus: PENDING | PARTIAL_READY | COMPLETE | AMENDED | ARCHIVED
}

export interface InvoiceLike {
  amountDue: unknown; // Prisma Decimal | number | string
}

/** A report is "finalized" once the lab has confirmed every result is
 * released (or it's a later amended/archived state building on that). */
export function isReportFinalized(report: ReportLike): boolean {
  return ['COMPLETE', 'AMENDED', 'ARCHIVED'].includes(report.status);
}

export function isInvoiceFullyPaid(invoice: InvoiceLike): boolean {
  return Number(invoice.amountDue ?? 0) <= 0;
}

/** Finalized + fully paid = the report may be shown to the patient
 * (front-desk preview, public website, PDF). */
export function canDeliverReport(report: ReportLike, invoice: InvoiceLike): boolean {
  return isReportFinalized(report) && isInvoiceFullyPaid(invoice);
}

/** Same rule as delivery today — kept as a separate name because printing
 * and on-screen delivery are conceptually different actions, so if they
 * ever need to diverge (e.g. an explicit admin override in the future)
 * there's already a distinct place to change just one of them. */
export function canPrintReport(report: ReportLike, invoice: InvoiceLike): boolean {
  return canDeliverReport(report, invoice);
}

export const PENDING_PAYMENT_MESSAGE =
  'Pending Payment: please collect the outstanding dues before printing the report.';

export const REPORT_NOT_FINALIZED_MESSAGE =
  'Report Not Ready: the laboratory is still completing this report.';
