-- CreateTable
CREATE TABLE "GradingItem" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "game" TEXT,
    "sku" TEXT,
    "certNumber" TEXT,
    "company" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "listedFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(14,2) NOT NULL,
    "markup" DECIMAL(14,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GradingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradingItem_submissionId_idx" ON "GradingItem"("submissionId");

-- AddForeignKey
ALTER TABLE "GradingItem" ADD CONSTRAINT "GradingItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "GradingSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing order becomes a single-card order so nothing is lost.
INSERT INTO "GradingItem" ("id", "submissionId", "cardName", "sku", "certNumber", "company", "tier", "quantity", "listedFee", "costPrice", "markup", "position")
SELECT 'gi_' || "id", "id", "cardName", "sku", "certNumber", "company", "tier", "quantity", "listedFee", "costPrice", "markup", 0
FROM "GradingSubmission";
