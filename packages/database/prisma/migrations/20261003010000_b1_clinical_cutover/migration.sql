-- B1 additive clinical cutover. Nine prior migrations are unchanged.
BEGIN;
-- AlterTable
ALTER TABLE "result_values" ADD COLUMN     "evaluatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "evaluationAgeMonths" INTEGER,
ADD COLUMN     "evaluationGender" "Gender",
ADD COLUMN     "selectedRangeId" TEXT,
ADD COLUMN     "testVersionId" TEXT,
ADD COLUMN     "versionParameterId" TEXT,
ALTER COLUMN "testParameterId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "results" ADD COLUMN     "amendmentActorId" TEXT,
ADD COLUMN     "amendmentReason" TEXT,
ADD COLUMN     "orderedTestId" TEXT,
ADD COLUMN     "revisionNo" INTEGER,
ADD COLUMN     "testVersionId" TEXT;

-- CreateTable
CREATE TABLE "test_version_parameters" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "testVersionId" TEXT NOT NULL,
    "legacyParameterId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "valueType" "ParameterValueType" NOT NULL,
    "unit" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL,
    "decimalPlaces" INTEGER,

    CONSTRAINT "test_version_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_version_parameter_choices" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "versionParameterId" TEXT NOT NULL,
    "legacyChoiceId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "test_version_parameter_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_version_reference_ranges" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "versionParameterId" TEXT NOT NULL,
    "legacyRangeId" TEXT NOT NULL,
    "gender" "Gender",
    "ageMinMonths" INTEGER,
    "ageMaxMonths" INTEGER,
    "lowNormal" DECIMAL(12,4),
    "highNormal" DECIMAL(12,4),
    "criticalLow" DECIMAL(12,4),
    "criticalHigh" DECIMAL(12,4),
    "unit" TEXT,
    "interpretation" TEXT,

    CONSTRAINT "test_version_reference_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_version_parameters_testVersionId_id_key" ON "test_version_parameters"("testVersionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "test_version_parameters_testVersionId_legacyParameterId_key" ON "test_version_parameters"("testVersionId", "legacyParameterId");

-- CreateIndex
CREATE UNIQUE INDEX "test_version_parameters_testVersionId_code_key" ON "test_version_parameters"("testVersionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "test_version_parameter_choices_versionParameterId_legacyCho_key" ON "test_version_parameter_choices"("versionParameterId", "legacyChoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "test_version_parameter_choices_versionParameterId_value_key" ON "test_version_parameter_choices"("versionParameterId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "test_version_reference_ranges_versionParameterId_id_key" ON "test_version_reference_ranges"("versionParameterId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "test_version_reference_ranges_versionParameterId_legacyRang_key" ON "test_version_reference_ranges"("versionParameterId", "legacyRangeId");

-- CreateIndex
CREATE UNIQUE INDEX "ordered_tests_tenantId_id_testVersionId_key" ON "ordered_tests"("tenantId", "id", "testVersionId");

-- CreateIndex
CREATE INDEX "result_values_testVersionId_versionParameterId_idx" ON "result_values"("testVersionId", "versionParameterId");

-- CreateIndex
CREATE INDEX "result_values_versionParameterId_selectedRangeId_idx" ON "result_values"("versionParameterId", "selectedRangeId");

-- CreateIndex
CREATE UNIQUE INDEX "result_values_resultId_versionParameterId_key" ON "result_values"("resultId", "versionParameterId");

-- CreateIndex
CREATE UNIQUE INDEX "results_orderedTestId_revisionNo_key" ON "results"("orderedTestId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "results_id_testVersionId_key" ON "results"("id", "testVersionId");

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_tenantId_orderedTestId_testVersionId_fkey" FOREIGN KEY ("tenantId", "orderedTestId", "testVersionId") REFERENCES "ordered_tests"("tenantId", "id", "testVersionId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_sampleId_orderedTestId_fkey" FOREIGN KEY ("sampleId", "orderedTestId") REFERENCES "sample_tests"("sampleId", "orderedTestId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_tenantId_amendmentActorId_fkey" FOREIGN KEY ("tenantId", "amendmentActorId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_values" ADD CONSTRAINT "result_values_resultId_testVersionId_fkey" FOREIGN KEY ("resultId", "testVersionId") REFERENCES "results"("id", "testVersionId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_values" ADD CONSTRAINT "result_values_testVersionId_versionParameterId_fkey" FOREIGN KEY ("testVersionId", "versionParameterId") REFERENCES "test_version_parameters"("testVersionId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "result_values" ADD CONSTRAINT "result_values_versionParameterId_selectedRangeId_fkey" FOREIGN KEY ("versionParameterId", "selectedRangeId") REFERENCES "test_version_reference_ranges"("versionParameterId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "test_version_parameters" ADD CONSTRAINT "test_version_parameters_testVersionId_fkey" FOREIGN KEY ("testVersionId") REFERENCES "test_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "test_version_parameter_choices" ADD CONSTRAINT "test_version_parameter_choices_versionParameterId_fkey" FOREIGN KEY ("versionParameterId") REFERENCES "test_version_parameters"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "test_version_reference_ranges" ADD CONSTRAINT "test_version_reference_ranges_versionParameterId_fkey" FOREIGN KEY ("versionParameterId") REFERENCES "test_version_parameters"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Normalize retained JSON evidence; never recapture it from the mutable catalog.
CREATE FUNCTION public.b1_normalize_definition(p_version TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE payload JSONB; p JSONB; parameter_id TEXT;
BEGIN
  SELECT "definitionSnapshot" INTO STRICT payload FROM public.test_versions WHERE id=p_version FOR UPDATE;
  FOR p IN SELECT value FROM jsonb_array_elements(payload->'parameters') LOOP
    INSERT INTO public.test_version_parameters ("testVersionId","legacyParameterId",code,name,"valueType",unit,"sortOrder","isRequired","decimalPlaces")
      VALUES (p_version,p->>'id',p->>'code',p->>'name',(p->>'valueType')::public."ParameterValueType",p->>'unit',
        (p->>'sortOrder')::integer,(p->>'isRequired')::boolean,(p->>'decimalPlaces')::integer)
      ON CONFLICT ("testVersionId","legacyParameterId") DO NOTHING;
    SELECT id INTO STRICT parameter_id FROM public.test_version_parameters WHERE "testVersionId"=p_version AND "legacyParameterId"=p->>'id';
    INSERT INTO public.test_version_parameter_choices ("versionParameterId","legacyChoiceId",value,label,"sortOrder")
      SELECT parameter_id,c->>'id',c->>'value',c->>'label',(c->>'sortOrder')::integer FROM jsonb_array_elements(p->'choices') c
      ON CONFLICT ("versionParameterId","legacyChoiceId") DO NOTHING;
    INSERT INTO public.test_version_reference_ranges ("versionParameterId","legacyRangeId",gender,"ageMinMonths","ageMaxMonths",
      "lowNormal","highNormal","criticalLow","criticalHigh",unit,interpretation)
      SELECT parameter_id,r->>'id',(r->>'gender')::public."Gender",(r->>'ageMinMonths')::integer,(r->>'ageMaxMonths')::integer,
        (r->>'lowNormal')::numeric,(r->>'highNormal')::numeric,(r->>'criticalLow')::numeric,(r->>'criticalHigh')::numeric,
        r->>'unit',r->>'interpretation' FROM jsonb_array_elements(p->'ranges') r
      ON CONFLICT ("versionParameterId","legacyRangeId") DO NOTHING;
  END LOOP;
END $$;
DO $$ DECLARE v RECORD; BEGIN FOR v IN SELECT id FROM public.test_versions ORDER BY id LOOP PERFORM public.b1_normalize_definition(v.id); END LOOP; END $$;

CREATE FUNCTION public.b1_capture_definition() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN PERFORM public.b1_normalize_definition(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER b1_test_version_normalize AFTER INSERT ON public.test_versions FOR EACH ROW EXECUTE FUNCTION public.b1_capture_definition();

-- Insertions must reproduce the snapshot exactly; no late extra mutable definitions.
CREATE FUNCTION public.b1_definition_guard() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE expected JSONB; actual JSONB; p JSONB;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Immutable version definition' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='test_version_parameters' THEN
    SELECT x INTO expected FROM public.test_versions v CROSS JOIN LATERAL jsonb_array_elements(v."definitionSnapshot"->'parameters') x
      WHERE v.id=NEW."testVersionId" AND x->>'id'=NEW."legacyParameterId";
    expected:=expected-'choices'-'ranges';
    actual:=jsonb_build_object('id',NEW."legacyParameterId",'code',NEW.code,'name',NEW.name,'valueType',NEW."valueType",
      'unit',NEW.unit,'sortOrder',NEW."sortOrder",'isRequired',NEW."isRequired",'decimalPlaces',NEW."decimalPlaces");
  ELSE
    SELECT x INTO p FROM public.test_version_parameters vp JOIN public.test_versions v ON v.id=vp."testVersionId"
      CROSS JOIN LATERAL jsonb_array_elements(v."definitionSnapshot"->'parameters') x
      WHERE vp.id=NEW."versionParameterId" AND x->>'id'=vp."legacyParameterId";
    IF TG_TABLE_NAME='test_version_parameter_choices' THEN
      SELECT x INTO expected FROM jsonb_array_elements(p->'choices') x WHERE x->>'id'=NEW."legacyChoiceId";
      actual:=jsonb_build_object('id',NEW."legacyChoiceId",'value',NEW.value,'label',NEW.label,'sortOrder',NEW."sortOrder");
    ELSE
      SELECT x INTO expected FROM jsonb_array_elements(p->'ranges') x WHERE x->>'id'=NEW."legacyRangeId";
      actual:=jsonb_build_object('id',NEW."legacyRangeId",'gender',NEW.gender,'ageMinMonths',NEW."ageMinMonths",'ageMaxMonths',NEW."ageMaxMonths",
        'lowNormal',NEW."lowNormal"::text,'highNormal',NEW."highNormal"::text,'criticalLow',NEW."criticalLow"::text,
        'criticalHigh',NEW."criticalHigh"::text,'unit',NEW.unit,'interpretation',NEW.interpretation);
    END IF;
  END IF;
  IF expected IS NULL OR expected IS DISTINCT FROM actual THEN RAISE EXCEPTION 'Definition differs from immutable snapshot' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b1_parameters_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.test_version_parameters FOR EACH ROW EXECUTE FUNCTION public.b1_definition_guard();
CREATE TRIGGER b1_choices_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.test_version_parameter_choices FOR EACH ROW EXECUTE FUNCTION public.b1_definition_guard();
CREATE TRIGGER b1_ranges_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.test_version_reference_ranges FOR EACH ROW EXECUTE FUNCTION public.b1_definition_guard();

-- Only isolated, evidenced single results whose every value maps to the capture.
-- Ambiguous work, amendment chains and overwritten historical evidence stay legacy.
UPDATE public.results r SET "orderedTestId"=o.id,"testVersionId"=o."testVersionId","revisionNo"=1
FROM public.sample_tests a JOIN public.ordered_tests o ON o.id=a."orderedTestId" JOIN public.test_versions v ON v.id=o."testVersionId"
WHERE a."evidenceResultId"=r.id AND a."sampleId"=r."sampleId" AND o."invoiceLineId"=r."invoiceLineId" AND v."testId"=r."testId"
  AND r."tenantId"=o."tenantId" AND r."amendedFromResultId" IS NULL AND r.status IN ('ENTERED','RELEASED')
  AND NOT EXISTS (SELECT 1 FROM public.results c WHERE c."amendedFromResultId"=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.results c WHERE c.id<>r.id AND c."invoiceLineId"=r."invoiceLineId" AND c."testId"=r."testId")
  AND NOT EXISTS (SELECT 1 FROM public.result_values rv WHERE rv."resultId"=r.id AND NOT EXISTS
    (SELECT 1 FROM public.test_version_parameters vp WHERE vp."testVersionId"=o."testVersionId" AND vp."legacyParameterId"=rv."testParameterId"));
UPDATE public.result_values rv SET "testVersionId"=r."testVersionId","versionParameterId"=p.id
FROM public.results r JOIN public.test_version_parameters p ON p."testVersionId"=r."testVersionId"
WHERE rv."resultId"=r.id AND p."legacyParameterId"=rv."testParameterId" AND r."orderedTestId" IS NOT NULL;
-- No flag/range/context is re-evaluated or invented for backfilled values.

ALTER TABLE public.results ADD CONSTRAINT b1_result_identity CHECK
 (("orderedTestId" IS NULL AND "testVersionId" IS NULL AND "revisionNo" IS NULL) OR
  ("orderedTestId" IS NOT NULL AND "testVersionId" IS NOT NULL AND "revisionNo" IS NOT NULL AND "revisionNo">0));
ALTER TABLE public.results ADD CONSTRAINT b1_correction_evidence CHECK
 ("orderedTestId" IS NULL OR "revisionNo"=1 OR ("amendedFromResultId" IS NOT NULL AND
  "amendmentActorId" IS NOT NULL AND "amendmentReason" IS NOT NULL AND length(btrim("amendmentReason"))>0));
ALTER TABLE public.result_values ADD CONSTRAINT b1_value_identity CHECK
 (("versionParameterId" IS NULL AND "testVersionId" IS NULL AND "testParameterId" IS NOT NULL) OR
  ("versionParameterId" IS NOT NULL AND "testVersionId" IS NOT NULL));
CREATE UNIQUE INDEX b1_one_draft_per_occurrence ON public.results("orderedTestId") WHERE "orderedTestId" IS NOT NULL AND status='ENTERED';
CREATE UNIQUE INDEX b1_one_release_per_occurrence ON public.results("orderedTestId") WHERE "orderedTestId" IS NOT NULL AND status='RELEASED';
CREATE UNIQUE INDEX b1_one_successor_per_revision ON public.results("amendedFromResultId") WHERE "orderedTestId" IS NOT NULL AND "amendedFromResultId" IS NOT NULL;

CREATE FUNCTION public.b1_result_guard() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE o public.ordered_tests%ROWTYPE; prior public.results%ROWTYPE; source_test TEXT;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD."orderedTestId" IS NOT NULL THEN RAISE EXCEPTION 'Clinical revisions are retained' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD."orderedTestId" IS NOT NULL THEN
    IF (NEW."tenantId",NEW."sampleId",NEW."invoiceLineId",NEW."testId",NEW."orderedTestId",NEW."testVersionId",NEW."revisionNo",NEW."amendedFromResultId",NEW."amendmentReason",NEW."amendmentActorId") IS DISTINCT FROM
      (OLD."tenantId",OLD."sampleId",OLD."invoiceLineId",OLD."testId",OLD."orderedTestId",OLD."testVersionId",OLD."revisionNo",OLD."amendedFromResultId",OLD."amendmentReason",OLD."amendmentActorId") THEN
      RAISE EXCEPTION 'Clinical revision identity is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.status IN ('RELEASED','SUPERSEDED') AND NOT (OLD.status='RELEASED' AND NEW.status='SUPERSEDED'
      AND to_jsonb(NEW)-'status'-'updatedAt'=to_jsonb(OLD)-'status'-'updatedAt') THEN
      RAISE EXCEPTION 'Released clinical evidence is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW."orderedTestId" IS NOT NULL THEN
    SELECT * INTO STRICT o FROM public.ordered_tests WHERE id=NEW."orderedTestId" FOR UPDATE;
    SELECT "testId" INTO STRICT source_test FROM public.test_versions WHERE id=o."testVersionId";
    IF NEW."tenantId" IS DISTINCT FROM o."tenantId" OR NEW."testVersionId" IS DISTINCT FROM o."testVersionId"
      OR NEW."testId" IS DISTINCT FROM source_test OR NEW."invoiceLineId" IS DISTINCT FROM o."invoiceLineId" THEN
      RAISE EXCEPTION 'Result does not match ordered occurrence' USING ERRCODE='23514'; END IF;
    IF NEW."revisionNo"=1 THEN
      IF NEW."amendedFromResultId" IS NOT NULL THEN RAISE EXCEPTION 'Initial revision has no predecessor' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO STRICT prior FROM public.results WHERE id=NEW."amendedFromResultId";
      IF prior."orderedTestId" IS DISTINCT FROM NEW."orderedTestId" OR prior."testVersionId" IS DISTINCT FROM NEW."testVersionId"
        OR NEW."revisionNo"<>prior."revisionNo"+1 OR prior.status NOT IN ('RELEASED','SUPERSEDED') THEN
        RAISE EXCEPTION 'Invalid clinical revision lineage' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.samples s JOIN public.invoices i ON i.id=s."invoiceId"
    WHERE s.id=NEW."sampleId" AND i."visitId" IS NOT NULL) AND TG_OP='INSERT' THEN
    RAISE EXCEPTION 'Visit-based work requires an OrderedTest' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b1_results_guard BEFORE INSERT OR UPDATE OR DELETE ON public.results FOR EACH ROW EXECUTE FUNCTION public.b1_result_guard();

CREATE FUNCTION public.b1_value_guard() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE parent public.results%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN
    SELECT * INTO parent FROM public.results WHERE id=OLD."resultId" FOR UPDATE;
    IF NOT FOUND AND TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF parent."orderedTestId" IS NOT NULL AND parent.status IN ('RELEASED','SUPERSEDED') THEN
      RAISE EXCEPTION 'Released clinical values are immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF parent."orderedTestId" IS NOT NULL AND (NEW."resultId",NEW."versionParameterId",NEW."testVersionId") IS DISTINCT FROM
      (OLD."resultId",OLD."versionParameterId",OLD."testVersionId") THEN RAISE EXCEPTION 'Value identity is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT * INTO STRICT parent FROM public.results WHERE id=NEW."resultId" FOR UPDATE;
  IF parent."orderedTestId" IS NOT NULL THEN
    IF parent.status<>'ENTERED' OR NEW."testVersionId" IS DISTINCT FROM parent."testVersionId" OR NEW."versionParameterId" IS NULL THEN
      RAISE EXCEPTION 'V2 values require the draft frozen definition' USING ERRCODE='23514'; END IF;
  ELSIF NEW."versionParameterId" IS NOT NULL OR NEW."testVersionId" IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy values cannot claim a V2 definition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b1_values_guard BEFORE INSERT OR UPDATE OR DELETE ON public.result_values FOR EACH ROW EXECUTE FUNCTION public.b1_value_guard();

CREATE FUNCTION public.b1_release_integrity() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE current_row public.results%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM public.results WHERE id=NEW.id;
  IF current_row."orderedTestId" IS NULL THEN RETURN NULL; END IF;
  IF current_row.status='SUPERSEDED' AND NOT EXISTS (SELECT 1 FROM public.results r WHERE r."amendedFromResultId"=current_row.id AND r.status IN ('RELEASED','SUPERSEDED')) THEN
    RAISE EXCEPTION 'Supersession requires an atomically finalized successor' USING ERRCODE='23514'; END IF;
  IF current_row.status='RELEASED' AND (NOT EXISTS (SELECT 1 FROM public.result_values WHERE "resultId"=current_row.id) OR EXISTS
    (SELECT 1 FROM public.test_version_parameters p WHERE p."testVersionId"=current_row."testVersionId" AND p."isRequired"
      AND NOT EXISTS (SELECT 1 FROM public.result_values v WHERE v."resultId"=current_row.id AND v."versionParameterId"=p.id))) THEN
    RAISE EXCEPTION 'Release requires frozen parameter values' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER b1_release_integrity AFTER INSERT OR UPDATE ON public.results DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.b1_release_integrity();
COMMIT;

