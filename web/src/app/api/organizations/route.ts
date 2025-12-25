import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organizations
    const { data: memberships } = await supabase
      .from('organization_members')
      .select(`
        role,
        organization:organizations(*)
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')

    const organizations = memberships?.map(m => ({
      ...m.organization,
      role: m.role,
    })) || []

    return NextResponse.json({ organizations })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
