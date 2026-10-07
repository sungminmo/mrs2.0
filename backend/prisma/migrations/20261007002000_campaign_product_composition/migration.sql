UPDATE `campaigns` SET `enabled` = false;

ALTER TABLE `campaigns` DROP FOREIGN KEY `campaigns_categoryId_fkey`;
DROP INDEX `campaigns_categoryId_idx` ON `campaigns`;
ALTER TABLE `campaigns` DROP COLUMN `categoryId`, ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_version_check` CHECK (`version` >= 0);

CREATE TABLE `campaign_products` (
  `campaignId` VARCHAR(20) NOT NULL,
  `productId` VARCHAR(20) NOT NULL,
  `sortOrder` SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (`campaignId`, `productId`),
  UNIQUE INDEX `campaign_products_campaignId_sortOrder_key` (`campaignId`, `sortOrder`),
  INDEX `campaign_products_productId_idx` (`productId`),
  CONSTRAINT `campaign_products_order_check` CHECK (`sortOrder` < 100),
  CONSTRAINT `campaign_products_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `campaign_products_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;