-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DIRECT', 'DELIVERY');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "orderType" "OrderType" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "recipientAddress" TEXT,
ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT,
ADD COLUMN     "shippingCarrier" TEXT,
ADD COLUMN     "trackingCode" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_orderType_idx" ON "Transaction"("orderType");
