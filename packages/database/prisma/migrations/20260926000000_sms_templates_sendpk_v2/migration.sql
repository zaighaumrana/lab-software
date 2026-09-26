-- SMS Settings rework: SmsTemplate gains SENDPK approved-template mapping
-- fields, and Notification gains provider/delivery tracking fields plus an
-- idempotency guard so the same automatic SMS event can never be recorded
-- (and therefore never sent) twice for the same related entity.

-- AlterTable: SmsTemplate
ALTER TABLE "sms_templates"
  ADD COLUMN "sendpkTemplateId" TEXT,
  ADD COLUMN "sendpkTemplateName" TEXT,
  ADD COLUMN "sendpkApprovedBody" TEXT,
  ADD COLUMN "sendpkRequiredVariables" JSONB,
  ADD COLUMN "sendpkLastSyncedAt" TIMESTAMP(3);

-- New events must not go live sending until an administrator explicitly
-- enables them, so the default for new rows changes to false. Existing
-- rows keep whatever value they already had.
ALTER TABLE "sms_templates" ALTER COLUMN "isActive" SET DEFAULT false;

-- AlterTable: Notification
ALTER TABLE "notifications"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerTemplateId" TEXT,
  ADD COLUMN "providerVariables" JSONB,
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "lastProviderResponse" TEXT,
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "messageType" TEXT,
  ADD COLUMN "smsParts" INTEGER;

-- Idempotency guard for automatic SMS events. NULLs are distinct in
-- Postgres unique indexes, so ad-hoc notifications with no
-- relatedType/relatedId/templateKey are unaffected.
CREATE UNIQUE INDEX "notifications_tenantId_relatedType_relatedId_templateKey_key"
  ON "notifications"("tenantId", "relatedType", "relatedId", "templateKey");
