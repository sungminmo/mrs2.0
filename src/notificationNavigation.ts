import { createContext } from 'react'

export const NotificationNavigation = createContext<{ unread: number | null; active: boolean; onOpen: () => void; error?: boolean } | null>(null)