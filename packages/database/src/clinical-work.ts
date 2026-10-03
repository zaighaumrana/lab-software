import { randomUUID } from 'node:crypto';
import { Prisma, SampleEventType, SampleStatus } from './generated/prisma/client.js';

// These factories deliberately accept a transaction, never a standalone client:
// legacy + clinical writes either all commit or all roll back. No additional pool.
export async function allocateVisitAccession(tx: Prisma.TransactionClient, tenantId: string, branchId: string, at = new Date()): Promise<string> {
  // Raw Date bindings can be normalized as timezone-free timestamps by the adapter.
  // An explicit ISO offset string makes business-day conversion independent of session TimeZone.
  const instant = at.toISOString();
  const [row] = await tx.$queryRaw<{ accession: string }[]>`
    SELECT phase_a_visit_accession(${tenantId}::text, ${branchId}::text, ${instant}::timestamptz) AS accession`;
  return row.accession;
}

export async function captureCurrentTestVersion(tx: Prisma.TransactionClient, testId: string): Promise<string> {
  // Mapped CaptureProvenance retains this deployed PostgreSQL enum/type name.
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    SELECT phase_a_capture_test(${testId}::text, 'PROSPECTIVE_CURRENT'::"DefinitionCaptureSource") AS id`;
  return row.id;
}

export async function captureCurrentPackageVersion(tx: Prisma.TransactionClient, packageId: string): Promise<string> {
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    SELECT phase_a_capture_package(${packageId}::text, 'PROSPECTIVE_CURRENT'::"DefinitionCaptureSource") AS id`;
  return row.id;
}

/** Foundation factory, not enabled in the legacy billing endpoint until clinical authoring/cutover. */
export async function materializeInvoiceClinicalWork(tx: Prisma.TransactionClient, invoiceId: string): Promise<string> {
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    SELECT phase_a_materialize_invoice(${invoiceId}::text, false) AS id`;
  return row.id;
}

export async function assignSampleToOrderedTest(tx: Prisma.TransactionClient, sampleId: string, orderedTestId: string) {
  // Serialize competing assignments for this occurrence. The composite FKs enforce scope even in SQL.
  await tx.$queryRaw`SELECT id FROM ordered_tests WHERE id=${orderedTestId} FOR UPDATE`;
  const order = await tx.orderedTest.findUniqueOrThrow({ where: { id: orderedTestId } });
  return tx.sampleTest.create({ data: {
    tenantId: order.tenantId, branchId: order.branchId, visitId: order.visitId,
    sampleId, orderedTestId, captureProvenance: 'PROSPECTIVE_CURRENT',
  } });
}

export interface SampleEventInput {
  tenantId: string;
  sampleId: string;
  actorId?: string;
  eventType: SampleEventType;
  fromStatus?: SampleStatus;
  toStatus: SampleStatus;
  occurredAt?: Date;
  reason?: string;
  sourceKey?: string;
}

/** Call in the same transaction as the specimen projection change. Actor is NULL when unknown. */
export function appendSampleEvent(tx: Prisma.TransactionClient, input: SampleEventInput) {
  return tx.sampleEvent.create({ data: {
    ...input, captureProvenance: 'PROSPECTIVE_CURRENT', occurredAt: input.occurredAt ?? new Date(),
    sourceKey: input.sourceKey ?? randomUUID(),
  } });
}
