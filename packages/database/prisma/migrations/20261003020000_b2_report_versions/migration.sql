-- B2 additive report versions. Previous ten migrations are unchanged.
BEGIN;
-- CreateEnum
CREATE TYPE "ReportVersionKind" AS ENUM ('INITIAL', 'AMENDMENT');

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "currentVersionId" TEXT;

-- CreateTable
CREATE TABLE "report_versions" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "previousVersionId" TEXT,
    "kind" "ReportVersionKind" NOT NULL,
    "releasedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedById" TEXT,
    "amendmentReason" TEXT,
    "displaySnapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfPath" TEXT,
    "pdfSha256" TEXT,
    "pdfByteSize" INTEGER,
    "pdfGeneratedAt" TIMESTAMPTZ(3),
    "renderSettingsSnapshot" JSONB,
    "firstPrintedAt" TIMESTAMPTZ(3),
    "lastPrintedAt" TIMESTAMPTZ(3),
    "printCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_version_results" (
    "reportVersionId" TEXT NOT NULL,
    "orderedTestId" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "report_version_results_pkey" PRIMARY KEY ("reportVersionId","orderedTestId")
);

-- CreateIndex
CREATE INDEX "report_versions_tenantId_releasedById_idx" ON "report_versions"("tenantId", "releasedById");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_tenantId_reportId_id_key" ON "report_versions"("tenantId", "reportId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_reportId_id_key" ON "report_versions"("reportId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_reportId_versionNo_key" ON "report_versions"("reportId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_reportId_contentHash_key" ON "report_versions"("reportId", "contentHash");

-- CreateIndex
CREATE INDEX "report_version_results_resultId_orderedTestId_idx" ON "report_version_results"("resultId", "orderedTestId");

-- CreateIndex
CREATE INDEX "report_version_results_orderedTestId_idx" ON "report_version_results"("orderedTestId");

-- CreateIndex
CREATE UNIQUE INDEX "report_version_results_reportVersionId_resultId_key" ON "report_version_results"("reportVersionId", "resultId");

