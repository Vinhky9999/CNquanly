-- AlterEnum
-- A consignment card can now be read from an eBay page the owner opened in his own browser (no API keys needed).
ALTER TYPE "ConsignmentDataSource" ADD VALUE IF NOT EXISTS 'EBAY_PAGE';
