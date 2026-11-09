-- CreateTable
CREATE TABLE "AssistantNote" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "content" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantNote_pkey" PRIMARY KEY ("id")
);

