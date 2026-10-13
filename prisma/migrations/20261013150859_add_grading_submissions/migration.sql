-- CreateEnum
CREATE TYPE "GradingStatus" AS ENUM ('PENDING_SEND', 'AT_GRADER', 'SHIPPING_BACK', 'COMPLETED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CashLedgerEntryType" ADD VALUE 'GRADING_INCOME';
ALTER TYPE "CashLedgerEntryType" ADD VALUE 'GRADING_COST';

-- CreateTable
CREATE TABLE "GradingSubmission" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerContact" TEXT,
    "cardName" TEXT NOT NULL,
    "sku" TEXT,
    "certNumber" TEXT,
    "company" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "listedFee" DECIMAL(14,2) NOT NULL,
    "costPrice" DECIMAL(14,2) NOT NULL,
    "markup" DECIMAL(14,2) NOT NULL,
    "chargeAmount" DECIMAL(14,2) NOT NULL,
    "status" "GradingStatus" NOT NULL DEFAULT 'PENDING_SEND',
    "notes" TEXT,
    "incomeEntryId" TEXT,
    "costEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradingSubmission_incomeEntryId_key" ON "GradingSubmission"("incomeEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "GradingSubmission_costEntryId_key" ON "GradingSubmission"("costEntryId");

-- CreateIndex
CREATE INDEX "GradingSubmission_status_idx" ON "GradingSubmission"("status");

-- CreateIndex
CREATE INDEX "GradingSubmission_customerName_idx" ON "GradingSubmission"("customerName");

-- CreateIndex
CREATE INDEX "GradingSubmission_createdAt_idx" ON "GradingSubmission"("createdAt");

-- AddForeignKey
ALTER TABLE "GradingSubmission" ADD CONSTRAINT "GradingSubmission_incomeEntryId_fkey" FOREIGN KEY ("incomeEntryId") REFERENCES "CashLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingSubmission" ADD CONSTRAINT "GradingSubmission_costEntryId_fkey" FOREIGN KEY ("costEntryId") REFERENCES "CashLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
