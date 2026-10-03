-- All statements run atomically. Only new tables and additive compatibility columns are written.
-- Current captures are evidence of today's definition, NEVER approval or historic sale composition.
BEGIN;

-- Single-server VISIT allocator. branch-ID scope, Karachi capture/business day, next unused value.
-- No count/random accession; INSERT ON CONFLICT serializes increments even on first allocation.
CREATE FUNCTION phase_a_visit_accession(p_tenant TEXT, p_branch TEXT, p_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE n BIGINT; period TEXT; branch_code TEXT;
BEGIN
  IF p_at IS NULL THEN RAISE EXCEPTION 'Accession allocation requires an instant'; END IF;
  SELECT code INTO STRICT branch_code FROM branches WHERE id=p_branch AND "tenantId"=p_tenant;
  period := to_char(p_at AT TIME ZONE 'Asia/Karachi', 'YYYYMMDD');
  INSERT INTO identifier_counters ("tenantId",namespace,"scopeKey","periodKey","branchId","nextValue","updatedAt")
    VALUES (p_tenant,'VISIT','branch:'||p_branch,period,p_branch,2,CURRENT_TIMESTAMP)
  ON CONFLICT ("tenantId",namespace,"scopeKey","periodKey") DO UPDATE
    SET "nextValue"=identifier_counters."nextValue"+1, "updatedAt"=CURRENT_TIMESTAMP
  RETURNING "nextValue"-1 INTO n;
  -- lpad must not truncate values above 999999.
  RETURN 'V-'||branch_code||'-'||period||'-'||lpad(n::text,greatest(6,length(n::text)),'0');
END $$;

-- One MVCC statement captures parameters, choices and ranges together. Decimal bounds are strings.
-- Parent locking serializes revision allocation; no claim that the legacy editor publishes versions.
CREATE FUNCTION phase_a_capture_test(p_test TEXT, p_source "DefinitionCaptureSource")
RETURNS TEXT LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE t tests%ROWTYPE; payload JSONB; fingerprint TEXT; v test_versions%ROWTYPE; answer TEXT;
BEGIN
  SELECT * INTO STRICT t FROM tests WHERE id=p_test FOR UPDATE;
  SELECT jsonb_build_object('schemaVersion',1,'code',t.code,'name',t.name,'category',t.category,
    'sampleType',t."sampleType",'description',t.description,'isPanel',t."isPanel",'turnaroundHours',t."turnaroundHours",
    'parameters',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name',p.name,
      'valueType',p."valueType",'unit',p.unit,'sortOrder',p."sortOrder",'isRequired',p."isRequired",'decimalPlaces',p."decimalPlaces",
      'choices',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'value',c.value,'label',c.label,'sortOrder',c."sortOrder") ORDER BY c."sortOrder",c.id COLLATE "C") FROM test_parameter_choices c WHERE c."testParameterId"=p.id),'[]'::jsonb),
      'ranges',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'gender',r.gender,'ageMinMonths',r."ageMinMonths",'ageMaxMonths',r."ageMaxMonths",
        'lowNormal',r."lowNormal"::text,'highNormal',r."highNormal"::text,'criticalLow',r."criticalLow"::text,'criticalHigh',r."criticalHigh"::text,
        'unit',r.unit,'interpretation',r.interpretation) ORDER BY r.id COLLATE "C") FROM test_reference_ranges r WHERE r."testParameterId"=p.id),'[]'::jsonb)
    ) ORDER BY p."sortOrder",p.id COLLATE "C") FILTER (WHERE p.id IS NOT NULL),'[]'::jsonb)) INTO payload
  FROM test_parameters p WHERE p."testId"=t.id;
  fingerprint := encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  SELECT * INTO v FROM test_versions WHERE "testId"=t.id ORDER BY "revisionNo" DESC LIMIT 1;
  IF v.id IS NOT NULL AND v."definitionHash"=fingerprint THEN RETURN v.id; END IF;
  INSERT INTO test_versions ("tenantId","testId","revisionNo","codeSnapshot","nameSnapshot","specimenType",source,"definitionSnapshot","definitionHash")
    VALUES (t."tenantId",t.id,coalesce(v."revisionNo",0)+1,t.code,t.name,t."sampleType",p_source,payload,fingerprint) RETURNING id INTO answer;
  RETURN answer;
