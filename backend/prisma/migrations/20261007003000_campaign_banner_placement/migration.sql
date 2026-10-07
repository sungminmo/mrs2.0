ALTER TABLE `campaigns`
  ADD COLUMN `placementCode` VARCHAR(3) NOT NULL DEFAULT 'MKT',
  ADD COLUMN `placementName` VARCHAR(120) NOT NULL DEFAULT '고객포탈 마켓 상단 기획전',
  ADD CONSTRAINT `campaigns_placement_code_check` CHECK (CHAR_LENGTH(TRIM(`placementCode`)) = 3),
  ADD CONSTRAINT `campaigns_placement_name_check` CHECK (CHAR_LENGTH(TRIM(`placementName`)) > 0);

CREATE INDEX `campaigns_placementCode_enabled_sortOrder_idx` ON `campaigns` (`placementCode`, `enabled`, `sortOrder`);