ALTER TABLE `users` ADD COLUMN `customerId` VARCHAR(20) NULL;

CREATE INDEX `users_customerId_idx` ON `users`(`customerId`);
