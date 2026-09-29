CREATE TABLE `_master_item_code_mapping` (
    `oldId` VARCHAR(20) NOT NULL,
    `temporaryId` VARCHAR(20) NOT NULL,
    `newId` VARCHAR(6) NOT NULL,
    PRIMARY KEY (`oldId`),
    UNIQUE INDEX `_master_item_code_mapping_temporaryId_key` (`temporaryId`),
    UNIQUE INDEX `_master_item_code_mapping_newId_key` (`newId`)
);

INSERT INTO `_master_item_code_mapping` (`oldId`, `temporaryId`, `newId`)
SELECT
    `id`,
    CONCAT('MRS-ITEM-', LPAD(ROW_NUMBER() OVER (ORDER BY `id`), 6, '0')),
    LPAD(ROW_NUMBER() OVER (ORDER BY `id`), 6, '0')
FROM `master_items`;

CREATE TABLE `_master_item_migration_guard` (
    `valid` BOOLEAN NOT NULL,
    CONSTRAINT `_master_item_migration_guard_check` CHECK (`valid` = true)
);

INSERT INTO `_master_item_migration_guard` (`valid`)
SELECT COUNT(*) <= 999999 FROM `_master_item_code_mapping`;

ALTER TABLE `master_item_images` DROP FOREIGN KEY `master_item_images_masterItemId_fkey`;
ALTER TABLE `assets` DROP FOREIGN KEY `assets_itemId_fkey`;

UPDATE `master_item_images` image
JOIN `_master_item_code_mapping` mapping ON mapping.`oldId` = image.`masterItemId`
SET image.`masterItemId` = mapping.`temporaryId`;
UPDATE `assets` asset
JOIN `_master_item_code_mapping` mapping ON mapping.`oldId` = asset.`itemId`
SET asset.`itemId` = mapping.`temporaryId`;
UPDATE `master_items` item
JOIN `_master_item_code_mapping` mapping ON mapping.`oldId` = item.`id`
SET item.`id` = mapping.`temporaryId`;

UPDATE `master_item_images` image
JOIN `_master_item_code_mapping` mapping ON mapping.`temporaryId` = image.`masterItemId`
SET image.`masterItemId` = mapping.`newId`;
UPDATE `assets` asset
JOIN `_master_item_code_mapping` mapping ON mapping.`temporaryId` = asset.`itemId`
SET asset.`itemId` = mapping.`newId`;
UPDATE `master_items` item
JOIN `_master_item_code_mapping` mapping ON mapping.`temporaryId` = item.`id`
SET item.`id` = mapping.`newId`;

ALTER TABLE `master_items` MODIFY `id` VARCHAR(6) NOT NULL;
ALTER TABLE `master_item_images` MODIFY `masterItemId` VARCHAR(6) NOT NULL;
ALTER TABLE `assets` MODIFY `itemId` VARCHAR(6) NOT NULL;

ALTER TABLE `master_items`
    ADD CONSTRAINT `master_items_code_check` CHECK (`id` REGEXP '^[0-9]{6}$');

ALTER TABLE `master_item_images` ADD CONSTRAINT `master_item_images_masterItemId_fkey` FOREIGN KEY (`masterItemId`) REFERENCES `master_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `assets` ADD CONSTRAINT `assets_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `master_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE `_master_item_migration_guard`;
DROP TABLE `_master_item_code_mapping`;