import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { SignJWT } from 'jose'
import { createApp } from '../src/app.js'
import { type AuthRepository, type AuthUser } from '../src/auth.js'
import { createDatabase } from '../src/database.js'
import { createAuthRepository } from '../src/customer.js'
import { createReceivingRepository } from '../src/receiving.js'
import { createInspectionRepository, inspectionWrite } from '../src/inspection.js'
import { createAssetRepository } from '../src/asset.js'
import { createAdminDataRepository, saleApprovalInput } from '../src/admin-data.js'
import { createQuoteRepository, quoteCreateInput, quotePreviewInput } from '../src/quote.js'
import { createOutboundRepository, outboundAction, outboundOffer, outboundOrderAction, outboundSend, outboundShipment } from '../src/outbound.js'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { createNotificationRepository, decodeNotificationCursor, emitNotification, notificationQuery, notificationReadInput, type NotificationRepository } from '../src/notification.js'

test('notification input and cursor preserve unsigned IDs and reject ownership injection', () => {
  assert.deepEqual(notificationQuery.parse({}), { size: 20, unreadOnly: 'false' })
  for (const query of [{ size: '51' }, { customerId: 'other' }, { unreadOnly: 'yes' }]) assert.equal(notificationQuery.safeParse(query).success, false)
  for (const ids of [[], ['0'], ['1', '1'], ['18446744073709551616']]) assert.equal(notificationReadInput.safeParse({ ids }).success, false)
  assert.equal(notificationReadInput.parse({ ids: ['18446744073709551615'] }).ids[0], '18446744073709551615')
  assert.throws(() => decodeNotificationCursor('invalid'), /알림 페이지/)
  assert.throws(() => decodeNotificationCursor(Buffer.from(JSON.stringify({ at: 'bad', id: '1' })).toString('base64url')), /알림 페이지/)
})

