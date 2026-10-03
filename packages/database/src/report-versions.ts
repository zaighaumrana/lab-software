import { Prisma } from './generated/prisma/client.js';

/** Invoke inside the clinical transaction. The native factory locks invoice then report. */
export async function captureReleasedReportVersion(
  tx: Prisma.TransactionClient, tenantId: string, reportId: string,
): Promise<string | null> {
  const [row] = await tx.$queryRaw<{ id: string | null }[]>`
    SELECT public.b2_capture_report_version(${tenantId}::text, ${reportId}::text) AS id`;
  return row.id;
}
