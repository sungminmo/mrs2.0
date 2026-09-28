CREATE TABLE `receivings` (
    `id` VARCHAR(20) NOT NULL,
    `customerId` VARCHAR(20) NOT NULL,
    `siteId` VARCHAR(20) NULL,
    `siteName` VARCHAR(120) NOT NULL,
    `managerName` VARCHAR(80) NOT NULL,
    `managerPhone` VARCHAR(30) NOT NULL,
    `channel` ENUM('관리자 등록', '홈페이지', '카카오톡', 'MRS고객포탈', '기타') NOT NULL,
    `volume` ENUM('UNDER_ONE_TON', 'TWO_POINT_FIVE_TONS', 'FIVE_TONS_OR_MORE', 'OTHER') NOT NULL,
    `volumeDescription` VARCHAR(160) NOT NULL DEFAULT '',
    `summary` VARCHAR(500) NOT NULL DEFAULT '',
    `status` ENUM('입고 신청', '입고 승인', '입고 완료', '입고 반려', '취소') NOT NULL DEFAULT '입고 신청',
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `scheduledAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NULL,
    `termsAgreedAt` DATETIME(3) NOT NULL,
    `termsVersion` VARCHAR(80) NOT NULL,
    `termsText` TEXT NOT NULL,
    `transportEstimate` DECIMAL(19, 0) NULL,
    `note` VARCHAR(1000) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `receivings_customerId_requestedAt_idx`(`customerId`, `requestedAt`),
    INDEX `receivings_status_requestedAt_idx`(`status`, `requestedAt`),
    INDEX `receivings_siteId_requestedAt_idx`(`siteId`, `requestedAt`),
    INDEX `receivings_scheduledAt_idx`(`scheduledAt`),
    CONSTRAINT `receivings_transport_estimate_check` CHECK (`transportEstimate` IS NULL OR `transportEstimate` >= 0),
    CONSTRAINT `receivings_received_at_check` CHECK ((`status` = '입고 완료' AND `receivedAt` IS NOT NULL) OR (`status` <> '입고 완료' AND `receivedAt` IS NULL)),
    CONSTRAINT `receivings_terms_check` CHECK (CHAR_LENGTH(TRIM(`termsVersion`)) > 0 AND CHAR_LENGTH(TRIM(`termsText`)) > 0),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `receiving_images` (
    `id` VARCHAR(36) NOT NULL,
    `receivingId` VARCHAR(20) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `url` TEXT NOT NULL,
    `sortOrder` TINYINT UNSIGNED NOT NULL DEFAULT 0,

    UNIQUE INDEX `receiving_images_receivingId_sortOrder_key`(`receivingId`, `sortOrder`),
    CONSTRAINT `receiving_images_limit_check` CHECK (`sortOrder` BETWEEN 0 AND 4),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspections` (
    `id` VARCHAR(20) NOT NULL,
    `receivingId` VARCHAR(20) NOT NULL,
    `status` ENUM('검수 대기', '결과 확인 대기', '검수 종료') NOT NULL DEFAULT '검수 대기',
    `inspectorUserId` VARCHAR(36) NULL,
    `inspectedAt` DATETIME(3) NULL,
    `notifiedAt` DATETIME(3) NULL,
    `notificationChannel` VARCHAR(80) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inspections_receivingId_key`(`receivingId`),
    INDEX `inspections_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `inspections_inspectorUserId_inspectedAt_idx`(`inspectorUserId`, `inspectedAt`),
    CONSTRAINT `inspections_status_check` CHECK (
        (`status` = '검수 대기' AND `inspectedAt` IS NULL AND `acknowledgedAt` IS NULL AND `notifiedAt` IS NULL)
        OR (`status` = '결과 확인 대기' AND `inspectedAt` IS NOT NULL AND `acknowledgedAt` IS NULL)
        OR (`status` = '검수 종료' AND `inspectedAt` IS NOT NULL AND `acknowledgedAt` IS NOT NULL)
    ),
    CONSTRAINT `inspections_notification_check` CHECK (
        (`notifiedAt` IS NULL AND `notificationChannel` IS NULL)
        OR (`notifiedAt` IS NOT NULL AND `notificationChannel` IS NOT NULL AND CHAR_LENGTH(TRIM(`notificationChannel`)) > 0)
    ),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspection_items` (
    `id` VARCHAR(36) NOT NULL,
    `inspectionId` VARCHAR(20) NOT NULL,
    `assetId` VARCHAR(20) NULL,
    `name` VARCHAR(160) NOT NULL,
    `specification` VARCHAR(500) NOT NULL DEFAULT '',
    `grade` ENUM('S', 'A', 'B', 'F') NULL,
    `unit` ENUM('EA', 'Box', 'kg', 'ton', 'm', 'm³', '본') NOT NULL,
    `receivedQuantity` DECIMAL(18, 3) NOT NULL,
    `usableQuantity` DECIMAL(18, 3) NULL,
    `disposalQuantity` DECIMAL(18, 3) NULL,
    `reason` VARCHAR(1000) NOT NULL DEFAULT '',
    `sortOrder` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inspection_items_assetId_key`(`assetId`),
    UNIQUE INDEX `inspection_items_id_inspectionId_key`(`id`, `inspectionId`),
    UNIQUE INDEX `inspection_items_inspectionId_sortOrder_key`(`inspectionId`, `sortOrder`),
    CONSTRAINT `inspection_items_quantities_check` CHECK (`receivedQuantity` > 0 AND (`usableQuantity` IS NULL OR `usableQuantity` >= 0) AND (`disposalQuantity` IS NULL OR `disposalQuantity` >= 0)),
    CONSTRAINT `inspection_items_result_check` CHECK (
        (`grade` IS NULL AND `usableQuantity` IS NULL AND `disposalQuantity` IS NULL)
        OR (`grade` IS NOT NULL AND `usableQuantity` IS NOT NULL AND `disposalQuantity` IS NOT NULL AND `receivedQuantity` = `usableQuantity` + `disposalQuantity`)
    ),
    CONSTRAINT `inspection_items_grade_check` CHECK (`grade` IS NULL OR `grade` <> 'F' OR `usableQuantity` = 0),
    CONSTRAINT `inspection_items_reason_check` CHECK (`disposalQuantity` IS NULL OR `disposalQuantity` = 0 OR CHAR_LENGTH(TRIM(`reason`)) > 0),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspection_item_images` (
    `id` VARCHAR(36) NOT NULL,
    `inspectionItemId` VARCHAR(36) NOT NULL,
    `url` TEXT NOT NULL,
    `caption` VARCHAR(500) NOT NULL DEFAULT '',
    `sortOrder` SMALLINT UNSIGNED NOT NULL DEFAULT 0,

    INDEX `inspection_item_images_inspectionItemId_sortOrder_idx`(`inspectionItemId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `disposals` (
    `inspectionId` VARCHAR(20) NOT NULL,
    `status` ENUM('미처리', '처리 예정', '폐기 완료') NOT NULL DEFAULT '미처리',
    `consentRequired` BOOLEAN NOT NULL DEFAULT true,
    `consentedAt` DATETIME(3) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `evidence` TEXT NULL,
    `costStatus` ENUM('미산정', '예상 비용 안내', '비용 확정', '청구 완료') NOT NULL DEFAULT '미산정',
    `estimate` DECIMAL(19, 0) NULL,
    `amount` DECIMAL(19, 0) NULL,
    `invoiceId` VARCHAR(20) NULL,
    `billedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `disposals_invoiceId_key`(`invoiceId`),
    INDEX `disposals_status_scheduledAt_idx`(`status`, `scheduledAt`),
    INDEX `disposals_costStatus_billedAt_idx`(`costStatus`, `billedAt`),
    CONSTRAINT `disposals_amounts_check` CHECK ((`estimate` IS NULL OR `estimate` >= 0) AND (`amount` IS NULL OR `amount` >= 0)),
    CONSTRAINT `disposals_cost_state_check` CHECK (
        (`costStatus` = '미산정' AND `estimate` IS NULL AND `amount` IS NULL AND `invoiceId` IS NULL AND `billedAt` IS NULL)
        OR (`costStatus` = '예상 비용 안내' AND `estimate` IS NOT NULL AND `amount` IS NULL AND `invoiceId` IS NULL AND `billedAt` IS NULL)
        OR (`costStatus` = '비용 확정' AND `amount` IS NOT NULL AND `invoiceId` IS NULL AND `billedAt` IS NULL)
        OR (`costStatus` = '청구 완료' AND `amount` IS NOT NULL AND `invoiceId` IS NOT NULL AND CHAR_LENGTH(TRIM(`invoiceId`)) > 0 AND `billedAt` IS NOT NULL)
    ),
    CONSTRAINT `disposals_consent_check` CHECK (
        (`consentedAt` IS NULL OR `costStatus` <> '미산정')
        AND (`status` = '미처리' OR `consentRequired` = false OR `consentedAt` IS NOT NULL)
    ),
    CONSTRAINT `disposals_completion_check` CHECK (
        (`status` = '폐기 완료' AND `completedAt` IS NOT NULL AND `evidence` IS NOT NULL AND CHAR_LENGTH(TRIM(`evidence`)) > 0)
        OR (`status` <> '폐기 완료' AND `completedAt` IS NULL)
    ),
    PRIMARY KEY (`inspectionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `disposal_items` (
    `inspectionItemId` VARCHAR(36) NOT NULL,
    `inspectionId` VARCHAR(20) NOT NULL,
    `processedQuantity` DECIMAL(18, 3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `disposal_items_inspectionId_idx`(`inspectionId`),
    UNIQUE INDEX `disposal_items_inspectionItemId_inspectionId_key`(`inspectionItemId`, `inspectionId`),
    CONSTRAINT `disposal_items_processed_check` CHECK (`processedQuantity` IS NULL OR `processedQuantity` >= 0),
    PRIMARY KEY (`inspectionItemId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `disposal_cost_lines` (
    `id` VARCHAR(36) NOT NULL,
    `inspectionId` VARCHAR(20) NOT NULL,
    `label` VARCHAR(160) NOT NULL,
    `amount` DECIMAL(19, 0) NOT NULL,
    `sortOrder` SMALLINT UNSIGNED NOT NULL DEFAULT 0,

    UNIQUE INDEX `disposal_cost_lines_inspectionId_sortOrder_key`(`inspectionId`, `sortOrder`),
    CONSTRAINT `disposal_cost_lines_amount_check` CHECK (`amount` >= 0),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `disposal_comments` (
    `id` VARCHAR(36) NOT NULL,
    `inspectionId` VARCHAR(20) NOT NULL,
    `authorUserId` VARCHAR(36) NULL,
    `text` VARCHAR(2000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `disposal_comments_inspectionId_createdAt_idx`(`inspectionId`, `createdAt`),
    INDEX `disposal_comments_authorUserId_idx`(`authorUserId`),
    CONSTRAINT `disposal_comments_text_check` CHECK (CHAR_LENGTH(TRIM(`text`)) > 0),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `receiving_changes` (
    `id` VARCHAR(36) NOT NULL,
    `receivingId` VARCHAR(20) NOT NULL,
    `stage` ENUM('RECEIVING', 'INSPECTION', 'DISPOSAL') NOT NULL,
    `actorUserId` VARCHAR(36) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `changes` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `receiving_changes_receivingId_stage_createdAt_idx`(`receivingId`, `stage`, `createdAt`),
    INDEX `receiving_changes_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    CONSTRAINT `receiving_changes_reason_check` CHECK (CHAR_LENGTH(TRIM(`reason`)) > 0),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `receiving_images` ADD CONSTRAINT `receiving_images_receivingId_fkey` FOREIGN KEY (`receivingId`) REFERENCES `receivings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inspections` ADD CONSTRAINT `inspections_receivingId_fkey` FOREIGN KEY (`receivingId`) REFERENCES `receivings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inspections` ADD CONSTRAINT `inspections_inspectorUserId_fkey` FOREIGN KEY (`inspectorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `inspection_items` ADD CONSTRAINT `inspection_items_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `inspections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inspection_items` ADD CONSTRAINT `inspection_items_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inspection_item_images` ADD CONSTRAINT `inspection_item_images_inspectionItemId_fkey` FOREIGN KEY (`inspectionItemId`) REFERENCES `inspection_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `disposals` ADD CONSTRAINT `disposals_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `inspections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `disposal_items` ADD CONSTRAINT `disposal_items_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `disposals`(`inspectionId`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `disposal_items` ADD CONSTRAINT `disposal_items_inspectionItemId_inspectionId_fkey` FOREIGN KEY (`inspectionItemId`, `inspectionId`) REFERENCES `inspection_items`(`id`, `inspectionId`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `disposal_cost_lines` ADD CONSTRAINT `disposal_cost_lines_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `disposals`(`inspectionId`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `disposal_comments` ADD CONSTRAINT `disposal_comments_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `disposals`(`inspectionId`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `disposal_comments` ADD CONSTRAINT `disposal_comments_authorUserId_fkey` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `receiving_changes` ADD CONSTRAINT `receiving_changes_receivingId_fkey` FOREIGN KEY (`receivingId`) REFERENCES `receivings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `receiving_changes` ADD CONSTRAINT `receiving_changes_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;