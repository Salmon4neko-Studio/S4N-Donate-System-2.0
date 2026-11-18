-- Append-only event log. Separate from "Donation".
-- sequence is BIGSERIAL and is never reused. Retention is the only delete.

CREATE TABLE "EventLog" (
    "sequence" BIGSERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "donationId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("sequence")
);

CREATE UNIQUE INDEX "EventLog_eventId_key" ON "EventLog"("eventId");

-- One alert per donation id and event type. NULL donationId (chat and other
-- events) stays unrestricted: PostgreSQL unique indexes treat NULLs as distinct.
CREATE UNIQUE INDEX "EventLog_type_donationId_key" ON "EventLog"("type", "donationId");

CREATE INDEX "EventLog_createdAt_idx" ON "EventLog"("createdAt");
CREATE INDEX "EventLog_type_createdAt_idx" ON "EventLog"("type", "createdAt");
