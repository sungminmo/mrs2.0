CREATE TABLE `_asset_code_mapping` (
    `oldId` VARCHAR(20) NOT NULL,
    `temporaryId` VARCHAR(20) NOT NULL,
    `newId` VARCHAR(20) NOT NULL,
    PRIMARY KEY (`oldId`),
    UNIQUE INDEX `_asset_code_mapping_temporaryId_key` (`temporaryId`),
    UNIQUE INDEX `_asset_code_mapping_newId_key` (`newId`)
);

INSERT INTO `_asset_code_mapping` (`oldId`, `temporaryId`, `newId`)
SELECT
    numbered.`oldId`,
    CONCAT('#MRS#', LPAD(ROW_NUMBER() OVER (ORDER BY numbered.`oldId`), 15, '0')),
    CONCAT(numbered.`receivedDate`, '-', LPAD(numbered.`dailySequence`, 4, '0'))
FROM (
    SELECT
        asset.`id` AS `oldId`,
        DATE_FORMAT(COALESCE(receiving.`receivedAt`, asset.`createdAt`), '%y%m%d') AS `receivedDate`,
        ROW_NUMBER() OVER (
            PARTITION BY DATE(COALESCE(receiving.`receivedAt`, asset.`createdAt`))
            ORDER BY asset.`id`
        ) AS `dailySequence`
    FROM `assets` asset
    LEFT JOIN `receivings` receiving ON receiving.`id` = asset.`receivingId`
) numbered;

CREATE TABLE `_asset_migration_guard` (
    `valid` BOOLEAN NOT NULL,
    CONSTRAINT `_asset_migration_guard_check` CHECK (`valid` = true)
);

INSERT INTO `_asset_migration_guard` (`valid`)
SELECT
    COALESCE(MAX(CHAR_LENGTH(`newId`)), 0) <= 11
    AND NOT EXISTS (
        SELECT 1
        FROM `assets`
        WHERE `id` LIKE '#MRS#%'
    )
FROM `_asset_code_mapping`;

ALTER TABLE `asset_images` DROP FOREIGN KEY `asset_images_assetId_fkey`;
ALTER TABLE `asset_changes` DROP FOREIGN KEY `asset_changes_assetId_fkey`;
ALTER TABLE `products` DROP FOREIGN KEY `products_assetId_fkey`;
ALTER TABLE `inspection_items` DROP FOREIGN KEY `inspection_items_assetId_fkey`;

UPDATE `asset_images` child
JOIN `_asset_code_mapping` mapping ON mapping.`oldId` = child.`assetId`
SET child.`assetId` = mapping.`temporaryId`;
UPDATE `asset_changes` child
JOIN `_asset_code_mapping` mapping ON mapping.`oldId` = child.`assetId`
SET child.`assetId` = mapping.`temporaryId`;
UPDATE `products` child
JOIN `_asset_code_mapping` mapping ON mapping.`oldId` = child.`assetId`
SET child.`assetId` = mapping.`temporaryId`;
UPDATE `inspection_items` child
JOIN `_asset_code_mapping` mapping ON mapping.`oldId` = child.`assetId`
SET child.`assetId` = mapping.`temporaryId`;
UPDATE `assets` asset
JOIN `_asset_code_mapping` mapping ON mapping.`oldId` = asset.`id`
SET asset.`id` = mapping.`temporaryId`;

UPDATE `asset_images` child
JOIN `_asset_code_mapping` mapping ON mapping.`temporaryId` = child.`assetId`
SET child.`assetId` = mapping.`newId`;
UPDATE `asset_changes` child
JOIN `_asset_code_mapping` mapping ON mapping.`temporaryId` = child.`assetId`
SET child.`assetId` = mapping.`newId`;
UPDATE `products` child
JOIN `_asset_code_mapping` mapping ON mapping.`temporaryId` = child.`assetId`
SET child.`assetId` = mapping.`newId`;
UPDATE `inspection_items` child
JOIN `_asset_code_mapping` mapping ON mapping.`temporaryId` = child.`assetId`
SET child.`assetId` = mapping.`newId`;
UPDATE `assets` asset
JOIN `_asset_code_mapping` mapping ON mapping.`temporaryId` = asset.`id`
SET asset.`id` = mapping.`newId`;

ALTER TABLE `assets` MODIFY `id` VARCHAR(11) NOT NULL;
ALTER TABLE `asset_images` MODIFY `assetId` VARCHAR(11) NOT NULL;
ALTER TABLE `asset_changes` MODIFY `assetId` VARCHAR(11) NOT NULL;
ALTER TABLE `products` MODIFY `assetId` VARCHAR(11) NOT NULL;
ALTER TABLE `inspection_items` MODIFY `assetId` VARCHAR(11) NULL;

ALTER TABLE `assets`
    ADD CONSTRAINT `assets_code_check` CHECK (`id` REGEXP '^[0-9]{6}-[0-9]{4}$');

ALTER TABLE `asset_images` ADD CONSTRAINT `asset_images_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_changes` ADD CONSTRAINT `asset_changes_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `products` ADD CONSTRAINT `products_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inspection_items` ADD CONSTRAINT `inspection_items_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE `_asset_migration_guard`;
DROP TABLE `_asset_code_mapping`;