CREATE TABLE `material_categories` (
    `id` VARCHAR(20) NOT NULL,
    `parentId` VARCHAR(20) NULL,
    `name` VARCHAR(80) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `material_categories_parentId_sortOrder_idx`(`parentId`, `sortOrder`),
    UNIQUE INDEX `material_categories_parentId_name_key`(`parentId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `master_items` (
    `id` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `categoryId` VARCHAR(20) NOT NULL,
    `specification` VARCHAR(255) NOT NULL,
    `brand` VARCHAR(160) NOT NULL DEFAULT '',
    `unit` ENUM('EA', 'Box', 'kg', 'ton', 'm', 'm³', '본') NOT NULL,
    `inboundPrice` DECIMAL(19, 0) NULL,
    `outboundPrice` DECIMAL(19, 0) NULL,
    `standardPrice` DECIMAL(19, 0) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `note` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `master_items_categoryId_enabled_idx`(`categoryId`, `enabled`),
    UNIQUE INDEX `master_items_name_categoryId_specification_brand_unit_key`(`name`, `categoryId`, `specification`, `brand`, `unit`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `master_item_images` (
    `id` VARCHAR(36) NOT NULL,
    `masterItemId` VARCHAR(20) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `url` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `master_item_images_masterItemId_sortOrder_idx`(`masterItemId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `assets` (
    `id` VARCHAR(20) NOT NULL,
    `itemId` VARCHAR(20) NOT NULL,
    `receivingId` VARCHAR(20) NOT NULL,
    `customerId` VARCHAR(20) NOT NULL,
    `receiptId` VARCHAR(20) NULL,
    `locationId` VARCHAR(20) NULL,
    `categoryId` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `specification` VARCHAR(500) NOT NULL,
    `brand` VARCHAR(160) NOT NULL DEFAULT '',
    `grade` ENUM('S', 'A', 'B', 'F') NOT NULL,
    `quantity` DECIMAL(18, 3) NOT NULL,
    `unit` ENUM('EA', 'Box', 'kg', 'ton', 'm', 'm³', '본') NOT NULL,
    `appraisal` DECIMAL(19, 0) NULL,
    `storageStatus` ENUM('입고대기', '보관중', '출고완료') NOT NULL,
    `saleStatus` ENUM('판매대기', '판매중', '판매완료') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `assets_itemId_idx`(`itemId`),
    INDEX `assets_categoryId_idx`(`categoryId`),
    INDEX `assets_customerId_storageStatus_idx`(`customerId`, `storageStatus`),
    INDEX `assets_receivingId_idx`(`receivingId`),
    INDEX `assets_saleStatus_storageStatus_idx`(`saleStatus`, `storageStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `asset_images` (
    `id` VARCHAR(36) NOT NULL,
    `assetId` VARCHAR(20) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `url` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `asset_images_assetId_sortOrder_idx`(`assetId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `asset_changes` (
    `id` VARCHAR(36) NOT NULL,
    `assetId` VARCHAR(20) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `changes` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `asset_changes_assetId_createdAt_idx`(`assetId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `material_categories` ADD CONSTRAINT `material_categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `material_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `master_items` ADD CONSTRAINT `master_items_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `material_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `master_item_images` ADD CONSTRAINT `master_item_images_masterItemId_fkey` FOREIGN KEY (`masterItemId`) REFERENCES `master_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `assets` ADD CONSTRAINT `assets_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `master_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `assets` ADD CONSTRAINT `assets_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `material_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `asset_images` ADD CONSTRAINT `asset_images_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_changes` ADD CONSTRAINT `asset_changes_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;