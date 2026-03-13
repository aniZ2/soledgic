import crypto from 'node:crypto'

const PROJECT_BASE_URL = (
  process.env.SOLEDGIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://ocjrcsmoeikxfooeglkt.supabase.co'
).replace(/\/$/, '')

const SERVICE_ROLE_KEY = (
  process.env.SOLEDGIC_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  ''
).trim()

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY / SOLEDGIC_SERVICE_ROLE_KEY')
  process.exit(1)
}

const restBase = `${PROJECT_BASE_URL}/rest/v1`
const authBase = `${PROJECT_BASE_URL}/auth/v1`
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)

function assert(condition, message, context = null) {
  if (!condition) {
    const error = new Error(message)
    if (context) {
      error.context = context
    }
    throw error
  }
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  })

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const error = new Error(`HTTP ${res.status} ${url}`)
    error.payload = data
    throw error
  }

  return data
}

async function createAuthUser(email, password) {
  const payload = await request(`${authBase}/admin/users`, {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        fixture: 'ecosystem-multi-platform',
        run_id: runId,
      },
    }),
  })

  const user = payload?.user && typeof payload.user === 'object'
    ? payload.user
    : payload

  assert(user?.id, 'Failed to create auth user', payload)
  return user
}

async function createOrganizationWithLedgerPair({
  userId,
  organizationName,
  organizationSlug,
  ledgerName,
}) {
  const payload = await request(`${restBase}/rpc/create_organization_with_ledger`, {
    method: 'POST',
    body: JSON.stringify({
      p_user_id: userId,
      p_org_name: organizationName,
      p_org_slug: organizationSlug,
      p_plan: 'trial',
      p_trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      p_max_ledgers: 3,
      p_max_team_members: 5,
      p_ledger_name: ledgerName,
      p_ledger_mode: 'marketplace',
    }),
  })

  assert(payload?.organization_id, 'Failed to create organization', payload)
  return payload
}

async function createEcosystem(name, slug, ownerId) {
  const rows = await request(`${restBase}/ecosystems`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      owner_id: ownerId,
      description: `Fixture ecosystem ${runId}`,
      settings: {
        fixture: 'ecosystem-multi-platform',
        run_id: runId,
      },
    }),
  })

  assert(Array.isArray(rows) && rows[0]?.id, 'Failed to create ecosystem', rows)
  return rows[0]
}

async function updateOrganizationsIntoEcosystem(organizationIds, ecosystemId) {
  const rows = await request(`${restBase}/organizations?id=in.(${organizationIds.join(',')})`, {
    method: 'PATCH',
    body: JSON.stringify({ ecosystem_id: ecosystemId }),
  })

  assert(rows.length === organizationIds.length, 'Failed to attach organizations to ecosystem', rows)
}

async function createEcosystemMembership(ecosystemId, userId) {
  const rows = await request(`${restBase}/ecosystem_memberships`, {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      ecosystem_id: ecosystemId,
      user_id: userId,
      role: 'owner',
      status: 'active',
      metadata: {
        fixture: 'ecosystem-multi-platform',
        run_id: runId,
      },
    }),
  })

  assert(Array.isArray(rows) && rows[0]?.ecosystem_id === ecosystemId, 'Failed to create ecosystem membership', rows)
}

async function getOwnerMembershipMap(userId, organizationIds) {
  const rows = await request(
    `${restBase}/organization_members?select=id,organization_id,user_id,role,status&user_id=eq.${userId}&organization_id=in.(${organizationIds.join(',')})`,
  )

  const byOrgId = new Map(rows.map((row) => [row.organization_id, row]))
  for (const organizationId of organizationIds) {
    assert(byOrgId.has(organizationId), `Missing owner membership for ${organizationId}`, rows)
  }
  return byOrgId
}

