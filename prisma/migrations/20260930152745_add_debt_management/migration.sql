-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('ADVANCED_BY_PERSON', 'ADVANCED_TO_PERSON');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CashLedgerEntryType" ADD VALUE 'DEBT_REPAYMENT';
ALTER TYPE "CashLedgerEntryType" ADD VALUE 'DEBT_COLLECTION';

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "type" "DebtType" NOT NULL,
    "personName" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "referenceLabel" TEXT,
    "notes" TEXT,
    "status" "DebtStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "cashLedgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Debt_type_idx" ON "Debt"("type");

-- CreateIndex
CREATE INDEX "Debt_status_idx" ON "Debt"("status");

-- CreateIndex
CREATE INDEX "Debt_personName_idx" ON "Debt"("personName");

-- CreateIndex
CREATE UNIQUE INDEX "DebtPayment_cashLedgerEntryId_key" ON "DebtPayment"("cashLedgerEntryId");

-- CreateIndex
CREATE INDEX "DebtPayment_debtId_idx" ON "DebtPayment"("debtId");

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_cashLedgerEntryId_fkey" FOREIGN KEY ("cashLedgerEntryId") REFERENCES "CashLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
