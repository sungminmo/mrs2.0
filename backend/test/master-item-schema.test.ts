import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

test('master item codes migrate to editable unique six-digit values on isolated MySQL 8.4', { skip: process.env.RUN_MASTER_ITEM_SCHEMA_TEST !== '1' }, async (context) => {
  const container = `mrs-master-item-test-${randomUUID()}`
  const docker = (args: string[], input?: string) => execFileSync('docker', args, {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 180_000,
  }).trim()
  context.after(() => docker(['rm', '--force', '--volumes', container]))
  docker(['run', '--detach', '--name', container, '--env', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', '--env', 'MYSQL_DATABASE=master_item_test', 'mysql:8.4.11', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci'])
  docker(['exec', container, 'mysqladmin', '--protocol=TCP', '--host=127.0.0.1', '--wait=120', '--connect-timeout=1', 'ping', '--silent'])
  const sql = (statement: string) => docker(['exec', '-i', container, 'mysql', '--default-character-set=utf8mb4', '--database=master_item_test', '--batch', '--skip-column-names'], statement)
  const reject = (statement: string, expected: RegExp) => assert.throws(
    () => sql(`START TRANSACTION; ${statement}; ROLLBACK;`),
    (error: unknown) => error instanceof Error && 'stderr' in error && expected.test(String(error.stderr)),
  )
  const migrations = new URL('../prisma/migrations/', import.meta.url)
  const itemMigration = '20260929001000_change_master_item_code_format'
  const directories = readdirSync(migrations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))
  for (const directory of directories.filter((entry) => entry.name < itemMigration)) {
    const migration = new URL(`${directory.name}/migration.sql`, migrations)
    if (existsSync(migration)) sql(readFileSync(migration, 'utf8'))
  }

  sql(`
    INSERT INTO material_categories (id, name) VALUES ('010000', 'Materials');
    INSERT INTO master_items (id, name, categoryId, specification, brand, unit, note, updatedAt) VALUES
      ('ITM-B', 'Legacy B', '010000', 'Spec B', '', 'EA', '', NOW(3)),
      ('ITM-A', 'Legacy A', '010000', 'Spec A', '', 'EA', '', NOW(3));
    INSERT INTO master_item_images (id, masterItemId, name, url, sortOrder)
    VALUES ('IMAGE-ITEM-A', 'ITM-A', 'Legacy image', '/item-a.jpg', 0);
    INSERT INTO assets (id, itemId, receivingId, customerId, categoryId, name, specification, brand, grade, quantity, unit, storageStatus, saleStatus, updatedAt)
    VALUES ('ASSET-ITEM-A', 'ITM-A', 'RECEIVING-ITEM', 'CUSTOMER-ITEM', '010000', 'Legacy asset', 'Spec A', '', 'A', 1, 'EA', '보관중', '판매대기', NOW(3));
  `)

  const migration = new URL(`${itemMigration}/migration.sql`, migrations)
  sql(readFileSync(migration, 'utf8'))

  await context.test('existing items are renumbered deterministically', () => {
    assert.equal(sql("SELECT GROUP_CONCAT(CONCAT(id, ':', name) ORDER BY id SEPARATOR '|') FROM master_items"), '000001:Legacy A|000002:Legacy B')
  })

  await context.test('images and assets preserve their item references', () => {
    assert.equal(sql("SELECT masterItemId FROM master_item_images WHERE id = 'IMAGE-ITEM-A'"), '000001')
    assert.equal(sql("SELECT itemId FROM assets WHERE id = 'ASSET-ITEM-A'"), '000001')
  })

  await context.test('administrators can change a code and references cascade', () => {
    sql("UPDATE master_items SET id = '123456' WHERE id = '000001'")
    assert.equal(sql("SELECT masterItemId FROM master_item_images WHERE id = 'IMAGE-ITEM-A'"), '123456')
    assert.equal(sql("SELECT itemId FROM assets WHERE id = 'ASSET-ITEM-A'"), '123456')
  })

  await context.test('format and uniqueness are enforced', () => {
    reject("INSERT INTO master_items (id, name, categoryId, specification, brand, unit, note, updatedAt) VALUES ('ABC123', 'Invalid', '010000', 'Spec', '', 'EA', '', NOW(3))", /master_items_code_check/)
    reject("INSERT INTO master_items (id, name, categoryId, specification, brand, unit, note, updatedAt) VALUES ('12345', 'Invalid', '010000', 'Spec', '', 'EA', '', NOW(3))", /master_items_code_check/)
    reject("UPDATE master_items SET id = '123456' WHERE id = '000002'", /Duplicate entry/)
  })

  await context.test('item reference columns are six characters', () => {
    assert.equal(sql("SELECT GROUP_CONCAT(CONCAT(TABLE_NAME, '.', COLUMN_NAME, ':', CHARACTER_MAXIMUM_LENGTH) ORDER BY TABLE_NAME, COLUMN_NAME SEPARATOR '|') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'master_items' AND COLUMN_NAME = 'id') OR (TABLE_NAME = 'master_item_images' AND COLUMN_NAME = 'masterItemId') OR (TABLE_NAME = 'assets' AND COLUMN_NAME = 'itemId'))"), 'assets.itemId:6|master_item_images.masterItemId:6|master_items.id:6')
  })
})