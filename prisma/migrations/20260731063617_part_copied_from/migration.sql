-- AlterTable
ALTER TABLE "Part" ADD COLUMN     "copiedFromPartId" TEXT;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_copiedFromPartId_fkey" FOREIGN KEY ("copiedFromPartId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;