END $$;

CREATE FUNCTION phase_a_capture_package(p_package TEXT, p_source "DefinitionCaptureSource")
RETURNS TEXT LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE p packages%ROWTYPE; m RECORD; members JSONB := '[]'; ordinal INTEGER:=0;
  payload JSONB; fingerprint TEXT; v package_versions%ROWTYPE; answer TEXT; tv TEXT; issue TEXT;
BEGIN
  SELECT * INTO STRICT p FROM packages WHERE id=p_package FOR UPDATE;
  -- Lock test parents in stable order before capture (packages may share tests).
  PERFORM t.id FROM tests t JOIN package_items i ON i."testId"=t.id WHERE i."packageId"=p.id ORDER BY t.id COLLATE "C" FOR UPDATE OF t;
  FOR m IN SELECT i.*,t."tenantId" AS test_tenant FROM package_items i LEFT JOIN tests t ON t.id=i."testId"
    WHERE i."packageId"=p.id ORDER BY i."sortOrder",i.id COLLATE "C" LOOP
    ordinal:=ordinal+1; tv:=NULL;
    IF m."testId" IS NOT NULL AND m."nestedPackageId" IS NULL AND m.test_tenant=p."tenantId" THEN
      tv:=phase_a_capture_test(m."testId",p_source);
    ELSE issue:='UNSUPPORTED_OR_CROSS_TENANT_MEMBER'; END IF;
    members:=members||jsonb_build_array(jsonb_build_object('ordinal',ordinal,'legacyItemId',m.id,
      'testId',m."testId",'testVersionId',tv,'nestedPackageId',m."nestedPackageId",'quantity',1));
  END LOOP;
  IF ordinal=0 THEN issue:='EMPTY_COMPOSITION'; END IF;
  payload:=jsonb_build_object('schemaVersion',1,'code',p.code,'name',p.name,'description',p.description,'members',members);
  fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  SELECT * INTO v FROM package_versions WHERE "packageId"=p.id ORDER BY "revisionNo" DESC LIMIT 1;
  IF v.id IS NOT NULL AND v."compositionHash"=fingerprint THEN RETURN v.id; END IF;
  INSERT INTO package_versions ("tenantId","packageId","revisionNo","codeSnapshot","nameSnapshot",source,"compositionSnapshot","compositionHash","reviewReason")
    VALUES (p."tenantId",p.id,coalesce(v."revisionNo",0)+1,p.code,p.name,p_source,payload,fingerprint,issue) RETURNING id INTO answer;
  RETURN answer;
END $$;

-- Explicit compatibility factory. Runtime activation is deferred; callers must use their existing transaction.
-- Historical package lines stay unmapped. Prospective explicit factory calls freeze current composition.
CREATE FUNCTION phase_a_materialize_invoice(p_invoice TEXT, p_historical BOOLEAN)
RETURNS TEXT LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE inv invoices%ROWTYPE; b bookings%ROWTYPE; patient patients%ROWTYPE; line RECORD;
  visit_id TEXT; tv TEXT; pv package_versions%ROWTYPE; member JSONB; occurrence INTEGER:=0; unit_no INTEGER;
  capture_source "DefinitionCaptureSource"; issue TEXT; referrer TEXT; payer TEXT;
