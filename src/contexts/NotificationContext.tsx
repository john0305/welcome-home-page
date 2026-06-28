import React, { createContext, useContext, useState, useCallback } from 'react'
import type { AppNotification, NotificationPreferences } from '@/types/notifications'
import { DEFAULT_NOTIFICATION_PREFS } from '@/types/notifications'
import { generateId } from '@/lib/utils'

interface NotificationContextValue {
  notifications: AppNotification[]
  unreadCount: number
  prefs: NotificationPreferences
  add: (n: Omit<AppNotification, 'id' | 'read' | 'created_at'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  dismiss: (id: string) => void
  clearAll: () => void
  updatePrefs: (prefs: Partial<NotificationPreferences>) => void
  requestBrowserPush: () => Promise<boolean>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)
const PREFS_KEY = 'radariq_notification_prefs'

// Notifications come from real events (optimization completed, sync results,
// performance attribution, etc.). The bar starts empty and fills in as the
// app generates real signals — no canned demo entries.

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [prefs, setPrefs] = useState<NotificationPreferences>(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY)
      return stored ? { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(stored) } : DEFAULT_NOTIFICATION_PREFS
    } catch {
      return DEFAULT_NOTIFICATION_PREFS
    }
  })

  const unreadCount = notifications.filter(n => !n.read).length

  const add = useCallback((n: Omit<AppNotification, 'id' | 'read' | 'created_at'>) => {
    const notification: AppNotification = {
      ...n,
      id: generateId(),
      read: false,
      created_at: new Date().toISOString(),
    }
    setNotifications(prev => [notification, ...prev].slice(0, 50)) // keep last 50
  }, [])

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const clearAll = useCallback(() => setNotifications([]), [])

  const updatePrefs = useCallback((updates: Partial<NotificationPreferences>) => {
    setPrefs(prev => {
      const next = { ...prev, ...updates }
      localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const requestBrowserPush = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    const result = await Notification.requestPermission()
    const granted = result === 'granted'
    if (granted) updatePrefs({ browser_push: true })
    return granted
  }, [updatePrefs])

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, prefs,
      add, markRead, markAllRead, dismiss, clearAll, updatePrefs, requestBrowserPush,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
