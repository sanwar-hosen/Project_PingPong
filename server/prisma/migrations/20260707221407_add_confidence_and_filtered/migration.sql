-- CreateEnum
CREATE TYPE "OpenConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "open_events" ADD COLUMN     "confidence" "OpenConfidence" NOT NULL DEFAULT 'LOW',
ADD COLUMN     "isFiltered" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "open_events_emailId_isFiltered_idx" ON "open_events"("emailId", "isFiltered");
