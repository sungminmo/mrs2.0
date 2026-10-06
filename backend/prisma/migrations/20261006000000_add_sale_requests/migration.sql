CREATE TABLE `sale_requests` (
  `id` VARCHAR(36) NOT NULL,
  `assetId` VARCHAR(11) NOT NULL,
  `actorUserId` VARCHAR(36) NOT NULL,
  `quantity` DECIMAL(18,3) NOT NULL,
  `desiredAmount` DECIMAL(19,0) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `inspection` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `sale_requests_assetId_key` (`assetId`),
  INDEX `sale_requests_status_createdAt_idx` (`status`, `createdAt`),
  CONSTRAINT `sale_requests_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `sale_requests_quantity_check` CHECK (`quantity` > 0 AND `quantity` <= 1000000000),
  CONSTRAINT `sale_requests_amount_check` CHECK (`desiredAmount` > 0 AND `desiredAmount` <= 1000000000000),
  CONSTRAINT `sale_requests_status_check` CHECK (`status` IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT `sale_requests_inspection_check` CHECK (`inspection` IN ('PENDING', 'COMPLETED'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;