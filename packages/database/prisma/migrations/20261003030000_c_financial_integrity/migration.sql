-- Phase C additive financial evidence; prior migrations and historical rows retained.
BEGIN;
-- CreateEnum
CREATE TYPE "InvoiceAdjustmentType" AS ENUM ('CHARGE', 'DISCOUNT', 'WRITE_OFF', 'REFUND', 'VOID');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cashShiftId" TEXT,
ADD COLUMN     "operationKey" TEXT,
ADD COLUMN     "postedAt" TIMESTAMPTZ(3),
ADD COLUMN     "recordedById" TEXT,
ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- CreateTable
CREATE TABLE "invoice_adjustments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "InvoiceAdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relatedPaymentId" TEXT,
    "cashShiftId" TEXT,
    "operationKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,

    CONSTRAINT "invoice_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_adjustments_invoiceId_createdAt_idx" ON "invoice_adjustments"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "invoice_adjustments_createdById_idx" ON "invoice_adjustments"("createdById");

-- CreateIndex
CREATE INDEX "invoice_adjustments_cashShiftId_idx" ON "invoice_adjustments"("cashShiftId");

-- CreateIndex
CREATE INDEX "invoice_adjustments_invoiceId_relatedPaymentId_idx" ON "invoice_adjustments"("invoiceId", "relatedPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_adjustments_tenantId_operationKey_key" ON "invoice_adjustments"("tenantId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_id_key" ON "invoices"("tenantId", "id");

-- CreateIndex
CREATE INDEX "payments_recordedById_postedAt_idx" ON "payments"("recordedById", "postedAt");

-- CreateIndex
CREATE INDEX "payments_cashShiftId_idx" ON "payments"("cashShiftId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_operationKey_key" ON "payments"("tenantId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "payments_invoiceId_id_key" ON "payments"("invoiceId", "id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_recordedById_fkey" FOREIGN KEY ("tenantId", "recordedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "cash_shifts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_invoiceId_relatedPaymentId_fkey" FOREIGN KEY ("invoiceId", "relatedPaymentId") REFERENCES "payments"("invoiceId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "cash_shifts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Historical financial rows are not rewritten. NOT VALID retains legacy anomalies,
-- while PostgreSQL enforces these checks for new or changed rows.
ALTER TABLE public.payments ADD CONSTRAINT c_payment_positive CHECK (amount>0) NOT VALID;
ALTER TABLE public.payments ADD CONSTRAINT c_payment_evidence CHECK (
  ("tenantId" IS NULL AND "recordedById" IS NULL AND "operationKey" IS NULL AND "requestHash" IS NULL AND "postedAt" IS NULL AND "cashShiftId" IS NULL) OR
  ("tenantId" IS NOT NULL AND "recordedById" IS NOT NULL AND "operationKey" ~ '^[a-zA-Z0-9_-]{8,100}$' AND "requestHash" ~ '^[a-f0-9]{64}$' AND "postedAt" IS NOT NULL)
) NOT VALID;
ALTER TABLE public.invoice_adjustments ADD CONSTRAINT c_adjustment_shape CHECK (
  ((type='VOID' AND amount>=0) OR (type<>'VOID' AND amount>0)) AND length(btrim(reason)) BETWEEN 1 AND 1000 AND
  "operationKey" ~ '^[a-zA-Z0-9_-]{8,100}$' AND "requestHash" ~ '^[a-f0-9]{64}$' AND
  ((type='REFUND' AND "relatedPaymentId" IS NOT NULL) OR (type<>'REFUND' AND "relatedPaymentId" IS NULL AND "cashShiftId" IS NULL))
);

CREATE FUNCTION public.c_movement_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE inv public.invoices%ROWTYPE; original public.payments%ROWTYPE; shift public.cash_shifts%ROWTYPE;
  prior_refunds NUMERIC; cashier TEXT;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'Financial movements are immutable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT inv FROM public.invoices WHERE id=NEW."invoiceId" FOR UPDATE;
  IF NEW."tenantId" IS DISTINCT FROM inv."tenantId" THEN RAISE EXCEPTION 'Financial tenant mismatch' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='payments' THEN
    IF inv.status<>'ISSUED' OR NEW.status NOT IN ('FULLY_RECEIVED','PARTIALLY_RECEIVED') OR NEW."recordedById" IS NULL OR
      NEW."operationKey" IS NULL OR NEW."requestHash" IS NULL OR NEW."postedAt" IS NULL OR NEW."receivedAt" IS NULL THEN
      RAISE EXCEPTION 'New receipt requires an issued invoice and complete posting evidence' USING ERRCODE='23514'; END IF;
    cashier:=NEW."recordedById";
    IF NEW."cashShiftId" IS NOT NULL AND NEW.method<>'CASH' THEN RAISE EXCEPTION 'Only cash belongs to a cash shift' USING ERRCODE='23514'; END IF;
  ELSE
    IF inv.status IN ('DRAFT','VOIDED') OR (inv.status='REFUNDED' AND NEW.type<>'VOID') THEN
      RAISE EXCEPTION 'Invoice cannot accept this adjustment' USING ERRCODE='23514'; END IF;
    cashier:=NEW."createdById";
    IF NEW.type='REFUND' THEN
      SELECT * INTO STRICT original FROM public.payments WHERE id=NEW."relatedPaymentId" AND "invoiceId"=inv.id;
      IF original.status NOT IN ('FULLY_RECEIVED','PARTIALLY_RECEIVED') THEN RAISE EXCEPTION 'Refund requires a received payment' USING ERRCODE='23514'; END IF;
      SELECT coalesce(sum(amount),0) INTO prior_refunds FROM public.invoice_adjustments WHERE "relatedPaymentId"=original.id AND type='REFUND';
      IF prior_refunds+NEW.amount>original.amount THEN RAISE EXCEPTION 'Refund exceeds received amount' USING ERRCODE='23514'; END IF;
      IF NEW."cashShiftId" IS NOT NULL AND original.method<>'CASH' THEN RAISE EXCEPTION 'Only a cash refund belongs to a shift' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  IF NEW."cashShiftId" IS NOT NULL THEN
    SELECT * INTO STRICT shift FROM public.cash_shifts WHERE id=NEW."cashShiftId" FOR UPDATE;
    IF shift.status<>'OPEN' OR shift."tenantId"<>inv."tenantId" OR shift."branchId" IS DISTINCT FROM inv."branchId" OR shift."openedById"<>cashier THEN
      RAISE EXCEPTION 'Cash shift must be open in the posting branch for this cashier' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.c_movement_guard();
CREATE TRIGGER c_adjustment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_adjustments FOR EACH ROW EXECUTE FUNCTION public.c_movement_guard();

-- Deferred verification observes the complete movement + projection transaction.
CREATE FUNCTION public.c_projection_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE inv public.invoices%ROWTYPE; total NUMERIC; net NUMERIC; refunds NUMERIC; is_void BOOLEAN; expected_status public."InvoiceStatus";
BEGIN
  SELECT * INTO STRICT inv FROM public.invoices WHERE id=NEW."invoiceId";
  SELECT inv."grandTotal"+coalesce(sum(CASE WHEN type='CHARGE' THEN amount WHEN type IN ('DISCOUNT','WRITE_OFF','VOID') THEN -amount ELSE 0 END),0),
    coalesce(sum(CASE WHEN type='REFUND' THEN amount ELSE 0 END),0),coalesce(bool_or(type='VOID'),false)
    INTO total,refunds,is_void FROM public.invoice_adjustments WHERE "invoiceId"=inv.id;
  SELECT coalesce(sum(amount),0)-refunds INTO net FROM public.payments WHERE "invoiceId"=inv.id AND status IN ('FULLY_RECEIVED','PARTIALLY_RECEIVED');
  expected_status:=CASE WHEN is_void OR inv.status='VOIDED' THEN 'VOIDED'::public."InvoiceStatus"
    WHEN refunds>0 AND net=0 THEN 'REFUNDED'::public."InvoiceStatus" WHEN total=net THEN 'CLOSED'::public."InvoiceStatus" ELSE 'ISSUED'::public."InvoiceStatus" END;
  IF total<0 OR net<0 OR total-net<0 OR inv."amountPaid"<>net OR inv."amountDue"<>total-net OR inv.status<>expected_status OR
    (is_void AND (net<>0 OR total<>0 OR inv."voidedAt" IS NULL OR length(btrim(coalesce(inv."voidReason",'')))=0)) THEN
    RAISE EXCEPTION 'Invoice projection must reconcile its accepted financial history' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER c_receipt_projection AFTER INSERT ON public.payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.c_projection_guard();
CREATE CONSTRAINT TRIGGER c_adjustment_projection AFTER INSERT ON public.invoice_adjustments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.c_projection_guard();

CREATE FUNCTION public.c_sale_snapshot_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE inv public.invoices%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='invoices' THEN
    IF OLD.status<>'DRAFT' THEN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Issued invoices are retained' USING ERRCODE='23514'; END IF;
      IF (NEW."tenantId",NEW."branchId",NEW."bookingId",NEW."invoiceNumber",NEW.subtotal,NEW."discountTotal",NEW."taxTotal",NEW."grandTotal",NEW.currency,NEW."createdAt") IS DISTINCT FROM
         (OLD."tenantId",OLD."branchId",OLD."bookingId",OLD."invoiceNumber",OLD.subtotal,OLD."discountTotal",OLD."taxTotal",OLD."grandTotal",OLD.currency,OLD."createdAt") THEN
        RAISE EXCEPTION 'Original issued sale totals and identity are immutable' USING ERRCODE='23514'; END IF;
    END IF;
  ELSE
    SELECT * INTO STRICT inv FROM public.invoices WHERE id=OLD."invoiceId";
    IF inv.status<>'DRAFT' THEN RAISE EXCEPTION 'Issued invoice line pricing is immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND NEW."invoiceId"<>OLD."invoiceId" THEN RAISE EXCEPTION 'Invoice line cannot change invoice' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER c_invoice_snapshot BEFORE UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.c_sale_snapshot_guard();
CREATE TRIGGER c_line_snapshot BEFORE UPDATE OR DELETE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION public.c_sale_snapshot_guard();
COMMIT;
