-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "printedAt" TIMESTAMP(3),
ADD COLUMN     "printCount" INTEGER NOT NULL DEFAULT 0;
