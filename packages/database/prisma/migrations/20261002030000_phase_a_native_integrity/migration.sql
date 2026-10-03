-- Prisma does not model CHECKs/guard triggers. Catalog and direct-SQL regression tests retain these.
BEGIN;
ALTER TABLE visits ADD CONSTRAINT visits_row_version_positive CHECK ("rowVersion">0);
ALTER TABLE visits ADD CONSTRAINT visits_prospective_instant CHECK (source='LEGACY_INVOICE' OR "occurredAt" IS NOT NULL);
ALTER TABLE test_versions ADD CONSTRAINT test_versions_revision_positive CHECK ("revisionNo">0),
  ADD CONSTRAINT test_versions_snapshot_valid CHECK (jsonb_typeof("definitionSnapshot")='object'
    AND "definitionSnapshot"->>'schemaVersion'='1' AND jsonb_typeof("definitionSnapshot"->'parameters')='array'
    AND "definitionHash"=encode(sha256(convert_to("definitionSnapshot"::text,'UTF8')),'hex') IS TRUE
    AND ("definitionSnapshot"->>'schemaVersion'='1') IS TRUE AND jsonb_typeof("definitionSnapshot"->'parameters') IS NOT NULL);
ALTER TABLE package_versions ADD CONSTRAINT package_versions_revision_positive CHECK ("revisionNo">0),
  ADD CONSTRAINT package_versions_snapshot_valid CHECK (jsonb_typeof("compositionSnapshot")='object'
    AND "compositionSnapshot"->>'schemaVersion'='1' AND jsonb_typeof("compositionSnapshot"->'members')='array'
    AND "compositionHash"=encode(sha256(convert_to("compositionSnapshot"::text,'UTF8')),'hex') IS TRUE
    AND ("compositionSnapshot"->>'schemaVersion'='1') IS TRUE AND jsonb_typeof("compositionSnapshot"->'members') IS NOT NULL);
ALTER TABLE ordered_tests ADD CONSTRAINT ordered_tests_occurrence_positive CHECK ("occurrenceNo">0 AND "rowVersion">0),
  ADD CONSTRAINT ordered_tests_source_tuple CHECK (("invoiceLineId" IS NULL AND "sourceUnitNo" IS NULL AND "sourceMemberNo" IS NULL)
    OR ("invoiceLineId" IS NOT NULL AND "sourceUnitNo" IS NOT NULL AND "sourceUnitNo">0 AND "sourceMemberNo" IS NOT NULL AND "sourceMemberNo">=0));
ALTER TABLE samples ADD CONSTRAINT samples_recollection_scope CHECK ("previousSampleId" IS NULL
  OR ("visitId" IS NOT NULL AND "previousSampleId"<>id));
ALTER TABLE identifier_counters ADD CONSTRAINT identifier_counters_valid CHECK ("nextValue">0 AND namespace<>'' AND "scopeKey"<>'' AND "periodKey"<>''
  AND (namespace<>'VISIT' OR ("branchId" IS NOT NULL AND "scopeKey"='branch:'||"branchId" AND "periodKey" ~ '^[0-9]{8}$')));
ALTER TABLE sample_events ADD CONSTRAINT sample_events_target_valid CHECK (
  ("eventType"='COLLECTED' AND "toStatus"='COLLECTED') OR ("eventType"='RECEIVED' AND "toStatus"='RECEIVED_AT_LAB')
  OR ("eventType"='ACCEPTED' AND "toStatus"='ACCEPTED') OR ("eventType"='REJECTED' AND "toStatus"='REJECTED')
  OR ("eventType"='TESTING_STARTED' AND "toStatus"='IN_TESTING') OR ("eventType"='COMPLETED' AND "toStatus"='COMPLETED')
  OR ("eventType"='RECOLLECTION_REQUESTED' AND "toStatus"='REJECTED') OR ("eventType"='DISCARDED' AND "toStatus"='DISCARDED')),
  ADD CONSTRAINT sample_events_source_valid CHECK ("sourceKey"<>'' AND (source<>'PROSPECTIVE_CURRENT' OR "occurredAt" IS NOT NULL));

CREATE FUNCTION phase_a_retain_capture() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Phase A captured definitions and specimen events are retained immutable history' USING ERRCODE='23514'; END $$;
CREATE TRIGGER test_versions_immutable BEFORE UPDATE OR DELETE ON test_versions FOR EACH ROW EXECUTE FUNCTION phase_a_retain_capture();
CREATE TRIGGER package_versions_immutable BEFORE UPDATE OR DELETE ON package_versions FOR EACH ROW EXECUTE FUNCTION phase_a_retain_capture();
CREATE TRIGGER sample_events_append_only BEFORE UPDATE OR DELETE ON sample_events FOR EACH ROW EXECUTE FUNCTION phase_a_retain_capture();
CREATE TRIGGER sample_tests_retain BEFORE UPDATE OR DELETE ON sample_tests FOR EACH ROW EXECUTE FUNCTION phase_a_retain_capture();

