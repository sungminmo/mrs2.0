import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

test('asset codes migrate to received-date sequences on isolated MySQL 8.4', { skip: process.env.RUN_ASSET_CODE_SCHEMA_TEST !== '1' }, async (context) => {
  const container = `mrs-asset-code-test-${randomUUID()}`
  const docker = (args: string[], input?: string) => execFileSync('docker', args, {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 180_000,
  }).trim()
  context.after(() => docker(['rm', '--force', '--volumes', container]))
  docker(['run', '--detach', '--name', container, '--env', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', '--env', 'MYSQL_DATABASE=asset_code_test', 'mysql:8.4.11', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci'])
  docker(['exec', container, 'mysqladmin', '--protocol=TCP', '--host=127.0.0.1', '--wait=120', '--connect-timeout=1', 'ping', '--silent'])
  const sql = (statement: string) => docker(['exec', '-i', container, 'mysql', '--default-character-set=utf8mb4', '--database=asset_code_test', '--batch', '--skip-column-names'], statement)
  const reject = (statement: string, expected: RegExp) => assert.throws(
    () => sql(`START TRANSACTION; ${statement}; ROLLBACK;`),
    (error: unknown) => error instanceof Error && 'stderr' in error && expected.test(String(error.stderr)),
  )
  const migrations = new URL('../prisma/migrations/', import.meta.url)
  const assetMigration = '20260929002000_change_asset_code_format'
  const directories = readdirSync(migrations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))
  for (const directory of directories.filter((entry) => entry.name < assetMigration)) {
    const migration = new URL(`${directory.name}/migration.sql`, migrations)
    if (existsSync(migration)) sql(readFileSync(migration, 'utf8'))
  }

  sql(`
    INSERT INTO material_categories (id, name) VALUES ('010000', 'Materials');
    INSERT INTO master_items (id, name, categoryId, specification, brand, unit, note, updatedAt)
    VALUES ('000001', 'Legacy item', '010000', 'Spec', '', 'EA', '', NOW(3));
    INSERT INTO receivings (id, customerId, siteName, managerName, managerPhone, channel, volume, status, receivedAt, termsAgreedAt, termsVersion, termsText, updatedAt) VALUES
      ('RCV-1', 'CUSTOMER-1', 'Site', 'Manager', '010-0000-0000', '관리자 등록', 'UNDER_ONE_TON', '입고 완료', '2026-09-01 10:00:00.000', NOW(3), 'v1', 'Terms', NOW(3));
    INSERT INTO inspections (id, receivingId, updatedAt) VALUES ('INSP-1', 'RCV-1', NOW(3));
    INSERT INTO assets (id, itemId, receivingId, customerId, categoryId, name, specification, brand, grade, quantity, unit, storageStatus, saleStatus, createdAt, updatedAt) VALUES
      ('LEGACY-B', '000001', 'RCV-1', 'CUSTOMER-1', '010000', 'Asset B', 'Spec', '', 'A', 1, 'EA', '보관중', '판매대기', '2026-08-01 00:00:00.000', NOW(3)),
      ('LEGACY-A', '000001', 'RCV-1', 'CUSTOMER-1', '010000', 'Asset A', 'Spec', '', 'A', 1, 'EA', '보관중', '판매대기', '2026-08-02 00:00:00.000', NOW(3)),
      ('LEGACY-C', '000001', 'MISSING-RCV', 'CUSTOMER-1', '010000', 'Asset C', 'Spec', '', 'A', 1, 'EA', '보관중', '판매대기', '2026-09-02 00:00:00.000', NOW(3));
    INSERT INTO asset_images (id, assetId, name, url) VALUES ('IMAGE-A', 'LEGACY-A', 'Image', '/image.jpg');
    INSERT INTO asset_changes (id, assetId, reason, changes) VALUES ('CHANGE-A', 'LEGACY-A', 'Legacy', JSON_OBJECT());
    INSERT INTO products (id, assetId, name, originalUnitPrice, listedQuantity, updatedAt) VALUES ('PRODUCT-A', 'LEGACY-A', 'Product', 1000, 1, NOW(3));
    INSERT INTO inspection_items (id, inspectionId, assetId, name, unit, receivedQuantity, updatedAt) VALUES ('ITEM-A', 'INSP-1', 'LEGACY-A', 'Item', 'EA', 1, NOW(3));
  `)

  const migration = new URL(`${assetMigration}/migration.sql`, migrations)
  sql(readFileSync(migration, 'utf8'))

  await context.test('received date takes priority and sequences reset by date', () => {
    assert.equal(sql("SELECT GROUP_CONCAT(CONCAT(id, ':', name) ORDER BY id SEPARATOR '|') FROM assets"), '260901-0001:Asset A|260901-0002:Asset B|260902-0001:Asset C')
  })

  await context.test('all asset references are preserved', () => {
    assert.equal(sql("SELECT assetId FROM asset_images WHERE id = 'IMAGE-A'"), '260901-0001')
    assert.equal(sql("SELECT assetId FROM asset_changes WHERE id = 'CHANGE-A'"), '260901-0001')
    assert.equal(sql("SELECT assetId FROM products WHERE id = 'PRODUCT-A'"), '260901-0001')
    assert.equal(sql("SELECT assetId FROM inspection_items WHERE id = 'ITEM-A'"), '260901-0001')
  })

  await context.test('format and uniqueness are enforced', () => {
    reject("INSERT INTO assets (id, itemId, receivingId, customerId, categoryId, name, specification, brand, grade, quantity, unit, storageStatus, saleStatus, updatedAt) VALUES ('260901_0001', '000001', 'RCV-X', 'CUSTOMER-1', '010000', 'Invalid', 'Spec', '', 'A', 1, 'EA', '보관중', '판매대기', NOW(3))", /assets_code_check/)
    reject("UPDATE assets SET id = '260901-0001' WHERE id = '260902-0001'", /Duplicate entry/)
  })

  await context.test('asset reference columns are eleven characters', () => {
    assert.equal(sql("SELECT GROUP_CONCAT(CONCAT(TABLE_NAME, '.', COLUMN_NAME, ':', CHARACTER_MAXIMUM_LENGTH) ORDER BY TABLE_NAME, COLUMN_NAME SEPARATOR '|') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'assets' AND COLUMN_NAME = 'id') OR (TABLE_NAME IN ('asset_images', 'asset_changes', 'products', 'inspection_items') AND COLUMN_NAME = 'assetId'))"), 'asset_changes.assetId:11|asset_images.assetId:11|assets.id:11|inspection_items.assetId:11|products.assetId:11')
  })
})