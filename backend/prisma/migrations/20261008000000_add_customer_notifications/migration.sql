CREATE TABLE `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customerId` VARCHAR(20) NOT NULL,
  `kind` VARCHAR(60) NOT NULL,
  `sourceKey` VARCHAR(191) NOT NULL,
  `targetType` VARCHAR(20) NOT NULL,
  `targetId` VARCHAR(36) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `resourceCode` VARCHAR(80) NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `notifications_sourceKey_key` (`sourceKey`),
  INDEX `notifications_customerId_createdAt_id_idx` (`customerId`, `createdAt`, `id`),
  CONSTRAINT `notifications_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `notifications_target_check` CHECK (`targetType` IN ('RECEIVING', 'INSPECTION', 'ASSET', 'QUOTE', 'ORDER'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notification_reads` (
  `userId` VARCHAR(36) NOT NULL,
  `notificationId` BIGINT UNSIGNED NOT NULL,
  `readAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`, `notificationId`),
  INDEX `notification_reads_notificationId_idx` (`notificationId`),
  CONSTRAINT `notification_reads_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `notification_reads_notificationId_fkey` FOREIGN KEY (`notificationId`) REFERENCES `notifications` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;