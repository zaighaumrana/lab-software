-- Additive only: nullable legacy links; new tables and scoped integrity keys.
BEGIN;
-- CreateEnum
CREATE TYPE "DefinitionCaptureSource" AS ENUM ('LEGACY_CURRENT', 'PROSPECTIVE_CURRENT');

-- CreateEnum
CREATE TYPE "VisitSource" AS ENUM ('LEGACY_INVOICE', 'BOOKING', 'WALK_IN');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderedTestStatus" AS ENUM ('ORDERED', 'AWAITING_SAMPLE', 'IN_PROGRESS', 'RESULT_RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SampleEventType" AS ENUM ('COLLECTED', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'TESTING_STARTED', 'COMPLETED', 'RECOLLECTION_REQUESTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "test_parameters" ADD COLUMN     "testVersionId" TEXT;

-- AlterTable
ALTER TABLE "package_items" ADD COLUMN     "packageVersionId" TEXT,
ADD COLUMN     "testVersionId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "phaseAReviewReason" TEXT,
ADD COLUMN     "visitId" TEXT;

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "phaseAReviewReason" TEXT;

-- AlterTable
ALTER TABLE "samples" ADD COLUMN     "phaseAReviewReason" TEXT,
ADD COLUMN     "previousSampleId" TEXT,
ADD COLUMN     "visitId" TEXT;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "visitId" TEXT;

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "bookingId" TEXT,
    "doctorId" TEXT,
    "companyId" TEXT,
    "accessionNumber" TEXT NOT NULL,
    "source" "VisitSource" NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMPTZ(3),
    "legacyOccurredAtRaw" TEXT,
    "patientNameSnapshot" TEXT NOT NULL,
    "labNumberSnapshot" TEXT NOT NULL,
    "mrcNumberSnapshot" TEXT NOT NULL,
    "demographicSource" "DefinitionCaptureSource" NOT NULL,
    "doctorNameSnapshot" TEXT,
    "companyNameSnapshot" TEXT,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_versions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "codeSnapshot" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "specimenType" TEXT,
    "containerRequirement" TEXT,
    "source" "DefinitionCaptureSource" NOT NULL,
    "definitionSnapshot" JSONB NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_versions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "codeSnapshot" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "source" "DefinitionCaptureSource" NOT NULL,
    "compositionSnapshot" JSONB NOT NULL,
    "compositionHash" TEXT NOT NULL,
    "reviewReason" TEXT,
    "effectiveAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordered_tests" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "testVersionId" TEXT NOT NULL,
    "invoiceLineId" TEXT,
    "packageVersionId" TEXT,
    "occurrenceNo" INTEGER NOT NULL,
    "sourceUnitNo" INTEGER,
    "sourceMemberNo" INTEGER,
    "source" "DefinitionCaptureSource" NOT NULL,
    "status" "OrderedTestStatus" NOT NULL DEFAULT 'ORDERED',
    "specimenTypeSnapshot" TEXT,
    "repeatReason" TEXT,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ordered_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_tests" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "orderedTestId" TEXT NOT NULL,
    "source" "DefinitionCaptureSource" NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceResultId" TEXT,

    CONSTRAINT "sample_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" "SampleEventType" NOT NULL,
    "fromStatus" "SampleStatus",
    "toStatus" "SampleStatus" NOT NULL,
    "occurredAt" TIMESTAMPTZ(3),
    "legacyOccurredAtRaw" TEXT,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "source" "DefinitionCaptureSource" NOT NULL,
    "sourceKey" TEXT NOT NULL,

    CONSTRAINT "sample_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identifier_counters" (
    "tenantId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "branchId" TEXT,
    "nextValue" BIGINT NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identifier_counters_pkey" PRIMARY KEY ("tenantId","namespace","scopeKey","periodKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "visits_bookingId_key" ON "visits"("bookingId");

-- CreateIndex
CREATE INDEX "visits_tenantId_branchId_occurredAt_idx" ON "visits"("tenantId", "branchId", "occurredAt");

-- CreateIndex
CREATE INDEX "visits_tenantId_patientId_occurredAt_idx" ON "visits"("tenantId", "patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "visits_tenantId_doctorId_idx" ON "visits"("tenantId", "doctorId");

-- CreateIndex
CREATE INDEX "visits_tenantId_companyId_idx" ON "visits"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "visits_tenantId_accessionNumber_key" ON "visits"("tenantId", "accessionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "visits_tenantId_branchId_id_key" ON "visits"("tenantId", "branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "visits_tenantId_branchId_patientId_bookingId_key" ON "visits"("tenantId", "branchId", "patientId", "bookingId");

-- CreateIndex
CREATE INDEX "test_versions_tenantId_testId_idx" ON "test_versions"("tenantId", "testId");

-- CreateIndex
CREATE UNIQUE INDEX "test_versions_testId_revisionNo_key" ON "test_versions"("testId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "test_versions_testId_id_key" ON "test_versions"("testId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "test_versions_tenantId_id_key" ON "test_versions"("tenantId", "id");

-- CreateIndex
CREATE INDEX "package_versions_tenantId_packageId_idx" ON "package_versions"("tenantId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "package_versions_packageId_revisionNo_key" ON "package_versions"("packageId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "package_versions_packageId_id_key" ON "package_versions"("packageId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "package_versions_tenantId_id_key" ON "package_versions"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ordered_tests_tenantId_branchId_visitId_status_idx" ON "ordered_tests"("tenantId", "branchId", "visitId", "status");

-- CreateIndex
CREATE INDEX "ordered_tests_tenantId_testVersionId_idx" ON "ordered_tests"("tenantId", "testVersionId");

-- CreateIndex
CREATE INDEX "ordered_tests_tenantId_packageVersionId_idx" ON "ordered_tests"("tenantId", "packageVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ordered_tests_visitId_occurrenceNo_key" ON "ordered_tests"("visitId", "occurrenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "ordered_tests_tenantId_branchId_visitId_id_key" ON "ordered_tests"("tenantId", "branchId", "visitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ordered_tests_invoiceLineId_sourceUnitNo_sourceMemberNo_key" ON "ordered_tests"("invoiceLineId", "sourceUnitNo", "sourceMemberNo");

-- CreateIndex
CREATE INDEX "sample_tests_tenantId_branchId_visitId_sampleId_idx" ON "sample_tests"("tenantId", "branchId", "visitId", "sampleId");

-- CreateIndex
CREATE INDEX "sample_tests_tenantId_branchId_visitId_orderedTestId_idx" ON "sample_tests"("tenantId", "branchId", "visitId", "orderedTestId");

-- CreateIndex
CREATE UNIQUE INDEX "sample_tests_sampleId_orderedTestId_key" ON "sample_tests"("sampleId", "orderedTestId");

-- CreateIndex
CREATE INDEX "sample_events_tenantId_sampleId_recordedAt_idx" ON "sample_events"("tenantId", "sampleId", "recordedAt");

-- CreateIndex
CREATE INDEX "sample_events_tenantId_actorId_idx" ON "sample_events"("tenantId", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "sample_events_sampleId_sourceKey_key" ON "sample_events"("sampleId", "sourceKey");

-- CreateIndex
CREATE INDEX "identifier_counters_tenantId_branchId_idx" ON "identifier_counters"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_id_key" ON "branches"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_id_key" ON "users"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_tenantId_id_key" ON "patients"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_tenantId_id_key" ON "doctors"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_tenantId_id_key" ON "companies"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tests_tenantId_id_key" ON "tests"("tenantId", "id");

-- CreateIndex
CREATE INDEX "test_parameters_testId_testVersionId_idx" ON "test_parameters"("testId", "testVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "packages_tenantId_id_key" ON "packages"("tenantId", "id");

-- CreateIndex
CREATE INDEX "package_items_packageId_packageVersionId_idx" ON "package_items"("packageId", "packageVersionId");

-- CreateIndex
CREATE INDEX "package_items_testId_testVersionId_idx" ON "package_items"("testId", "testVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_tenantId_branchId_patientId_id_key" ON "bookings"("tenantId", "branchId", "patientId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_visitId_key" ON "invoices"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_branchId_visitId_key" ON "invoices"("tenantId", "branchId", "visitId");

-- CreateIndex
CREATE INDEX "samples_tenantId_branchId_visitId_idx" ON "samples"("tenantId", "branchId", "visitId");

-- CreateIndex
CREATE INDEX "samples_tenantId_branchId_visitId_previousSampleId_idx" ON "samples"("tenantId", "branchId", "visitId", "previousSampleId");

-- CreateIndex
CREATE UNIQUE INDEX "samples_tenantId_branchId_visitId_id_key" ON "samples"("tenantId", "branchId", "visitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "samples_tenantId_id_key" ON "samples"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_visitId_key" ON "reports"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_tenantId_branchId_visitId_key" ON "reports"("tenantId", "branchId", "visitId");

-- AddForeignKey
ALTER TABLE "test_parameters" ADD CONSTRAINT "test_parameters_testId_testVersionId_fkey" FOREIGN KEY ("testId", "testVersionId") REFERENCES "test_versions"("testId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_packageId_packageVersionId_fkey" FOREIGN KEY ("packageId", "packageVersionId") REFERENCES "package_versions"("packageId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_testId_testVersionId_fkey" FOREIGN KEY ("testId", "testVersionId") REFERENCES "test_versions"("testId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_branchId_visitId_fkey" FOREIGN KEY ("tenantId", "branchId", "visitId") REFERENCES "visits"("tenantId", "branchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_tenantId_branchId_visitId_fkey" FOREIGN KEY ("tenantId", "branchId", "visitId") REFERENCES "visits"("tenantId", "branchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_tenantId_branchId_visitId_previousSampleId_fkey" FOREIGN KEY ("tenantId", "branchId", "visitId", "previousSampleId") REFERENCES "samples"("tenantId", "branchId", "visitId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_tenantId_branchId_visitId_fkey" FOREIGN KEY ("tenantId", "branchId", "visitId") REFERENCES "visits"("tenantId", "branchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenantId_patientId_fkey" FOREIGN KEY ("tenantId", "patientId") REFERENCES "patients"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenantId_branchId_patientId_bookingId_fkey" FOREIGN KEY ("tenantId", "branchId", "patientId", "bookingId") REFERENCES "bookings"("tenantId", "branchId", "patientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenantId_doctorId_fkey" FOREIGN KEY ("tenantId", "doctorId") REFERENCES "doctors"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenantId_companyId_fkey" FOREIGN KEY ("tenantId", "companyId") REFERENCES "companies"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "test_versions" ADD CONSTRAINT "test_versions_tenantId_testId_fkey" FOREIGN KEY ("tenantId", "testId") REFERENCES "tests"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "package_versions" ADD CONSTRAINT "package_versions_tenantId_packageId_fkey" FOREIGN KEY ("tenantId", "packageId") REFERENCES "packages"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ordered_tests" ADD CONSTRAINT "ordered_tests_tenantId_branchId_visitId_fkey" FOREIGN KEY ("tenantId", "branchId", "visitId") REFERENCES "visits"("tenantId", "branchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ordered_tests" ADD CONSTRAINT "ordered_tests_tenantId_testVersionId_fkey" FOREIGN KEY ("tenantId", "testVersionId") REFERENCES "test_versions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ordered_tests" ADD CONSTRAINT "ordered_tests_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ordered_tests" ADD CONSTRAINT "ordered_tests_tenantId_packageVersionId_fkey" FOREIGN KEY ("tenantId", "packageVersionId") REFERENCES "package_versions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_tenantId_branchId_visitId_sampleId_fkey" FOREIGN KEY ("tenantId", "branchId", "visitId", "sampleId") REFERENCES "samples"("tenantId", "branchId", "visitId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_tenantId_branchId_visitId_orderedTestId_fkey" FOREIGN KEY ("tenantId", "branchId", "visitId", "orderedTestId") REFERENCES "ordered_tests"("tenantId", "branchId", "visitId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sample_events" ADD CONSTRAINT "sample_events_tenantId_sampleId_fkey" FOREIGN KEY ("tenantId", "sampleId") REFERENCES "samples"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sample_events" ADD CONSTRAINT "sample_events_tenantId_actorId_fkey" FOREIGN KEY ("tenantId", "actorId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identifier_counters" ADD CONSTRAINT "identifier_counters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identifier_counters" ADD CONSTRAINT "identifier_counters_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
