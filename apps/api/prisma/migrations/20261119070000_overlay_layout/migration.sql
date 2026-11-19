-- Shared OBS canvas. Existing operators get a row only after they save.
-- Until then the API uses 1920×1080 and each plugin's manifest default.

CREATE TABLE "OverlayLayout" (
    "operatorId" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 1920,
    "height" INTEGER NOT NULL DEFAULT 1080,
    "slots" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverlayLayout_pkey" PRIMARY KEY ("operatorId")
);

ALTER TABLE "OverlayLayout" ADD CONSTRAINT "OverlayLayout_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
