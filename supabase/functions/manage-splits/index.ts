// Soledgic Edge Function: Manage Splits
// POST /manage-splits
// Configure tiers, per-creator rates, per-product rates
// SECURITY HARDENED VERSION

import { 
  getCorsHeaders,
  getSupabaseClient,
  validateApiKey,
  jsonResponse,
  errorResponse,
  validateId,
  getClientIp
} from '../_shared/utils.ts'

type Action = 'list_tiers' | 'get_effective_split' | 'set_creator_split' | 'clear_creator_split' | 'set_product_split' | 'clear_product_split' | 'auto_promote_creators'

interface ManageSplitsRequest {
  action: Action
  creator_id?: string
  creator_percent?: number
  product_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const apiKey = req.headers.get('x-api-key')
    if (!apiKey) {
      return errorResponse('Missing API key', 401, req)
    }

    const supabase = getSupabaseClient()
    const ledger = await validateApiKey(supabase, apiKey)

    if (!ledger) {
      return errorResponse('Invalid API key', 401, req)
    }

    if (ledger.status !== 'active') {
      return errorResponse('Ledger is not active', 403, req)
    }

    const body: ManageSplitsRequest = await req.json()

    switch (body.action) {
      case 'list_tiers': {
        const { data: tiers } = await supabase
          .from('creator_tiers')
          .select('*')
          .eq('ledger_id', ledger.id)
          .order('tier_order', { ascending: true })

        return jsonResponse({ success: true, data: tiers || [] }, 200, req)
      }

      case 'get_effective_split': {
        if (!body.creator_id) {
          return errorResponse('creator_id required', 400, req)
        }

        const creatorId = validateId(body.creator_id, 100)
        if (!creatorId) {
          return errorResponse('Invalid creator_id', 400, req)
        }

        const { data: account } = await supabase
          .from('accounts')
          .select('metadata')
          .eq('ledger_id', ledger.id)
          .eq('account_type', 'creator_balance')
          .eq('entity_id', creatorId)
          .single()

        if (account?.metadata?.custom_split_percent) {
          return jsonResponse({
            success: true,
            data: { 
              creator_id: creatorId, 
              creator_percent: account.metadata.custom_split_percent, 
              platform_percent: 100 - account.metadata.custom_split_percent, 
              source: 'custom' 
            }
          }, 200, req)
        }

        if (account?.metadata?.tier_id) {
          const { data: tier } = await supabase
            .from('creator_tiers')
            .select('*')
            .eq('id', account.metadata.tier_id)
            .single()

          if (tier) {
            return jsonResponse({
              success: true,
              data: { 
                creator_id: creatorId, 
                creator_percent: tier.creator_percent, 
                platform_percent: 100 - tier.creator_percent, 
                source: 'tier', 
                tier_name: tier.name 
              }
            }, 200, req)
          }
        }

        const defaultPercent = (ledger.settings as any)?.default_split_percent || 80
        return jsonResponse({
          success: true,
          data: { 
            creator_id: creatorId, 
            creator_percent: defaultPercent, 
            platform_percent: 100 - defaultPercent, 
            source: 'default' 
          }
        }, 200, req)
      }

      case 'set_creator_split': {
        if (!body.creator_id || body.creator_percent === undefined) {
          return errorResponse('creator_id and creator_percent required', 400, req)
        }

        const creatorId = validateId(body.creator_id, 100)
        if (!creatorId) {
          return errorResponse('Invalid creator_id', 400, req)
        }

        if (typeof body.creator_percent !== 'number' || body.creator_percent < 0 || body.creator_percent > 100) {
          return errorResponse('creator_percent must be 0-100', 400, req)
        }

        const { data: account } = await supabase
          .from('accounts')
          .select('id, metadata')
          .eq('ledger_id', ledger.id)
          .eq('account_type', 'creator_balance')
          .eq('entity_id', creatorId)
          .single()

        if (!account) {
          return errorResponse('Creator account not found', 404, req)
        }

        await supabase
          .from('accounts')
          .update({ metadata: { ...account.metadata, custom_split_percent: body.creator_percent } })
          .eq('id', account.id)

        supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'set_creator_split',
          entity_type: 'account',
          entity_id: account.id,
          actor_type: 'api',
          ip_address: getClientIp(req),
          request_body: { creator_id: creatorId, creator_percent: body.creator_percent }
        }).then(() => {}).catch(() => {})

