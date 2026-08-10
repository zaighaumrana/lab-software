-- AlterTable
ALTER TABLE "samples" ADD COLUMN     "externalLabName" TEXT,
ADD COLUMN     "isOutsourced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outsourcingCost" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "samples_tenantId_isOutsourced_idx" ON "samples"("tenantId", "isOutsourced");
