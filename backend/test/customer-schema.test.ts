import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createDatabase } from '../src/database.js'
import { createAuthRepository, createCustomerRepository } from '../src/customer.js'
import { createAssetRepository } from '../src/asset.js'

test('customer migration and repositories on isolated MySQL', { skip: process.env.RUN_CUSTOMER_SCHEMA_TEST !== '1' }, async (context) => {
  const container = `mrs-customer-test-${randomUUID()}`
  const docker = (args: string[], input?: string) => execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 180_000 }).trim()
  context.after(() => docker(['rm', '--force', '--volumes', container]))
  docker(['run', '--detach', '--name', container, '--publish', '127.0.0.1::3306', '--env', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', '--env', 'MYSQL_ROOT_HOST=%', '--env', 'MYSQL_DATABASE=customer_test', 'mysql:8.4.11', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci'])
  docker(['exec', container, 'mysqladmin', '--protocol=TCP', '--host=127.0.0.1', '--wait=120', '--connect-timeout=1', 'ping', '--silent'])
  const sql = (statement: string) => docker(['exec', '-i', container, 'mysql', '--default-character-set=utf8mb4', '--database=customer_test', '--batch', '--skip-column-names'], statement)
  const migrations = new URL('../prisma/migrations/', import.meta.url)
  for (const directory of readdirSync(migrations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const migration = new URL(`${directory.name}/migration.sql`, migrations)
    if (directory.name === '20260930000000_add_customers') sql(`
      INSERT INTO users (id,email,passwordHash,companyName,managerName,managerPhone,customerId,status,updatedAt) VALUES ('legacy-user','legacy@example.test','unused','Legacy','Manager','010','LEGACY-CUS','ACTIVE',NOW(3));
      INSERT INTO material_categories (id,name) VALUES ('880000','Legacy category');
      INSERT INTO master_items (id,name,categoryId,specification,brand,unit,note,updatedAt) VALUES ('880001','Legacy item','880000','Spec','','EA','',NOW(3));
      INSERT INTO assets (id,itemId,receivingId,customerId,categoryId,name,specification,brand,grade,quantity,unit,appraisal,storageStatus,saleStatus,updatedAt) VALUES ('260929-0001','880001','LEGACY-RCV','LEGACY-ASSET-OWNER','880000','Legacy asset','Spec','','A',2.500,'EA',12345,'보관중','판매대기',NOW(3));
    `)
    if (existsSync(migration)) sql(readFileSync(migration, 'utf8'))
  }
  assert.equal(sql("SELECT CONCAT(id, ':', status, ':', businessNumber IS NULL) FROM customers WHERE id='LEGACY-CUS'"), 'LEGACY-CUS:PENDING:1')
  assert.equal(sql("SELECT status FROM users WHERE id='legacy-user'"), 'PENDING')
  assert.equal(sql("SELECT CONCAT(id, ':', status) FROM customers WHERE id='LEGACY-ASSET-OWNER'"), 'LEGACY-ASSET-OWNER:PENDING')
  assert.equal(sql("SELECT CONCAT(COUNT(*), ':', SUM(quantity), ':', SUM(appraisal)) FROM assets WHERE customerId='LEGACY-ASSET-OWNER'"), '1:2.500:12345')
  assert.throws(() => sql("UPDATE users SET customerId='MISSING' WHERE id='legacy-user'"), /Command failed/)
  assert.throws(() => sql("DELETE FROM customers WHERE id='LEGACY-CUS'"), /Command failed/)
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  const database = createDatabase({ host: '127.0.0.1', port, name: 'customer_test', user: 'root', password: '', poolMax: 5, timeoutMs: 5000 })
  context.after(() => database.close())
  const client = database.client
  const customers = createCustomerRepository(client)
  const auth = createAuthRepository(client)
  const admin = await client.user.create({ data: { email: 'admin@example.test', passwordHash: 'unused', companyName: 'MRS', managerName: 'Admin', managerPhone: '010', role: 'ADMIN', status: 'ACTIVE' } })
  const fields = { name: 'Company A', businessNumber: '2208162517', representativeName: 'Owner', phone: '0212345678', address: 'Seoul' }
  const company = await customers.create(fields, 'Verified company', admin.id)
  await context.test('duplicate companies cannot be created and failed changes leave no audit', async () => {
    const before = await client.customerChange.count()
    await assert.rejects(customers.create(fields, 'Duplicate', admin.id), /상태/)
    assert.equal(await client.customerChange.count(), before)
  })
  const user = await auth.createRegistration({ email: 'member@example.test', passwordHash: 'unused', customerType: 'existing', customerId: company.id, managerName: 'Manager', managerPhone: '010' })
  await context.test('selecting a company grants no access; only MRS approval activates membership', async () => {
    assert.equal(user.status, 'PENDING')
    assert.equal(user.customerRole, 'VIEWER')
    const approved = await auth.approveMember(user.id, new Date(), { action: 'approve', reason: 'Confirmed through company contact', version: 0, customerRole: 'MANAGER' }, admin.id)
    assert.equal(approved?.status, 'ACTIVE')
    assert.equal(approved?.customerRole, 'MANAGER')
    await assert.rejects(auth.approveMember(user.id, new Date(), { action: 'approve', reason: 'Duplicate', version: 0, customerRole: 'MANAGER' }, admin.id))
  })
  await context.test('company suspension preserves individual suspension and rejects stale changes', async () => {
    await auth.changeMember!(user.id, { action: 'suspend', reason: 'Employee left', version: 1, customerRole: 'VIEWER' }, admin.id)
    const suspended = await customers.changeStatus(company.id, 'SUSPENDED', { version: 0, reason: 'Company suspended' }, admin.id)
    await assert.rejects(customers.update(company.id, fields, { version: 0, reason: 'Stale edit' }, admin.id))
    await customers.changeStatus(company.id, 'ACTIVE', { version: suspended.version, reason: 'Company restored' }, admin.id)
    assert.equal((await auth.findById(user.id))?.status, 'SUSPENDED')
    assert.equal((await auth.findById(user.id))?.customer?.accessVersion, 2)
  })
  await context.test('new applications do not reserve business numbers or silently approve users', async () => {
    const applicant = await auth.createRegistration({ email: 'new@example.test', passwordHash: 'unused', customerType: 'new', customer: fields, managerName: 'New member', managerPhone: '010' })
    const application = (await customers.applications()).find((entry) => entry.userId === applicant.id)!
    assert.equal(applicant.customerId, null)
    await assert.rejects(customers.review(application.id, { action: 'approve', version: 0, reason: 'Missing duplicate confirmation' }, admin.id))
    await customers.review(application.id, { action: 'approve', customerId: company.id, version: 0, reason: 'Existing company verified' }, admin.id)
    assert.equal((await auth.findById(applicant.id))?.status, 'PENDING')
    assert.equal((await auth.findById(applicant.id))?.customerId, company.id)
  })
  await context.test('shared rate limits reject excessive requests', async () => {
    await customers.throttle('test', 'identity', 1)
    await assert.rejects(customers.throttle('test', 'identity', 1), /요청이 많습니다/)
  })
  await context.test('real asset queries isolate detail, images, pagination and full-company totals', async () => {
    const other = await client.customer.create({ data: { id: 'OTHER', name: 'Other' } })
    await client.materialCategory.create({ data: { id: '990000', name: 'Root' } })
    await client.materialCategory.create({ data: { id: '990100', name: 'Middle', parentId: '990000' } })
    await client.materialCategory.create({ data: { id: '990101', name: 'Leaf', parentId: '990100' } })
    await client.masterItem.create({ data: { id: '990001', categoryId: '990101', name: 'Material', specification: 'Spec', unit: 'EA', note: '' } })
    const record = { itemId: '990001', receivingId: 'LEGACY-RECEIVING', categoryId: '990101', name: 'Asset', specification: 'Spec', grade: 'A' as const, quantity: '1.250', unit: 'EA' as const, storageStatus: 'STORED' as const, saleStatus: 'PENDING' as const }
    await client.asset.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ ...record, id: `260930-${String(index + 1).padStart(4, '0')}`, customerId: company.id, appraisal: index === 0 ? null : index === 1 ? '0' : '10' })) })
    await client.asset.create({ data: { ...record, id: '260930-9998', customerId: other.id, appraisal: '999999' } })
    await client.asset.create({ data: { ...record, id: '260930-9999', customerId: company.id, appraisal: '777777', quantity: '0', storageStatus: 'RELEASED' } })
    await client.assetImage.createMany({ data: [{ id: 'image-private', assetId: '260930-0001', name: 'Private image', url: 'https://private.example.test/secret.jpg', sortOrder: 0 }, { id: 'image-safe', assetId: '260930-0001', name: 'Stored image', url: 'data:image/png;base64,aGVsbG8=', sortOrder: 1 }] })
    const assets = createAssetRepository(client)
    const page = await assets.list(company.id, { page: 2, size: 100, sort: 'nameAsc', storageStatus: 'STORED' }, new Date())
    assert.equal(page.totalElements, 101)
    assert.equal(page.records.length, 1)
    const totals = await assets.summary!(company.id)
    assert.equal(totals.total, 101)
    assert.equal(totals.appraisalValue, '990')
    assert.equal(totals.unappraised, 1)
    assert.deepEqual(totals.quantities, [{ unit: 'EA', quantity: '126.25' }])
    assert.equal(await assets.detail!(other.id, '260930-0001'), null)
    const detail = await assets.detail!(company.id, '260930-0001')
    assert.deepEqual(detail?.images.map((image) => image.id), ['image-safe'])
    assert.equal(detail?.appraisalValue, null)
    assert.equal((await assets.detail!(company.id, '260930-0002'))?.appraisalValue, '0')
    await client.receiving.create({ data: { id: 'MISMATCH', customerId: other.id, siteName: 'Other site', managerName: 'Manager', managerPhone: '010', channel: 'ADMIN', volume: 'OTHER', termsAgreedAt: new Date(), termsVersion: 'v1', termsText: 'Test' } })
    await client.asset.update({ where: { id: '260930-0001' }, data: { receivingId: 'MISMATCH' } })
    await assert.rejects(assets.summary!(company.id), /귀속 확인/)
    await assert.rejects(assets.detail!(other.id, '260930-9998'), /귀속 확인/)
  })
  await context.test('concurrent edits only commit one version and one audit event', async () => {
    const current = await customers.detail(company.id)
    const before = await client.customerChange.count()
    const results = await Promise.allSettled([
      customers.update(company.id, { ...fields, name: 'First edit' }, { version: current.version, reason: 'First' }, admin.id),
      customers.update(company.id, { ...fields, name: 'Second edit' }, { version: current.version, reason: 'Second' }, admin.id),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(await client.customerChange.count(), before + 1)
  })
})