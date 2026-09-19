-- AlterTable
ALTER TABLE "Part" ADD COLUMN     "liveRealWidthCm" DOUBLE PRECISION;

-- Backfill: existing parts keep exactly the size customers see today
UPDATE "Part" SET "liveRealWidthCm" = "realWidthCm";
