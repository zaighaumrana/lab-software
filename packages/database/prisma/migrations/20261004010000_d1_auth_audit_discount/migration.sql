BEGIN;
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "discountMode" TEXT NOT NULL DEFAULT 'PER_LINE',
ADD COLUMN     "invoiceDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceDiscountReason" TEXT;

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revocationReason" TEXT,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "attemptKey" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("attemptKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_tenantId_userId_revokedAt_idx" ON "auth_sessions"("tenantId", "userId", "revokedAt");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "login_attempts_updatedAt_idx" ON "login_attempts"("updatedAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_actorId_createdAt_idx" ON "audit_logs"("tenantId", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_action_createdAt_idx" ON "audit_logs"("tenantId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prospective session ownership/time/hash integrity; no historical credential changes.
ALTER TABLE auth_sessions ADD CONSTRAINT d1_session_hash CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT d1_session_time CHECK ("lastSeenAt">="createdAt" AND "expiresAt">"lastSeenAt"),
 ADD CONSTRAINT d1_session_revocation CHECK (("revokedAt" IS NULL AND "revocationReason" IS NULL) OR
 ("revokedAt" IS NOT NULL AND length(btrim(coalesce("revocationReason",''))) BETWEEN 1 AND 100));
ALTER TABLE login_attempts ADD CONSTRAINT d1_attempt_hash CHECK ("attemptKey" ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT d1_attempt_count CHECK (failures>=0 AND failures<=5);

-- The existing audit store is append-only, including statement-level truncation.
CREATE FUNCTION public.d1_reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Audit history is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER d1_audit_append_only BEFORE UPDATE OR DELETE ON public.audit_logs
 FOR EACH ROW EXECUTE FUNCTION public.d1_reject_audit_mutation();
CREATE TRIGGER d1_audit_no_truncate BEFORE TRUNCATE ON public.audit_logs
 FOR EACH STATEMENT EXECUTE FUNCTION public.d1_reject_audit_mutation();

ALTER TABLE invoices ADD CONSTRAINT d1_discount_mode CHECK ("discountMode" IN ('PER_LINE','INVOICE_LEVEL')),
 ADD CONSTRAINT d1_initial_discount CHECK ("invoiceDiscountAmount">=0 AND "invoiceDiscountAmount"<=subtotal AND
 (("discountMode"='PER_LINE' AND "invoiceDiscountAmount"=0) OR
 ("discountMode"='INVOICE_LEVEL' AND "discountTotal"="invoiceDiscountAmount" AND "grandTotal"=subtotal-"invoiceDiscountAmount"+"taxTotal")));
CREATE FUNCTION public.d1_discount_snapshot_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF OLD.status<>'DRAFT' AND (NEW."discountMode",NEW."invoiceDiscountAmount",NEW."invoiceDiscountReason") IS DISTINCT FROM
 (OLD."discountMode",OLD."invoiceDiscountAmount",OLD."invoiceDiscountReason") THEN
 RAISE EXCEPTION 'Issued invoice discount snapshot is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER d1_discount_snapshot BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION public.d1_discount_snapshot_guard();
CREATE FUNCTION public.d1_no_mixed_discount() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE inv_id text; mode text;
BEGIN
 IF TG_TABLE_NAME='invoices' THEN inv_id:=NEW.id; ELSE inv_id:=NEW."invoiceId"; END IF;
 SELECT "discountMode" INTO mode FROM invoices WHERE id=inv_id;
 IF mode='INVOICE_LEVEL' AND EXISTS(SELECT 1 FROM invoice_lines WHERE "invoiceId"=inv_id
  AND ("discountAmount"<>0 OR coalesce("manualDiscount",0)<>0 OR length(btrim(coalesce("manualDiscountReason",'')))>0)) THEN
  RAISE EXCEPTION 'Invoice-level and per-line discounts cannot mix' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER d1_invoice_discount_lines AFTER INSERT OR UPDATE ON invoices DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION public.d1_no_mixed_discount();
CREATE CONSTRAINT TRIGGER d1_line_discount_mode AFTER INSERT OR UPDATE ON invoice_lines DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION public.d1_no_mixed_discount();
COMMIT;
