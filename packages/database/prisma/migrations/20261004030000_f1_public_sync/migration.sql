-- Evolve the original outbox. No historical payload backfill or invented events.
ALTER TABLE public.reports
  ADD COLUMN "publicSyncKey" TEXT,
  ADD COLUMN "publicSyncRevision" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "reports_publicSyncKey_key" ON public.reports("publicSyncKey");
ALTER TABLE public.reports ADD CONSTRAINT f1_report_revision CHECK
  ("publicSyncRevision" >= 0 AND ("publicSyncRevision" = 0 OR "publicSyncKey" IS NOT NULL));

ALTER TABLE public.sync_outbox
  ADD COLUMN "projectionKey" TEXT,
  ADD COLUMN "projectionRevision" BIGINT,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "claimedBy" TEXT,
  ADD COLUMN "claimExpiresAt" TIMESTAMP(3),
  ADD COLUMN "dispatchStartedAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT;
CREATE UNIQUE INDEX "sync_outbox_projectionKey_projectionRevision_key"
  ON public.sync_outbox("projectionKey", "projectionRevision");
CREATE INDEX "sync_outbox_eventType_status_nextAttemptAt_idx"
  ON public.sync_outbox("eventType", status, "nextAttemptAt");
-- At most one lease per aggregate, also when several API processes claim work.
CREATE UNIQUE INDEX f1_one_active_projection ON public.sync_outbox("projectionKey")
  WHERE "eventType"='public-report/v1' AND status='SYNCING';
ALTER TABLE public.sync_outbox ADD CONSTRAINT f1_projection_envelope CHECK
  ("eventType" <> 'public-report/v1' OR ((
    "projectionKey" IS NOT NULL AND "projectionRevision" > 0 AND
    "aggregateType"='Report' AND payload->>'schemaVersion'='public-report/v1' AND
    payload->>'projectionKey'="projectionKey" AND
    payload->>'projectionRevision'="projectionRevision"::text AND
    attempts BETWEEN 0 AND 5 AND ("lastError" IS NULL OR length("lastError")<=100) AND
    (status <> 'SYNCING' OR ("claimedBy" IS NOT NULL AND "claimExpiresAt" IS NOT NULL))
  ) IS TRUE));

-- Queue status can change; publication identity/payload and evidence cannot be rewritten/deleted.
CREATE FUNCTION public.f1_sync_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."eventType"='public-report/v1' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Public sync evidence is retained' USING ERRCODE='23514'; END IF;
    IF (NEW.id,NEW."tenantId",NEW."eventType",NEW."aggregateType",NEW."aggregateId",NEW.payload,
        NEW."projectionKey",NEW."projectionRevision",NEW."createdAt") IS DISTINCT FROM
       (OLD.id,OLD."tenantId",OLD."eventType",OLD."aggregateType",OLD."aggregateId",OLD.payload,
        OLD."projectionKey",OLD."projectionRevision",OLD."createdAt") OR NEW.attempts < OLD.attempts THEN
      RAISE EXCEPTION 'Public sync intent is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER f1_sync_evidence BEFORE UPDATE OR DELETE ON public.sync_outbox
  FOR EACH ROW EXECUTE FUNCTION public.f1_sync_evidence_guard();
REVOKE ALL ON FUNCTION public.f1_sync_evidence_guard() FROM PUBLIC;

CREATE FUNCTION public.f1_projection_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."publicSyncKey" IS NOT NULL AND NEW."publicSyncKey" IS DISTINCT FROM OLD."publicSyncKey")
     OR NEW."publicSyncRevision" < OLD."publicSyncRevision" THEN
    RAISE EXCEPTION 'Public projection identity/revision cannot move backwards' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER f1_projection_identity BEFORE UPDATE OF "publicSyncKey","publicSyncRevision" ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.f1_projection_identity_guard();
REVOKE ALL ON FUNCTION public.f1_projection_identity_guard() FROM PUBLIC;