async function createParticipantFixture({
  ledgerId,
  participantId,
  participantName,
  participantEmail,
  balance,
  heldAmount,
}) {
  const accountRows = await request(`${restBase}/accounts`, {
    method: 'POST',
    body: JSON.stringify({
      ledger_id: ledgerId,
      account_type: 'creator_balance',
      entity_id: participantId,
      entity_type: 'creator',
      name: participantName,
      balance,
      currency: 'USD',
      metadata: {
        email: participantEmail,
        fixture: 'ecosystem-multi-platform',
        run_id: runId,
      },
      is_active: true,
    }),
  })

  assert(Array.isArray(accountRows) && accountRows[0]?.id, 'Failed to create participant account', accountRows)

  if (heldAmount > 0) {
    const transactionRows = await request(`${restBase}/transactions`, {
      method: 'POST',
      body: JSON.stringify({
        ledger_id: ledgerId,
        transaction_type: 'sale',
        reference_id: `fixture_hold_${participantId}_${runId}`,
        reference_type: 'fixture',
        description: `Fixture hold for ${participantId}`,
        amount: heldAmount,
        currency: 'USD',
        status: 'completed',
        metadata: {
          fixture: 'ecosystem-multi-platform',
          run_id: runId,
        },
      }),
    })

    assert(Array.isArray(transactionRows) && transactionRows[0]?.id, 'Failed to create hold transaction', transactionRows)

    const holdRows = await request(`${restBase}/held_funds`, {
      method: 'POST',
      body: JSON.stringify({
        ledger_id: ledgerId,
        transaction_id: transactionRows[0].id,
        creator_id: participantId,
        held_amount: heldAmount,
        released_amount: 0,
        status: 'held',
        hold_reason: 'fixture_verification',
      }),
    })

    assert(Array.isArray(holdRows) && holdRows[0]?.id, 'Failed to create held funds record', holdRows)
  }
}

async function createIdentityLink({
  ledgerId,
  participantId,
  userId,
  membershipId,
  linkSource,
}) {
  const rows = await request(`${restBase}/participant_identity_links`, {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      ledger_id: ledgerId,
      participant_id: participantId,
      user_id: userId,
      membership_id: membershipId,
      link_source: linkSource,
      status: 'active',
      is_primary: true,
      linked_at: new Date().toISOString(),
      metadata: {
        fixture: 'ecosystem-multi-platform',
        run_id: runId,
      },
    }),
  })

  assert(Array.isArray(rows) && rows[0]?.ledger_id === ledgerId, 'Failed to create participant identity link', rows)
}

async function upsertSharedProfiles(userId) {
  const [taxRows, payoutRows] = await Promise.all([
    request(`${restBase}/shared_tax_profiles`, {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        status: 'active',
        legal_name: `Fixture User ${runId}`,
        tax_id_type: 'ssn',
        tax_id_last4: '4321',
        business_type: 'sole_proprietor',
        address_line1: '1 Test Way',
        address_city: 'Austin',
        address_state: 'TX',
        address_postal_code: '73301',
        address_country: 'US',
        certified_at: new Date().toISOString(),
      }),
    }),
    request(`${restBase}/shared_payout_profiles`, {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        status: 'active',
        default_method: 'bank',
        schedule: 'manual',
        minimum_amount: 2500,
        currency: 'USD',
        country: 'US',
        payouts_enabled: true,
      }),
    }),
  ])

  assert(Array.isArray(taxRows) && taxRows[0]?.user_id === userId, 'Failed to upsert shared tax profile', taxRows)
  assert(Array.isArray(payoutRows) && payoutRows[0]?.user_id === userId, 'Failed to upsert shared payout profile', payoutRows)
}

function summarizePortfolio(participants) {
  const organizationIds = new Set()
  const ledgerIds = new Set()
  const ecosystemIds = new Set()
  let ledgerBalance = 0
  let heldAmount = 0
  let availableBalance = 0

  for (const participant of participants) {
    organizationIds.add(participant.organizationId)
    ledgerIds.add(participant.ledgerId)
    ecosystemIds.add(participant.ecosystemId)
    ledgerBalance += participant.ledgerBalance
    heldAmount += participant.heldAmount
    availableBalance += participant.availableBalance
  }

  return {
    participantCount: participants.length,
    organizationCount: organizationIds.size,
    ledgerCount: ledgerIds.size,
    ecosystemCount: ecosystemIds.size,
    ledgerBalance: Math.round(ledgerBalance * 100) / 100,
    heldAmount: Math.round(heldAmount * 100) / 100,
    availableBalance: Math.round(availableBalance * 100) / 100,
  }
}

