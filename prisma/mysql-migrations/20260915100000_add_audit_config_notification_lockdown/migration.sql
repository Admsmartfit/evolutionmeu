-- AlterTable
ALTER TABLE `AuditConfig` ADD COLUMN `senderInstanceName` VARCHAR(255) NULL;
ALTER TABLE `AuditConfig` ADD COLUMN `recipientPhoneNumber` VARCHAR(50) NULL;
