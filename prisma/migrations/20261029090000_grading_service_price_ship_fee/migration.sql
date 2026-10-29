-- AlterTable
ALTER TABLE "GradingItem" ADD COLUMN     "shipFee" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GradingSubmission" ADD COLUMN     "shipFee" DECIMAL(14,2) NOT NULL DEFAULT 0;


-- "Phí niêm yết hãng" becomes "Giá dịch vụ" (what the customer pays). Existing orders keep their totals:
-- the service price of a line is what the customer was charged before (giá gốc + lãi), with no ship fee.
UPDATE "GradingItem" SET "listedFee" = "costPrice" + "markup";
UPDATE "GradingSubmission" SET "listedFee" = "chargeAmount";
