import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authenticatedFetch, readAuthSession, signOut, type AuthSession } from './authSession'
import { useCartStore, type CartData } from './cartStore'
import { CartQueue } from './cartQueue'
import { CartContext } from './cartContext'
import { createUuid } from './uuid'

class CartApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
export function CartQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
export function CartProvider({ session, children }: { session: AuthSession | null; children: ReactNode }) {
  const client = useQueryClient()
  const guest = useCartStore(state => state.guest)
  const intents = useCartStore(state => state.intents)
  const open = useCartStore(state => state.open)
  const owner = session ? `${session.user.id}/${session.user.customerId}` : ''
  const key = ['cart', owner]
  const [error, setError] = useState('')
  const active = useRef(true)
  const retryAdd = useRef<{ path: string; method: string; body: unknown } | null>(null)
  const request = async (path: string, method = 'GET', body?: unknown, signal?: AbortSignal) => {
    if (!session || readAuthSession()?.accessToken !== session.accessToken) throw new CartApiError('로그인 계정이 변경되었습니다.', 401)
    const response = await authenticatedFetch(path, { method, signal, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const result = await response.json()
    if (!response.ok) throw new CartApiError(result.error?.message ?? '장바구니 저장에 실패했습니다.', response.status)
    return result.data as CartData
  }
  const accept = (data: CartData) => { if (active.current) client.setQueryData<CartData>(key, current => !current || data.version >= current.version ? data : current) }
  const query = useQuery({ queryKey: key, enabled: !!session, queryFn: async ({ signal }) => { const data = await request('/api/cart', 'GET', undefined, signal); const cached = client.getQueryData<CartData>(key); if (active.current && cached?.items.some(item => data.items.some(next => next.id === item.id && next.unitPrice !== item.unitPrice))) useCartStore.getState().message('장바구니 상품 가격이 변경되어 최신 가격을 적용했습니다.'); return cached && cached.version > data.version ? cached : data }, staleTime: 0, retry: (attempt, failure) => attempt < 1 && (!(failure instanceof CartApiError) || failure.status >= 500) })
  const mutation = useMutation({ mutationFn: ({ path, method, body }: { path: string; method: string; body: unknown }) => request(path, method, body), retry: (attempt, failure) => attempt < 2 && (!(failure instanceof CartApiError) || failure.status >= 500) })
  const latest = useRef({ mutation, owner, query })
  useEffect(() => { latest.current = { mutation, owner, query } })
  const [queue] = useState(() => new CartQueue(async () => {}))
  useEffect(() => { queue.setSend(async id => {
    const intent = useCartStore.getState().intents[id]
    const item = client.getQueryData<CartData>(key)?.items.find(entry => entry.id === id)
    if (!intent || !item || !active.current) return
    try {
      accept(await latest.current.mutation.mutateAsync({ path: `/api/cart/items/${id}`, method: 'PATCH', body: { quantity: intent.quantity, expectedVersion: item.version } }))
      if (active.current) useCartStore.getState().settle(id, intent.sequence)
    } catch (failure) {
      if (!active.current) return
      useCartStore.getState().settle(id, intent.sequence, failure instanceof Error ? failure.message : '저장 실패')
      await latest.current.query.refetch()
    }
  }) })
  const merge = async () => {
    if (!session) return
    if (!useCartStore.getState().guest.length && !useCartStore.getState().batch) return
    if (!navigator.locks) { setError('현재 접속 환경에서는 비회원 장바구니를 자동 병합할 수 없습니다. HTTPS로 접속한 뒤 다시 시도해 주세요.'); useCartStore.getState().setOpen(true); return }
    await navigator.locks.request('mrs-guest-cart-merge', async () => {
      await useCartStore.persist.rehydrate()
      const batch = useCartStore.getState().beginMerge(owner)
      if (!batch) return
      if (batch.owner !== owner) { setError('이전 계정으로 병합 중이던 장바구니가 있습니다. 해당 계정으로 로그인해 완료해 주세요.'); return }
      try {
        const data = await latest.current.mutation.mutateAsync({ path: '/api/cart/sync', method: 'POST', body: { operationId: batch.operationId, items: batch.items.map(item => ({ productId: item.productId, quantity: item.quantity })) } })
        useCartStore.getState().finishMerge(batch.operationId)
        accept(data)
        if (active.current) setError('')
      } catch (failure) { if (active.current) { setError(failure instanceof Error ? failure.message : '병합 실패'); useCartStore.getState().setOpen(true) } }
    })
  }
  const initialMerge = useEffectEvent(() => { if (session) void queue.enqueue(merge).catch(() => {}) })
  const refetchOnOpen = useEffectEvent(() => { if (session) void query.refetch() })
  const beforeSignOut = useEffectEvent((event: Event) => {
    if (!session) return
    event.preventDefault()
    void queue.flush().then(() => {
      if (!active.current) return
      if (Object.keys(useCartStore.getState().intents).length) { useCartStore.getState().setOpen(true); setError('저장하지 못한 수량이 있습니다. 재시도 후 로그아웃해 주세요.'); return }
      signOut((event as CustomEvent<{ destination: string }>).detail.destination, true)
    }).catch(() => { if (active.current) setError('장바구니 저장 후 다시 로그아웃해 주세요.') })
  })
  useEffect(() => {
    active.current = true
    queue.start()
    initialMerge()
    const storage = (event: StorageEvent) => { if (event.key === 'mrs.guest.cart') void useCartStore.persist.rehydrate() }
    const beforeUnload = (event: BeforeUnloadEvent) => { if (Object.keys(useCartStore.getState().intents).length) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('storage', storage)
    window.addEventListener('beforeunload', beforeUnload)
    const signout = (event: Event) => beforeSignOut(event)
    window.addEventListener('mrs-before-signout', signout)
    return () => { active.current = false; queue.stop(); client.removeQueries({ queryKey: ['cart', owner] }); useCartStore.getState().resetUI(); window.removeEventListener('storage', storage); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('mrs-before-signout', signout) }
  }, [client, owner, queue])
  useEffect(() => { if (open) refetchOnOpen() }, [open])
  const run = (work: () => Promise<void>) => { void queue.enqueue(work).catch(failure => { if (active.current) { const message = failure instanceof Error ? failure.message : '장바구니 처리에 실패했습니다. 다시 시도해 주세요.'; setError(message); useCartStore.getState().message(message, 'error'); useCartStore.getState().setOpen(true) } }) }
  const data = session ? query.data ?? { id: null, version: 0, items: [] } : { id: null, version: 0, items: guest }
  return <CartContext value={{ member: !!session, data: { ...data, items: data.items.map(item => ({ ...item, quantity: intents[item.id] && !intents[item.id].error ? intents[item.id].quantity : item.quantity })) }, loading: !!session && query.isPending, refreshing: !!session && query.isFetching, busy: mutation.isPending || (!!session && !!useCartStore.getState().batch), error: error || (query.error?.message ?? ''), refresh: () => { setError(''); if (retryAdd.current) run(async () => { accept(await mutation.mutateAsync(retryAdd.current!)); retryAdd.current = null; useCartStore.getState().message('장바구니에 담았습니다.') }); else void query.refetch() }, merge: () => run(merge), close: () => { void queue.flush().catch(() => {}); useCartStore.getState().setOpen(false) }, add: item => {
    if (!session) { try { useCartStore.getState().addGuest(item); setError(''); useCartStore.getState().message('장바구니에 담았습니다.') } catch (failure) { const message = failure instanceof Error ? failure.message : '장바구니에 담지 못했습니다. 다시 시도해 주세요.'; setError(message); useCartStore.getState().message(message, 'error') } return }
    run(async () => { const body = { operationId: createUuid(), productId: item.productId, quantity: item.quantity }; if (useCartStore.getState().batch) throw new Error('비회원 장바구니 병합을 먼저 완료해 주세요.'); retryAdd.current = { path: '/api/cart/items', method: 'POST', body }; accept(await mutation.mutateAsync(retryAdd.current)); retryAdd.current = null; setError(''); useCartStore.getState().message('장바구니에 담았습니다.') })
  }, change: (id, quantity) => { if (!session) { useCartStore.getState().changeGuest(id, quantity); return } useCartStore.getState().edit(id, quantity); queue.schedule(id) }, remove: ids => {
    if (!session) { useCartStore.getState().removeGuest(ids); return }
    for (const id of ids) { queue.cancel(id); const intent = useCartStore.getState().intents[id]; if (intent) useCartStore.getState().settle(id, intent.sequence) }
    run(async () => { const items = client.getQueryData<CartData>(key)?.items.filter(item => ids.includes(item.id)).map(item => ({ id: item.id, expectedVersion: item.version })) ?? []; if (!items.length) return; accept(await mutation.mutateAsync({ path: '/api/cart/items', method: 'DELETE', body: { items } })); setError('') })
  } }}>{children}</CartContext>
}