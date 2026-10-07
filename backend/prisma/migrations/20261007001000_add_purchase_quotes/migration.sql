

-- CreateTable
CREATE TABLE `purchase_quotes` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `customerId` VARCHAR(20) NOT NULL,
    `actorUserId` VARCHAR(36) NOT NULL,
    `status` ENUM('RECEIVED') NOT NULL DEFAULT 'RECEIVED',
    `operationId` VARCHAR(36) NOT NULL,
    `payloadHash` CHAR(64) NOT NULL,
    `company` VARCHAR(160) NOT NULL,
    `contactName` VARCHAR(80) NOT NULL,
    `phone` VARCHAR(40) NOT NULL,
    `email` VARCHAR(254) NOT NULL DEFAULT '',
    `address` VARCHAR(300) NOT NULL DEFAULT '',
    `deliveryDate` DATE NULL,
    `note` VARCHAR(1000) NOT NULL DEFAULT '',
    `originalTotal` DECIMAL(24, 0) NOT NULL,
    `total` DECIMAL(24, 0) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `purchase_quotes_code_key`(`code`),
    UNIQUE INDEX `purchase_quotes_operationId_key`(`operationId`),
    INDEX `purchase_quotes_customerId_createdAt_id_idx`(`customerId`, `createdAt`, `id`),
    INDEX `purchase_quotes_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- CreateTable
CREATE TABLE `purchase_quote_items` (
    `id` VARCHAR(36) NOT NULL,
    `quoteId` VARCHAR(36) NOT NULL,
    `productId` VARCHAR(20) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `category` VARCHAR(500) NOT NULL,
    `grade` VARCHAR(10) NOT NULL,
    `unit` VARCHAR(20) NOT NULL,
    `specification` VARCHAR(500) NOT NULL,
    `brand` VARCHAR(160) NOT NULL,
    `imageUrl` TEXT NULL,
    `quantity` DECIMAL(18, 3) NOT NULL,
    `originalUnitPrice` DECIMAL(19, 0) NOT NULL,
    `discountRate` INTEGER NOT NULL,
    `unitPrice` DECIMAL(19, 0) NOT NULL,
    `originalTotal` DECIMAL(24, 0) NOT NULL,
    `total` DECIMAL(24, 0) NOT NULL,

    UNIQUE INDEX `purchase_quote_items_quoteId_productId_key`(`quoteId`, `productId`),
    UNIQUE INDEX `purchase_quote_items_quoteId_sortOrder_key`(`quoteId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- AddForeignKey
ALTER TABLE `purchase_quotes` ADD CONSTRAINT `purchase_quotes_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE `purchase_quotes` ADD CONSTRAINT `purchase_quotes_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE `purchase_quote_items` ADD CONSTRAINT `purchase_quote_items_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `purchase_quotes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE `purchase_quote_items` ADD CONSTRAINT `purchase_quote_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `purchase_quotes` ADD CONSTRAINT `purchase_quotes_amount_check` CHECK (`total` >= 0 AND `originalTotal` >= `total`);
ALTER TABLE `purchase_quote_items` ADD CONSTRAINT `purchase_quote_items_quantity_check` CHECK (`quantity` > 0 AND `quantity` <= 1000000000), ADD CONSTRAINT `purchase_quote_items_amount_check` CHECK (`unitPrice` >= 0 AND `originalUnitPrice` >= `unitPrice` AND `total` >= 0 AND `originalTotal` >= `total` AND `discountRate` BETWEEN 0 AND 100 AND `sortOrder` >= 0);
