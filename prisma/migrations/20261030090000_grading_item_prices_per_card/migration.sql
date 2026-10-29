-- Grading card lines now hold the price of ONE card (the order totals are price x quantity).
-- Existing lines stored the total of the whole line, so divide them by the quantity.
-- Order-level columns on "GradingSubmission" already hold the correct totals and are left as they are.
UPDATE "GradingItem"
SET "listedFee" = "listedFee" / "quantity",
    "costPrice" = "costPrice" / "quantity",
    "shipFee"   = "shipFee"   / "quantity",
    "markup"    = "markup"    / "quantity"
WHERE "quantity" > 1;
