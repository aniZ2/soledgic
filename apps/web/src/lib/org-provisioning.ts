import { createServerClient } from '@supabase/ssr'
import { createHash } from 'crypto'

export type ProvisionLedgerMode = 'standard' | 'marketplace'

export interface FinixSettingsPatch {
  identity_id?: string
  merchant_id?: string
  source_id?: string
  onboarding_form_id?: string
}

export interface ProvisionOrganizationInput {
  userId: string
  userEmail?: string | null
  organizationName: string
  organizationSlug?: string
  ledgerName?: string
  ledgerMode?: ProvisionLedgerMode
  finix?: FinixSettingsPatch
  reuseIfSlugExists?: boolean
}

export interface ProvisionOrganizationResult {
  organizationId: string
  organizationSlug: string
  organizationName: string
  testLedgerId: string
  liveLedgerId: string
  ledgerGroupId: string
  testApiKey: string | null
  liveApiKey: string | null
  createdOrganization: boolean
}

type JsonObject = Record<string, unknown>

type ExistingOrganization = {
  id: string
  name: string
  slug: string
  owner_id: string
  settings: JsonObject | null
}

type ExistingLedger = {
  id: string
  livemode: boolean
  ledger_group_id: string
  api_key: string | null
}

function createServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
    }
  )
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || `org-${crypto.randomUUID().slice(0, 8)}`
}

function randomSuffix(length = 6): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, length)
}

