CREATE TABLE `_category_code_mapping` (
    `oldId` VARCHAR(20) NOT NULL,
    `temporaryId` VARCHAR(20) NOT NULL,
    `newId` VARCHAR(6) NOT NULL,
    PRIMARY KEY (`oldId`),
    UNIQUE INDEX `_category_code_mapping_temporaryId_key` (`temporaryId`),
    UNIQUE INDEX `_category_code_mapping_newId_key` (`newId`)
);

INSERT INTO `_category_code_mapping` (`oldId`, `temporaryId`, `newId`)
SELECT
    `id`,
    CONCAT('MRS-CAT-', LPAD(ROW_NUMBER() OVER (ORDER BY `sortOrder`, `id`), 6, '0')),
    CONCAT(LPAD(ROW_NUMBER() OVER (ORDER BY `sortOrder`, `id`), 2, '0'), '0000')
FROM `material_categories`
WHERE `parentId` IS NULL;

SET @category_code_offset = (SELECT COUNT(*) FROM `_category_code_mapping`);

INSERT INTO `_category_code_mapping` (`oldId`, `temporaryId`, `newId`)
SELECT
    category.`id`,
    CONCAT('MRS-CAT-', LPAD(@category_code_offset + ROW_NUMBER() OVER (ORDER BY parent_mapping.`newId`, category.`sortOrder`, category.`id`), 6, '0')),
    CONCAT(LEFT(parent_mapping.`newId`, 2), LPAD(ROW_NUMBER() OVER (PARTITION BY category.`parentId` ORDER BY category.`sortOrder`, category.`id`), 2, '0'), '00')
FROM `material_categories` category
JOIN `material_categories` parent ON parent.`id` = category.`parentId` AND parent.`parentId` IS NULL
JOIN `_category_code_mapping` parent_mapping ON parent_mapping.`oldId` = parent.`id`;

SET @category_code_offset = (SELECT COUNT(*) FROM `_category_code_mapping`);

INSERT INTO `_category_code_mapping` (`oldId`, `temporaryId`, `newId`)
SELECT
    category.`id`,
    CONCAT('MRS-CAT-', LPAD(@category_code_offset + ROW_NUMBER() OVER (ORDER BY parent_mapping.`newId`, category.`sortOrder`, category.`id`), 6, '0')),
    CONCAT(LEFT(parent_mapping.`newId`, 4), LPAD(ROW_NUMBER() OVER (PARTITION BY category.`parentId` ORDER BY category.`sortOrder`, category.`id`), 2, '0'))
FROM `material_categories` category
JOIN `material_categories` parent ON parent.`id` = category.`parentId` AND parent.`parentId` IS NOT NULL
JOIN `material_categories` root ON root.`id` = parent.`parentId` AND root.`parentId` IS NULL
JOIN `_category_code_mapping` parent_mapping ON parent_mapping.`oldId` = parent.`id`;

CREATE TABLE `_category_migration_guard` (
    `valid` BOOLEAN NOT NULL,
    CONSTRAINT `_category_migration_guard_check` CHECK (`valid` = true)
);

INSERT INTO `_category_migration_guard` (`valid`)
SELECT (SELECT COUNT(*) FROM `_category_code_mapping`) = (SELECT COUNT(*) FROM `material_categories`);

ALTER TABLE `material_categories` DROP FOREIGN KEY `material_categories_parentId_fkey`;
ALTER TABLE `master_items` DROP FOREIGN KEY `master_items_categoryId_fkey`;
ALTER TABLE `assets` DROP FOREIGN KEY `assets_categoryId_fkey`;
ALTER TABLE `campaigns` DROP FOREIGN KEY `campaigns_categoryId_fkey`;

UPDATE `material_categories` category
JOIN `_category_code_mapping` mapping ON mapping.`oldId` = category.`parentId`
SET category.`parentId` = mapping.`temporaryId`;
UPDATE `master_items` item
JOIN `_category_code_mapping` mapping ON mapping.`oldId` = item.`categoryId`
SET item.`categoryId` = mapping.`temporaryId`;
UPDATE `assets` asset
JOIN `_category_code_mapping` mapping ON mapping.`oldId` = asset.`categoryId`
SET asset.`categoryId` = mapping.`temporaryId`;
UPDATE `campaigns` campaign
JOIN `_category_code_mapping` mapping ON mapping.`oldId` = campaign.`categoryId`
SET campaign.`categoryId` = mapping.`temporaryId`;
UPDATE `material_categories` category
JOIN `_category_code_mapping` mapping ON mapping.`oldId` = category.`id`
SET category.`id` = mapping.`temporaryId`;

UPDATE `material_categories` category
JOIN `_category_code_mapping` mapping ON mapping.`temporaryId` = category.`parentId`
SET category.`parentId` = mapping.`newId`;
UPDATE `master_items` item
JOIN `_category_code_mapping` mapping ON mapping.`temporaryId` = item.`categoryId`
SET item.`categoryId` = mapping.`newId`;
UPDATE `assets` asset
JOIN `_category_code_mapping` mapping ON mapping.`temporaryId` = asset.`categoryId`
SET asset.`categoryId` = mapping.`newId`;
UPDATE `campaigns` campaign
JOIN `_category_code_mapping` mapping ON mapping.`temporaryId` = campaign.`categoryId`
SET campaign.`categoryId` = mapping.`newId`;
UPDATE `material_categories` category
JOIN `_category_code_mapping` mapping ON mapping.`temporaryId` = category.`id`
SET category.`id` = mapping.`newId`;

ALTER TABLE `material_categories`
    MODIFY `id` VARCHAR(6) NOT NULL,
    MODIFY `parentId` VARCHAR(6) NULL;
ALTER TABLE `master_items` MODIFY `categoryId` VARCHAR(6) NOT NULL;
ALTER TABLE `assets` MODIFY `categoryId` VARCHAR(6) NOT NULL;
ALTER TABLE `campaigns` MODIFY `categoryId` VARCHAR(6) NOT NULL;

ALTER TABLE `material_categories`
    ADD CONSTRAINT `material_categories_code_check` CHECK (
        `id` REGEXP '^[0-9]{6}$'
        AND `id` <> '000000'
        AND (
            (`parentId` IS NULL AND RIGHT(`id`, 4) = '0000')
            OR (
                `parentId` IS NOT NULL
                AND `parentId` REGEXP '^[0-9]{6}$'
                AND (
                    (RIGHT(`parentId`, 4) = '0000' AND LEFT(`id`, 2) = LEFT(`parentId`, 2) AND SUBSTRING(`id`, 3, 2) <> '00' AND RIGHT(`id`, 2) = '00')
                    OR (RIGHT(`parentId`, 4) <> '0000' AND RIGHT(`parentId`, 2) = '00' AND LEFT(`id`, 4) = LEFT(`parentId`, 4) AND RIGHT(`id`, 2) <> '00')
                )
            )
        )
    );

ALTER TABLE `material_categories` ADD CONSTRAINT `material_categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `material_categories`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `master_items` ADD CONSTRAINT `master_items_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `material_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `assets` ADD CONSTRAINT `assets_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `material_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `material_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE `_category_migration_guard`;
DROP TABLE `_category_code_mapping`;