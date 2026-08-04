-- CreateTable
CREATE TABLE "AuditConfig" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "periodicity" VARCHAR(20) NOT NULL,
    "customStartDate" TIMESTAMP,
    "customEndDate" TIMESTAMP,
    "cronExpression" VARCHAR(50) NOT NULL DEFAULT '0 2 * * 1',
    "selectedInstances" JSONB,
    "excludedJids" JSONB,
    "aiProvider" VARCHAR(30) NOT NULL,
    "aiModel" VARCHAR(100) NOT NULL,
    "apiKeyEncrypted" VARCHAR(500),
    "temperature" DOUBLE PRECISION,
    "topP" DOUBLE PRECISION,
    "maxTokens" INTEGER,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "AuditConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactRoleMapping" (
    "id" TEXT NOT NULL,
    "phoneNumber" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100),
    "role" VARCHAR(30) NOT NULL,
    "instanceId" VARCHAR(255),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "ContactRoleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditRecipient" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phoneNumber" VARCHAR(50) NOT NULL,
    "role" VARCHAR(30),
    "triggerCondition" VARCHAR(30) NOT NULL DEFAULT 'ALWAYS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "AuditRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditReport" (
    "id" TEXT NOT NULL,
    "auditConfigId" TEXT,
    "executionDate" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP NOT NULL,
    "periodEnd" TIMESTAMP NOT NULL,
    "instancesAudited" JSONB,
    "overallRiskLevel" VARCHAR(20),
    "executiveSummary" JSONB,
    "occurrencesDetails" JSONB,
    "pdfStorageUrl" VARCHAR(500),
    "status" VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "AuditReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactRoleMapping_phoneNumber_key" ON "ContactRoleMapping"("phoneNumber");

-- CreateIndex
CREATE INDEX "AuditConfig_enabled_idx" ON "AuditConfig"("enabled");

-- CreateIndex
CREATE INDEX "ContactRoleMapping_role_idx" ON "ContactRoleMapping"("role");

-- CreateIndex
CREATE INDEX "ContactRoleMapping_instanceId_idx" ON "ContactRoleMapping"("instanceId");

-- CreateIndex
CREATE INDEX "AuditRecipient_active_idx" ON "AuditRecipient"("active");

-- CreateIndex
CREATE INDEX "AuditReport_auditConfigId_idx" ON "AuditReport"("auditConfigId");

-- CreateIndex
CREATE INDEX "AuditReport_executionDate_idx" ON "AuditReport"("executionDate");

-- CreateIndex
CREATE INDEX "AuditReport_overallRiskLevel_idx" ON "AuditReport"("overallRiskLevel");

-- CreateIndex
CREATE INDEX "AuditReport_status_idx" ON "AuditReport"("status");

-- AddForeignKey
ALTER TABLE "AuditReport" ADD CONSTRAINT "AuditReport_auditConfigId_fkey" FOREIGN KEY ("auditConfigId") REFERENCES "AuditConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
