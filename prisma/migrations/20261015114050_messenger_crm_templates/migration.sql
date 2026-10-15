-- AlterTable
ALTER TABLE "MessengerConversation" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "MessengerTemplate" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '💬',
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessengerTemplate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MessengerConversation" ADD CONSTRAINT "MessengerConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
