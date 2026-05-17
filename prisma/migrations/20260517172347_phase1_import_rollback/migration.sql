-- AlterEnum
ALTER TYPE "ImportRowStatus" ADD VALUE 'ROLLED_BACK';

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "rolled_back_at" TIMESTAMP(3),
ADD COLUMN     "rolled_back_rows" INTEGER NOT NULL DEFAULT 0;
