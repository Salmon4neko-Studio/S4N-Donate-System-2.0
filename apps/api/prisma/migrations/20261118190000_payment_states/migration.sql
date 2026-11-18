-- AlterEnum
ALTER TYPE "DonationStatus" ADD VALUE 'awaiting';
ALTER TYPE "DonationStatus" ADD VALUE 'expired';

-- AlterTable
ALTER TABLE "Donation" ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "bankCode" TEXT,
ADD COLUMN "payCode" TEXT,
ADD COLUMN "barcode1" TEXT,
ADD COLUMN "barcode2" TEXT,
ADD COLUMN "barcode3" TEXT,
ADD COLUMN "paymentType" TEXT;

-- CreateIndex
CREATE INDEX "Donation_status_expiresAt_idx" ON "Donation"("status", "expiresAt");
