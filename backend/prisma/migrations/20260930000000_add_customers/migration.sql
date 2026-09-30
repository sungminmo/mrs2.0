CREATE TABLE `customers` (
  `id` VARCHAR(20) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `businessNumber` VARCHAR(10) NULL,
  `representativeName` VARCHAR(80) NOT NULL DEFAULT '',
  `address` VARCHAR(500) NOT NULL DEFAULT '',
  `phone` VARCHAR(30) NOT NULL DEFAULT '',
  `status` ENUM('PENDING', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'PENDING',
  `accessVersion` INTEGER NOT NULL DEFAULT 0,
  `version` INTEGER NOT NULL DEFAULT 0,
  `approvedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customers_businessNumber_key` (`businessNumber`),
  INDEX `customers_status_name_idx` (`status`, `name`),
  CONSTRAINT `customers_active_identity_check` CHECK (`status` <> 'ACTIVE' OR (`businessNumber` IS NOT NULL AND `businessNumber` REGEXP '^[0-9]{10}$' AND CHAR_LENGTH(TRIM(`representativeName`)) > 0 AND CHAR_LENGTH(TRIM(`address`)) > 0 AND CHAR_LENGTH(TRIM(`phone`)) > 0))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `customers` (`id`, `name`, `status`, `updatedAt`)
SELECT `customerId`, `customerId`, 'PENDING', CURRENT_TIMESTAMP(3) FROM (
  SELECT `customerId` FROM `users` WHERE `customerId` IS NOT NULL
  UNION SELECT `customerId` FROM `assets`
  UNION SELECT `customerId` FROM `receivings`
) AS legacy_customers;

ALTER TABLE `users`
  ADD COLUMN `customerRole` ENUM('VIEWER', 'MANAGER') NOT NULL DEFAULT 'VIEWER',
  ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT `users_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `assets` ADD CONSTRAINT `assets_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `receivings` ADD CONSTRAINT `receivings_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE `users` SET `status` = 'PENDING', `approvedAt` = NULL, `sessionVersion` = `sessionVersion` + 1
WHERE `role` = 'CUSTOMER' AND `status` = 'ACTIVE';

CREATE TABLE `customer_applications` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `customerId` VARCHAR(20) NULL,
  `name` VARCHAR(160) NOT NULL,
  `businessNumber` VARCHAR(10) NOT NULL,
  `representativeName` VARCHAR(80) NOT NULL,
  `address` VARCHAR(500) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewReason` VARCHAR(500) NOT NULL DEFAULT '',
  `reviewedAt` DATETIME(3) NULL,
  `version` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_applications_userId_key` (`userId`),
  INDEX `customer_applications_status_createdAt_idx` (`status`, `createdAt`),
  INDEX `customer_applications_businessNumber_idx` (`businessNumber`),
  CONSTRAINT `customer_applications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_applications_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_changes` (
  `id` VARCHAR(36) NOT NULL,
  `customerId` VARCHAR(20) NULL,
  `actorUserId` VARCHAR(36) NOT NULL,
  `targetUserId` VARCHAR(36) NULL,
  `action` VARCHAR(80) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `changes` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `customer_changes_customerId_createdAt_idx` (`customerId`, `createdAt`),
  INDEX `customer_changes_targetUserId_createdAt_idx` (`targetUserId`, `createdAt`),
  CONSTRAINT `customer_changes_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_changes_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_changes_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_rate_limits` (
  `key` VARCHAR(64) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 1,
  `expiresAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`),
  INDEX `customer_rate_limits_expiresAt_idx` (`expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;