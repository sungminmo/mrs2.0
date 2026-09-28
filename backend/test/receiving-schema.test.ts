import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

test('receiving schema on isolated MySQL 8.4', { skip: process.env.RUN_RECEIVING_SCHEMA_TEST !== '1' }, async (context) => {
  const container = `mrs-receiving-test-${randomUUID()}`
  const docker = (args: string[], input?: string) => execFileSync('docker', args, {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 180_000,
  }).trim()
  context.after(() => docker(['rm', '--force', '--volumes', container]))
  docker(['run', '--detach', '--name', container, '--env', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', '--env', 'MYSQL_DATABASE=receiving_test', 'mysql:8.4.11', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci'])
  docker(['exec', container, 'mysqladmin', '--protocol=TCP', '--host=127.0.0.1', '--wait=120', '--connect-timeout=1', 'ping', '--silent'])
  const sql = (statement: string) => docker(['exec', '-i', container, 'mysql', '--default-character-set=utf8mb4', '--database=receiving_test', '--batch', '--skip-column-names'], statement)
  const reject = (statement: string, constraint: RegExp) => assert.throws(
    () => sql(`START TRANSACTION; ${statement}; ROLLBACK;`),
    (error: unknown) => error instanceof Error && 'stderr' in error && constraint.test(String(error.stderr)),
  )
  const migrations = new URL('../prisma/migrations/', import.meta.url)
  for (const directory of readdirSync(migrations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const migration = new URL(`${directory.name}/migration.sql`, migrations)
    if (existsSync(migration)) sql(readFileSync(migration, 'utf8'))
  }

  sql(`
    INSERT INTO receivings (id, customerId, siteName, managerName, managerPhone, channel, volume, status, receivedAt, termsAgreedAt, termsVersion, termsText, updatedAt)
    VALUES ('REQ-TEST-1', 'CUS-TEST', 'Test site', 'Manager', '01000000000', 'MRS고객포탈', 'UNDER_ONE_TON', '입고 완료', NOW(3), NOW(3), 'v1', 'Disposal terms', NOW(3)),
           ('REQ-TEST-2', 'CUS-TEST', 'Test site', 'Manager', '01000000000', '홈페이지', 'OTHER', '입고 완료', NOW(3), NOW(3), 'v1', 'Disposal terms', NOW(3));
    INSERT INTO inspections (id, receivingId, updatedAt) VALUES ('RCV-TEST-1', 'REQ-TEST-1', NOW(3)), ('RCV-TEST-2', 'REQ-TEST-2', NOW(3));
    INSERT INTO inspection_items (id, inspectionId, name, unit, receivedQuantity, updatedAt)
    VALUES ('ITEM-TEST-1', 'RCV-TEST-1', 'Pending material', 'm³', 1.250, NOW(3)), ('ITEM-TEST-2', 'RCV-TEST-2', 'Other material', 'EA', 10, NOW(3));
    INSERT INTO disposals (inspectionId, updatedAt) VALUES ('RCV-TEST-1', NOW(3)), ('RCV-TEST-2', NOW(3));
    INSERT INTO disposal_items (inspectionItemId, inspectionId, updatedAt) VALUES ('ITEM-TEST-1', 'RCV-TEST-1', NOW(3));
  `)

  await context.test('pending quantities retain null instead of zero', () => {
    assert.equal(sql("SELECT CONCAT(receivedQuantity, ':', usableQuantity IS NULL, ':', disposalQuantity IS NULL) FROM inspection_items WHERE id = 'ITEM-TEST-1'"), '1.250:1:1')
    assert.equal(sql("SELECT processedQuantity IS NULL FROM disposal_items WHERE inspectionItemId = 'ITEM-TEST-1'"), '1')
  })

  await context.test('quantity balance, complete results, F grade and reasons are enforced', () => {
    reject("UPDATE inspection_items SET grade = 'B', usableQuantity = 1, disposalQuantity = 0.500, reason = 'Damage' WHERE id = 'ITEM-TEST-1'", /inspection_items_result_check/)
    reject("UPDATE inspection_items SET grade = 'B' WHERE id = 'ITEM-TEST-1'", /inspection_items_result_check/)
    reject("UPDATE inspection_items SET receivedQuantity = -1 WHERE id = 'ITEM-TEST-1'", /inspection_items_quantities_check/)
    reject("UPDATE inspection_items SET grade = 'F', usableQuantity = 1, disposalQuantity = 0.250, reason = 'Damage' WHERE id = 'ITEM-TEST-1'", /inspection_items_grade_check/)
    reject("UPDATE inspection_items SET grade = 'B', usableQuantity = 1, disposalQuantity = 0.250 WHERE id = 'ITEM-TEST-1'", /inspection_items_reason_check/)
    sql("START TRANSACTION; UPDATE inspection_items SET grade = 'F', usableQuantity = 0, disposalQuantity = 1.250, reason = 'Unusable' WHERE id = 'ITEM-TEST-1'; ROLLBACK;")
  })

  await context.test('receiving completion and inspection confirmation require timestamps', () => {
    reject("UPDATE receivings SET receivedAt = NULL WHERE id = 'REQ-TEST-1'", /receivings_received_at_check/)
    reject("UPDATE inspections SET status = '검수 종료' WHERE id = 'RCV-TEST-1'", /inspections_status_check/)
    reject("UPDATE inspections SET status = '결과 확인 대기', inspectedAt = NOW(3), notifiedAt = NOW(3) WHERE id = 'RCV-TEST-1'", /inspections_notification_check/)
    sql("START TRANSACTION; UPDATE inspections SET status = '검수 종료', inspectedAt = NOW(3), acknowledgedAt = NOW(3) WHERE id = 'RCV-TEST-1'; ROLLBACK;")
  })

  await context.test('request photos are limited to five slots', () => {
    sql("START TRANSACTION; INSERT INTO receiving_images (id, receivingId, name, url, sortOrder) VALUES ('PHOTO-TEST', 'REQ-TEST-1', 'Site', '/site.jpg', 4); ROLLBACK;")
    reject("INSERT INTO receiving_images (id, receivingId, name, url, sortOrder) VALUES ('PHOTO-TEST', 'REQ-TEST-1', 'Site', '/site.jpg', 5)", /receiving_images_limit_check/)
  })

  await context.test('one inspection per receiving and same-inspection disposal items', () => {
    reject("INSERT INTO inspections (id, receivingId, updatedAt) VALUES ('RCV-DUPLICATE', 'REQ-TEST-1', NOW(3))", /Duplicate entry/)
    reject("INSERT INTO disposal_items (inspectionItemId, inspectionId, updatedAt) VALUES ('ITEM-TEST-2', 'RCV-TEST-1', NOW(3))", /disposal_items_inspectionItemId_inspectionId_fkey/)
    reject("UPDATE inspection_items SET assetId = 'MISSING-ASSET' WHERE id = 'ITEM-TEST-1'", /inspection_items_assetId_fkey/)
    reject("DELETE FROM receivings WHERE id = 'REQ-TEST-1'", /foreign key constraint fails/)
  })

  await context.test('consent cannot be bypassed or granted before estimating cost', () => {
    reject("UPDATE disposals SET status = '처리 예정' WHERE inspectionId = 'RCV-TEST-1'", /disposals_consent_check/)
    reject("UPDATE disposals SET consentedAt = NOW(3) WHERE inspectionId = 'RCV-TEST-1'", /disposals_consent_check/)
    sql("START TRANSACTION; UPDATE disposals SET costStatus = '예상 비용 안내', estimate = 0, consentedAt = NOW(3), status = '처리 예정' WHERE inspectionId = 'RCV-TEST-1'; ROLLBACK;")
  })

  await context.test('cost states preserve unknown, estimated, confirmed and billed values', () => {
    reject("UPDATE disposals SET costStatus = '예상 비용 안내' WHERE inspectionId = 'RCV-TEST-1'", /disposals_cost_state_check/)
    reject("UPDATE disposals SET costStatus = '비용 확정' WHERE inspectionId = 'RCV-TEST-1'", /disposals_cost_state_check/)
    reject("UPDATE disposals SET costStatus = '청구 완료', amount = 65000 WHERE inspectionId = 'RCV-TEST-1'", /disposals_cost_state_check/)
    reject("UPDATE disposals SET costStatus = '예상 비용 안내', estimate = -1 WHERE inspectionId = 'RCV-TEST-1'", /disposals_amounts_check/)
    sql("START TRANSACTION; UPDATE disposals SET costStatus = '비용 확정', amount = 0 WHERE inspectionId = 'RCV-TEST-1'; ROLLBACK;")
    sql("START TRANSACTION; UPDATE disposals SET costStatus = '청구 완료', estimate = 60000, amount = 65000, invoiceId = 'BILL-TEST', billedAt = NOW(3) WHERE inspectionId = 'RCV-TEST-1'; ROLLBACK;")
  })

  await context.test('completion needs evidence and actual quantities cannot be negative', () => {
    reject("UPDATE disposals SET consentRequired = false, status = '폐기 완료', completedAt = NOW(3) WHERE inspectionId = 'RCV-TEST-1'", /disposals_completion_check/)
    reject("UPDATE disposal_items SET processedQuantity = -1 WHERE inspectionItemId = 'ITEM-TEST-1'", /disposal_items_processed_check/)
    sql("START TRANSACTION; UPDATE disposals SET consentRequired = false, status = '폐기 완료', completedAt = NOW(3), evidence = 'Disposal receipt' WHERE inspectionId = 'RCV-TEST-1'; ROLLBACK;")
  })

  await context.test('line amounts and audit text are validated', () => {
    reject("INSERT INTO disposal_cost_lines (id, inspectionId, label, amount) VALUES ('COST-TEST', 'RCV-TEST-1', 'Transport', -1)", /disposal_cost_lines_amount_check/)
    reject("INSERT INTO disposal_comments (id, inspectionId, text) VALUES ('COMMENT-TEST', 'RCV-TEST-1', ' ')", /disposal_comments_text_check/)
    reject("INSERT INTO receiving_changes (id, receivingId, stage, reason, changes) VALUES ('CHANGE-TEST', 'REQ-TEST-1', 'INSPECTION', '', JSON_OBJECT())", /receiving_changes_reason_check/)
    sql("INSERT INTO receiving_changes (id, receivingId, stage, reason, changes) VALUES ('CHANGE-TEST', 'REQ-TEST-1', 'INSPECTION', 'Result confirmed', JSON_OBJECT('grade', JSON_OBJECT('before', NULL, 'after', 'B')))")
    assert.equal(sql("SELECT JSON_UNQUOTE(JSON_EXTRACT(changes, '$.grade.after')) FROM receiving_changes WHERE id = 'CHANGE-TEST'"), 'B')
  })
})