-- CreateTable
CREATE TABLE "MessageBackupFile" (
    "id" TEXT NOT NULL,
    "instanceId" VARCHAR(100) NOT NULL,
    "s3Key" VARCHAR(500) NOT NULL,
    "periodStart" TIMESTAMP NOT NULL,
    "periodEnd" TIMESTAMP NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "mediaPurgedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageBackupFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageBackupFile_instanceId_idx" ON "MessageBackupFile"("instanceId");

-- CreateIndex
CREATE INDEX "MessageBackupFile_periodEnd_mediaPurgedAt_idx" ON "MessageBackupFile"("periodEnd", "mediaPurgedAt");

-- CreateIndex
CREATE INDEX "Message_instanceId_messageTimestamp_idx" ON "Message"("instanceId", "messageTimestamp");
