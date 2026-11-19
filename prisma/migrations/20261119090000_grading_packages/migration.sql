-- CreateTable
CREATE TABLE "GradingPackage" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "estimate" TEXT NOT NULL DEFAULT '',
    "priceUsd" DECIMAL(10,2),
    "costPrice" DECIMAL(14,2) NOT NULL,
    "servicePrice" DECIMAL(14,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradingPackage_company_tier_key" ON "GradingPackage"("company", "tier");

-- Starting price list (giá gốc = giá USD x 26.000 đ). Owner edits it from the "Gói chấm" button; existing rows are kept.
INSERT INTO "GradingPackage" ("id", "company", "tier", "estimate", "priceUsd", "costPrice", "servicePrice", "position", "updatedAt") VALUES
  ('gpkg_psa_value',          'PSA', 'Value',         '4-5', 65,  1690000,  2080000,  1, CURRENT_TIMESTAMP),
  ('gpkg_psa_standard',       'PSA', 'Standard',      '3-4', 85,  2210000,  2600000,  2, CURRENT_TIMESTAMP),
  ('gpkg_psa_priority',       'PSA', 'Priority',      '2-3', 105, 2730000,  3250000,  3, CURRENT_TIMESTAMP),
  ('gpkg_psa_express',        'PSA', 'Express',       '1-2', 235, 6110000,  6500000,  4, CURRENT_TIMESTAMP),
  ('gpkg_psa_super_express',  'PSA', 'Super Express', '<1',  400, 10400000, 13000000, 5, CURRENT_TIMESTAMP),
  ('gpkg_bgs_express',        'BGS', 'Express',       '<1',  130, 3380000,  4500000,  6, CURRENT_TIMESTAMP),
  ('gpkg_bgs_priority',       'BGS', 'Priority',      '<0.5', 200, 5200000, 6500000,  7, CURRENT_TIMESTAMP)
ON CONFLICT ("company", "tier") DO NOTHING;
