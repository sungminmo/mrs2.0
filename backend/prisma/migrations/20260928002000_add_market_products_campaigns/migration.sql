CREATE TABLE `products` (
    `id` VARCHAR(20) NOT NULL,
    `assetId` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `originalUnitPrice` DECIMAL(19, 0) NOT NULL,
    `discountRate` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `listedQuantity` DECIMAL(18, 3) NOT NULL,
    `reservedQuantity` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `soldQuantity` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `minimumOrderQuantity` DECIMAL(18, 3) NOT NULL DEFAULT 1,
    `deliveryNotice` VARCHAR(1000) NOT NULL DEFAULT '',
    `status` ENUM('판매대기', '판매중', '재고없음') NOT NULL DEFAULT '판매대기',
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_assetId_key`(`assetId`),
    INDEX `products_status_createdAt_idx`(`status`, `createdAt`),
    CONSTRAINT `products_discountRate_check` CHECK (`discountRate` BETWEEN 0 AND 100),
    CONSTRAINT `products_quantities_nonnegative_check` CHECK (`listedQuantity` >= 0 AND `reservedQuantity` >= 0 AND `soldQuantity` >= 0),
    CONSTRAINT `products_quantity_balance_check` CHECK (`reservedQuantity` + `soldQuantity` <= `listedQuantity`),
    CONSTRAINT `products_minimumOrderQuantity_check` CHECK (`minimumOrderQuantity` > 0 AND `minimumOrderQuantity` <= `listedQuantity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `campaigns` (
    `id` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `categoryId` VARCHAR(20) NOT NULL,
    `description` VARCHAR(1000) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `campaigns_enabled_startsAt_endsAt_sortOrder_idx`(`enabled`, `startsAt`, `endsAt`, `sortOrder`),
    INDEX `campaigns_categoryId_idx`(`categoryId`),
    CONSTRAINT `campaigns_period_check` CHECK (`startsAt` < `endsAt`),
    CONSTRAINT `campaigns_sortOrder_check` CHECK (`sortOrder` <= 9999),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `market_changes` (
    `id` VARCHAR(36) NOT NULL,
    `entityType` ENUM('PRODUCT', 'CAMPAIGN') NOT NULL,
    `entityId` VARCHAR(20) NOT NULL,
    `actorUserId` VARCHAR(36) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `changes` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `market_changes_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
    INDEX `market_changes_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `products` ADD CONSTRAINT `products_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `material_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `market_changes` ADD CONSTRAINT `market_changes_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