test('isolated successful business transitions emit once, keep seller privacy, and roll back on notification failure', { skip: !process.env.MRS_NOTIFICATION_TEST_DB_PORT }, async context => {
  const name = process.env.MRS_NOTIFICATION_TEST_DB_NAME ?? 'mrs_test'
  assert.match(name, /^(?:mrs_test|receiving_preview|test_[a-z0-9_]+|[a-z0-9_]+_test)$/)
  const database = createDatabase({ host: '127.0.0.1', port: Number(process.env.MRS_NOTIFICATION_TEST_DB_PORT), name, user: 'root', password: process.env.MRS_NOTIFICATION_TEST_DB_PASSWORD ?? '', poolMax: 4, timeoutMs: 5000 })
  const client = database.client
  const prefix = `NE-${randomUUID().slice(0, 8)}`
  const companies = [`${prefix}-S`, `${prefix}-B`]
  const ids = [randomUUID(), randomUUID(), randomUUID()]
  const locationId = prefix
  const categoryRoot = `${randomInt(80, 99)}0000`
  const categories = [categoryRoot, `${categoryRoot.slice(0, 2)}0100`, `${categoryRoot.slice(0, 2)}0101`]
  const itemId = String(randomInt(900000, 999999))
  const siteName = `${prefix} site`
  let ownedCategories = false
  let ownedItem = false
  const receivedAt = '1980-01-01T00:00:00.000Z'
  const sequence = await client.assetSequence.findUnique({ where: { dateCode: '800101' } })
  try {
    assert.equal(await client.materialCategory.count({ where: { id: { in: categories } } }), 0)
    await client.materialCategory.create({ data: { id: categories[0]!, name: prefix } })
    ownedCategories = true
    await client.materialCategory.create({ data: { id: categories[1]!, parentId: categories[0], name: `${prefix}-middle` } })
    await client.materialCategory.create({ data: { id: categories[2]!, parentId: categories[1], name: `${prefix}-leaf` } })
    await client.masterItem.create({ data: { id: itemId, name: prefix, categoryId: categories[2], specification: 'Test', brand: 'Test', unit: 'EA', inboundPrice: 1000, note: '' } })
    ownedItem = true
    await client.location.create({ data: { id: locationId, name: prefix, zone: 'Test' } })
    await client.customer.createMany({ data: companies.map(id => ({ id, name: id, businessNumber: String(randomInt(1_000_000_000, 10_000_000_000)), representativeName: 'Test', address: 'Test', phone: '0212345678', status: 'ACTIVE' })) })
    await client.user.createMany({ data: ids.map((id, index) => ({ id, email: `${id}@example.test`, passwordHash: 'not-a-login-password', companyName: prefix, managerName: 'Test', managerPhone: '01012345678', role: index === 2 ? 'ADMIN' : 'CUSTOMER', adminRole: index === 2 ? 'SYSTEM_ADMIN' : null, customerRole: 'MANAGER', status: 'ACTIVE', customerId: index === 2 ? null : companies[index] })) })
    const auth = createAuthRepository(client)
    const seller = (await auth.findById(ids[0]!))!, buyer = (await auth.findById(ids[1]!))!, admin = (await auth.findById(ids[2]!))!
    const receivings = createReceivingRepository(client), inspections = createInspectionRepository(client), assets = createAssetRepository(client), sales = createAdminDataRepository(client), quotes = createQuoteRepository(client), outbound = createOutboundRepository(client)
    const input = { siteName, managerName: 'Test', managerPhone: '01012345678', volume: 'UNDER_ONE_TON' as const, note: 'PRIVATE ADMIN NOTE', disposalTerms: 'true' as const }
    let assetId = ''
    let productId = ''
    await context.test('receiving, inspection and sale stages emit exactly once with historical input dates', async () => {
      const receiving = await receivings.create(seller, input, [])
      await receivings.review(receiving.id, { action: 'approve', reason: 'PRIVATE ADMIN NOTE' }, admin)
      await assert.rejects(receivings.review(receiving.id, { action: 'approve', reason: 'retry' }, admin))
      let report = await inspections.receive(receiving.id, { receivedAt, reason: 'Test' }, admin)
      const write = inspectionWrite.parse({ version: report.version, reason: 'Test', rows: [{ id: randomUUID(), itemId, categoryId: categories[2], name: prefix, specification: 'Test', brand: 'Test', unit: 'EA', grade: 'A', received: '11', usable: '10', disposal: '1', reason: 'Damaged', locationId }] })
      await inspections.draft(report.id, write, admin)
      assert.equal(await client.notification.count({ where: { kind: 'inspection.confirmed', customerId: companies[0] } }), 0)
      report = await inspections.save(report.id, { ...write, version: report.version + 1 }, admin, false)
      report = await inspections.save(report.id, { ...write, version: report.version }, admin, true)
      report = await inspections.customerAction(report.id, report.version, seller, false)
      await inspections.customerAction(report.id, report.version, seller, false)
      report = await inspections.customerAction(report.id, report.version, seller, true)
      await inspections.customerAction(report.id, report.version, seller, true)
      assetId = report.assets[0]!.id
      const request = await assets.requestSale!(seller, assetId, { desiredAmount: 10000, expectedQuantity: '10' })
      await assert.rejects(assets.requestSale!(seller, assetId, { desiredAmount: 10000, expectedQuantity: '10' }))
      let asset = await client.asset.findUniqueOrThrow({ where: { id: assetId } })
      await sales.completeSaleInspection(request.id, asset.updatedAt.toISOString(), admin)
      asset = await client.asset.findUniqueOrThrow({ where: { id: assetId } })
      const approved = await sales.approveSale(request.id, saleApprovalInput.parse({ expectedUpdatedAt: asset.updatedAt.toISOString(), unitPrice: 1000, reason: 'Test' }), admin)
      productId = approved.productId
      const rejected = await receivings.create(seller, input, [])
      await receivings.review(rejected.id, { action: 'reject', reason: 'PRIVATE ADMIN NOTE' }, admin)
      const notifications = await client.notification.findMany({ where: { customerId: companies[0] } })
      for (const kind of ['receiving.approved', 'receiving.rejected', 'receiving.received', 'inspection.confirmed', 'inspection.amended', 'inspection.acknowledged', 'disposal.consented', 'sale.requested', 'sale.inspected', 'sale.approved']) assert.equal(notifications.filter(item => item.kind === kind).length, 1, kind)
      assert.equal(notifications.some(item => item.description.includes('PRIVATE ADMIN NOTE')), false)
      assert.equal(notifications.every(item => item.createdAt.getTime() > Date.now() - 60000), true)
    })
    async function newQuote() {
      const preview = quotePreviewInput.parse({ source: 'product', items: [{ productId, quantity: '4' }] })
      const snapshot = await quotes.preview(buyer, preview)
      const input = quoteCreateInput.parse({ ...preview, operationId: randomUUID(), expectedSnapshot: snapshot.snapshot, contact: { name: 'BUYER PRIVATE', phone: '01099998888' }, address: 'PRIVATE ADDRESS' })
      const result = await quotes.create(buyer, input)
      assert.ok('quote' in result && result.quote)
      const quote = result.quote!
      await quotes.create(buyer, input)
      assert.equal(await client.notification.count({ where: { customerId: companies[1], kind: 'quote.created', targetId: quote.id } }), 1)
      return quote
    }
    async function newOffer(quoteId: string) {
      const created = await outbound.command(admin, 'create-offer', quoteId, outboundOffer.parse({ operationId: randomUUID(), version: 0, reason: 'PRIVATE ADMIN NOTE', contactName: 'BUYER PRIVATE', phone: '01099998888', email: '', address: 'PRIVATE ADDRESS', deliveryDate: null, deliveryMethod: 'DELIVERY', expiresAt: null, shippingFee: '0', note: 'PRIVATE', items: [{ productId, sourceQuoteItemId: null, quantity: '4', unitPrice: '1000' }] }))
      const id = created.offerId!
      const input = outboundSend.parse({ operationId: randomUUID(), version: 0, reason: 'Test', expiresAt: null })
      await outbound.command(admin, 'send', id, input)
      await outbound.command(admin, 'send', id, input)
      assert.equal(await client.notification.count({ where: { sourceKey: { endsWith: input.operationId } } }), 1)
      return id
    }
    await context.test('offer replies, approvals, partial shipment, delivery and cancellation keep business replay semantics', async () => {
      const quote = await newQuote()
      const withdrawn = await newOffer(quote.id)
      await outbound.command(admin, 'withdraw', withdrawn, outboundAction.parse({ operationId: randomUUID(), version: 1, reason: 'Test' }))
      const declined = await newOffer(quote.id)
      await outbound.command(buyer, 'decline', declined, outboundAction.parse({ operationId: randomUUID(), version: 1, reason: 'Test' }))
      const accepted = await newOffer(quote.id)
      const accept = outboundAction.parse({ operationId: randomUUID(), version: 1, reason: 'Test' })
      const result = await outbound.command(buyer, 'accept', accepted, accept)
      await outbound.command(buyer, 'accept', accepted, accept)
      const orderId = result.orderId!
      let order = await outbound.detail(admin, orderId)
      const shipment = await outbound.command(admin, 'create-shipment', orderId, outboundShipment.parse({ operationId: randomUUID(), version: order.version, orderVersion: order.version, reason: 'Test', scheduledAt: null, carrier: '', vehicle: '', trackingNumber: '', note: '', items: [{ orderItemId: order.items[0]!.id, quantity: '1' }] }))
      order = await outbound.detail(admin, orderId)
      const dispatch = outboundOrderAction.parse({ operationId: randomUUID(), version: 0, orderVersion: order.version, reason: 'PRIVATE ADMIN NOTE' })
      await outbound.command(admin, 'dispatch', shipment.shipmentId!, dispatch)
      await outbound.command(admin, 'dispatch', shipment.shipmentId!, dispatch)
      order = await outbound.detail(admin, orderId)
      const firstCancellation = await outbound.command(buyer, 'request-cancellation', orderId, outboundAction.parse({ operationId: randomUUID(), version: order.version, reason: 'Test' }))
      order = await outbound.detail(admin, orderId)
      await outbound.command(admin, 'reject-cancellation', firstCancellation.cancellationId!, outboundOrderAction.parse({ operationId: randomUUID(), version: 0, orderVersion: order.version, reason: 'Test' }))
      order = await outbound.detail(admin, orderId)
      const secondCancellation = await outbound.command(buyer, 'request-cancellation', orderId, outboundAction.parse({ operationId: randomUUID(), version: order.version, reason: 'Test' }))
      order = await outbound.detail(admin, orderId)
      await outbound.command(admin, 'approve-cancellation', secondCancellation.cancellationId!, outboundOrderAction.parse({ operationId: randomUUID(), version: 0, orderVersion: order.version, reason: 'Test' }))
      order = await outbound.detail(admin, orderId)
      await outbound.command(admin, 'deliver', shipment.shipmentId!, outboundOrderAction.parse({ operationId: randomUUID(), version: 1, orderVersion: order.version, reason: 'Test' }))
      const directQuote = await newQuote()
      const directOffer = await newOffer(directQuote.id)
      const directOrder = await outbound.command(buyer, 'accept', directOffer, outboundAction.parse({ operationId: randomUUID(), version: 1, reason: 'Test' }))
      order = await outbound.detail(admin, directOrder.orderId!)
      await outbound.command(admin, 'cancel-order', order.id, outboundAction.parse({ operationId: randomUUID(), version: order.version, reason: 'Test' }))
      const buyerEvents = await client.notification.findMany({ where: { customerId: companies[1] } })
      for (const kind of ['quote.created', 'offer.sent', 'offer.withdrawn', 'offer.declined', 'order.created', 'shipment.dispatched', 'shipment.delivered', 'cancellation.requested', 'cancellation.approved', 'cancellation.rejected', 'cancellation.direct']) assert.ok(buyerEvents.some(item => item.kind === kind), kind)
      const sellerEvents = await client.notification.findMany({ where: { customerId: companies[0], kind: 'seller.asset.dispatched' } })
      assert.equal(sellerEvents.length, 1)
      assert.deepEqual([sellerEvents[0]!.targetType, sellerEvents[0]!.targetId], ['ASSET', assetId])
      for (const privateValue of ['BUYER PRIVATE', '01099998888', 'PRIVATE ADDRESS', 'PRIVATE ADMIN NOTE', orderId]) assert.equal(JSON.stringify(sellerEvents, (_, value) => typeof value === 'bigint' ? value.toString() : value).includes(privateValue), false)
      assert.match(sellerEvents[0]!.description, /출고 1 EA, 잔여 9 EA/)
    })
    await context.test('notification failure rolls back the source business and its audit', async () => {
      const failing = client.$extends({ query: { notification: { upsert: async () => { throw new Error('notification-storage-failure') } } } }) as unknown as PrismaClient
      const before = await client.receiving.count({ where: { customerId: companies[0] } })
      const beforeAudit = await client.receivingChange.count({ where: { actorUserId: seller.id } })
      await assert.rejects(createReceivingRepository(failing).create(seller, input, []), /notification-storage-failure/)
      assert.equal(await client.receiving.count({ where: { customerId: companies[0] } }), before)
      assert.equal(await client.receivingChange.count({ where: { actorUserId: seller.id } }), beforeAudit)
    })
  } finally {
    await client.notification.deleteMany({ where: { customerId: { in: companies } } })
    await client.fulfillmentOperation.deleteMany({ where: { actorUserId: { in: ids } } })
    await client.fulfillmentChange.deleteMany({ where: { actorUserId: { in: ids } } })
    const orders = { order: { customerId: { in: companies } } }
    await client.shipmentItem.deleteMany({ where: { shipment: orders } })
    await client.shipment.deleteMany({ where: orders })
    await client.orderCancellationItem.deleteMany({ where: { cancellation: orders } })
    await client.orderCancellation.deleteMany({ where: orders })
    await client.purchaseOrderItem.deleteMany({ where: orders })
    await client.purchaseOrder.deleteMany({ where: { customerId: { in: companies } } })
    await client.quoteOfferItem.deleteMany({ where: { offer: { quote: { customerId: { in: companies } } } } })
    await client.quoteOffer.deleteMany({ where: { quote: { customerId: { in: companies } } } })
    await client.purchaseQuoteItem.deleteMany({ where: { quote: { customerId: { in: companies } } } })
    await client.purchaseQuote.deleteMany({ where: { customerId: { in: companies } } })
    await client.product.deleteMany({ where: { asset: { customerId: { in: companies } } } })
    await client.saleRequest.deleteMany({ where: { actorUserId: { in: ids } } })
    await client.customerChange.deleteMany({ where: { actorUserId: { in: ids } } })
    await client.receivingChange.deleteMany({ where: { actorUserId: { in: ids } } })
    await client.disposalItem.deleteMany({ where: { disposal: { inspection: { receiving: { customerId: { in: companies } } } } } })
    await client.disposal.deleteMany({ where: { inspection: { receiving: { customerId: { in: companies } } } } })
    await client.inspectionItem.deleteMany({ where: { inspection: { receiving: { customerId: { in: companies } } } } })
    await client.inspection.deleteMany({ where: { receiving: { customerId: { in: companies } } } })
    await client.asset.deleteMany({ where: { customerId: { in: companies } } })
    await client.receiving.deleteMany({ where: { customerId: { in: companies } } })
    await client.user.deleteMany({ where: { id: { in: ids } } })
    await client.customer.deleteMany({ where: { id: { in: companies } } })
    await client.location.deleteMany({ where: { id: locationId } })
    if (ownedItem) await client.masterItem.delete({ where: { id: itemId } })
    if (ownedCategories) for (const id of categories.toReversed()) await client.materialCategory.deleteMany({ where: { id } })
    if (sequence) await client.assetSequence.update({ where: { dateCode: '800101' }, data: { last: sequence.last } })
    else await client.assetSequence.deleteMany({ where: { dateCode: '800101' } })
    await database.close()
  }
})

