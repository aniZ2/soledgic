'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, Check, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  action_url: string | null
  read_at: string | null
  created_at: string
}

const TYPE_ICONS: Record<string, { color: string; bgColor: string }> = {
  payout_processed: { color: 'text-green-600', bgColor: 'bg-green-500/10' },
  payout_failed: { color: 'text-red-600', bgColor: 'bg-red-500/10' },
  sale_recorded: { color: 'text-blue-600', bgColor: 'bg-blue-500/10' },
  period_closed: { color: 'text-purple-600', bgColor: 'bg-purple-500/10' },
  reconciliation_mismatch: { color: 'text-amber-600', bgColor: 'bg-amber-500/10' },
  webhook_failed: { color: 'text-red-600', bgColor: 'bg-red-500/10' },
  limit_warning: { color: 'text-amber-600', bgColor: 'bg-amber-500/10' },
  limit_reached: { color: 'text-red-600', bgColor: 'bg-red-500/10' },
  trial_ending: { color: 'text-amber-600', bgColor: 'bg-amber-500/10' },
  payment_failed: { color: 'text-red-600', bgColor: 'bg-red-500/10' },
  security_alert: { color: 'text-red-600', bgColor: 'bg-red-500/10' },
  team_invite: { color: 'text-blue-600', bgColor: 'bg-blue-500/10' },
  system: { color: 'text-gray-600', bgColor: 'bg-gray-500/10' },
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadNotifications()

    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Close dropdown when clicking outside
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadNotifications = async () => {
    try {
      const response = await fetch('/api/notifications')
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      }
    } catch (error) {
      console.error('Failed to load notifications:', error)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await fetchWithCsrf('/api/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'mark_read', notificationId })
      })
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await fetchWithCsrf('/api/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'mark_all_read' })
      })
      setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const dismissNotification = async (notificationId: string) => {
    try {
      await fetchWithCsrf('/api/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'dismiss', notificationId })
      })
      setNotifications(prev => prev.filter(n => n.id !== notificationId))
      const notification = notifications.find(n => n.id === notificationId)
      if (notification && !notification.read_at) {
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error('Failed to dismiss notification:', error)
    }
  }

  const formatTime = (date: string) => {
    const now = new Date()
    const created = new Date(date)
    const diffMs = now.getTime() - created.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return created.toLocaleDateString()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => {
                  const typeStyle = TYPE_ICONS[notification.type] || TYPE_ICONS.system
                  return (
                    <div
                      key={notification.id}
                      className={`px-4 py-3 hover:bg-accent/50 transition-colors ${
                        !notification.read_at ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 ${
                          !notification.read_at ? 'bg-primary' : 'bg-transparent'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {notification.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {formatTime(notification.created_at)}
                            </span>
                            {notification.action_url && (
                              <Link
                                href={notification.action_url}
                                onClick={() => markAsRead(notification.id)}
                                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                              >
                                View <ExternalLink className="w-3 h-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => dismissNotification(notification.id)}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                          title="Dismiss"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
