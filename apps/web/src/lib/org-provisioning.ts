import { createHash } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service'

export type ProvisionLedgerMode = 'standard' | 'marketplace'

export interface ProvisionOrganizationInput {
  userId: string
  userEmail?: string | null
  organizationName: string
  organizationSlug?: string
  ledgerName?: string
  ledgerMode?: ProvisionLedgerMode
  reuseIfSlugExists?: boolean
}

export interface ProvisionOrganizationResult {
  organizationId: string
  organizationSlug: string
  organizationName: string
  testLedgerId: string
  liveLedgerId: string
  ledgerGroupId: string
  // Returned only when a new key had to be generated during this call.
  testApiKey: string | null
  liveApiKey: string | null
  createdOrganization: boolean
}

type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null
}

function getStringField(value: unknown, key: string): string | null {
  if (!isJsonObject(value)) return null
  const raw = value[key]
  return typeof raw === 'string' ? raw : null
}

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
  api_key_hash: string | null
}

let cachedServiceClient: ReturnType<typeof createServiceRoleClient> | null = null

function createServiceClient() {
  return createServiceRoleClient()
}

function getServiceClient() {
  if (!cachedServiceClient) {
    cachedServiceClient = createServiceClient()
  }
  return cachedServiceClient
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
  const supabase = getServiceClient()
  const baseSlug = slugify(input.organizationSlug || input.organizationName)
  const organizationName = input.organizationName.trim()
  let slug = baseSlug

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: existingRaw, error: existingError } = await supabase
      .from('organizations')
      .select('id, name, slug, owner_id, settings')
      .eq('slug', slug)
      .maybeSingle()

    const existing = existingRaw as ExistingOrganization | null

    if (existingError && !isNoRowsError(existingError)) {
      throw new Error(`Failed checking organization slug: ${existingError.message}`)
    }

    if (existing) {
      if (existing.owner_id === input.userId) {
        if (existing.name !== organizationName) {
          const { error: updateError } = await supabase
            .from('organizations')
            .update({ name: organizationName })
            .eq('id', existing.id)
          if (updateError) {
            throw new Error(`Failed updating organization name: ${updateError.message}`)
          }
        }

        return {
          organizationId: existing.id,
          organizationSlug: slug,
          organizationName,
          created: false,
        }
      }

      // Bootstrap callers may ask to reuse the slug, but we must never "take
      // over" an existing organization. If the slug is already owned by a
      // different user, fail loudly.
      if (input.reuseIfSlugExists) {
        throw new Error(`Organization slug "${slug}" is already taken`)
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
        current_member_count: 0,
        current_ledger_count: 0,
      })
      .select('id')
      .single()

    const createdId = getStringField(created, 'id')
    if (!createError && typeof createdId === 'string' && createdId.length > 0) {
      return {
        organizationId: createdId,
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
  const supabase = getServiceClient()
  const { data: membershipRaw, error: membershipError } = await supabase
    .from('organization_members')
    .select('id, role, status')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()

  const membership = membershipRaw as { id: string; role: string; status: string | null } | null

  if (membershipError && !isNoRowsError(membershipError)) {
    throw new Error(`Failed checking organization membership: ${membershipError.message}`)
  }

  const { data: orgOwner, error: orgOwnerError } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', organizationId)
    .single()

  if (orgOwnerError) {
    throw new Error(`Failed loading organization owner: ${orgOwnerError.message}`)
  }

  // Safety check: never grant ownership/membership if the org isn't owned by
  // the caller. This prevents bootstrap/service flows from accidentally (or
  // maliciously) escalating access to an unrelated org.
  if (getStringField(orgOwner, 'owner_id') !== userId) {
    throw new Error('Refusing to provision membership for non-owner user')
  }

  if (!membership) {
    // Heal org counters if they drift (or if an org was created with an
    // initial member count but no actual membership rows yet).
    const [{ data: orgUsage, error: orgUsageError }, { count: activeMemberCount, error: memberCountError }] = await Promise.all([
      supabase
        .from('organizations')
        .select('current_member_count, max_team_members')
        .eq('id', organizationId)
        .single(),
      supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'active'),
    ])

    if (orgUsageError) {
      throw new Error(`Failed loading organization usage: ${orgUsageError.message}`)
    }

    if (memberCountError) {
      throw new Error(`Failed counting organization members: ${memberCountError.message}`)
    }

    const normalizedCount = activeMemberCount || 0
    const updates: Record<string, number> = {}
    if ((orgUsage.current_member_count || 0) !== normalizedCount) {
      updates.current_member_count = normalizedCount
    }
    // Keep included-member limits stable for overage billing.
    if (!orgUsage.max_team_members || orgUsage.max_team_members < 1) {
      updates.max_team_members = 1
    }

    if (Object.keys(updates).length > 0) {
      const { error: healError } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', organizationId)
      if (healError) {
        throw new Error(`Failed syncing organization member limits: ${healError.message}`)
      }
    }

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

async function ensureLedgerApiKey(ledgerId: string, livemode: boolean, createdBy: string) {
  const supabase = getServiceClient()
  const apiKey = makeApiKey(livemode)
  const apiKeyHash = hashApiKey(apiKey)

  // Prefer hash-only storage. Fallback keeps compatibility if api_key column
  // has already been dropped in some environments.
  const attempts: Array<Record<string, unknown>> = [
    { api_key_hash: apiKeyHash, api_key: null },
    { api_key_hash: apiKeyHash },
  ]

  let lastError: { message?: string } | null = null
  for (const payload of attempts) {
    const { error } = await supabase
      .from('ledgers')
      .update(payload)
      .eq('id', ledgerId)

    if (!error) {
      lastError = null
      break
    }

    lastError = error
    if (
      !error.message.toLowerCase().includes('schema cache') &&
      !error.message.toLowerCase().includes('column')
    ) {
      break
    }
  }

  if (lastError) {
    throw new Error(`Failed updating missing API key hash: ${lastError.message}`)
  }

  await maybeCreateApiKeyRecords([
    {
      ledger_id: ledgerId,
      name: livemode ? 'Default Live Key' : 'Default Test Key',
      key_hash: apiKeyHash,
      key_prefix: apiKey.slice(0, 12),
      scopes: ['read', 'write', 'admin'],
      created_by: createdBy,
    },
  ])

  return apiKey
}

async function maybeCreateApiKeyRecords(
  rows: Array<{ ledger_id: string; name: string; key_hash: string; key_prefix: string; scopes: string[]; created_by: string }>
) {
  if (rows.length === 0) return

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('api_keys')
    .insert(rows)

  if (error && error.code !== '42P01') {
    // Keep provisioning resilient; this table is not required for runtime auth.
    console.warn('api_keys insert skipped:', error.code)
  }
}

async function insertLedgersWithSchemaFallback(
  rows: Array<Record<string, unknown>>
): Promise<ExistingLedger[]> {
  const supabase = getServiceClient()

  const attempts: Array<{ label: string; payload: Array<Record<string, unknown>> }> = [
    { label: 'primary', payload: rows },
    {
      label: 'drop_owner_email',
      payload: rows.map((row) => {
        const next = { ...row }
        delete next.owner_email
        return next
      }),
    },
    {
      label: 'drop_platform_name',
      payload: rows.map((row) => {
        const next = { ...row }
        delete next.platform_name
        return next
      }),
    },
    {
      label: 'drop_owner_email_and_platform_name',
      payload: rows.map((row) => {
        const next = { ...row }
        delete next.owner_email
        delete next.platform_name
        return next
      }),
    },
  ]

  let lastError: { message?: string } | null = null

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from('ledgers')
      .insert(attempt.payload)
      .select('id, livemode, ledger_group_id, api_key_hash')
      .returns<ExistingLedger[]>()

    if (!error) {
      if (attempt.label !== 'primary') {
        console.warn(
          `[org-provisioning] insertLedgersWithSchemaFallback used non-primary path: ${attempt.label}`
        )
      }
      return (data || []) as ExistingLedger[]
    }

    lastError = error
    const message = (error.message || '').toLowerCase()
    if (!message.includes('schema cache') && !message.includes('column')) {
      break
    }
  }

  throw new Error(`Failed creating ledger pair: ${lastError?.message || 'unknown schema error'}`)
}

async function ensureLedgerPair(input: ProvisionOrganizationInput, organizationId: string) {
  const supabase = getServiceClient()
  const ledgerMode = input.ledgerMode || 'standard'
  const businessName = input.ledgerName?.trim() || input.organizationName.trim()
  const ownerEmail = input.userEmail?.toLowerCase() || 'admin@soledgic.com'

  const { data: existingLedgersRaw, error: fetchError } = await supabase
    .from('ledgers')
    .select('id, livemode, ledger_group_id, api_key_hash')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .returns<ExistingLedger[]>()

  if (fetchError) {
    throw new Error(`Failed fetching ledgers: ${fetchError.message}`)
  }

  const existingLedgers = (existingLedgersRaw || []) as ExistingLedger[]

  let testLedger = existingLedgers?.find((ledger) => ledger.livemode === false) || null
  let liveLedger = existingLedgers?.find((ledger) => ledger.livemode === true) || null
  const ledgerGroupId =
    testLedger?.ledger_group_id ||
    liveLedger?.ledger_group_id ||
    crypto.randomUUID()

  const rowsToInsert: Array<Record<string, unknown>> = []
  let generatedTestApiKey: string | null = null
  let generatedLiveApiKey: string | null = null

  if (!testLedger) {
    const apiKey = makeApiKey(false)
    generatedTestApiKey = apiKey
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
      api_key_hash: hashApiKey(apiKey),
    })
  }

  if (!liveLedger) {
    const apiKey = makeApiKey(true)
    generatedLiveApiKey = apiKey
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
      api_key_hash: hashApiKey(apiKey),
    })
  }

  if (rowsToInsert.length > 0) {
    const inserted = await insertLedgersWithSchemaFallback(rowsToInsert)

    for (const ledger of inserted || []) {
      if (ledger.livemode) {
        liveLedger = ledger
      } else {
        testLedger = ledger
      }
    }

    await maybeCreateApiKeyRecords(
      (inserted || []).flatMap((ledger) => {
        const key = ledger.livemode ? generatedLiveApiKey : generatedTestApiKey
        if (!key) return []
        return [
          {
            ledger_id: ledger.id,
            name: ledger.livemode ? 'Default Live Key' : 'Default Test Key',
            key_hash: hashApiKey(key),
            key_prefix: key.slice(0, 12),
            scopes: ['read', 'write', 'admin'],
            created_by: input.userId,
          },
        ]
      })
    )
  }

  if (!testLedger || !liveLedger) {
    throw new Error('Failed to ensure both test and live ledgers')
  }

  if (!testLedger.api_key_hash) {
    generatedTestApiKey = await ensureLedgerApiKey(testLedger.id, false, input.userId)
  }

  if (!liveLedger.api_key_hash) {
    generatedLiveApiKey = await ensureLedgerApiKey(liveLedger.id, true, input.userId)
  }

  return {
    testLedger,
    liveLedger,
    ledgerGroupId: testLedger.ledger_group_id || liveLedger.ledger_group_id,
    testApiKey: generatedTestApiKey,
    liveApiKey: generatedLiveApiKey,
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

  return {
    organizationId: organization.organizationId,
    organizationSlug: organization.organizationSlug,
    organizationName: organization.organizationName,
    testLedgerId: ledgers.testLedger.id,
    liveLedgerId: ledgers.liveLedger.id,
    ledgerGroupId: ledgers.ledgerGroupId,
    testApiKey: ledgers.testApiKey,
    liveApiKey: ledgers.liveApiKey,
    createdOrganization: organization.created,
  }
}
