-- CreateTable
CREATE TABLE "AssistantLesson" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantLesson_createdAt_idx" ON "AssistantLesson"("createdAt");
