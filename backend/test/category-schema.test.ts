import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

test('category codes migrate to hierarchical six-digit values on isolated MySQL 8.4', { skip: process.env.RUN_CATEGORY_SCHEMA_TEST !== '1' }, async (context) => {
  const container = `mrs-category-test-${randomUUID()}`
  const docker = (args: string[], input?: string) => execFileSync('docker', args, {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 180_000,
  }).trim()
  context.after(() => docker(['rm', '--force', '--volumes', container]))
  docker(['run', '--detach', '--name', container, '--env', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', '--env', 'MYSQL_DATABASE=category_test', 'mysql:8.4.11', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci'])
  docker(['exec', container, 'mysqladmin', '--protocol=TCP', '--host=127.0.0.1', '--wait=120', '--connect-timeout=1', 'ping', '--silent'])
  const sql = (statement: string) => docker(['exec', '-i', container, 'mysql', '--default-character-set=utf8mb4', '--database=category_test', '--batch', '--skip-column-names'], statement)
  const reject = (statement: string, constraint: RegExp) => assert.throws(
    () => sql(`START TRANSACTION; ${statement}; ROLLBACK;`),
    (error: unknown) => error instanceof Error && 'stderr' in error && constraint.test(String(error.stderr)),
  )
  const migrations = new URL('../prisma/migrations/', import.meta.url)
  const categoryMigration = '20260929000000_change_category_code_format'
  const directories = readdirSync(migrations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))
  for (const directory of directories.filter((entry) => entry.name < categoryMigration)) {
    const migration = new URL(`${directory.name}/migration.sql`, migrations)
    if (existsSync(migration)) sql(readFileSync(migration, 'utf8'))
  }

  sql(`
    INSERT INTO material_categories (id, parentId, name, sortOrder) VALUES
      ('CAT-ROOT-B', NULL, 'Root B', 2),
      ('CAT-ROOT-A', NULL, 'Root A', 1),
      ('CAT-MID-A2', 'CAT-ROOT-A', 'Middle A2', 2),
      ('CAT-MID-A1', 'CAT-ROOT-A', 'Middle A1', 1),
      ('CAT-LEAF-A1B', 'CAT-MID-A1', 'Leaf A1B', 2),
      ('CAT-LEAF-A1A', 'CAT-MID-A1', 'Leaf A1A', 1);
    INSERT INTO master_items (id, name, categoryId, specification, brand, unit, note, updatedAt)
    VALUES ('ITEM-CATEGORY', 'Legacy item', 'CAT-LEAF-A1A', 'Spec', '', 'EA', '', NOW(3));
    INSERT INTO assets (id, itemId, receivingId, customerId, categoryId, name, specification, brand, grade, quantity, unit, storageStatus, saleStatus, updatedAt)
    VALUES ('ASSET-CATEGORY', 'ITEM-CATEGORY', 'RECEIVING-CATEGORY', 'CUSTOMER-CATEGORY', 'CAT-LEAF-A1A', 'Legacy asset', 'Spec', '', 'A', 1, 'EA', '보관중', '판매대기', NOW(3));
    INSERT INTO campaigns (id, name, categoryId, description, startsAt, endsAt, updatedAt)
    VALUES ('CAM-CATEGORY', 'Legacy campaign', 'CAT-ROOT-A', '', NOW(3), DATE_ADD(NOW(3), INTERVAL 1 DAY), NOW(3));
  `)

  const migration = new URL(`${categoryMigration}/migration.sql`, migrations)
  sql(readFileSync(migration, 'utf8'))

  await context.test('existing hierarchy is renumbered by sibling order', () => {
    assert.equal(sql("SELECT GROUP_CONCAT(CONCAT(id, ':', name, ':', COALESCE(parentId, '-')) ORDER BY id SEPARATOR '|') FROM material_categories"), '010000:Root A:-|010100:Middle A1:010000|010101:Leaf A1A:010100|010102:Leaf A1B:010100|010200:Middle A2:010000|020000:Root B:-')
  })

  await context.test('all dependent records follow primary key updates', () => {
    assert.equal(sql("SELECT categoryId FROM master_items WHERE id = 'ITEM-CATEGORY'"), '010101')
    assert.equal(sql("SELECT categoryId FROM assets WHERE id = 'ASSET-CATEGORY'"), '010101')
    assert.equal(sql("SELECT categoryId FROM campaigns WHERE id = 'CAM-CATEGORY'"), '010000')
  })

  await context.test('format and hierarchy constraints reject invalid codes', () => {
    reject("INSERT INTO material_categories (id, name) VALUES ('CAT-001', 'Invalid')", /Data too long|material_categories_code_check/)
    reject("INSERT INTO material_categories (id, name) VALUES ('040100', 'Invalid root')", /material_categories_code_check/)
    reject("INSERT INTO material_categories (id, parentId, name) VALUES ('020100', '010000', 'Wrong major')", /material_categories_code_check/)
    reject("INSERT INTO material_categories (id, parentId, name) VALUES ('010201', '010100', 'Wrong middle')", /material_categories_code_check/)
    sql("START TRANSACTION; INSERT INTO material_categories (id, parentId, name) VALUES ('010103', '010100', 'Valid leaf'); ROLLBACK;")
  })

  await context.test('category columns are six characters', () => {
    assert.equal(sql("SELECT GROUP_CONCAT(CONCAT(TABLE_NAME, '.', COLUMN_NAME, ':', CHARACTER_MAXIMUM_LENGTH) ORDER BY TABLE_NAME, COLUMN_NAME SEPARATOR '|') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'material_categories' AND COLUMN_NAME IN ('id', 'parentId')) OR (TABLE_NAME IN ('master_items', 'assets', 'campaigns') AND COLUMN_NAME = 'categoryId'))"), 'assets.categoryId:6|campaigns.categoryId:6|master_items.categoryId:6|material_categories.id:6|material_categories.parentId:6')
  })
})