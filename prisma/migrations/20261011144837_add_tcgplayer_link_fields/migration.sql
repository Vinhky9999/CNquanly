-- AlterTable
ALTER TABLE "SealedProduct" ADD COLUMN     "marketPriceUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "priceLinkAttemptedAt" TIMESTAMP(3),
ADD COLUMN     "priceMatchScore" DOUBLE PRECISION,
ADD COLUMN     "priceSource" TEXT,
ADD COLUMN     "priceSourceLabel" TEXT,
ADD COLUMN     "priceSourceUrl" TEXT;

-- AlterTable
ALTER TABLE "SingleCard" ADD COLUMN     "priceLinkAttemptedAt" TIMESTAMP(3),
ADD COLUMN     "priceMatchScore" DOUBLE PRECISION,
ADD COLUMN     "priceSourceLabel" TEXT,
ADD COLUMN     "priceSourceUrl" TEXT;
