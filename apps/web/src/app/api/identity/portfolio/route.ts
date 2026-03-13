import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getIdentityPortfolioForUser } from '@/lib/identity-server'

export const GET = createApiHandler(
  async (_request, { user }) => {
    const supabase = createServiceRoleClient()
    const portfolio = await getIdentityPortfolioForUser(supabase, user!.id)

    return NextResponse.json({
      summary: portfolio.summary,
      participants: portfolio.participants,
    })
  },
  {
    routePath: '/api/identity/portfolio',
    csrfProtection: false,
  },
)
