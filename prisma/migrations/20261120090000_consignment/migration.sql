-- CreateEnum
CREATE TYPE "ConsignmentListingStatus" AS ENUM ('ACTIVE', 'ENDED', 'SOLD', 'UNSOLD');

-- CreateEnum
CREATE TYPE "ConsignmentDataSource" AS ENUM ('EBAY_API', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConsignmentFeeMode" AS ENUM ('FLAT_BY_BAND', 'MARGINAL');

-- CreateTable
CREATE TABLE "ConsignmentFeeSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "mode" "ConsignmentFeeMode" NOT NULL DEFAULT 'FLAT_BY_BAND',
    "serviceRate" DECIMAL(7,4) NOT NULL DEFAULT 5,
    "minimumFee" DECIMAL(14,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsignmentFeeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsignmentFeeTier" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "fromPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "toPrice" DECIMAL(14,2),
    "percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "fixedFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConsignmentFeeTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsignmentOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerContact" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsignmentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsignmentItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ebayUrl" TEXT,
    "ebayItemId" TEXT,
    "ebayMarketplace" TEXT,
    "seller" TEXT,
    "dataSource" "ConsignmentDataSource" NOT NULL DEFAULT 'MANUAL',
    "fetchedAt" TIMESTAMP(3),
    "fetchError" TEXT,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "setName" TEXT,
    "year" TEXT,
    "cardNumber" TEXT,
    "cardType" TEXT,
    "rarity" TEXT,
    "gradingCompany" TEXT,
    "grade" TEXT,
    "certNumber" TEXT,
    "condition" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "listingStatus" "ConsignmentListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "currentPrice" DECIMAL(14,2),
    "endPrice" DECIMAL(14,2),
    "bidCount" INTEGER,
    "endsAt" TIMESTAMP(3),
    "feeScheduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsignmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsignmentImage" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "data" BYTEA,
    "contentType" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsignmentImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsignmentPayment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ConsignmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsignmentFeeSchedule_effectiveFrom_idx" ON "ConsignmentFeeSchedule"("effectiveFrom");

-- CreateIndex
CREATE INDEX "ConsignmentFeeTier_scheduleId_idx" ON "ConsignmentFeeTier"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentOrder_code_key" ON "ConsignmentOrder"("code");

-- CreateIndex
CREATE INDEX "ConsignmentOrder_customerName_idx" ON "ConsignmentOrder"("customerName");

-- CreateIndex
CREATE INDEX "ConsignmentOrder_createdAt_idx" ON "ConsignmentOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentItem_code_key" ON "ConsignmentItem"("code");

-- CreateIndex
CREATE INDEX "ConsignmentItem_orderId_idx" ON "ConsignmentItem"("orderId");

-- CreateIndex
CREATE INDEX "ConsignmentItem_listingStatus_idx" ON "ConsignmentItem"("listingStatus");

-- CreateIndex
CREATE INDEX "ConsignmentItem_ebayItemId_idx" ON "ConsignmentItem"("ebayItemId");

-- CreateIndex
CREATE INDEX "ConsignmentItem_endsAt_idx" ON "ConsignmentItem"("endsAt");

-- CreateIndex
CREATE INDEX "ConsignmentImage_itemId_idx" ON "ConsignmentImage"("itemId");

-- CreateIndex
CREATE INDEX "ConsignmentPayment_itemId_idx" ON "ConsignmentPayment"("itemId");

-- AddForeignKey
ALTER TABLE "ConsignmentFeeTier" ADD CONSTRAINT "ConsignmentFeeTier_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ConsignmentFeeSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentItem" ADD CONSTRAINT "ConsignmentItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ConsignmentOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentItem" ADD CONSTRAINT "ConsignmentItem_feeScheduleId_fkey" FOREIGN KEY ("feeScheduleId") REFERENCES "ConsignmentFeeSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentImage" ADD CONSTRAINT "ConsignmentImage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ConsignmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentPayment" ADD CONSTRAINT "ConsignmentPayment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ConsignmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

