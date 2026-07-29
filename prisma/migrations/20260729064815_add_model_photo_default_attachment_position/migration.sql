-- AlterTable
ALTER TABLE "ModelBasePhoto" ADD COLUMN     "defaultAttachmentXPercent" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "defaultAttachmentYPercent" DOUBLE PRECISION NOT NULL DEFAULT 25;
