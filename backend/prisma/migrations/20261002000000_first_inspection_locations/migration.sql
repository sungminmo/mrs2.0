CREATE TABLE `locations` (
  `id` VARCHAR(20) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `zone` VARCHAR(80) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `version` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `locations_name_key` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
UPDATE `assets` SET `locationId` = NULL WHERE `locationId` = '';
INSERT INTO `locations` (`id`,`name`,`zone`,`enabled`,`updatedAt`)
SELECT DISTINCT `locationId`,`locationId`,'미분류',false,NOW(3) FROM `assets` WHERE `locationId` IS NOT NULL;
ALTER TABLE `assets` MODIFY `itemId` VARCHAR(6) NULL;
ALTER TABLE `assets` ADD CONSTRAINT `assets_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `locations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inspections` ADD `version` INTEGER NOT NULL DEFAULT 0, ADD `draftData` JSON NULL;
ALTER TABLE `inspection_items` ADD `itemId` VARCHAR(6) NULL, ADD `categoryId` VARCHAR(6) NULL,
  ADD `brand` VARCHAR(160) NOT NULL DEFAULT '', ADD `locationId` VARCHAR(20) NULL, ADD `assetBaseline` JSON NULL;
UPDATE `inspection_items` i JOIN `assets` a ON a.id=i.assetId
SET i.itemId=a.itemId,i.categoryId=a.categoryId,i.brand=a.brand,i.locationId=a.locationId;
CREATE TABLE `asset_sequences` (
  `dateCode` VARCHAR(6) NOT NULL,
  `last` INTEGER NOT NULL,
  PRIMARY KEY (`dateCode`),
  CONSTRAINT `asset_sequences_range_check` CHECK (`last` BETWEEN 0 AND 9999)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `asset_sequences` (`dateCode`,`last`)
SELECT LEFT(id,6), MAX(CAST(RIGHT(id,4) AS UNSIGNED)) FROM `assets`
WHERE id REGEXP '^[0-9]{6}-[0-9]{4}$' GROUP BY LEFT(id,6);
ALTER TABLE `disposals` DROP CHECK `disposals_consent_check`;
ALTER TABLE `disposals` ADD CONSTRAINT `disposals_consent_check` CHECK
  (`status` = '미처리' OR `consentRequired` = false OR `consentedAt` IS NOT NULL);