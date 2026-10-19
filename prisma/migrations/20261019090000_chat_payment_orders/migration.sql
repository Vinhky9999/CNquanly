-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transaction_conversationId_idx" ON "Transaction"("conversationId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MessengerConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

