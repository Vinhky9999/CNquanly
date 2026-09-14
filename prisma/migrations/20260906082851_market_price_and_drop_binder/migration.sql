/*
  Warnings:

  - You are about to drop the column `binderId` on the `SingleCard` table. All the data in the column will be lost.
  - You are about to drop the `Binder` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "SingleCard" DROP CONSTRAINT "SingleCard_binderId_fkey";

-- AlterTable
ALTER TABLE "SealedProduct" ADD COLUMN     "marketPriceSource" TEXT,
ADD COLUMN     "marketPriceUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SingleCard" DROP COLUMN "binderId",
ADD COLUMN     "marketPrice" DECIMAL(14,2),
ADD COLUMN     "marketPriceSource" TEXT,
ADD COLUMN     "marketPriceUpdatedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "Binder";