        return jsonResponse({
          success: true,
          data: { 
            creator_id: creatorId, 
            creator_percent: body.creator_percent, 
            platform_percent: 100 - body.creator_percent 
          }
        }, 200, req)
      }

      case 'clear_creator_split': {
        if (!body.creator_id) {
          return errorResponse('creator_id required', 400, req)
        }

        const creatorId = validateId(body.creator_id, 100)
        if (!creatorId) {
          return errorResponse('Invalid creator_id', 400, req)
        }

        const { data: account } = await supabase
          .from('accounts')
          .select('id, metadata')
          .eq('ledger_id', ledger.id)
          .eq('account_type', 'creator_balance')
          .eq('entity_id', creatorId)
          .single()

        if (!account) {
          return errorResponse('Creator account not found', 404, req)
        }

        const newMetadata = { ...account.metadata }
        delete newMetadata.custom_split_percent

        await supabase
          .from('accounts')
          .update({ metadata: newMetadata })
          .eq('id', account.id)

        return jsonResponse({ success: true, message: 'Custom split cleared' }, 200, req)
      }

      case 'set_product_split': {
        if (!body.product_id || body.creator_percent === undefined) {
          return errorResponse('product_id and creator_percent required', 400, req)
        }

        const productId = validateId(body.product_id, 100)
        if (!productId) {
          return errorResponse('Invalid product_id', 400, req)
        }

        if (typeof body.creator_percent !== 'number' || body.creator_percent < 0 || body.creator_percent > 100) {
          return errorResponse('creator_percent must be 0-100', 400, req)
        }

        await supabase
          .from('product_splits')
          .upsert({
            ledger_id: ledger.id,
            product_id: productId,
            creator_percent: body.creator_percent
          }, { onConflict: 'ledger_id,product_id' })

        return jsonResponse({
          success: true,
          data: { 
            product_id: productId, 
            creator_percent: body.creator_percent, 
            platform_percent: 100 - body.creator_percent 
          }
        }, 200, req)
      }

      case 'clear_product_split': {
        if (!body.product_id) {
          return errorResponse('product_id required', 400, req)
        }

        const productId = validateId(body.product_id, 100)
        if (!productId) {
          return errorResponse('Invalid product_id', 400, req)
        }

        await supabase
          .from('product_splits')
          .delete()
          .eq('ledger_id', ledger.id)
          .eq('product_id', productId)

        return jsonResponse({ success: true, message: 'Product split cleared' }, 200, req)
      }

      case 'auto_promote_creators': {
        const { data: tiers } = await supabase
          .from('creator_tiers')
          .select('*')
          .eq('ledger_id', ledger.id)
          .order('tier_order', { ascending: true })

        if (!tiers || tiers.length === 0) {
          return jsonResponse({ success: true, promoted: 0, message: 'No tiers configured' }, 200, req)
        }

        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, entity_id, metadata, balance')
          .eq('ledger_id', ledger.id)
          .eq('account_type', 'creator_balance')

        let promoted = 0
        for (const account of accounts || []) {
          const totalEarned = Math.abs(Number(account.balance))
          
          for (const tier of tiers.slice().reverse()) {
            if (totalEarned >= (tier.min_earnings || 0)) {
              if (account.metadata?.tier_id !== tier.id) {
                await supabase
                  .from('accounts')
                  .update({ metadata: { ...account.metadata, tier_id: tier.id } })
                  .eq('id', account.id)
                promoted++
              }
              break
            }
          }
        }

        return jsonResponse({ success: true, promoted, message: `${promoted} creators promoted` }, 200, req)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req)
    }

  } catch (error: any) {
    console.error('Error in manage-splits:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
