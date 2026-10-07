import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CartQueue } from '../src/cartQueue.ts'
import { addQuantity, useCartStore, validQuantity } from '../src/cartStore.ts'

test('cart quantities use exact decimal addition and unit validation', () => {
  assert.equal(addQuantity('0.001', '0.009'), '0.01')
  assert.equal(addQuantity('1', '9'), '10')
  assert.equal(addQuantity('999999999.999', '0.001'), '1000000000')
  assert.equal(validQuantity('1.001', 'EA'), false)
  assert.equal(validQuantity('1.001', 'M'), true)
  for (const value of ['0', '-1', '1.0001', '1e2', '1000000001']) assert.equal(validQuantity(value, 'M'), false)
})
test('guest cart and optimistic state are synchronous and late responses cannot clear newer intent', () => {
  const store = useCartStore.getState()
  useCartStore.setState({ guest: [], batch: null })
  const item = { id: 'PRD-1', productId: 'PRD-1', name: '자재', quantity: '1', unit: 'EA', grade: 'A', category: '', imageUrl: null, availableQuantity: '10', minimumOrderQuantity: '1', version: 0, issues: [] }
  store.addGuest(item); store.addGuest(item)
  assert.equal(useCartStore.getState().guest[0]?.quantity, '2')
  const first = store.edit(item.id, '3')
  const second = store.edit(item.id, '4')
  store.settle(item.id, first)
  assert.equal(useCartStore.getState().intents[item.id]?.quantity, '4')
  store.settle(item.id, second, 'offline')
  assert.equal(useCartStore.getState().intents[item.id]?.error, 'offline')
  const batch = store.beginMerge('user')!
  assert.equal(store.beginMerge('user')?.operationId, batch.operationId)
  store.addGuest(item)
  store.finishMerge('wrong-id')
  assert.ok(useCartStore.getState().batch)
  store.finishMerge(batch.operationId)
  assert.equal(useCartStore.getState().guest.length, 1)
  store.resetUI()
})
test('quantity debounce sends once after 750ms and delete cancels pending changes', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const sent: string[] = []
  const queue = new CartQueue(async id => { sent.push(id) })
  for (let click = 0; click < 10; click++) queue.schedule('item')
  context.mock.timers.tick(749)
  assert.deepEqual(sent, [])
  context.mock.timers.tick(1)
  await queue.enqueue(async () => {})
  assert.deepEqual(sent, ['item'])
  queue.schedule('deleted'); queue.cancel('deleted')
  context.mock.timers.tick(1000)
  await queue.enqueue(async () => {})
  assert.deepEqual(sent, ['item'])
  queue.stop()
})
test('queue serializes inflight updates and can restart for StrictMode', async () => {
  const sent: string[] = []
  let release!: () => void
  const queue = new CartQueue(async () => {})
  const first = queue.enqueue(async () => { await new Promise<void>(resolve => { release = resolve }); sent.push('first') })
  await Promise.resolve(); await Promise.resolve()
  const second = queue.enqueue(async () => { sent.push('second') })
  assert.deepEqual(sent, [])
  release(); await first; await second
  assert.deepEqual(sent, ['first', 'second'])
  queue.stop(); queue.start()
  await queue.enqueue(async () => { sent.push('restart') })
  assert.equal(sent[2], 'restart')
})
test('corrupt persisted guest rows are discarded before rendering', () => {
  const merge = useCartStore.persist.getOptions().merge!
  const state = merge({ guest: [{ id: 'bad', productId: 'bad', name: 'bad', unit: 'EA', quantity: '1', availableQuantity: '1', minimumOrderQuantity: '1', category: '', grade: 'A', imageUrl: null, issues: null }], batch: null }, useCartStore.getState())
  assert.equal(state.guest.length, 0)
})