test('notification HTTP protects customer audience and strict input, documents all routes', async () => {
  const secret = 'notification-test-secret-at-least-32'
  const user: AuthUser = { id: randomUUID(), email: 'test@example.test', passwordHash: '', companyName: 'Test', managerName: 'Test', role: 'CUSTOMER', status: 'ACTIVE', sessionVersion: 0, customerId: 'TEST', customer: { id: 'TEST', name: 'Test', businessNumber: null, representativeName: 'Test', address: '', phone: '', status: 'ACTIVE', accessVersion: 0 } }
  const auth: AuthRepository = { findById: async () => user, findByEmail: async () => user, createRegistration: async () => { throw new Error('unused') }, listMembers: async () => [], approveMember: async () => null }
  const totals = { totalCount: 0, unreadCount: 0, windowDays: 90 as const, asOf: new Date().toISOString() }
  const calls: string[] = []
  const notifications: NotificationRepository = { summary: async () => totals, list: async () => ({ items: [], hasMore: false, nextCursor: null, windowDays: 90 }), read: async () => { calls.push('read'); return totals }, readAll: async () => { calls.push('all'); return totals } }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret, expiresIn: '1h' }, notifications })
  const token = await new SignJWT({ email: user.email, sessionVersion: 0, customerVersion: 0 }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setAudience('customer').setExpirationTime('1h').sign(new TextEncoder().encode(secret))
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  assert.equal((await app.request('/api/customer/notifications')).status, 401)
  for (const path of ['/api/customer/notifications', '/api/customer/notifications/summary']) {
    const response = await app.request(path, { headers })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  }
  for (const query of ['?size=51', '?customerId=OTHER']) assert.equal((await app.request(`/api/customer/notifications${query}`, { headers })).status, 400)
  assert.equal((await app.request('/api/customer/notifications/read', { method: 'PATCH', headers, body: JSON.stringify({ ids: ['1', '1'] }) })).status, 400)
  assert.equal((await app.request('/api/customer/notifications/read-all', { method: 'POST', headers, body: JSON.stringify({ userId: 'other' }) })).status, 400)
  assert.equal((await app.request('/api/customer/notifications/read-all', { method: 'POST', headers, body: 'not-json' })).status, 400)
  assert.equal((await app.request('/api/customer/notifications/read-all', { method: 'POST', headers, body: ' '.repeat(9000) })).status, 413)
  assert.equal(calls.length, 0)
  assert.equal((await app.request('/api/customer/notifications/read', { method: 'PATCH', headers, body: JSON.stringify({ ids: ['1'] }) })).status, 200)
  assert.equal((await app.request('/api/customer/notifications/read-all', { method: 'POST', headers, body: '{}' })).status, 200)
  const adminToken = await new SignJWT({ email: user.email, sessionVersion: 0 }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setAudience('admin').setExpirationTime('1h').sign(new TextEncoder().encode(secret))
  assert.equal((await app.request('/api/customer/notifications', { headers: { Authorization: `Bearer ${adminToken}` } })).status, 401)
  const spec = await (await app.request('/api/openapi/customer.json')).json()
  for (const path of ['/api/customer/notifications', '/api/customer/notifications/summary', '/api/customer/notifications/read', '/api/customer/notifications/read-all']) assert.ok(spec.paths[path])
})

