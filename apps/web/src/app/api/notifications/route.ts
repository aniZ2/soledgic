import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'

interface NotificationPatchBody {
  action?: 'mark_read' | 'mark_all_read' | 'dismiss'
  notificationId?: string
  notificationIds?: string[]
}

export const GET = createApiHandler(
  async (request: Request, { user }) => {
    const supabase = await createClient()

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json({ notifications: [] })
    }

    // Get notifications
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .or(`user_id.is.null,user_id.eq.${user!.id}`)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const unreadCount = notifications?.filter(n => !n.read_at).length || 0

    return NextResponse.json({
      notifications: notifications || [],
      unreadCount
    })
  },
  {
    csrfProtection: false, // GET requests don't need CSRF
    routePath: '/api/notifications',
  }
)

export const PATCH = createApiHandler(
  async (request: Request, { user }) => {
    const supabase = await createClient()

    const { data: body, error: parseError } = await parseJsonBody<NotificationPatchBody>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    const { action, notificationId, notificationIds } = body
    if (!action || !['mark_read', 'mark_all_read', 'dismiss'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No organization' }, { status: 404 })
    }

    const scopedRecipientFilter = `user_id.is.null,user_id.eq.${user!.id}`

    if (action === 'mark_read') {
      if (notificationId) {
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', notificationId)
          .eq('organization_id', membership.organization_id)
          .or(scopedRecipientFilter)
        if (error) {
          return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
        }
      } else if (notificationIds && Array.isArray(notificationIds)) {
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .in('id', notificationIds)
          .eq('organization_id', membership.organization_id)
          .or(scopedRecipientFilter)
        if (error) {
          return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: 'notificationId or notificationIds is required' }, { status: 400 })
      }
    } else if (action === 'mark_all_read') {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('organization_id', membership.organization_id)
        .or(scopedRecipientFilter)
        .is('read_at', null)
      if (error) {
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
      }
    } else if (action === 'dismiss') {
      if (notificationId) {
        const { error } = await supabase
          .from('notifications')
          .update({ dismissed_at: new Date().toISOString() })
          .eq('id', notificationId)
          .eq('organization_id', membership.organization_id)
          .or(scopedRecipientFilter)
        if (error) {
          return NextResponse.json({ error: 'Failed to dismiss notification' }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: 'notificationId is required' }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true })
  },
  {
    csrfProtection: true,
    routePath: '/api/notifications',
  }
)
