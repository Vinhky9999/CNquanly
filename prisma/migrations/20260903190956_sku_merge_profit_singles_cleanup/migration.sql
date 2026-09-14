/*
  Warnings:

  - You are about to drop the column `marketPrice` on the `SingleCard` table. All the data in the column will be lost.
  - You are about to drop the column `targetSellPrice` on the `SingleCard` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SingleCard" DROP COLUMN "marketPrice",
DROP COLUMN "targetSellPrice";

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "totalCost" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "TransactionItem" ADD COLUMN     "costBasis" DECIMAL(14,2);
