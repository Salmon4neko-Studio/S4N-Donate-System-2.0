-- AlterEnum
ALTER TYPE "DonationStatus" ADD VALUE 'review';

-- AlterTable
ALTER TABLE "Donation" ADD COLUMN "reviewNotice" JSONB;
