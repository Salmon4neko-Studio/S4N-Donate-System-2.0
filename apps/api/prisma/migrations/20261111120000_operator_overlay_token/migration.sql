ALTER TABLE "Operator" ADD COLUMN "overlayTokenHash" TEXT;
ALTER TABLE "Operator" ADD COLUMN "overlayCiphertext" BYTEA;
ALTER TABLE "Operator" ADD COLUMN "overlayIv" BYTEA;
ALTER TABLE "Operator" ADD COLUMN "overlayAuthTag" BYTEA;

CREATE UNIQUE INDEX "Operator_overlayTokenHash_key" ON "Operator"("overlayTokenHash");