-- Guard provenance through legacy tables without replacing any old FK or financial calculation.
CREATE FUNCTION phase_a_guard_order_source() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE source_visit TEXT; source_test TEXT; source_package TEXT;
BEGIN
  IF TG_OP='UPDATE' AND (NEW."tenantId",NEW."branchId",NEW."visitId",NEW."testVersionId",NEW."invoiceLineId",NEW."packageVersionId",NEW."occurrenceNo",NEW."sourceUnitNo",NEW."sourceMemberNo")
    IS DISTINCT FROM (OLD."tenantId",OLD."branchId",OLD."visitId",OLD."testVersionId",OLD."invoiceLineId",OLD."packageVersionId",OLD."occurrenceNo",OLD."sourceUnitNo",OLD."sourceMemberNo") THEN
    RAISE EXCEPTION 'Ordered occurrence identity/provenance is frozen' USING ERRCODE='23514';
  END IF;
  IF NEW."invoiceLineId" IS NOT NULL THEN
    SELECT i."visitId",l."testId",l."packageId" INTO source_visit,source_test,source_package
      FROM invoice_lines l JOIN invoices i ON i.id=l."invoiceId" WHERE l.id=NEW."invoiceLineId";
    IF source_visit IS DISTINCT FROM NEW."visitId" THEN RAISE EXCEPTION 'Order source belongs to another Visit' USING ERRCODE='23514'; END IF;
    IF NEW."packageVersionId" IS NULL THEN
      IF source_package IS NOT NULL OR NOT EXISTS (SELECT 1 FROM test_versions v WHERE v.id=NEW."testVersionId" AND v."testId"=source_test) THEN
        RAISE EXCEPTION 'Direct order source definition mismatch' USING ERRCODE='23514'; END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM package_versions v CROSS JOIN LATERAL jsonb_array_elements(v."compositionSnapshot"->'members') m
      WHERE v.id=NEW."packageVersionId" AND v."packageId"=source_package AND source_test IS NULL
        AND m->>'testVersionId'=NEW."testVersionId" AND (m->>'ordinal')::int=NEW."sourceMemberNo") THEN
      RAISE EXCEPTION 'Order is not a member of captured package source' USING ERRCODE='23514';
    END IF;
  ELSIF NEW."packageVersionId" IS NOT NULL THEN RAISE EXCEPTION 'Package provenance requires a source line' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ordered_tests_source_guard BEFORE INSERT OR UPDATE ON ordered_tests FOR EACH ROW EXECUTE FUNCTION phase_a_guard_order_source();

CREATE FUNCTION phase_a_guard_compatibility() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD."visitId" IS NOT NULL AND NEW."visitId" IS DISTINCT FROM OLD."visitId" THEN
    RAISE EXCEPTION 'Captured encounter link cannot be reassigned' USING ERRCODE='23514'; END IF;
  IF NEW."visitId" IS NOT NULL THEN
    IF TG_TABLE_NAME='invoices' THEN
      IF NOT EXISTS (SELECT 1 FROM visits v WHERE v.id=NEW."visitId" AND v."bookingId"=NEW."bookingId") THEN
        RAISE EXCEPTION 'Invoice booking/Visit mismatch' USING ERRCODE='23514'; END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id=NEW."invoiceId" AND i."visitId"=NEW."visitId") THEN
        RAISE EXCEPTION 'Specimen/report invoice/Visit mismatch' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_visit_guard BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION phase_a_guard_compatibility();
CREATE TRIGGER samples_visit_guard BEFORE INSERT OR UPDATE ON samples FOR EACH ROW EXECUTE FUNCTION phase_a_guard_compatibility();
CREATE TRIGGER reports_visit_guard BEFORE INSERT OR UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION phase_a_guard_compatibility();

CREATE FUNCTION phase_a_guard_source_line() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF (NEW."invoiceId",NEW."testId",NEW."packageId") IS DISTINCT FROM (OLD."invoiceId",OLD."testId",OLD."packageId")
    AND EXISTS (SELECT 1 FROM ordered_tests WHERE "invoiceLineId"=OLD.id) THEN
    RAISE EXCEPTION 'Retained order source cannot be reassigned' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_lines_order_source_guard BEFORE UPDATE ON invoice_lines FOR EACH ROW EXECUTE FUNCTION phase_a_guard_source_line();

CREATE FUNCTION phase_a_guard_counter() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Issued identifier counters are retained' USING ERRCODE='23514'; END IF;
  IF NEW."nextValue"<OLD."nextValue" OR (NEW."tenantId",NEW.namespace,NEW."scopeKey",NEW."periodKey",NEW."branchId")
    IS DISTINCT FROM (OLD."tenantId",OLD.namespace,OLD."scopeKey",OLD."periodKey",OLD."branchId") THEN
    RAISE EXCEPTION 'Counter scope cannot change or decrement' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER identifier_counters_monotonic BEFORE UPDATE OR DELETE ON identifier_counters FOR EACH ROW EXECUTE FUNCTION phase_a_guard_counter();

-- JSON membership is a typed frozen payload during legacy authoring, not a mutable package editor.
-- Its version references must still be checked on direct SQL inserts, including tenant ownership.
CREATE FUNCTION phase_a_guard_package_members() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE m JSONB; ordinals INTEGER[]:='{}'; ordinal INTEGER;
BEGIN
  FOR m IN SELECT value FROM jsonb_array_elements(NEW."compositionSnapshot"->'members') LOOP
    ordinal:=(m->>'ordinal')::integer;
    IF ordinal IS NULL OR ordinal<=0 OR ordinal=ANY(ordinals) OR (m->>'quantity')::integer IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'Invalid captured package ordinal/quantity' USING ERRCODE='23514'; END IF;
    ordinals:=array_append(ordinals,ordinal);
    IF m->>'testVersionId' IS NULL THEN
      IF NEW."reviewReason" IS NULL THEN RAISE EXCEPTION 'Unresolved package member needs review' USING ERRCODE='23514'; END IF;
    ELSIF m->>'nestedPackageId' IS NOT NULL OR NOT EXISTS (SELECT 1 FROM test_versions v WHERE v.id=m->>'testVersionId'
      AND v."tenantId"=NEW."tenantId" AND v."testId"=m->>'testId') THEN
      RAISE EXCEPTION 'Captured package member definition/tenant mismatch' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER package_versions_member_guard BEFORE INSERT ON package_versions FOR EACH ROW EXECUTE FUNCTION phase_a_guard_package_members();
COMMIT;