async function fetchPortfolioView(userId, organizationIds) {
  const [links, accounts, holds, organizations] = await Promise.all([
    request(`${restBase}/participant_identity_links?select=id,ledger_id,participant_id,user_id,link_source,linked_at,status&user_id=eq.${userId}&status=eq.active&order=linked_at.desc`),
    request(`${restBase}/accounts?select=ledger_id,entity_id,name,balance,currency,metadata&account_type=eq.creator_balance`),
    request(`${restBase}/held_funds?select=ledger_id,creator_id,held_amount,released_amount,status&status=in.(held,partial)`),
    request(`${restBase}/organizations?select=id,name,ecosystem_id,ecosystem:ecosystems(id,name,slug)&id=in.(${organizationIds.join(',')})`),
  ])

  const orgMap = new Map(
    organizations.map((org) => [
      org.id,
      {
        name: org.name,
        ecosystemId: org.ecosystem_id,
        ecosystemName: Array.isArray(org.ecosystem) ? org.ecosystem[0]?.name : org.ecosystem?.name,
        ecosystemSlug: Array.isArray(org.ecosystem) ? org.ecosystem[0]?.slug : org.ecosystem?.slug,
      },
    ]),
  )
  const accountMap = new Map(
    accounts.map((account) => [`${account.ledger_id}:${account.entity_id}`, account]),
  )
  const holdMap = new Map()
  for (const hold of holds) {
    const key = `${hold.ledger_id}:${hold.creator_id}`
    const amount = Number(hold.held_amount) - Number(hold.released_amount || 0)
    holdMap.set(key, (holdMap.get(key) || 0) + amount)
  }

  const ledgerRows = await request(
    `${restBase}/ledgers?select=id,business_name,organization_id,ledger_group_id,livemode,default_currency&id=in.(${Array.from(new Set(links.map((link) => link.ledger_id))).join(',')})`,
  )
  const ledgerMap = new Map(ledgerRows.map((ledger) => [ledger.id, ledger]))

  return links.map((link) => {
    const ledger = ledgerMap.get(link.ledger_id)
    const org = orgMap.get(ledger.organization_id)
    const account = accountMap.get(`${link.ledger_id}:${link.participant_id}`)
    const held = Math.round(((holdMap.get(`${link.ledger_id}:${link.participant_id}`) || 0)) * 100) / 100
    const balance = Math.round((Number(account?.balance || 0)) * 100) / 100
    return {
      linkId: link.id,
      ledgerId: link.ledger_id,
      participantId: link.participant_id,
      organizationId: ledger.organization_id,
      organizationName: org?.name || null,
      ecosystemId: org?.ecosystemId || null,
      ecosystemName: org?.ecosystemName || null,
      ecosystemSlug: org?.ecosystemSlug || null,
      ledgerName: ledger.business_name,
      ledgerBalance: balance,
      heldAmount: held,
      availableBalance: Math.round((balance - held) * 100) / 100,
    }
  })
}

