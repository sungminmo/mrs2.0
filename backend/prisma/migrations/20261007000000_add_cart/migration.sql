CREATE TABLE `carts` (
  `id` VARCHAR(36) NOT NULL, `userId` VARCHAR(36) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `carts_userId_key` (`userId`),
  CONSTRAINT `carts_version_check` CHECK (`version` >= 0),
  CONSTRAINT `carts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `cart_items` (
  `id` VARCHAR(36) NOT NULL, `cartId` VARCHAR(36) NOT NULL, `productId` VARCHAR(20) NOT NULL,
  `quantity` DECIMAL(18,3) NOT NULL, `version` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `cart_items_cartId_productId_key` (`cartId`, `productId`),
  CONSTRAINT `cart_items_quantity_check` CHECK (`quantity` > 0 AND `quantity` <= 1000000000),
  CONSTRAINT `cart_items_version_check` CHECK (`version` >= 0),
  CONSTRAINT `cart_items_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `carts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cart_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `cart_operations` (
  `id` VARCHAR(36) NOT NULL, `cartId` VARCHAR(36) NOT NULL, `payloadHash` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `cart_operations_cartId_idx` (`cartId`),
  CONSTRAINT `cart_operations_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `carts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;