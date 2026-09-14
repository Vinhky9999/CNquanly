-- CreateEnum
CREATE TYPE "SealedStockStatus" AS ENUM ('IN_STOCK', 'IN_TRANSIT', 'PRE_ORDER', 'ON_HOLD');

-- AlterTable
ALTER TABLE "SealedProduct" ADD COLUMN     "status" "SealedStockStatus" NOT NULL DEFAULT 'IN_STOCK';

-- AlterTable
ALTER TABLE "SingleCard" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;
