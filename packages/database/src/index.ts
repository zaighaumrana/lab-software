// Only this facade exposes generated query/types to the application.
export * from './generated/prisma/client.js';
export { PrismaClient, createDatabaseClient } from './client.js';
export { assertRuntimePrivileges, hardenedRuntime } from './runtime-security.js';
export type { DatabaseClientOptions } from './client.js';
import { Prisma } from './generated/prisma/client.js';
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
export { allocateVisitAccession, captureCurrentTestVersion, captureCurrentPackageVersion,
  materializeInvoiceClinicalWork, assignSampleToOrderedTest, appendSampleEvent } from './clinical-work.js';
export type { SampleEventInput } from './clinical-work.js';
export { captureReleasedReportVersion } from './report-versions.js';
