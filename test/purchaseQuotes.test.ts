import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quoteDocument, quoteRequest, type PurchaseQuote } from '../src/purchaseQuotes.ts'

test('purchase request documents escape snapshots and use stored exact totals', () => {
  const quote: PurchaseQuote = { id: 'quote', code: 'QUO-TEST', customerId: 'customer', actorUserId: 'user', company: '<script>company</script>', contactName: '담당자', phone: '010', email: '', address: '<img src=x onerror=alert(1)>', deliveryDate: null, note: '"<script>note</script>', createdAt: '2026-10-07T00:00:00Z', status: 'RECEIVED', total: '13814', originalTotal: '23023', items: [{ productId: 'PRD-TEST', name: '<script>product</script>', category: '전기', grade: 'A', unit: 'M', specification: '규격', brand: 'MRS', imageUrl: null, quantity: '1.001', unitPrice: '13800', originalUnitPrice: '23000', total: '13814', originalTotal: '23023' }] }
  const html = quoteDocument(quote)
  assert.equal(html.includes('<script>'), false)
  assert.equal(html.includes('<img src=x'), false)
  assert.match(html, /&lt;script&gt;company/)
  assert.match(html, /1\.001 M/)
  assert.match(html, /13,814/)
  assert.match(html, /구매 견적 요청서/)
  assert.match(html, /재고 확보를 의미하지 않습니다/)
})

test('quote requests cannot use a missing or switched customer session', async () => {
  await assert.rejects(quoteRequest('/api/customer/quotes', 'old-token'), /로그인 계정이 변경/)
})