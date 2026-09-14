-- AlterTable
ALTER TABLE "SingleCard" ADD COLUMN     "externalCardId" TEXT;

-- CreateIndex
CREATE INDEX "SingleCard_externalCardId_idx" ON "SingleCard"("externalCardId");
