-- Remove the demo conversations (and their messages, via cascade) before the flag that marked them goes away.
DELETE FROM "MessengerConversation" WHERE "isSimulated" = true;

/*
  Warnings:

  - You are about to drop the column `isSimulated` on the `MessengerConversation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MessengerConversation" DROP COLUMN "isSimulated";
