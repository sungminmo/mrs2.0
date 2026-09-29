import { hashPassword } from './auth.js'
import { readConfig } from './config.js'
import { createDatabase } from './database.js'

const config = readConfig()
const database = createDatabase(config.database)
const password = 'TestPassword123!'

try {
  const [adminPasswordHash, customerPasswordHash] = await Promise.all([
    hashPassword(password),
    hashPassword(password),
  ])

  await database.client.$transaction(async (transaction) => {
    await transaction.materialCategory.upsert({
      where: { id: '990000' },
      update: { name: 'Test Materials', parentId: null, enabled: true, sortOrder: 9000 },
      create: { id: '990000', name: 'Test Materials', enabled: true, sortOrder: 9000 },
    })
    await transaction.materialCategory.upsert({
      where: { id: '990100' },
      update: { name: 'Metals', parentId: '990000', enabled: true, sortOrder: 1 },
      create: { id: '990100', name: 'Metals', parentId: '990000', enabled: true, sortOrder: 1 },
    })
    await transaction.materialCategory.upsert({
      where: { id: '990101' },
      update: { name: 'Aluminum', parentId: '990100', enabled: true, sortOrder: 1 },
      create: { id: '990101', name: 'Aluminum', parentId: '990100', enabled: true, sortOrder: 1 },
    })
    await transaction.materialCategory.upsert({
      where: { id: '990102' },
      update: { name: 'Steel', parentId: '990100', enabled: true, sortOrder: 2 },
      create: { id: '990102', name: 'Steel', parentId: '990100', enabled: true, sortOrder: 2 },
    })

    await transaction.user.upsert({
      where: { email: 'admin@example.test' },
      update: {
        passwordHash: adminPasswordHash,
        companyName: 'MRS Test Operations',
        managerName: 'Test Admin',
        managerPhone: '010-0000-0001',
        role: 'ADMIN',
        status: 'ACTIVE',
        approvedAt: new Date('2026-09-21T00:00:00.000Z'),
      },
      create: {
        email: 'admin@example.test',
        passwordHash: adminPasswordHash,
        companyName: 'MRS Test Operations',
        managerName: 'Test Admin',
        managerPhone: '010-0000-0001',
        role: 'ADMIN',
        status: 'ACTIVE',
        approvedAt: new Date('2026-09-21T00:00:00.000Z'),
      },
    })
    await transaction.user.upsert({
      where: { email: 'customer@example.test' },
      update: {
        customerId: 'TEST-CUST-001',
        passwordHash: customerPasswordHash,
        companyName: 'MRS Test Customer',
        managerName: 'Test Customer',
        managerPhone: '010-0000-0002',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        approvedAt: new Date('2026-09-21T00:00:00.000Z'),
      },
      create: {
        customerId: 'TEST-CUST-001',
        email: 'customer@example.test',
        passwordHash: customerPasswordHash,
        companyName: 'MRS Test Customer',
        managerName: 'Test Customer',
        managerPhone: '010-0000-0002',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        approvedAt: new Date('2026-09-21T00:00:00.000Z'),
      },
    })

    await transaction.masterItem.upsert({
      where: { id: '900001' },
      update: {
        name: 'Test Aluminum Sheet', categoryId: '990101', specification: 'A5052, 2.0mm x 1000mm x 2000mm', brand: 'Test Metal', unit: 'EA', inboundPrice: 45000, outboundPrice: 62000, standardPrice: 55000, enabled: true, note: 'Test seed item',
      },
      create: {
        id: '900001', name: 'Test Aluminum Sheet', categoryId: '990101', specification: 'A5052, 2.0mm x 1000mm x 2000mm', brand: 'Test Metal', unit: 'EA', inboundPrice: 45000, outboundPrice: 62000, standardPrice: 55000, enabled: true, note: 'Test seed item',
      },
    })
    await transaction.masterItem.upsert({
      where: { id: '900002' },
      update: {
        name: 'Test Steel Pipe', categoryId: '990102', specification: 'SS400, 50mm x 50mm x 3.2mm', brand: 'Test Steel', unit: 'M', inboundPrice: 12000, outboundPrice: 18000, standardPrice: 15000, enabled: true, note: 'Test seed item',
      },
      create: {
        id: '900002', name: 'Test Steel Pipe', categoryId: '990102', specification: 'SS400, 50mm x 50mm x 3.2mm', brand: 'Test Steel', unit: 'M', inboundPrice: 12000, outboundPrice: 18000, standardPrice: 15000, enabled: true, note: 'Test seed item',
      },
    })

    await transaction.asset.upsert({
      where: { id: '260901-0001' },
      update: {
        itemId: '900001', receivingId: 'TEST-RCV-001', customerId: 'TEST-CUST-001', locationId: 'TEST-LOC-A1', categoryId: '990101', name: 'Test Aluminum Sheet', specification: 'A5052, 2.0mm x 1000mm x 2000mm', brand: 'Test Metal', grade: 'S', quantity: '25.000', unit: 'EA', appraisal: 1375000, storageStatus: 'STORED', saleStatus: 'ON_SALE',
      },
      create: {
        id: '260901-0001', itemId: '900001', receivingId: 'TEST-RCV-001', customerId: 'TEST-CUST-001', locationId: 'TEST-LOC-A1', categoryId: '990101', name: 'Test Aluminum Sheet', specification: 'A5052, 2.0mm x 1000mm x 2000mm', brand: 'Test Metal', grade: 'S', quantity: '25.000', unit: 'EA', appraisal: 1375000, storageStatus: 'STORED', saleStatus: 'ON_SALE',
      },
    })
    await transaction.asset.upsert({
      where: { id: '260901-0002' },
      update: {
        itemId: '900001', receivingId: 'TEST-RCV-002', customerId: 'TEST-CUST-001', categoryId: '990101', name: 'Test Aluminum Sheet', specification: 'A5052, 2.0mm x 1000mm x 2000mm', brand: 'Test Metal', grade: 'A', quantity: '10.000', unit: 'EA', appraisal: 500000, storageStatus: 'PENDING', saleStatus: 'PENDING',
      },
      create: {
        id: '260901-0002', itemId: '900001', receivingId: 'TEST-RCV-002', customerId: 'TEST-CUST-001', categoryId: '990101', name: 'Test Aluminum Sheet', specification: 'A5052, 2.0mm x 1000mm x 2000mm', brand: 'Test Metal', grade: 'A', quantity: '10.000', unit: 'EA', appraisal: 500000, storageStatus: 'PENDING', saleStatus: 'PENDING',
      },
    })
    await transaction.asset.upsert({
      where: { id: '260902-0001' },
      update: {
        itemId: '900002', receivingId: 'TEST-RCV-003', customerId: 'TEST-CUST-002', locationId: 'TEST-LOC-B2', categoryId: '990102', name: 'Test Steel Pipe', specification: 'SS400, 50mm x 50mm x 3.2mm', brand: 'Test Steel', grade: 'B', quantity: '120.000', unit: 'M', appraisal: 1800000, storageStatus: 'STORED', saleStatus: 'PENDING',
      },
      create: {
        id: '260902-0001', itemId: '900002', receivingId: 'TEST-RCV-003', customerId: 'TEST-CUST-002', locationId: 'TEST-LOC-B2', categoryId: '990102', name: 'Test Steel Pipe', specification: 'SS400, 50mm x 50mm x 3.2mm', brand: 'Test Steel', grade: 'B', quantity: '120.000', unit: 'M', appraisal: 1800000, storageStatus: 'STORED', saleStatus: 'PENDING',
      },
    })
  })

  console.info('Test seed data is ready.')
  console.info('Accounts: admin@example.test, customer@example.test')
  console.info(`Password: ${password}`)
} finally {
  await database.close()
}