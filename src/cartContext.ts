import { createContext, useContext } from 'react'
import type { CartData, GuestItem } from './cartStore'
export type CartActions = { member: boolean; data: CartData; loading: boolean; refreshing: boolean; busy: boolean; error: string; add: (item: GuestItem) => void; change: (id: string, quantity: string) => void; remove: (ids: string[]) => void; refresh: () => void; merge: () => void; close: () => void }
export const CartContext = createContext<CartActions | null>(null)
export function useCart() { const value = useContext(CartContext); if (!value) throw new Error('장바구니 컨텍스트가 필요합니다.'); return value }