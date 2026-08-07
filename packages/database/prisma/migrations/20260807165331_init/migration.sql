-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECEPTION', 'SAMPLE_COLLECTOR', 'LAB_TECH', 'LAB_OPERATOR', 'CASHIER', 'PATHOLOGIST', 'ACCOUNTANT', 'DOCTOR_PORTAL', 'CORPORATE_MANAGER', 'WEBSITE_CONTENT_MANAGER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'PER_TEST_FIXED');

-- CreateEnum
CREATE TYPE "CorporateBillingMode" AS ENUM ('COMPANY_PAYS_ALL', 'SPLIT_COPAY', 'EMPLOYEE_PAYS');

-- CreateEnum
CREATE TYPE "ResultSharingPolicy" AS ENUM ('BILLING_ONLY', 'FULL_REPORTS');

-- CreateEnum
CREATE TYPE "ParameterValueType" AS ENUM ('NUMERIC', 'TEXT', 'BOOLEAN', 'CHOICE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'CHECKED_IN', 'CONVERTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('WALK_IN', 'ONLINE', 'HOME_COLLECTION', 'PHONE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOIDED', 'CLOSED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'VOIDED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('PENDING_COLLECTION', 'COLLECTED', 'IN_TRANSIT', 'RECEIVED_AT_LAB', 'ACCEPTED', 'REJECTED', 'RECOLLECTED', 'IN_TESTING', 'COMPLETED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('ENTERED', 'RELEASED', 'SUPERSEDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ResultFlag" AS ENUM ('NORMAL', 'LOW', 'HIGH', 'CRITICAL_LOW', 'CRITICAL_HIGH', 'ABNORMAL');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'PARTIAL_READY', 'COMPLETE', 'AMENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('CALCULATED', 'PAYABLE', 'PAID', 'REVERSED', 'CLAWBACK_PENDING', 'SETTLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'RETRYING', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('QUEUED', 'SYNCING', 'SYNCED', 'FAILED', 'RETRYING', 'ABANDONED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "mrn" TEXT,
    "labNumber" TEXT NOT NULL,
    "mrcNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneAlt" TEXT,
    "cnic" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "address" TEXT,
    "email" TEXT,
    "bloodGroup" TEXT,
    "notes" TEXT,
    "smsConsent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "specialty" TEXT,
    "clinicName" TEXT,
    "commissionType" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "commissionValue" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "billingMode" "CorporateBillingMode" NOT NULL DEFAULT 'COMPANY_PAYS_ALL',
    "resultSharingPolicy" "ResultSharingPolicy" NOT NULL DEFAULT 'BILLING_ONLY',
    "discountPercent" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_companies" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "sampleType" TEXT,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "turnaroundHours" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "isPanel" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_parameters" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "valueType" "ParameterValueType" NOT NULL DEFAULT 'NUMERIC',
    "unit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "decimalPlaces" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_parameter_choices" (
    "id" TEXT NOT NULL,
    "testParameterId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "test_parameter_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_reference_ranges" (
    "id" TEXT NOT NULL,
    "testParameterId" TEXT NOT NULL,
    "gender" "Gender",
    "ageMinMonths" INTEGER,
    "ageMaxMonths" INTEGER,
    "lowNormal" DECIMAL(12,4),
    "highNormal" DECIMAL(12,4),
    "criticalLow" DECIMAL(12,4),
    "criticalHigh" DECIMAL(12,4),
    "unit" TEXT,
    "interpretation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_reference_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_items" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "testId" TEXT,
    "nestedPackageId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "companyId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "BookingSource" NOT NULL DEFAULT 'WALK_IN',
    "bookingCode" TEXT NOT NULL,
    "preferredAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "notes" TEXT,
    "homeAddress" TEXT,
    "homeCollectorId" TEXT,
    "homeRouteNotes" TEXT,
    "homeTimeWindowStart" TIMESTAMP(3),
    "homeTimeWindowEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "companyId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceNumber" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "testId" TEXT,
    "packageId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "doctorDiscount" DECIMAL(12,2),
    "corporateDiscount" DECIMAL(12,2),
    "campaignDiscount" DECIMAL(12,2),
    "manualDiscount" DECIMAL(12,2),
    "manualDiscountReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "samples" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sampleCode" TEXT NOT NULL,
    "status" "SampleStatus" NOT NULL DEFAULT 'PENDING_COLLECTION',
    "sampleType" TEXT,
    "collectedAt" TIMESTAMP(3),
    "collectedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "discardedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "status" "ResultStatus" NOT NULL DEFAULT 'ENTERED',
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "enteredById" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "amendedFromResultId" TEXT,
    "voidReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_values" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "testParameterId" TEXT NOT NULL,
    "valueNumeric" DECIMAL(16,6),
    "valueText" TEXT,
    "unit" TEXT,
    "flag" "ResultFlag",
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "interpretation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reportNumber" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "pdfPath" TEXT,
    "generatedAt" TIMESTAMP(3),
    "amendedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_commissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'CALCULATED',
    "commissionType" "CommissionType" NOT NULL,
    "rateOrAmount" DECIMAL(10,2) NOT NULL,
    "calculatedAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "clawbackAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'SMS',
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "recipient" TEXT NOT NULL,
    "templateKey" TEXT,
    "body" TEXT NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_outbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configurations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "branches_tenantId_idx" ON "branches"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_code_key" ON "branches"("tenantId", "code");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_username_key" ON "users"("tenantId", "username");

-- CreateIndex
CREATE INDEX "patients_tenantId_cnic_idx" ON "patients"("tenantId", "cnic");

-- CreateIndex
CREATE INDEX "patients_tenantId_fullName_idx" ON "patients"("tenantId", "fullName");

-- CreateIndex
CREATE INDEX "patients_tenantId_labNumber_idx" ON "patients"("tenantId", "labNumber");

-- CreateIndex
CREATE INDEX "patients_tenantId_mrcNumber_idx" ON "patients"("tenantId", "mrcNumber");

-- CreateIndex
CREATE INDEX "patients_tenantId_idx" ON "patients"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "patients_tenantId_phone_key" ON "patients"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "patients_tenantId_labNumber_key" ON "patients"("tenantId", "labNumber");

-- CreateIndex
CREATE UNIQUE INDEX "patients_tenantId_mrcNumber_key" ON "patients"("tenantId", "mrcNumber");

-- CreateIndex
CREATE INDEX "doctors_tenantId_idx" ON "doctors"("tenantId");

-- CreateIndex
CREATE INDEX "companies_tenantId_idx" ON "companies"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_tenantId_code_key" ON "companies"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "patient_companies_patientId_companyId_key" ON "patient_companies"("patientId", "companyId");

-- CreateIndex
CREATE INDEX "tests_tenantId_idx" ON "tests"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tests_tenantId_code_key" ON "tests"("tenantId", "code");

-- CreateIndex
CREATE INDEX "test_parameters_testId_idx" ON "test_parameters"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "test_parameters_testId_code_key" ON "test_parameters"("testId", "code");

-- CreateIndex
CREATE INDEX "test_parameter_choices_testParameterId_idx" ON "test_parameter_choices"("testParameterId");

-- CreateIndex
CREATE UNIQUE INDEX "test_parameter_choices_testParameterId_value_key" ON "test_parameter_choices"("testParameterId", "value");

-- CreateIndex
CREATE INDEX "test_reference_ranges_testParameterId_idx" ON "test_reference_ranges"("testParameterId");

-- CreateIndex
CREATE INDEX "packages_tenantId_idx" ON "packages"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "packages_tenantId_code_key" ON "packages"("tenantId", "code");

-- CreateIndex
CREATE INDEX "package_items_packageId_idx" ON "package_items"("packageId");

-- CreateIndex
CREATE INDEX "bookings_tenantId_status_idx" ON "bookings"("tenantId", "status");

-- CreateIndex
CREATE INDEX "bookings_tenantId_patientId_idx" ON "bookings"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "bookings_branchId_idx" ON "bookings"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_tenantId_bookingCode_key" ON "bookings"("tenantId", "bookingCode");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_bookingId_key" ON "invoices"("bookingId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_status_idx" ON "invoices"("tenantId", "status");

-- CreateIndex
CREATE INDEX "invoices_branchId_idx" ON "invoices"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_invoiceNumber_key" ON "invoices"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "samples_tenantId_status_idx" ON "samples"("tenantId", "status");

-- CreateIndex
CREATE INDEX "samples_invoiceId_idx" ON "samples"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "samples_tenantId_sampleCode_key" ON "samples"("tenantId", "sampleCode");

-- CreateIndex
CREATE INDEX "results_tenantId_idx" ON "results"("tenantId");

-- CreateIndex
CREATE INDEX "results_sampleId_idx" ON "results"("sampleId");

-- CreateIndex
CREATE INDEX "results_invoiceLineId_idx" ON "results"("invoiceLineId");

-- CreateIndex
CREATE INDEX "results_testId_idx" ON "results"("testId");

-- CreateIndex
CREATE INDEX "result_values_resultId_idx" ON "result_values"("resultId");

-- CreateIndex
CREATE INDEX "result_values_testParameterId_idx" ON "result_values"("testParameterId");

-- CreateIndex
CREATE UNIQUE INDEX "result_values_resultId_testParameterId_key" ON "result_values"("resultId", "testParameterId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_invoiceId_key" ON "reports"("invoiceId");

-- CreateIndex
CREATE INDEX "reports_tenantId_status_idx" ON "reports"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reports_tenantId_reportNumber_key" ON "reports"("tenantId", "reportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "reports_tenantId_trackingId_key" ON "reports"("tenantId", "trackingId");

-- CreateIndex
CREATE INDEX "doctor_commissions_tenantId_doctorId_idx" ON "doctor_commissions"("tenantId", "doctorId");

-- CreateIndex
CREATE INDEX "doctor_commissions_invoiceId_idx" ON "doctor_commissions"("invoiceId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_status_idx" ON "notifications"("tenantId", "status");

-- CreateIndex
CREATE INDEX "notifications_status_createdAt_idx" ON "notifications"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sms_templates_tenantId_key_key" ON "sms_templates"("tenantId", "key");

-- CreateIndex
CREATE INDEX "sync_outbox_tenantId_status_idx" ON "sync_outbox"("tenantId", "status");

-- CreateIndex
CREATE INDEX "sync_outbox_status_createdAt_idx" ON "sync_outbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_entityType_entityId_idx" ON "audit_logs"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_tenantId_key_key" ON "feature_flags"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_tenantId_key_key" ON "configurations"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_companies" ADD CONSTRAINT "patient_companies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_companies" ADD CONSTRAINT "patient_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_parameters" ADD CONSTRAINT "test_parameters_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_parameter_choices" ADD CONSTRAINT "test_parameter_choices_testParameterId_fkey" FOREIGN KEY ("testParameterId") REFERENCES "test_parameters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_reference_ranges" ADD CONSTRAINT "test_reference_ranges_testParameterId_fkey" FOREIGN KEY ("testParameterId") REFERENCES "test_parameters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "samples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_amendedFromResultId_fkey" FOREIGN KEY ("amendedFromResultId") REFERENCES "results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_values" ADD CONSTRAINT "result_values_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_values" ADD CONSTRAINT "result_values_testParameterId_fkey" FOREIGN KEY ("testParameterId") REFERENCES "test_parameters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_commissions" ADD CONSTRAINT "doctor_commissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_commissions" ADD CONSTRAINT "doctor_commissions_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_commissions" ADD CONSTRAINT "doctor_commissions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_templates" ADD CONSTRAINT "sms_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_outbox" ADD CONSTRAINT "sync_outbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