function makeApiKey(livemode: boolean): string {
  return `sk_${livemode ? 'live' : 'test'}_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

function isNoRowsError(error: { code?: string } | null): boolean {
  return Boolean(error?.code === 'PGRST116')
}

async function ensureOrganization(input: ProvisionOrganizationInput) {
  const supabase = createServiceClient()
  const baseSlug = slugify(input.organizationSlug || input.organizationName)
  const organizationName = input.organizationName.trim()
  let slug = baseSlug

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: existing, error: existingError } = await supabase
      .from('organizations')
      .select('id, name, slug, owner_id, settings')
      .eq('slug', slug)
      .maybeSingle<ExistingOrganization>()

    if (existingError && !isNoRowsError(existingError)) {
      throw new Error(`Failed checking organization slug: ${existingError.message}`)
    }

    if (existing) {
      if (existing.owner_id === input.userId || input.reuseIfSlugExists) {
        if (existing.name !== organizationName || existing.owner_id !== input.userId) {
          const { error: updateError } = await supabase
            .from('organizations')
            .update({ name: organizationName, owner_id: input.userId })
            .eq('id', existing.id)
          if (updateError) {
            throw new Error(`Failed updating organization owner: ${updateError.message}`)
          }
        }

        return {
          organizationId: existing.id,
          organizationSlug: slug,
          organizationName,
          created: false,
        }
      }

      slug = `${baseSlug}-${randomSuffix(4)}`
      continue
    }

    const { data: created, error: createError } = await supabase
      .from('organizations')
      .insert({
        name: organizationName,
        slug,
        owner_id: input.userId,
      })
      .select('id')
      .single<{ id: string }>()

    if (!createError && created?.id) {
      return {
        organizationId: created.id,
        organizationSlug: slug,
        organizationName,
        created: true,
      }
    }

    if (createError?.code === '23505') {
      slug = `${baseSlug}-${randomSuffix(4)}`
      continue
    }

    throw new Error(`Failed creating organization: ${createError?.message || 'unknown error'}`)
  }

  throw new Error('Failed to reserve unique organization slug')
}

async function ensureOwnerMembership(organizationId: string, userId: string) {
  const supabase = createServiceClient()
  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('id, role, status')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle<{ id: string; role: string; status: string | null }>()

  if (membershipError && !isNoRowsError(membershipError)) {
    throw new Error(`Failed checking organization membership: ${membershipError.message}`)
  }

  if (!membership) {
    const { error: insertError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        role: 'owner',
        status: 'active',
      })
    if (insertError) {
      throw new Error(`Failed creating owner membership: ${insertError.message}`)
    }
    return
  }

  if (membership.role !== 'owner' || membership.status !== 'active') {
    const { error: updateError } = await supabase
      .from('organization_members')
      .update({ role: 'owner', status: 'active' })
      .eq('id', membership.id)
    if (updateError) {
      throw new Error(`Failed updating owner membership: ${updateError.message}`)
    }
  }
}

async function ensureLedgerApiKey(ledgerId: string, livemode: boolean) {
  const supabase = createServiceClient()
  const apiKey = makeApiKey(livemode)
  const apiKeyHash = hashApiKey(apiKey)

  const { error } = await supabase
    .from('ledgers')
    .update({
      api_key: apiKey,
      api_key_hash: apiKeyHash,
    })
    .eq('id', ledgerId)

  if (error) {
    throw new Error(`Failed updating missing API key: ${error.message}`)
  }

  return apiKey
}

async function maybeCreateApiKeyRecords(
  rows: Array<{ ledger_id: string; name: string; key_hash: string; key_prefix: string; scopes: string[]; created_by: string }>
) {
  if (rows.length === 0) return

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('api_keys')
    .insert(rows)

  if (error && error.code !== '42P01') {
    // Keep provisioning resilient; this table is not required for runtime auth.
    console.warn('api_keys insert skipped:', error.code)
  }
}

async function ensureLedgerPair(input: ProvisionOrganizationInput, organizationId: string) {
  const supabase = createServiceClient()
  const ledgerMode = input.ledgerMode || 'standard'
  const businessName = input.ledgerName?.trim() || input.organizationName.trim()
  const ownerEmail = input.userEmail?.toLowerCase() || 'admin@soledgic.com'

  const { data: existingLedgers, error: fetchError } = await supabase
    .from('ledgers')
    .select('id, livemode, ledger_group_id, api_key')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .returns<ExistingLedger[]>()

  if (fetchError) {
    throw new Error(`Failed fetching ledgers: ${fetchError.message}`)
  }

  let testLedger = existingLedgers?.find((ledger) => ledger.livemode === false) || null
  let liveLedger = existingLedgers?.find((ledger) => ledger.livemode === true) || null
  const ledgerGroupId =
    testLedger?.ledger_group_id ||
    liveLedger?.ledger_group_id ||
    crypto.randomUUID()

  const rowsToInsert: Array<Record<string, unknown>> = []

  if (!testLedger) {
    const apiKey = makeApiKey(false)
    rowsToInsert.push({
      organization_id: organizationId,
      platform_name: businessName,
      owner_email: ownerEmail,
      business_name: businessName,
      ledger_mode: ledgerMode,
      status: 'active',
      ledger_group_id: ledgerGroupId,
      livemode: false,
      settings: { currency: 'USD', fiscal_year_start: 1 },
      api_key: apiKey,
      api_key_hash: hashApiKey(apiKey),
    })
  }

  if (!liveLedger) {
    const apiKey = makeApiKey(true)
    rowsToInsert.push({
      organization_id: organizationId,
      platform_name: businessName,
      owner_email: ownerEmail,
      business_name: businessName,
      ledger_mode: ledgerMode,
      status: 'active',
      ledger_group_id: ledgerGroupId,
      livemode: true,
      settings: { currency: 'USD', fiscal_year_start: 1 },
      api_key: apiKey,
      api_key_hash: hashApiKey(apiKey),
    })
  }

  if (rowsToInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from('ledgers')
      .insert(rowsToInsert)
      .select('id, livemode, ledger_group_id, api_key')
      .returns<ExistingLedger[]>()

    if (insertError) {
      throw new Error(`Failed creating ledger pair: ${insertError.message}`)
    }

    for (const ledger of inserted || []) {
      if (ledger.livemode) {
        liveLedger = ledger
      } else {
        testLedger = ledger
      }
    }

    await maybeCreateApiKeyRecords(
      (inserted || [])
        .filter((ledger) => typeof ledger.api_key === 'string' && ledger.api_key.length > 0)
        .map((ledger) => {
          const apiKey = (ledger.api_key || '') as string
          return {
            ledger_id: ledger.id,
            name: ledger.livemode ? 'Default Live Key' : 'Default Test Key',
            key_hash: hashApiKey(apiKey),
            key_prefix: apiKey.slice(0, 12),
            scopes: ['read', 'write', 'admin'],
            created_by: input.userId,
          }
        })
    )
  }

  if (!testLedger || !liveLedger) {
    throw new Error('Failed to ensure both test and live ledgers')
  }

  if (!testLedger.api_key) {
    testLedger.api_key = await ensureLedgerApiKey(testLedger.id, false)
  }

  if (!liveLedger.api_key) {
    liveLedger.api_key = await ensureLedgerApiKey(liveLedger.id, true)
  }

  return {
    testLedger,
    liveLedger,
    ledgerGroupId: testLedger.ledger_group_id || liveLedger.ledger_group_id,
  }
}

async function mergeFinixSettings(organizationId: string, patch: FinixSettingsPatch) {
  const cleanedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => Boolean(value))
  ) as FinixSettingsPatch

  if (Object.keys(cleanedPatch).length === 0) return

  const supabase = createServiceClient()
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .single<{ settings: JsonObject | null }>()

  if (orgError) {
    throw new Error(`Failed loading organization settings: ${orgError.message}`)
  }

  const currentSettings = (org?.settings || {}) as JsonObject
  const currentFinix = (currentSettings.finix || {}) as JsonObject
  const nextSettings: JsonObject = {
    ...currentSettings,
    finix: {
      ...currentFinix,
      ...cleanedPatch,
      last_synced_at: new Date().toISOString(),
    },
  }

  const { error: updateError } = await supabase
    .from('organizations')
    .update({ settings: nextSettings })
    .eq('id', organizationId)

  if (updateError) {
    throw new Error(`Failed updating Finix settings: ${updateError.message}`)
  }
}

export async function provisionOrganizationWithLedgers(
  input: ProvisionOrganizationInput
): Promise<ProvisionOrganizationResult> {
  const organizationName = input.organizationName.trim()
  if (!organizationName) {
    throw new Error('Organization name is required')
  }

  if (!input.userId) {
    throw new Error('User ID is required')
  }

  const organization = await ensureOrganization({
    ...input,
    organizationName,
  })
  await ensureOwnerMembership(organization.organizationId, input.userId)
  const ledgers = await ensureLedgerPair(input, organization.organizationId)

  if (input.finix) {
    await mergeFinixSettings(organization.organizationId, input.finix)
  }

  return {
    organizationId: organization.organizationId,
    organizationSlug: organization.organizationSlug,
    organizationName: organization.organizationName,
    testLedgerId: ledgers.testLedger.id,
    liveLedgerId: ledgers.liveLedger.id,
    ledgerGroupId: ledgers.ledgerGroupId,
    testApiKey: ledgers.testLedger.api_key,
    liveApiKey: ledgers.liveLedger.api_key,
    createdOrganization: organization.created,
  }
}
