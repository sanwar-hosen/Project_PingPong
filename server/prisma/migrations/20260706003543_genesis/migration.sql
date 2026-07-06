-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "subject" TEXT,
    "recipient" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_events" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "approxLocation" TEXT,
    "recipientHint" TEXT,

    CONSTRAINT "open_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "open_events_emailId_idx" ON "open_events"("emailId");

-- CreateIndex
CREATE INDEX "open_events_openedAt_idx" ON "open_events"("openedAt");

-- AddForeignKey
ALTER TABLE "open_events" ADD CONSTRAINT "open_events_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