async function main() {
  const password = `Fixture-${runId}-Aa11!!`
  const email = `ecosystem-fixture-${runId}@soledgic.test`

  const user = await createAuthUser(email, password)
  const alpha = await createOrganizationWithLedgerPair({
    userId: user.id,
    organizationName: `Fixture Platform Alpha ${runId}`,
    organizationSlug: `fixture-platform-alpha-${runId}`,
    ledgerName: `Fixture Platform Alpha ${runId}`,
  })
  const beta = await createOrganizationWithLedgerPair({
    userId: user.id,
    organizationName: `Fixture Platform Beta ${runId}`,
    organizationSlug: `fixture-platform-beta-${runId}`,
    ledgerName: `Fixture Platform Beta ${runId}`,
  })

  const ecosystem = await createEcosystem(
    `Fixture Ecosystem ${runId}`,
    `fixture-ecosystem-${runId}`,
    user.id,
  )

  await updateOrganizationsIntoEcosystem(
    [alpha.organization_id, beta.organization_id],
    ecosystem.id,
  )
  await createEcosystemMembership(ecosystem.id, user.id)

  const membershipMap = await getOwnerMembershipMap(user.id, [
    alpha.organization_id,
    beta.organization_id,
  ])

  await createParticipantFixture({
    ledgerId: alpha.test_ledger_id,
    participantId: `fixture_alpha_creator_${runId}`,
    participantName: 'Fixture Alpha Creator',
    participantEmail: email,
    balance: 125.5,
    heldAmount: 25.5,
  })
  await createParticipantFixture({
    ledgerId: beta.test_ledger_id,
    participantId: `fixture_beta_creator_${runId}`,
    participantName: 'Fixture Beta Creator',
    participantEmail: email,
    balance: 80,
    heldAmount: 8,
  })

  await createIdentityLink({
    ledgerId: alpha.test_ledger_id,
    participantId: `fixture_alpha_creator_${runId}`,
    userId: user.id,
    membershipId: membershipMap.get(alpha.organization_id).id,
    linkSource: 'manual',
  })
  await createIdentityLink({
    ledgerId: beta.test_ledger_id,
    participantId: `fixture_beta_creator_${runId}`,
    userId: user.id,
    membershipId: membershipMap.get(beta.organization_id).id,
    linkSource: 'manual',
  })

  await upsertSharedProfiles(user.id)

  const ecosystemPlatforms = await request(
    `${restBase}/organizations?select=id,name,slug,status,ecosystem_id&id=in.(${alpha.organization_id},${beta.organization_id})&order=created_at.asc`,
  )
  const allLedgers = await request(
    `${restBase}/ledgers?select=id,organization_id,business_name,livemode,ledger_group_id&id=in.(${alpha.test_ledger_id},${alpha.live_ledger_id},${beta.test_ledger_id},${beta.live_ledger_id})&order=created_at.asc`,
  )
  const links = await request(
    `${restBase}/participant_identity_links?select=id,ledger_id,participant_id,user_id,status&user_id=eq.${user.id}&status=eq.active`,
  )
  const taxProfiles = await request(`${restBase}/shared_tax_profiles?select=user_id,status&user_id=eq.${user.id}`)
  const payoutProfiles = await request(`${restBase}/shared_payout_profiles?select=user_id,status,payouts_enabled&user_id=eq.${user.id}`)
  const portfolioParticipants = await fetchPortfolioView(user.id, [
    alpha.organization_id,
    beta.organization_id,
  ])
  const summary = summarizePortfolio(portfolioParticipants)

  assert(ecosystemPlatforms.length === 2, 'Expected two organizations in the shared ecosystem', ecosystemPlatforms)
  assert(ecosystemPlatforms.every((platform) => platform.ecosystem_id === ecosystem.id), 'Organizations are not attached to the shared ecosystem', ecosystemPlatforms)
  assert(allLedgers.length === 4, 'Expected two ledger pairs across both platforms', allLedgers)
  assert(new Set(allLedgers.map((ledger) => ledger.organization_id)).size === 2, 'Expected ledgers to belong to two organizations', allLedgers)
  assert(new Set(allLedgers.filter((ledger) => ledger.livemode === false).map((ledger) => ledger.id)).size === 2, 'Expected two test ledgers', allLedgers)
  assert(new Set(allLedgers.filter((ledger) => ledger.livemode === true).map((ledger) => ledger.id)).size === 2, 'Expected two live ledgers', allLedgers)
  assert(links.length === 2, 'Expected two participant identity links for the shared user', links)
  assert(taxProfiles.length === 1, 'Expected one shared tax profile', taxProfiles)
  assert(payoutProfiles.length === 1 && payoutProfiles[0].payouts_enabled === true, 'Expected one enabled shared payout profile', payoutProfiles)
  assert(summary.participantCount === 2, 'Expected two linked participants in the portfolio', summary)
  assert(summary.organizationCount === 2, 'Expected two organizations in the portfolio summary', summary)
  assert(summary.ledgerCount === 2, 'Expected two ledgers in the portfolio summary', summary)
  assert(summary.ecosystemCount === 1, 'Expected one ecosystem in the portfolio summary', summary)
  assert(summary.ledgerBalance === 205.5, 'Unexpected total ledger balance', summary)
  assert(summary.heldAmount === 33.5, 'Unexpected total held amount', summary)
  assert(summary.availableBalance === 172, 'Unexpected available balance', summary)
  assert(portfolioParticipants.every((participant) => participant.ecosystemId === ecosystem.id), 'Portfolio items do not share the same ecosystem', portfolioParticipants)

  console.log(JSON.stringify({
    runId,
    user: {
      id: user.id,
      email: user.email,
    },
    ecosystem: {
      id: ecosystem.id,
      slug: ecosystem.slug,
    },
    platforms: ecosystemPlatforms,
    ledgers: allLedgers,
    portfolioSummary: summary,
  }, null, 2))
}

main().catch((error) => {
  console.error('Ecosystem multi-platform test failed')
  console.error(error.message)
  if (error.context) {
    console.error(JSON.stringify(error.context, null, 2))
  }
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2))
  }
  process.exit(1)
})
