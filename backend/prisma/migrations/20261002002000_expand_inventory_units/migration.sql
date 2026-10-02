ALTER TABLE `assets`
  MODIFY `unit` ENUM(
    'EA', 'Set', '롤', '봉', '면', 'Box', 'kg', 'ton', 'm', 'm³', '본',
    '켤레', '조', '장', '식', '건', '통', '묶음', '대', '포', '곽', '갑', '기타'
  ) NOT NULL;

ALTER TABLE `inspection_items`
  MODIFY `unit` ENUM(
    'EA', 'Set', '롤', '봉', '면', 'Box', 'kg', 'ton', 'm', 'm³', '본',
    '켤레', '조', '장', '식', '건', '통', '묶음', '대', '포', '곽', '갑', '기타'
  ) NOT NULL;