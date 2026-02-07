import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createApiHandler } from '@/lib/api-handler'

export const GET = createApiHandler(
  async (request: Request) => {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ notifications: [] })
    }

    // Get notifications
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
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
  { csrfProtection: false } // GET requests don't need CSRF
)

export const PATCH = createApiHandler(
  async (request: Request) => {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, notificationId, notificationIds } = body

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No organization' }, { status: 404 })
    }

    if (action === 'mark_read') {
      if (notificationId) {
        await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', notificationId)
          .eq('organization_id', membership.organization_id)
      } else if (notificationIds && Array.isArray(notificationIds)) {
        await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .in('id', notificationIds)
          .eq('organization_id', membership.organization_id)
      }
    } else if (action === 'mark_all_read') {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('organization_id', membership.organization_id)
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .is('read_at', null)
    } else if (action === 'dismiss') {
      if (notificationId) {
        await supabase
          .from('notifications')
          .update({ dismissed_at: new Date().toISOString() })
          .eq('id', notificationId)
          .eq('organization_id', membership.organization_id)
      }
    }

    return NextResponse.json({ success: true })
  },
  { csrfProtection: true }
)
