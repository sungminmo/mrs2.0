CREATE TABLE `banner_placements` (
    `id` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `banner_items` (
    `id` VARCHAR(36) NOT NULL,
    `placementId` VARCHAR(80) NOT NULL,
    `desktopImageUrl` LONGTEXT NOT NULL,
    `mobileImageUrl` LONGTEXT NOT NULL,
    `linkUrl` VARCHAR(2048) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `banner_items_placementId_sortOrder_idx`(`placementId`, `sortOrder`),
    INDEX `banner_items_enabled_startsAt_endsAt_idx`(`enabled`, `startsAt`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `banner_items` ADD CONSTRAINT `banner_items_placementId_fkey` FOREIGN KEY (`placementId`) REFERENCES `banner_placements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `banner_placements` (`id`, `name`, `enabled`, `createdAt`, `updatedAt`)
VALUES ('customer-home-hero', '고객 홈 메인 배너', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `banner_items` (`id`, `placementId`, `desktopImageUrl`, `mobileImageUrl`, `linkUrl`, `enabled`, `sortOrder`, `startsAt`, `endsAt`, `createdAt`, `updatedAt`)
VALUES
    ('00000000-0000-4000-8000-000000000001', 'customer-home-hero', '/mrs2.0/banner1.jpg', '/mrs2.0/banner1.jpg', NULL, true, 1, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000000002', 'customer-home-hero', '/mrs2.0/banner2.jpg', '/mrs2.0/banner2.jpg', NULL, true, 2, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));