-- CreateIndex
CREATE UNIQUE INDEX "report_version_results_reportVersionId_sortOrder_key" ON "report_version_results"("reportVersionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "reports_currentVersionId_key" ON "reports"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_tenantId_id_currentVersionId_key" ON "reports"("tenantId", "id", "currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_tenantId_id_key" ON "reports"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "results_id_orderedTestId_key" ON "results"("id", "orderedTestId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_tenantId_id_currentVersionId_fkey" FOREIGN KEY ("tenantId", "id", "currentVersionId") REFERENCES "report_versions"("tenantId", "reportId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_tenantId_reportId_fkey" FOREIGN KEY ("tenantId", "reportId") REFERENCES "reports"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_reportId_previousVersionId_fkey" FOREIGN KEY ("reportId", "previousVersionId") REFERENCES "report_versions"("reportId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_tenantId_releasedById_fkey" FOREIGN KEY ("tenantId", "releasedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_version_results" ADD CONSTRAINT "report_version_results_reportVersionId_fkey" FOREIGN KEY ("reportVersionId") REFERENCES "report_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_version_results" ADD CONSTRAINT "report_version_results_orderedTestId_fkey" FOREIGN KEY ("orderedTestId") REFERENCES "ordered_tests"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "report_version_results" ADD CONSTRAINT "report_version_results_resultId_orderedTestId_fkey" FOREIGN KEY ("resultId", "orderedTestId") REFERENCES "results"("id", "orderedTestId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.report_versions ADD CONSTRAINT b2_version_shape CHECK (
  "versionNo">0 AND "tenantId" ~ '^[a-zA-Z0-9_-]+$' AND "reportId" ~ '^[a-zA-Z0-9_-]+$' AND
  "contentHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("displaySnapshot")='object' AND
  (("versionNo"=1 AND kind='INITIAL' AND "previousVersionId" IS NULL AND "amendmentReason" IS NULL) OR
   ("versionNo">1 AND kind='AMENDMENT' AND "previousVersionId" IS NOT NULL AND "amendmentReason" IS NOT NULL AND length(btrim("amendmentReason"))>0)) AND
  (("pdfPath" IS NULL AND "pdfSha256" IS NULL AND "pdfByteSize" IS NULL AND "pdfGeneratedAt" IS NULL AND "renderSettingsSnapshot" IS NULL) OR
   ("pdfPath" IS NOT NULL AND "pdfSha256" IS NOT NULL AND "pdfSha256" ~ '^[a-f0-9]{64}$' AND "pdfByteSize" IS NOT NULL AND "pdfByteSize">0 AND
    "pdfGeneratedAt" IS NOT NULL AND "renderSettingsSnapshot" IS NOT NULL AND jsonb_typeof("renderSettingsSnapshot")='object' AND
    "pdfPath" ~ ('^reports/' || "tenantId" || '/' || "reportId" || '/version-' || "versionNo" || '/[a-f0-9-]{36}\.pdf$'))) AND
  "printCount">=0 AND (("printCount"=0 AND "firstPrintedAt" IS NULL AND "lastPrintedAt" IS NULL) OR
  ("printCount">0 AND "pdfPath" IS NOT NULL AND "firstPrintedAt" IS NOT NULL AND "lastPrintedAt" IS NOT NULL AND "lastPrintedAt">="firstPrintedAt"))
);
ALTER TABLE public.report_version_results ADD CONSTRAINT b2_member_sort CHECK ("sortOrder">0);

-- One aggregate lock assigns the next number and publishes the exact complete released set.
-- No renderer, filesystem or network work occurs here.
CREATE FUNCTION public.b2_capture_report_version(p_tenant TEXT, p_report TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE rep public.reports%ROWTYPE; current_ver public.report_versions%ROWTYPE;
  fingerprint TEXT; new_id TEXT; release_actor TEXT; reason TEXT; display_data JSONB; next_no INTEGER;
BEGIN
  SELECT * INTO STRICT rep FROM public.reports WHERE id=p_report AND "tenantId"=p_tenant;
  PERFORM id FROM public.invoices WHERE id=rep."invoiceId" FOR UPDATE;
  SELECT * INTO STRICT rep FROM public.reports WHERE id=p_report AND "tenantId"=p_tenant FOR UPDATE;
  IF rep."visitId" IS NULL OR rep.id !~ '^[a-zA-Z0-9_-]+$' OR p_tenant !~ '^[a-zA-Z0-9_-]+$' OR
    NOT EXISTS (SELECT 1 FROM public.ordered_tests WHERE "visitId"=rep."visitId") OR EXISTS (
    SELECT 1 FROM public.ordered_tests o WHERE o."visitId"=rep."visitId" AND
      (NOT EXISTS (SELECT 1 FROM public.results r WHERE r."orderedTestId"=o.id AND r.status='RELEASED') OR
       EXISTS (SELECT 1 FROM public.results r WHERE r."orderedTestId"=o.id AND r.status='ENTERED'))
  ) THEN RETURN NULL; END IF;
  SELECT encode(sha256(convert_to(string_agg(o.id || ':' || r.id, ',' ORDER BY o."occurrenceNo",o.id),'UTF8')),'hex')
    INTO fingerprint FROM public.ordered_tests o JOIN public.results r ON r."orderedTestId"=o.id AND r.status='RELEASED'
    WHERE o."visitId"=rep."visitId";
  SELECT id INTO new_id FROM public.report_versions WHERE "reportId"=rep.id AND "contentHash"=fingerprint;
  IF new_id IS NOT NULL THEN
    UPDATE public.reports SET status=CASE WHEN status='ARCHIVED' THEN status
      WHEN (SELECT kind FROM public.report_versions WHERE id=new_id)='AMENDMENT' OR status='AMENDED' THEN 'AMENDED'::public."ReportStatus"
      ELSE 'COMPLETE'::public."ReportStatus" END WHERE id=rep.id;
    RETURN new_id;
  END IF;
  IF rep."currentVersionId" IS NOT NULL THEN
    SELECT * INTO STRICT current_ver FROM public.report_versions WHERE id=rep."currentVersionId";
    next_no:=current_ver."versionNo"+1;
  ELSE next_no:=1; END IF;
  SELECT string_agg(DISTINCT r."amendmentReason", E'\n' ORDER BY r."amendmentReason") INTO reason
    FROM public.results r JOIN public.ordered_tests o ON o.id=r."orderedTestId"
    WHERE o."visitId"=rep."visitId" AND r.status='RELEASED' AND rep."currentVersionId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.report_version_results m WHERE m."reportVersionId"=rep."currentVersionId" AND m."resultId"=r.id);
  SELECT coalesce(r."releasedById",r."amendmentActorId") INTO release_actor
    FROM public.results r JOIN public.ordered_tests o ON o.id=r."orderedTestId"
    JOIN public.users u ON u.id=coalesce(r."releasedById",r."amendmentActorId") AND u."tenantId"=p_tenant
    WHERE o."visitId"=rep."visitId" AND r.status='RELEASED' AND (rep."currentVersionId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.report_version_results m WHERE m."reportVersionId"=rep."currentVersionId" AND m."resultId"=r.id))
    ORDER BY r."releasedAt" DESC NULLS LAST,r.id LIMIT 1;
  SELECT jsonb_build_object('capture','CURRENT_AT_VERSION_CREATION','patient',jsonb_build_object(
    'fullName',p."fullName",'phone',p.phone,'gender',p.gender,'labNumber',p."labNumber",'mrcNumber',p."mrcNumber",
    'dateOfBirth',substring(p."dateOfBirth"::text,1,10)),
    'referrer',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('fullName',d."fullName") END,
    'invoiceNumber',i."invoiceNumber",'reportNumber',rep."reportNumber",'trackingId',rep."trackingId",'visitAccession',v."accessionNumber")
    INTO STRICT display_data FROM public.invoices i JOIN public.bookings b ON b.id=i."bookingId"
    JOIN public.patients p ON p.id=b."patientId" LEFT JOIN public.doctors d ON d.id=b."doctorId"
    JOIN public.visits v ON v.id=rep."visitId" WHERE i.id=rep."invoiceId";
  INSERT INTO public.report_versions ("tenantId","reportId","versionNo","previousVersionId",kind,"releasedById","amendmentReason","displaySnapshot","contentHash")
    VALUES (p_tenant,rep.id,next_no,rep."currentVersionId",CASE WHEN next_no=1 THEN 'INITIAL'::public."ReportVersionKind" ELSE 'AMENDMENT'::public."ReportVersionKind" END,
      release_actor,reason,display_data,fingerprint) RETURNING id INTO new_id;
  INSERT INTO public.report_version_results ("reportVersionId","orderedTestId","resultId","sortOrder")
    SELECT new_id,o.id,r.id,o."occurrenceNo" FROM public.ordered_tests o JOIN public.results r ON r."orderedTestId"=o.id AND r.status='RELEASED'
    WHERE o."visitId"=rep."visitId" ORDER BY o."occurrenceNo";
  UPDATE public.reports SET "currentVersionId"=new_id,
    status=CASE WHEN status IN ('ARCHIVED','AMENDED') THEN status WHEN next_no=1 THEN 'COMPLETE'::public."ReportStatus" ELSE 'AMENDED'::public."ReportStatus" END,
    "generatedAt"=coalesce("generatedAt",CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "amendedAt"=CASE WHEN next_no>1 THEN CURRENT_TIMESTAMP AT TIME ZONE 'UTC' ELSE "amendedAt" END,
    "updatedAt"=CURRENT_TIMESTAMP AT TIME ZONE 'UTC' WHERE id=rep.id;
  RETURN new_id;
END $$;

CREATE FUNCTION public.b2_version_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE rep public.reports%ROWTYPE; prev public.report_versions%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Report releases are retained' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO STRICT rep FROM public.reports WHERE id=NEW."reportId" FOR UPDATE;
    IF rep."visitId" IS NULL OR NEW."tenantId"<>rep."tenantId" OR NEW."previousVersionId" IS DISTINCT FROM rep."currentVersionId" THEN
      RAISE EXCEPTION 'Report release must extend its own current Visit release' USING ERRCODE='23514'; END IF;
    IF NEW."previousVersionId" IS NOT NULL THEN
      SELECT * INTO STRICT prev FROM public.report_versions WHERE id=NEW."previousVersionId";
      IF NEW."versionNo"<>prev."versionNo"+1 THEN RAISE EXCEPTION 'Report version number must be sequential' USING ERRCODE='23514'; END IF;
    ELSIF NEW."versionNo"<>1 THEN RAISE EXCEPTION 'Initial report version must be one' USING ERRCODE='23514'; END IF;
    IF NEW."pdfPath" IS NOT NULL OR NEW."printCount"<>0 THEN RAISE EXCEPTION 'New release has no generated artifact or print history' USING ERRCODE='23514'; END IF;
  ELSE
    IF (to_jsonb(NEW)-ARRAY['pdfPath','pdfSha256','pdfByteSize','pdfGeneratedAt','renderSettingsSnapshot','firstPrintedAt','lastPrintedAt','printCount']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['pdfPath','pdfSha256','pdfByteSize','pdfGeneratedAt','renderSettingsSnapshot','firstPrintedAt','lastPrintedAt','printCount']) THEN
      RAISE EXCEPTION 'Report clinical release fields are immutable' USING ERRCODE='23514'; END IF;
    IF OLD."pdfPath" IS NOT NULL AND (NEW."pdfPath",NEW."pdfSha256",NEW."pdfByteSize",NEW."pdfGeneratedAt",NEW."renderSettingsSnapshot") IS DISTINCT FROM
      (OLD."pdfPath",OLD."pdfSha256",OLD."pdfByteSize",OLD."pdfGeneratedAt",OLD."renderSettingsSnapshot") THEN
      RAISE EXCEPTION 'Canonical report artifact is immutable' USING ERRCODE='23514'; END IF;
    IF NEW."printCount"<>OLD."printCount" THEN
      IF NEW."printCount"<>OLD."printCount"+1 OR NEW."firstPrintedAt" IS DISTINCT FROM coalesce(OLD."firstPrintedAt",NEW."lastPrintedAt") OR
        NEW."lastPrintedAt" IS NULL OR NEW."lastPrintedAt"<coalesce(OLD."lastPrintedAt",NEW."lastPrintedAt") THEN
        RAISE EXCEPTION 'Invalid report print history transition' USING ERRCODE='23514'; END IF;
    ELSIF (NEW."firstPrintedAt",NEW."lastPrintedAt") IS DISTINCT FROM (OLD."firstPrintedAt",OLD."lastPrintedAt") THEN
      RAISE EXCEPTION 'Print instants require a print count increment' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b2_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.report_versions FOR EACH ROW EXECUTE FUNCTION public.b2_version_guard();

CREATE FUNCTION public.b2_membership_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE valid BOOLEAN;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Report release membership is immutable' USING ERRCODE='23514'; END IF;
  SELECT (v.xmin::text::bigint=(pg_current_xact_id()::text::bigint % 4294967296)) AND
    v."previousVersionId" IS NOT DISTINCT FROM rep."currentVersionId" AND rep."currentVersionId" IS DISTINCT FROM v.id AND
    o."visitId"=rep."visitId" AND r.status='RELEASED' AND r."orderedTestId"=o.id AND NEW."sortOrder"=o."occurrenceNo"
    INTO valid FROM public.report_versions v JOIN public.reports rep ON rep.id=v."reportId"
    JOIN public.ordered_tests o ON o.id=NEW."orderedTestId" JOIN public.results r ON r.id=NEW."resultId"
    WHERE v.id=NEW."reportVersionId";
  IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Membership requires this transaction new version and its own released occurrence' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b2_memberships_guard BEFORE INSERT OR UPDATE OR DELETE ON public.report_version_results FOR EACH ROW EXECUTE FUNCTION public.b2_membership_guard();

CREATE FUNCTION public.b2_complete_release() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE rep public.reports%ROWTYPE; fingerprint TEXT;
BEGIN
  SELECT * INTO STRICT rep FROM public.reports WHERE id=NEW."reportId";
  IF rep."currentVersionId" IS DISTINCT FROM NEW.id OR NOT EXISTS (SELECT 1 FROM public.ordered_tests WHERE "visitId"=rep."visitId") OR EXISTS (
    SELECT 1 FROM public.ordered_tests o WHERE o."visitId"=rep."visitId" AND
    (NOT EXISTS (SELECT 1 FROM public.report_version_results m WHERE m."reportVersionId"=NEW.id AND m."orderedTestId"=o.id) OR
     EXISTS (SELECT 1 FROM public.results r WHERE r."orderedTestId"=o.id AND r.status='ENTERED'))
  ) OR EXISTS (SELECT 1 FROM public.report_version_results m JOIN public.results r ON r.id=m."resultId" WHERE m."reportVersionId"=NEW.id AND r.status<>'RELEASED') THEN
    RAISE EXCEPTION 'Report release requires complete released work without a correction draft' USING ERRCODE='23514'; END IF;
  SELECT encode(sha256(convert_to(string_agg(m."orderedTestId" || ':' || m."resultId",',' ORDER BY m."sortOrder",m."orderedTestId"),'UTF8')),'hex')
    INTO fingerprint FROM public.report_version_results m WHERE m."reportVersionId"=NEW.id;
  IF fingerprint IS DISTINCT FROM NEW."contentHash" THEN RAISE EXCEPTION 'Report membership fingerprint mismatch' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER b2_release_complete AFTER INSERT ON public.report_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.b2_complete_release();

CREATE FUNCTION public.b2_pointer_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF OLD."currentVersionId" IS NOT NULL AND NEW."currentVersionId" IS NULL THEN RAISE EXCEPTION 'Current release cannot be erased' USING ERRCODE='23514'; END IF;
  IF NEW."currentVersionId" IS DISTINCT FROM OLD."currentVersionId" AND NOT EXISTS (
    SELECT 1 FROM public.report_versions v WHERE v.id=NEW."currentVersionId" AND v."reportId"=NEW.id AND
      v."previousVersionId" IS NOT DISTINCT FROM OLD."currentVersionId" AND
      v.xmin::text::bigint=(pg_current_xact_id()::text::bigint % 4294967296)
  ) THEN RAISE EXCEPTION 'Current pointer must publish the new successor release' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b2_current_pointer BEFORE UPDATE OF "currentVersionId" ON public.reports FOR EACH ROW EXECUTE FUNCTION public.b2_pointer_guard();

-- Only capture the provable current complete B1 set; never invent earlier versions.
-- Display/release capture is explicitly at upgrade time, not claimed historical issuance.
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT id,"tenantId" FROM public.reports WHERE "visitId" IS NOT NULL AND status IN ('COMPLETE','AMENDED','ARCHIVED') ORDER BY id
  LOOP PERFORM public.b2_capture_report_version(r."tenantId",r.id); END LOOP;
END $$;
COMMIT;
