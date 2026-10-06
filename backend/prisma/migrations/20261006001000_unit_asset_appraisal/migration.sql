UPDATE assets
SET appraisal = CASE WHEN quantity > 0 THEN ROUND(appraisal / quantity, 0) ELSE NULL END
WHERE appraisal IS NOT NULL;

UPDATE inspection_items
SET assetBaseline = JSON_SET(assetBaseline, '$.appraisal',
  CASE WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(assetBaseline, '$.quantity')) AS DECIMAL(18,3)) > 0
    AND JSON_TYPE(JSON_EXTRACT(assetBaseline, '$.appraisal')) <> 'NULL'
    THEN CAST(ROUND(CAST(JSON_UNQUOTE(JSON_EXTRACT(assetBaseline, '$.appraisal')) AS DECIMAL(19,0)) /
      CAST(JSON_UNQUOTE(JSON_EXTRACT(assetBaseline, '$.quantity')) AS DECIMAL(18,3)), 0) AS CHAR)
    ELSE NULL END)
WHERE assetBaseline IS NOT NULL;