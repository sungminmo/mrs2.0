import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID, scryptSync } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createDatabase } from '../src/database.js'
import { createAuthRepository, createCustomerRepository } from '../src/customer.js'
import { createAssetRepository } from '../src/asset.js'
import { createAdminAccountRepository } from '../src/admin-accounts.js'
import { hashPassword } from '../src/auth.js'
import { adminDataQuery, createAdminDataRepository } from '../src/admin-data.js'
import { adminListQuery } from '../src/admin-pagination.js'
import { createAdminImageRepository, imageOrigin } from '../src/admin-images.js'

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
  const admin = await client.user.create({ data: { email: 'admin@example.test', passwordHash: 'unused', companyName: 'MRS', managerName: 'Admin', managerPhone: '010', role: 'ADMIN', adminRole: 'SYSTEM_ADMIN', status: 'ACTIVE' } })
  await context.test('administrator accounts hash passwords, isolate customers, audit and preserve the last system administrator', async () => {
    const verifyPassword = (password: string, encoded: string) => {
      const [algorithm, salt, stored] = encoded.split('$')
      return algorithm === 'scrypt' && !!salt && !!stored && scryptSync(password, Buffer.from(salt, 'base64url'), 64).equals(Buffer.from(stored, 'base64url'))
    }
    const accounts = createAdminAccountRepository(client)
    const fields = { loginId: 'sales.test', password: 'password123', name: 'Sales staff', phone: '010', adminRole: 'SALES' as const, status: 'ACTIVE' as const, reason: 'MRS verified staff' }
    const account = await accounts.create(fields, admin.id)
    assert.equal('passwordHash' in account, false)
    assert.equal((await accounts.list()).some((entry) => 'passwordHash' in entry), false)
    assert.equal((await client.user.findUniqueOrThrow({ where: { id: account.id } })).role, 'ADMIN')
    assert.equal(await verifyPassword('password123', (await client.user.findUniqueOrThrow({ where: { id: account.id } })).passwordHash), true)
    const beforeAudit = await client.customerChange.count()
    await assert.rejects(accounts.create(fields, admin.id), /상태/)
    assert.equal(await client.customerChange.count(), beforeAudit)
    await assert.rejects(accounts.create({ ...fields, loginId: 'denied.test' }, account.id), /시스템 관리자/)
    await assert.rejects(accounts.update('legacy-user', { ...fields, version: 0 }, admin.id), /관리자 계정/)
    await assert.rejects(accounts.update(admin.id, { ...fields, version: 0 }, admin.id), /마지막 활성/)
    const changed = await accounts.update(account.id, { ...fields, adminRole: 'LOGISTICS', version: 0, password: 'changed123' }, admin.id)
    assert.equal(changed.adminRole, 'LOGISTICS')
    assert.equal(changed.sessionVersion, 1)
    assert.equal(await verifyPassword('changed123', (await client.user.findUniqueOrThrow({ where: { id: account.id } })).passwordHash), true)
    await assert.rejects(accounts.update(account.id, { ...fields, version: 0 }, admin.id), /계정 상태/)
    const suspended = await accounts.update(account.id, { ...fields, status: 'SUSPENDED', version: 1 }, admin.id)
    assert.equal(suspended.status, 'SUSPENDED')
    const audit = await client.customerChange.findMany({ where: { targetUserId: account.id }, orderBy: { createdAt: 'asc' } })
    assert.equal(audit.length, 3)
    assert.equal(JSON.stringify(audit).includes('changed123'), false)
    assert.equal(JSON.stringify(audit).includes('passwordHash'), false)
    await client.user.create({ data: { email: 'concurrent-system.test', passwordHash: await hashPassword('password123'), companyName: 'MRS', managerName: 'System 2', managerPhone: '', role: 'ADMIN', adminRole: 'SYSTEM_ADMIN', status: 'ACTIVE' } })
    const systems = (await accounts.list()).filter((entry) => entry.adminRole === 'SYSTEM_ADMIN' && entry.status === 'ACTIVE')
    const results = await Promise.allSettled(systems.map((entry) => accounts.update(entry.id, { ...fields, status: 'SUSPENDED', version: entry.sessionVersion }, entry.id)))
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(await client.user.count({ where: { role: 'ADMIN', adminRole: 'SYSTEM_ADMIN', status: 'ACTIVE' } }), 1)
    await client.user.update({ where: { id: admin.id }, data: { status: 'ACTIVE', adminRole: 'SYSTEM_ADMIN' } })
  })
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
    const adminData = createAdminDataRepository(client)
    const first = await adminData.load(adminDataQuery.parse({ scope: 'assets', customer: company.id, page: 1, rows: 10 }))
    const second = await adminData.load(adminDataQuery.parse({ scope: 'assets', customer: company.id, page: 2, rows: 10 }))
    assert.equal(first.assets.length, 10)
    assert.equal(second.assets.length, 10)
    assert.equal(first.pagination.total, 102)
    assert.equal(second.assets.some((entry) => first.assets.some((previous) => previous.id === entry.id)), false)
    assert.equal(first.items.length, 0)
    assert.equal(first.assets.every((entry) => entry.history.length === 0), true)
    const selected = await adminData.load(adminDataQuery.parse({ scope: 'assets', id: second.assets[0]!.id, page: 50 }))
    assert.equal(selected.assets[0]?.id, second.assets[0]!.id)
    const companyPage = adminListQuery.parse({ rows: 1, page: 2 })
    assert.equal((await customers.list(companyPage)).length, 1)
    assert.ok(await customers.count(companyPage) >= 2)
    await client.receiving.create({ data: { id: 'MISMATCH', customerId: other.id, siteName: 'Other site', managerName: 'Manager', managerPhone: '010', channel: 'ADMIN', volume: 'OTHER', termsAgreedAt: new Date(), termsVersion: 'v1', termsText: 'Test' } })
    await client.asset.update({ where: { id: '260930-0001' }, data: { receivingId: 'MISMATCH' } })
    await assert.rejects(assets.summary!(company.id), /귀속 확인/)
    await assert.rejects(assets.detail!(other.id, '260930-9998'), /귀속 확인/)
  })
  await context.test('S3 image references persist for items and assets, audit atomically and reject stale replacement', async () => {
    const repository = createAdminImageRepository(client)
    const itemImage = { id: randomUUID(), name: 'item.webp', url: `${imageOrigin}/items/test/${randomUUID()}.webp` }
    await repository.replace('items', '880001', { images: [itemImage], expected: [], reason: '검증 이미지 등록' }, admin.id)
    assert.equal((await client.masterItemImage.findFirstOrThrow({ where: { masterItemId: '880001' } })).url, itemImage.url)
    const assetImages = Array.from({ length: 8 }, (_, index) => ({ id: randomUUID(), name: `asset-${index}.webp`, url: `${imageOrigin}/assets/test/${randomUUID()}.webp` }))
    const before = await client.customerChange.count()
    await repository.replace('assets', '260929-0001', { images: assetImages, expected: [], reason: '검증 자산 사진 등록' }, admin.id)
    const saved = await client.assetImage.findMany({ where: { assetId: '260929-0001' }, orderBy: { sortOrder: 'asc' } })
    assert.deepEqual(saved.map(({ id, name, url }) => ({ id, name, url })), assetImages)
    assert.equal(await client.customerChange.count(), before + 1)
    const data = await createAdminDataRepository(client).load(adminDataQuery.parse({ scope: 'assets', id: '260929-0001' }))
    assert.equal(data.assets[0]?.images.length, 8)
    assert.ok(Array.isArray(data.assets[0]?.history.at(-1)?.changes))
    const detail = await createAssetRepository(client).detail!('LEGACY-ASSET-OWNER', '260929-0001')
    assert.equal(detail?.images.length, 8)
    await assert.rejects(repository.replace('assets', '260929-0001', { images: [], expected: [], reason: '충돌 검증' }, admin.id), /변경되었습니다/)
    assert.equal(await client.customerChange.count(), before + 1)
    await assert.rejects(repository.replace('assets', '260929-0001', { images: [], expected: assetImages, reason: '원자성 검증' }, 'missing-actor'))
    assert.equal(await client.assetImage.count({ where: { assetId: '260929-0001' } }), 8)
    const results = await Promise.allSettled([
      repository.replace('assets', '260929-0001', { images: assetImages.slice(0, 1), expected: assetImages, reason: '동시 저장 A' }, admin.id),
      repository.replace('assets', '260929-0001', { images: assetImages.slice(0, 2), expected: assetImages, reason: '동시 저장 B' }, admin.id),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(await client.customerChange.count(), before + 2)
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