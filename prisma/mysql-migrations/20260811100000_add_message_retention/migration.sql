-- CreateTable
CREATE TABLE `MessageBackupFile` (
    `id` VARCHAR(191) NOT NULL,
    `instanceId` VARCHAR(100) NOT NULL,
    `s3Key` VARCHAR(500) NOT NULL,
    `periodStart` TIMESTAMP NOT NULL,
    `periodEnd` TIMESTAMP NOT NULL,
    `messageCount` INTEGER NOT NULL,
    `mediaPurgedAt` TIMESTAMP NULL,
    `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX `MessageBackupFile_instanceId_idx`(`instanceId`),
    INDEX `MessageBackupFile_periodEnd_mediaPurgedAt_idx`(`periodEnd`, `mediaPurgedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Message_instanceId_messageTimestamp_idx` ON `Message`(`instanceId`, `messageTimestamp`);
