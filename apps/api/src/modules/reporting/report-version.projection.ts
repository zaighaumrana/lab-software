import { Prisma } from '@lms/database';
import { clinicalResultInclude, projectClinicalResult } from '../laboratory/clinical-results';

export const reportVersionInclude = {
  memberships: {
    orderBy: { sortOrder: 'asc' },
    include: { result: { include: { ...clinicalResultInclude, sample: true } } },
  },
} satisfies Prisma.ReportVersionInclude;

export const reportBaseInclude = {
  currentVersion: { include: reportVersionInclude },
  invoice: { include: {
    booking: { include: { patient: true, doctor: true } },
    lines: { include: { test: true, package: true } },
    samples: true,
    payments: { orderBy: { receivedAt: 'asc' } },
  } },
} satisfies Prisma.ReportInclude;
type Base = Prisma.ReportGetPayload<{ include: typeof reportBaseInclude }>;
type Version = Prisma.ReportVersionGetPayload<{ include: typeof reportVersionInclude }>;

export interface ReportDisplaySnapshot {
  patient: { fullName: string; phone: string | null; gender: string | null;
    labNumber: string; mrcNumber: string; dateOfBirth: string | null };
  referrer: { fullName: string } | null;
  invoiceNumber: string;
  reportNumber: string;
  trackingId: string;
  visitAccession: string;
}

/** Clinical rows come solely from membership, including retained superseded revisions. */
export function projectReportVersion(report: Base, version: Version) {
  const snapshot = version.displaySnapshot as unknown as ReportDisplaySnapshot;
  const memberships = version.memberships.map(m => ({ ...m, result: projectClinicalResult(m.result) }));
  const projectedVersion = { ...version, memberships };
  const results = memberships.map(m => m.result);
  return {
    ...report,
    currentVersion: report.currentVersion?.id === version.id ? projectedVersion :
      (report.currentVersion ? { ...report.currentVersion, memberships: [] } : null),
    selectedVersion: projectedVersion,
    reportNumber: snapshot.reportNumber,
    trackingId: snapshot.trackingId,
    generatedAt: version.releasedAt,
    invoice: {
      ...report.invoice,
      invoiceNumber: snapshot.invoiceNumber,
      booking: { ...report.invoice.booking,
        patient: { ...report.invoice.booking.patient, ...snapshot.patient },
        doctor: snapshot.referrer,
      },
      samples: report.invoice.samples.map(s => ({ ...s, results: results.filter(r => r.sampleId === s.id) })),
    },
  };
}
