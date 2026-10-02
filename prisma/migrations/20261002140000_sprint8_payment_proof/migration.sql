ALTER TABLE "Payment"
  ADD COLUMN "proofImageUrl" TEXT,
  ADD COLUMN "proofStoragePath" TEXT,
  ADD COLUMN "proofSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewNote" TEXT;
