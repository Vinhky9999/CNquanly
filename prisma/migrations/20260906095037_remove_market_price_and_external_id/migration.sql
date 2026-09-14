/*
  Warnings:

  - You are about to drop the column `marketPrice` on the `SealedProduct` table. All the data in the column will be lost.
  - You are about to drop the column `marketPriceSource` on the `SealedProduct` table. All the data in the column will be lost.
  - You are about to drop the column `marketPriceUpdatedAt` on the `SealedProduct` table. All the data in the column will be lost.
  - You are about to drop the column `externalCardId` on the `SingleCard` table. All the data in the column will be lost.
  - You are about to drop the column `marketPrice` on the `SingleCard` table. All the data in the column will be lost.
  - You are about to drop the column `marketPriceSource` on the `SingleCard` table. All the data in the column will be lost.
  - You are about to drop the column `marketPriceUpdatedAt` on the `SingleCard` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "SingleCard_externalCardId_idx";

-- AlterTable
ALTER TABLE "SealedProduct" DROP COLUMN "marketPrice",
DROP COLUMN "marketPriceSource",
DROP COLUMN "marketPriceUpdatedAt";

-- AlterTable
ALTER TABLE "SingleCard" DROP COLUMN "externalCardId",
DROP COLUMN "marketPrice",
DROP COLUMN "marketPriceSource",
DROP COLUMN "marketPriceUpdatedAt";