BEGIN
  SELECT * INTO STRICT inv FROM invoices WHERE id=p_invoice FOR UPDATE;
  IF inv."visitId" IS NOT NULL THEN RETURN inv."visitId"; END IF;
  SELECT * INTO STRICT b FROM bookings WHERE id=inv."bookingId" FOR UPDATE;
  SELECT * INTO STRICT patient FROM patients WHERE id=b."patientId";
  IF inv."tenantId"<>b."tenantId" OR inv."branchId"<>b."branchId" OR patient."tenantId"<>inv."tenantId"
    OR NOT EXISTS (SELECT 1 FROM branches WHERE id=inv."branchId" AND "tenantId"=inv."tenantId")
    OR (b."doctorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM doctors WHERE id=b."doctorId" AND "tenantId"=inv."tenantId"))
    OR (inv."companyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies WHERE id=inv."companyId" AND "tenantId"=inv."tenantId")) THEN
    IF NOT p_historical THEN RAISE EXCEPTION 'Invalid encounter ownership'; END IF;
    UPDATE invoices SET "phaseAReviewReason"='LEGACY_OWNERSHIP_MISMATCH' WHERE id=inv.id; RETURN NULL;
  END IF;
  SELECT "fullName" INTO referrer FROM doctors WHERE id=b."doctorId";
  SELECT name INTO payer FROM companies WHERE id=inv."companyId";
  capture_source:=CASE WHEN p_historical THEN 'LEGACY_CURRENT' ELSE 'PROSPECTIVE_CURRENT' END;
  INSERT INTO visits ("tenantId","branchId","patientId","bookingId","doctorId","companyId","accessionNumber",source,
    "occurredAt","legacyOccurredAtRaw","patientNameSnapshot","labNumberSnapshot","mrcNumberSnapshot","demographicSource",
    "doctorNameSnapshot","companyNameSnapshot","reviewReason","updatedAt")
    VALUES (inv."tenantId",inv."branchId",b."patientId",b.id,b."doctorId",inv."companyId",
      phase_a_visit_accession(inv."tenantId",inv."branchId",CURRENT_TIMESTAMP),
      CASE WHEN p_historical THEN 'LEGACY_INVOICE'::"VisitSource" ELSE 'BOOKING'::"VisitSource" END,
      CASE WHEN p_historical THEN NULL ELSE CURRENT_TIMESTAMP END,
      CASE WHEN p_historical THEN coalesce(inv."issuedAt",inv."createdAt")::text ELSE NULL END,
      patient."fullName",patient."labNumber",patient."mrcNumber",capture_source,referrer,payer,
      CASE WHEN p_historical THEN 'CURRENT_MASTER_CAPTURE_NOT_HISTORICAL_DEMOGRAPHICS;LEGACY_TIMEZONE_UNKNOWN' ELSE NULL END,CURRENT_TIMESTAMP)
    RETURNING id INTO visit_id;
  UPDATE invoices SET "visitId"=visit_id WHERE id=inv.id;
  -- Stable parent lock order for shared catalog captures.
  PERFORM t.id FROM tests t JOIN invoice_lines l ON l."testId"=t.id WHERE l."invoiceId"=inv.id ORDER BY t.id COLLATE "C" FOR UPDATE OF t;
  FOR line IN SELECT * FROM invoice_lines WHERE "invoiceId"=inv.id ORDER BY "sortOrder",id COLLATE "C" LOOP
    issue:=NULL;
    IF line.quantity<=0 OR line.quantity>1000 THEN issue:='INVALID_OR_UNBOUNDED_QUANTITY';
    ELSIF (line."testId" IS NULL)=(line."packageId" IS NULL) THEN issue:='AMBIGUOUS_CATALOG_TARGET';
    ELSIF line."packageId" IS NOT NULL AND p_historical THEN issue:='UNSNAPSHOTTED_HISTORICAL_PACKAGE';
    ELSIF line."testId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tests WHERE id=line."testId" AND "tenantId"=inv."tenantId") THEN issue:='CATALOG_OWNERSHIP_MISMATCH';
    ELSIF line."packageId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM packages WHERE id=line."packageId" AND "tenantId"=inv."tenantId") THEN issue:='CATALOG_OWNERSHIP_MISMATCH'; END IF;
    IF issue IS NOT NULL THEN
      IF NOT p_historical THEN RAISE EXCEPTION 'Cannot expand clinical work: %',issue; END IF;
      UPDATE invoice_lines SET "phaseAReviewReason"=issue WHERE id=line.id;
      UPDATE invoices SET "phaseAReviewReason"='PARTIAL_LEGACY_WORK_REQUIRES_REVIEW' WHERE id=inv.id;
      CONTINUE;
    END IF;
    IF line."testId" IS NOT NULL THEN
      tv:=phase_a_capture_test(line."testId",capture_source);
      FOR unit_no IN 1..line.quantity LOOP
        occurrence:=occurrence+1;
        INSERT INTO ordered_tests ("tenantId","branchId","visitId","testVersionId","invoiceLineId","occurrenceNo","sourceUnitNo","sourceMemberNo",source,"specimenTypeSnapshot","reviewReason","updatedAt")
          SELECT inv."tenantId",inv."branchId",visit_id,tv,line.id,occurrence,unit_no,0,capture_source,"specimenType",
            CASE WHEN p_historical THEN 'HISTORICAL_DEFINITION_AND_REPEAT_INTENT_UNVERIFIED' ELSE 'CURRENT_CAPTURE_NOT_CLINICALLY_APPROVED' END,CURRENT_TIMESTAMP FROM test_versions WHERE id=tv;
      END LOOP;
    ELSE
      -- Evaluate volatile capture once before the lookup; never in a per-row WHERE predicate.
      tv:=phase_a_capture_package(line."packageId",capture_source);
      SELECT * INTO STRICT pv FROM package_versions WHERE id=tv;
      IF pv."reviewReason" IS NOT NULL THEN RAISE EXCEPTION 'Unsupported package composition'; END IF;
      FOR unit_no IN 1..line.quantity LOOP
        FOR member IN SELECT value FROM jsonb_array_elements(pv."compositionSnapshot"->'members') LOOP
          occurrence:=occurrence+1;
          INSERT INTO ordered_tests ("tenantId","branchId","visitId","testVersionId","invoiceLineId","packageVersionId","occurrenceNo","sourceUnitNo","sourceMemberNo",source,"specimenTypeSnapshot","reviewReason","updatedAt")
            SELECT inv."tenantId",inv."branchId",visit_id,v.id,line.id,pv.id,occurrence,unit_no,(member->>'ordinal')::integer,capture_source,v."specimenType",
              'CURRENT_CAPTURE_NOT_CLINICALLY_APPROVED',CURRENT_TIMESTAMP FROM test_versions v WHERE v.id=member->>'testVersionId';
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  RETURN visit_id;
END $$;

-- Deterministic natural keys (parent/revision, booking, source line/unit/member); crypto IDs persist on retry.
DO $$ DECLARE row RECORD; BEGIN
  FOR row IN SELECT id FROM tests ORDER BY id COLLATE "C" LOOP PERFORM phase_a_capture_test(row.id,'LEGACY_CURRENT'); END LOOP;
  FOR row IN SELECT id FROM packages ORDER BY id COLLATE "C" LOOP PERFORM phase_a_capture_package(row.id,'LEGACY_CURRENT'); END LOOP;
  FOR row IN SELECT id FROM invoices ORDER BY id COLLATE "C" LOOP PERFORM phase_a_materialize_invoice(row.id,true); END LOOP;
END $$;

UPDATE test_parameters p SET "testVersionId"=v.id FROM test_versions v
  WHERE v."testId"=p."testId" AND v."revisionNo"=1 AND p."testVersionId" IS NULL;
UPDATE package_items i SET "packageVersionId"=v.id FROM package_versions v
  WHERE v."packageId"=i."packageId" AND v."revisionNo"=1 AND i."packageVersionId" IS NULL;
UPDATE package_items i SET "testVersionId"=v.id FROM test_versions v,packages p
  WHERE v."testId"=i."testId" AND v."revisionNo"=1 AND p.id=i."packageId" AND p."tenantId"=v."tenantId"
    AND i."nestedPackageId" IS NULL AND i."testVersionId" IS NULL;

UPDATE samples s SET "visitId"=i."visitId","phaseAReviewReason"='NO_UNAMBIGUOUS_RESULT_ASSIGNMENT'
  FROM invoices i WHERE s."invoiceId"=i.id AND s."tenantId"=i."tenantId" AND s."branchId"=i."branchId" AND i."visitId" IS NOT NULL AND s."visitId" IS NULL;
UPDATE samples SET "phaseAReviewReason"='LEGACY_ENCOUNTER_UNRESOLVED' WHERE "visitId" IS NULL AND "phaseAReviewReason" IS NULL;
UPDATE reports r SET "visitId"=i."visitId" FROM invoices i
  WHERE r."invoiceId"=i.id AND r."tenantId"=i."tenantId" AND r."branchId"=i."branchId" AND i."visitId" IS NOT NULL AND r."visitId" IS NULL;

-- Only one candidate occurrence for an evidenced Result line+test. Quantity/repeats remain unmapped.
INSERT INTO sample_tests ("tenantId","branchId","visitId","sampleId","orderedTestId",source,"evidenceResultId")
SELECT s."tenantId",s."branchId",s."visitId",s.id,o.id,'LEGACY_CURRENT',min(r.id COLLATE "C")
FROM results r JOIN samples s ON s.id=r."sampleId" AND s."tenantId"=r."tenantId"
JOIN invoice_lines l ON l.id=r."invoiceLineId" AND l."invoiceId"=s."invoiceId" AND l."testId"=r."testId"
JOIN ordered_tests o ON o."invoiceLineId"=l.id AND o."visitId"=s."visitId"
JOIN test_versions v ON v.id=o."testVersionId" AND v."testId"=r."testId"
WHERE (SELECT count(*) FROM ordered_tests c WHERE c."invoiceLineId"=l.id)=1
GROUP BY s."tenantId",s."branchId",s."visitId",s.id,o.id
ON CONFLICT ("sampleId","orderedTestId") DO NOTHING;
UPDATE samples s SET "phaseAReviewReason"=NULL WHERE EXISTS (SELECT 1 FROM sample_tests a WHERE a."sampleId"=s.id)
  AND NOT EXISTS (SELECT 1 FROM results r WHERE r."sampleId"=s.id AND NOT EXISTS
    (SELECT 1 FROM sample_tests a JOIN ordered_tests o ON o.id=a."orderedTestId" JOIN test_versions v ON v.id=o."testVersionId"
     WHERE a."sampleId"=s.id AND o."invoiceLineId"=r."invoiceLineId" AND v."testId"=r."testId"));

-- Preserve recorded transitions only. No guessed previous state/actor, instant, acceptance or lineage.
INSERT INTO sample_events ("tenantId","sampleId","actorId","eventType","toStatus","legacyOccurredAtRaw",reason,source,"sourceKey")
SELECT s."tenantId",s.id,
  CASE WHEN e.kind='COLLECTED' AND EXISTS (SELECT 1 FROM users u WHERE u.id=s."collectedById" AND u."tenantId"=s."tenantId") THEN s."collectedById" ELSE NULL END,
  e.kind::"SampleEventType",e.target::"SampleStatus",e.at::text,
  CASE WHEN e.kind='REJECTED' THEN s."rejectionReason" ELSE NULL END,'LEGACY_CURRENT','legacy:'||e.kind
FROM samples s CROSS JOIN LATERAL (VALUES
  ('COLLECTED','COLLECTED',s."collectedAt"),('RECEIVED','RECEIVED_AT_LAB',s."receivedAt"),
  ('ACCEPTED','ACCEPTED',s."acceptedAt"),('REJECTED','REJECTED',s."rejectedAt"),('DISCARDED','DISCARDED',s."discardedAt")
) e(kind,target,at) WHERE e.at IS NOT NULL ON CONFLICT ("sampleId","sourceKey") DO NOTHING;
COMMIT;
