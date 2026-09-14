import { createContext } from 'react'

export const NotificationNavigation = createContext<{ unread: number; active: boolean; onOpen: () => void } | null>(null)