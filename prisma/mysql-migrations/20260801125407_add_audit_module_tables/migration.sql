-- CreateTable
CREATE TABLE `AuditConfig` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `periodicity` VARCHAR(20) NOT NULL,
    `customStartDate` TIMESTAMP NULL,
    `customEndDate` TIMESTAMP NULL,
    `cronExpression` VARCHAR(50) NOT NULL DEFAULT '0 2 * * 1',
    `selectedInstances` JSON NULL,
    `excludedJids` JSON NULL,
    `aiProvider` VARCHAR(30) NOT NULL,
    `aiModel` VARCHAR(100) NOT NULL,
    `apiKeyEncrypted` VARCHAR(500) NULL,
    `temperature` DOUBLE NULL,
    `topP` DOUBLE NULL,
    `maxTokens` INTEGER NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL,

    INDEX `AuditConfig_enabled_idx`(`enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContactRoleMapping` (
    `id` VARCHAR(191) NOT NULL,
    `phoneNumber` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NULL,
    `role` VARCHAR(30) NOT NULL,
    `instanceId` VARCHAR(255) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL,

    UNIQUE INDEX `ContactRoleMapping_phoneNumber_key`(`phoneNumber`),
    INDEX `ContactRoleMapping_role_idx`(`role`),
    INDEX `ContactRoleMapping_instanceId_idx`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditRecipient` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `phoneNumber` VARCHAR(50) NOT NULL,
    `role` VARCHAR(30) NULL,
    `triggerCondition` VARCHAR(30) NOT NULL DEFAULT 'ALWAYS',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL,

    INDEX `AuditRecipient_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditReport` (
    `id` VARCHAR(191) NOT NULL,
    `auditConfigId` VARCHAR(191) NULL,
    `executionDate` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `periodStart` TIMESTAMP NOT NULL,
    `periodEnd` TIMESTAMP NOT NULL,
    `instancesAudited` JSON NULL,
    `overallRiskLevel` VARCHAR(20) NULL,
    `executiveSummary` JSON NULL,
    `occurrencesDetails` JSON NULL,
    `pdfStorageUrl` VARCHAR(500) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
    `errorMessage` TEXT NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL,

    INDEX `AuditReport_auditConfigId_idx`(`auditConfigId`),
    INDEX `AuditReport_executionDate_idx`(`executionDate`),
    INDEX `AuditReport_overallRiskLevel_idx`(`overallRiskLevel`),
    INDEX `AuditReport_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AuditReport` ADD CONSTRAINT `AuditReport_auditConfigId_fkey` FOREIGN KEY (`auditConfigId`) REFERENCES `AuditConfig`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
