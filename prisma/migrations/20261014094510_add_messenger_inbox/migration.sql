-- CreateEnum
CREATE TYPE "MessengerDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "MessengerConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pageId" TEXT,
    "pageName" TEXT,
    "pageAccessToken" TEXT,
    "appSecret" TEXT,
    "verifyToken" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessengerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerConversation" (
    "id" TEXT NOT NULL,
    "psid" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "profilePic" TEXT,
    "lastMessageText" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessengerConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessengerDirection" NOT NULL,
    "text" TEXT,
    "imageUrl" TEXT,
    "mid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessengerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessengerConversation_psid_key" ON "MessengerConversation"("psid");

-- CreateIndex
CREATE INDEX "MessengerConversation_lastMessageAt_idx" ON "MessengerConversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessengerMessage_mid_key" ON "MessengerMessage"("mid");

-- CreateIndex
CREATE INDEX "MessengerMessage_conversationId_createdAt_idx" ON "MessengerMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessengerMessage" ADD CONSTRAINT "MessengerMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MessengerConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
