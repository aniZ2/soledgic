import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { provisionOrganizationWithLedgers } from '@/lib/org-provisioning'

export async function POST(request: Request) {
  const body = await request.json()
  const { orgName, ledgerName, ledgerMode } = body

  if (!orgName || !ledgerName || !ledgerMode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  try {
    const data = await provisionOrganizationWithLedgers({
      userId: user.id,
      userEmail: user.email,
      organizationName: orgName,
      organizationSlug: slug,
      ledgerName,
      ledgerMode: ledgerMode === 'marketplace' ? 'marketplace' : 'standard',
    })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create organization' },
      { status: 500 }
    )
  }
}