test('isolated MySQL notifications preserve scope, individual reads, window, pagination and transaction rollback', { skip: !process.env.MRS_NOTIFICATION_TEST_DB_PORT }, async context => {
  const name = process.env.MRS_NOTIFICATION_TEST_DB_NAME ?? 'mrs_test'
  assert.match(name, /^(?:mrs_test|receiving_preview|test_[a-z0-9_]+|[a-z0-9_]+_test)$/)
  const port = Number(process.env.MRS_NOTIFICATION_TEST_DB_PORT)
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536)
  const database = createDatabase({ host: '127.0.0.1', port, name, user: 'root', password: process.env.MRS_NOTIFICATION_TEST_DB_PASSWORD ?? '', poolMax: 4, timeoutMs: 5000 })
  const client = database.client
  const owners = [0, 1].map(() => `NOT-${randomUUID().slice(0, 8)}`)
  const users = [0, 1, 2].map(() => randomUUID())
  const now = new Date()
  const repository = createNotificationRepository(client)
  try {
    await client.customer.createMany({ data: owners.map(id => ({ id, name: 'Notification test', businessNumber: String(randomInt(1_000_000_000, 10_000_000_000)), representativeName: 'Test', address: 'Test', phone: '0212345678', status: 'ACTIVE' })) })
    await client.user.createMany({ data: users.map((id, index) => ({ id, email: `${id}@example.test`, passwordHash: 'not-a-login-password', companyName: 'Test', managerName: 'Test', managerPhone: '01012345678', role: 'CUSTOMER', status: 'ACTIVE', customerId: owners[index === 2 ? 1 : 0] })) })
    const auth = createAuthRepository(client)
    const first = (await auth.findById(users[0]!))!
    const second = (await auth.findById(users[1]!))!
    const foreign = (await auth.findById(users[2]!))!
    const event = (customerId: string, sourceId: string) => ({ customerId, sourceId, kind: 'quote.created' as const, targetType: 'QUOTE' as const, targetId: randomUUID() })
    const events = await client.$transaction(async transaction => {
      const one = await emitNotification(transaction, event(owners[0]!, 'first'))
      const duplicate = await emitNotification(transaction, { ...event(owners[0]!, 'first'), targetId: one.targetId })
      assert.equal(one.id, duplicate.id)
      const two = await emitNotification(transaction, event(owners[0]!, 'second'))
      const other = await emitNotification(transaction, event(owners[1]!, 'foreign'))
      const old = await emitNotification(transaction, event(owners[0]!, 'old'))
      await transaction.notification.update({ where: { id: old.id }, data: { createdAt: new Date(now.getTime() - 91 * 86400000) } })
      return { one, two, other }
    })
    await context.test('page cursors and counts use company and precise read state', async () => {
      assert.equal((await repository.summary(first)).unreadCount, 2)
      const page = await repository.list(first, notificationQuery.parse({ size: 1 }))
      assert.equal(page.items.length, 1)
      assert.equal(page.hasMore, true)
      const next = await repository.list(first, notificationQuery.parse({ size: 1, cursor: page.nextCursor }))
      assert.equal(next.items.length, 1)
      assert.notEqual(next.items[0]!.id, page.items[0]!.id)
      assert.equal(next.hasMore, false)
      assert.equal((await repository.summary(foreign)).unreadCount, 1)
    })
    await context.test('mixed foreign IDs make no changes and personal reads are idempotent', async () => {
      await assert.rejects(repository.read(first, [events.one.id.toString(), events.other.id.toString()]), /알림을 찾을/)
      assert.equal((await repository.summary(first)).unreadCount, 2)
      await Promise.all([repository.read(first, [events.one.id.toString()]), repository.read(first, [events.one.id.toString()])])
      assert.equal((await repository.summary(first)).unreadCount, 1)
      assert.equal((await repository.summary(second)).unreadCount, 2)
      assert.equal((await repository.list(first, notificationQuery.parse({ unreadOnly: 'true' }))).items.length, 1)
    })
    await context.test('all-read cannot swallow newly committed lower IDs', async () => {
      let release!: () => void
      let ready!: () => void
      const entered = new Promise<void>(resolve => { ready = resolve })
      const wait = new Promise<void>(resolve => { release = resolve })
      const pending = client.$transaction(async transaction => { const hidden = await emitNotification(transaction, event(owners[0]!, 'delayed-commit')); ready(); await wait; return hidden }, { timeout: 15000 })
      await entered
      try { await repository.readAll(first) } finally { release() }
      const committed = await pending
      assert.equal((await repository.list(first, notificationQuery.parse({ unreadOnly: 'true' }))).items.some(item => item.id === committed.id.toString()), true)
      await repository.readAll(first)
      assert.equal((await repository.summary(first)).unreadCount, 0)
      assert.equal((await repository.summary(second)).unreadCount, 3)
    })
    await context.test('rolled-back notifications leave no rows and stale memberships cannot read', async () => {
      await assert.rejects(client.$transaction(async transaction => { await emitNotification(transaction, event(owners[0]!, 'rollback')); throw new Error('rollback') }), /rollback/)
      assert.equal(await client.notification.count({ where: { sourceKey: { contains: 'rollback' }, customerId: owners[0] } }), 0)
      await client.user.update({ where: { id: first.id }, data: { customerId: owners[1], sessionVersion: { increment: 1 } } })
      await assert.rejects(repository.readAll(first), /활성 고객사/)
    })
  } finally {
    await client.notification.deleteMany({ where: { customerId: { in: owners } } })
    await client.user.deleteMany({ where: { id: { in: users } } })
    await client.customer.deleteMany({ where: { id: { in: owners } } })
    await database.close()
  }
})