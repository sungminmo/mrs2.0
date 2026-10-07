import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createUuid } from './uuid'

export type CartItem = { id: string; productId: string; name: string; quantity: string; unit: string; grade: string; category: string; imageUrl: string | null; availableQuantity: string; minimumOrderQuantity: string; version: number; issues: string[]; unitPrice?: string; originalUnitPrice?: string }
export type CartData = { id: string | null; version: number; items: CartItem[] }
export type GuestItem = Omit<CartItem, 'unitPrice' | 'originalUnitPrice'>
type Batch = { operationId: string; owner: string; items: GuestItem[] }
type Intent = { quantity: string; sequence: number; error?: string }
type CartState = {
  sequence: number
  guest: GuestItem[]; batch: Batch | null; open: boolean; selected: string[]; intents: Record<string, Intent>; notice: string; noticeVersion: number; noticeKind: 'success' | 'error'
  addGuest: (item: GuestItem) => void; changeGuest: (id: string, quantity: string) => void; removeGuest: (ids: string[]) => void
  beginMerge: (owner: string) => Batch | null; finishMerge: (operationId: string) => void
  setOpen: (open: boolean) => void; select: (ids: string[]) => void; edit: (id: string, quantity: string) => number
  settle: (id: string, sequence: number, error?: string) => void; resetUI: () => void; message: (notice: string, kind?: 'success' | 'error') => void
}
export function validQuantity(quantity: string, unit: string) {
  return /^\d+(?:\.\d{1,3})?$/.test(quantity) && Number(quantity) > 0 && Number(quantity) <= 1e9 && (!['EA', 'BOX', 'PIECE'].includes(unit) || Number.isInteger(Number(quantity)))
}
export function addQuantity(first: string, second: string) {
  const scaled = (value: string) => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0')) }
  const total = scaled(first) + scaled(second)
  return `${total / 1000n}.${String(total % 1000n).padStart(3, '0')}`.replace(/\.?0+$/, '')
}
let storageWarning = false
const safeStorage = {
  getItem: (name: string) => { try { const value = localStorage.getItem(name); if (value) JSON.parse(value); return value } catch { return null } },
  setItem: (name: string, value: string) => { try { localStorage.setItem(name, value) } catch { if (!storageWarning) { storageWarning = true; queueMicrotask(() => useCartStore.getState().message('브라우저 저장 공간을 사용할 수 없어 새로고침 시 장바구니가 사라질 수 있습니다.')) } } },
  removeItem: (name: string) => { try { localStorage.removeItem(name) } catch { return } },
}
const guestItem = (value: unknown): value is GuestItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as GuestItem
  return typeof item.productId === 'string' && item.productId.length > 0 && item.productId.length <= 20 && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.unit === 'string' && typeof item.quantity === 'string' && validQuantity(item.quantity, item.unit) && typeof item.availableQuantity === 'string' && typeof item.minimumOrderQuantity === 'string' && typeof item.category === 'string' && typeof item.grade === 'string' && Array.isArray(item.issues) && item.issues.every(issue => typeof issue === 'string') && (item.imageUrl === null || typeof item.imageUrl === 'string')
}
export const useCartStore = create<CartState>()(persist((set, get) => ({
  sequence: 0, guest: [], batch: null, open: false, selected: [], intents: {}, notice: '', noticeVersion: 0, noticeKind: 'success',
  addGuest: item => {
    const current = get().guest.find(entry => entry.productId === item.productId)
    const quantity = current ? addQuantity(current.quantity, item.quantity) : item.quantity
    if (!validQuantity(quantity, item.unit) || (!current && get().guest.length >= 100)) throw new Error('장바구니 수량 또는 최대 100종 제한을 확인해 주세요.')
    const { unitPrice: _price, originalUnitPrice: _original, ...clean } = item as CartItem
    set({ guest: current ? get().guest.map(entry => entry.productId === item.productId ? { ...clean, id: current.id, quantity } : entry) : [...get().guest, clean] })
  },
  changeGuest: (id, quantity) => set({ guest: get().guest.map(item => item.id === id && validQuantity(quantity, item.unit) ? { ...item, quantity } : item) }),
  removeGuest: ids => set({ guest: get().guest.filter(item => !ids.includes(item.id)) }),
  beginMerge: owner => { if (get().batch) return get().batch; if (!get().guest.length) return null; const batch = { operationId: createUuid(), owner, items: get().guest }; set({ batch, guest: [] }); return batch },
  finishMerge: operationId => { if (get().batch?.operationId === operationId) set({ batch: null }) },
  setOpen: open => set({ open }), select: selected => set({ selected }),
  edit: (id, quantity) => { const sequence = get().sequence + 1; set({ sequence, intents: { ...get().intents, [id]: { quantity, sequence } } }); return sequence },
  settle: (id, sequence, error) => { const intent = get().intents[id]; if (intent?.sequence !== sequence) return; const intents = { ...get().intents }; if (error) intents[id] = { ...intent, error }; else delete intents[id]; set({ intents }) },
  resetUI: () => set({ intents: {}, selected: [], open: false, notice: '' }), message: (notice, noticeKind = 'success') => set({ notice, noticeKind, noticeVersion: get().noticeVersion + 1 }),
}), { name: 'mrs.guest.cart', version: 1, storage: createJSONStorage(() => safeStorage), partialize: state => ({ guest: state.guest, batch: state.batch }), merge: (persisted, current) => {
  const saved = persisted as { guest?: unknown[]; batch?: Batch } | undefined
  const guest = Array.isArray(saved?.guest) ? saved.guest.filter(guestItem).slice(0, 100).map(item => { const { unitPrice: _price, originalUnitPrice: _original, ...clean } = item as CartItem; return clean }) : []
  const batch = saved?.batch && typeof saved.batch.operationId === 'string' && typeof saved.batch.owner === 'string' && Array.isArray(saved.batch.items) && saved.batch.items.length <= 100 && saved.batch.items.every(guestItem) ? saved.batch : null
  return { ...current, guest, batch }
} }))