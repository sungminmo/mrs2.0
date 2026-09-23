CREATE TABLE `banners` (
    `id` VARCHAR(80) NOT NULL,
    `desktopImageUrl` LONGTEXT NOT NULL,
    `mobileImageUrl` LONGTEXT NOT NULL,
    `linkUrl` VARCHAR(2048) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `banners_enabled_startsAt_endsAt_idx`(`enabled`, `startsAt`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `banners` (`id`, `desktopImageUrl`, `mobileImageUrl`, `linkUrl`, `enabled`, `startsAt`, `endsAt`, `createdAt`, `updatedAt`)
VALUES
    ('customer-home-hero-01', '/mrs2.0/banner1.jpg', '/mrs2.0/banner1.jpg', NULL, true, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('customer-home-hero-02', '/mrs2.0/banner2.jpg', '/mrs2.0/banner2.jpg', NULL, true, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));