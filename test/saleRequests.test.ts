import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestAssetSale, submitAssetSales, type SaleSubmission, type SaleSubmissionResult } from '../src/saleRequests.ts'

const inputs: SaleSubmission[] = [{ assetId: '261008-0001', expectedQuantity: '10.125', desiredAmount: 100000 }, { assetId: '261008-0002', expectedQuantity: '2', desiredAmount: 20000 }]

test('multi-asset sales use sequential single-asset requests and report partial results', async () => {
  const calls: string[] = []
  const reported: SaleSubmissionResult[] = []
  const result = await submitAssetSales(inputs, 'test-session', result => reported.push(result), () => false, async input => {
    calls.push(input.assetId)
    if (input.assetId === inputs[1]!.assetId) throw new Error('가격 확인 필요')
    return { id: 'request-1' }
  })
  assert.deepEqual(calls, inputs.map(input => input.assetId))
  assert.deepEqual(result, reported)
  assert.equal(result[0]?.state, 'success')
  assert.equal(result[0]?.requestId, 'request-1')
  assert.equal(result[1]?.state, 'failed')
  const retryCalls: string[] = []
  await submitAssetSales(inputs.filter(input => result.some(entry => entry.assetId === input.assetId && entry.state === 'failed')), 'test-session', () => {}, () => false, async input => { retryCalls.push(input.assetId); return { id: 'request-2' } })
  assert.deepEqual(retryCalls, [inputs[1]!.assetId])
})

test('all batch input is validated before any request and cancelled work never starts', async () => {
  let calls = 0
  const send = async () => { calls += 1; return { id: 'request' } }
  for (const invalid of [[], [inputs[0]!, inputs[0]!], [inputs[0]!, { ...inputs[1]!, desiredAmount: 0 }], [{ ...inputs[0]!, expectedQuantity: '0' }], [{ ...inputs[0]!, desiredAmount: 1e12 + 1 }], [{ ...inputs[0]!, desiredAmount: 1.5 }], [{ ...inputs[0]!, assetId: '../other' }], Array.from({ length: 101 }, (_, index) => ({ ...inputs[0]!, assetId: `261008-${String(index).padStart(4, '0')}` }))]) await assert.rejects(submitAssetSales(invalid, 'session', () => {}, () => false, send))
  assert.deepEqual(await submitAssetSales(inputs, 'session', () => {}, () => true, send), [])
  assert.equal(calls, 0)
})

test('sale transport preserves existing API, stops on unknown outcomes and never sends under a changed session', async () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  let token = 'test-session'
  const calls: Array<{ path: string; init?: RequestInit }> = []
  Object.assign(globalThis, { window: { sessionStorage: { getItem: () => JSON.stringify({ accessToken: token, user: { email: 'test@example.test', role: 'CUSTOMER' } }), removeItem: () => { token = '' } }, dispatchEvent: () => true } })
  try {
    globalThis.fetch = async (path, init) => { calls.push({ path: String(path), init }); return Response.json({ success: true, data: { request: { id: 'request-id' } } }, { status: 201 }) }
    assert.deepEqual(await requestAssetSale(inputs[0]!, token), { id: 'request-id' })
    assert.equal(calls[0]?.path, '/api/assets/261008-0001/sale-requests')
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { desiredAmount: 100000, expectedQuantity: '10.125' })
    assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'Bearer test-session')
    await assert.rejects(requestAssetSale(inputs[0]!, 'old-session'), /로그인 상태가 변경/)
    assert.equal(calls.length, 1)
    globalThis.fetch = async () => { calls.push({ path: 'network-failure' }); throw new TypeError('Network failure') }
    const results = await submitAssetSales(inputs, token, () => {})
    assert.equal(results[0]?.state, 'unknown')
    assert.equal(results[1]?.state, 'failed')
    assert.match(results[1]!.message, /전송하지 않았/)
    assert.equal(calls.length, 2)
    globalThis.fetch = async () => Response.json({ success: false, error: { message: '수량 변경' } }, { status: 409 })
    const conflict = await submitAssetSales([inputs[0]!], token, () => {})
    assert.equal(conflict[0]?.state, 'blocked')
    assert.equal(conflict[0]?.message, '수량 변경')
    globalThis.fetch = async () => Response.json({ success: false }, { status: 401 })
    const expired = await submitAssetSales(inputs, token, () => {})
    assert.equal(expired[0]?.state, 'unknown')
    assert.match(expired[1]!.message, /전송하지 않았/)
  } finally {
    Object.assign(globalThis, { window: originalWindow, fetch: originalFetch })
  }
})