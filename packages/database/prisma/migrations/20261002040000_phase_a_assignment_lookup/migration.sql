-- Reverse specimen lookup by globally unique occurrence ID; the pair unique covers Sample only.
-- Separate additive index migration keeps the three already-tested/applied stages byte-identical.
BEGIN;
CREATE INDEX "sample_tests_orderedTestId_idx" ON "sample_tests"("orderedTestId");
COMMIT;
