-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'RECONCILIATION_REQUIRED';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "claimExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "claimedAt" TIMESTAMPTZ(3),
ADD COLUMN     "claimedBy" TEXT,
ADD COLUMN     "deliveryChecks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dispatchStartedAt" TIMESTAMPTZ(3),
ADD COLUMN     "lastErrorCode" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMPTZ(3),
ADD COLUMN     "nextDeliveryCheckAt" TIMESTAMPTZ(3),
ADD COLUMN     "patientId" TEXT;

-- CreateTable
CREATE TABLE "notification_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "outcome" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "providerStatus" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "providerResponse" TEXT,

    CONSTRAINT "notification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_attempts_tenantId_notificationId_startedAt_idx" ON "notification_attempts"("tenantId", "notificationId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_attempts_notificationId_attemptNo_key" ON "notification_attempts"("notificationId", "attemptNo");

-- CreateIndex
CREATE INDEX "notifications_status_nextAttemptAt_createdAt_idx" ON "notifications"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_status_claimExpiresAt_idx" ON "notifications"("status", "claimExpiresAt");

-- CreateIndex
CREATE INDEX "notifications_status_nextDeliveryCheckAt_idx" ON "notifications"("status", "nextDeliveryCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenantId_id_key" ON "notifications"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_patientId_fkey" FOREIGN KEY ("tenantId", "patientId") REFERENCES "patients"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_tenantId_notificationId_fkey" FOREIGN KEY ("tenantId", "notificationId") REFERENCES "notifications"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- New evidence is bounded and immutable. No historical rows are rewritten.
ALTER TABLE notification_attempts ADD CONSTRAINT notification_attempt_evidence_check CHECK (
  "attemptNo" > 0 AND "completedAt" >= "startedAt"
  AND outcome IN ('ACCEPTED','TRANSIENT_FAILURE','PERMANENT_FAILURE','UNKNOWN')
  AND length("providerMessageId") <= 128 AND length("providerStatus") <= 64
  AND length("errorCode") <= 64 AND length("errorMessage") <= 500
  AND length("providerResponse") <= 500
);
ALTER TABLE notifications ADD CONSTRAINT notification_lease_check CHECK (
  ("claimedBy" IS NULL AND "claimedAt" IS NULL AND "claimExpiresAt" IS NULL)
  OR ("claimedBy" IS NOT NULL AND "claimedAt" IS NOT NULL AND "claimExpiresAt" IS NOT NULL)
) NOT VALID;
ALTER TABLE notifications ADD CONSTRAINT notification_delivery_checks_check
  CHECK ("deliveryChecks" BETWEEN 0 AND 3) NOT VALID;

CREATE FUNCTION d2_reject_attempt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Notification attempt evidence is append-only';
END;
$$;
CREATE TRIGGER notification_attempt_immutable BEFORE UPDATE OR DELETE ON notification_attempts
  FOR EACH ROW EXECUTE FUNCTION d2_reject_attempt_mutation();
CREATE TRIGGER notification_attempt_no_truncate BEFORE TRUNCATE ON notification_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION d2_reject_attempt_mutation();

-- Retain the event key and frozen payload even for failed intents; retries cannot rebuild it.
CREATE FUNCTION d2_guard_notification_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'Durable notification intents must be retained';
  END IF;
  IF ROW(NEW.id,NEW."tenantId",NEW.channel,NEW.recipient,NEW.body,NEW."templateKey",
      NEW."relatedType",NEW."relatedId",NEW.provider,NEW."providerTemplateId",
      NEW."providerVariables",NEW."messageType",NEW."smsParts",NEW."patientId")
    IS DISTINCT FROM ROW(OLD.id,OLD."tenantId",OLD.channel,OLD.recipient,OLD.body,OLD."templateKey",
      OLD."relatedType",OLD."relatedId",OLD.provider,OLD."providerTemplateId",
      OLD."providerVariables",OLD."messageType",OLD."smsParts",OLD."patientId") THEN
    RAISE EXCEPTION 'Notification intent payload is immutable';
  END IF;
  IF (OLD.status::text='SENT' AND NEW.status::text<>'SENT')
    OR (OLD.status::text='RECONCILIATION_REQUIRED' AND NEW.status::text NOT IN ('RECONCILIATION_REQUIRED','SENT'))
    OR (OLD.status::text='SENDING' AND OLD."dispatchStartedAt" IS NOT NULL AND NEW.status::text='QUEUED')
    OR NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'Invalid notification state transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notification_intent_guard BEFORE UPDATE OR DELETE ON notifications
  FOR EACH ROW EXECUTE FUNCTION d2_guard_notification_intent();
CREATE TRIGGER notification_intent_no_truncate BEFORE TRUNCATE ON notifications
  FOR EACH STATEMENT EXECUTE FUNCTION d2_guard_notification_intent();
