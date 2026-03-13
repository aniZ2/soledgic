import { createClient } from '@supabase/supabase-js'

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

function parseArgs(argv) {
  const options = {
    runId: null,
    dryRun: true,
    scopeAll: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--execute') {
      options.dryRun = false
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--all') {
      options.scopeAll = true
    } else if (arg === '--run-id') {
      options.runId = argv[index + 1] || null
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/cleanup-ecosystem-multi-platform.mjs --run-id <runId> [--dry-run]',
    '  node scripts/cleanup-ecosystem-multi-platform.mjs --run-id <runId> --execute',
    '  node scripts/cleanup-ecosystem-multi-platform.mjs --all [--dry-run]',
    '  node scripts/cleanup-ecosystem-multi-platform.mjs --all --execute',
    '',
    'By default the script runs in dry-run mode.',
  ].join('\n'))
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

async function fetchAllUsers(supabase) {
  const users = []
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    })

    if (error) {
      throw error
    }

    const pageUsers = data?.users || []
    users.push(...pageUsers)
    if (pageUsers.length < perPage) {
      break
    }
    page += 1
  }

  return users
}

async function selectAll(query) {
  const { data, error } = await query
  if (error) {
    throw error
  }
  return data || []
}

async function deleteByIds(supabase, table, idColumn, ids) {
  if (!ids.length) {
    return 0
  }

  const { data, error } = await supabase
    .from(table)
    .delete()
    .in(idColumn, ids)
    .select(idColumn)

  if (error) {
    throw error
  }

  return data?.length || 0
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printUsage()
    return
  }

  if (!options.scopeAll && !options.runId) {
    throw new Error('Provide either --run-id <runId> or --all')
  }

  if (!SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY / SOLEDGIC_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(PROJECT_BASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const ecosystemSlugPattern = options.runId
    ? `fixture-ecosystem-${options.runId}`
    : 'fixture-ecosystem-%'
  const organizationSlugPattern = options.runId
    ? `fixture-platform-%-${options.runId}`
    : 'fixture-platform-%'
  const emailPrefix = options.runId
    ? `ecosystem-fixture-${options.runId}@`
    : 'ecosystem-fixture-'

  const ecosystems = await selectAll(
    options.runId
      ? supabase
        .from('ecosystems')
        .select('id, slug, owner_id')
        .eq('slug', ecosystemSlugPattern)
      : supabase
        .from('ecosystems')
        .select('id, slug, owner_id')
        .like('slug', ecosystemSlugPattern),
  )

  const organizations = await selectAll(
    supabase
      .from('organizations')
      .select('id, name, slug, owner_id, ecosystem_id')
      .like('slug', organizationSlugPattern),
  )

  const authUsers = (await fetchAllUsers(supabase)).filter((user) => {
    const email = user.email || ''
    if (options.runId) {
      return email.startsWith(emailPrefix) || user.user_metadata?.run_id === options.runId
    }
    return email.startsWith(emailPrefix) || user.user_metadata?.fixture === 'ecosystem-multi-platform'
  })

  const userIds = uniqueStrings([
    ...ecosystems.map((ecosystem) => ecosystem.owner_id),
    ...organizations.map((organization) => organization.owner_id),
    ...authUsers.map((user) => user.id),
  ])

  const ecosystemIds = uniqueStrings(ecosystems.map((ecosystem) => ecosystem.id))

  const userOrganizations = userIds.length
    ? await selectAll(
      supabase
        .from('organization_members')
        .select('organization_id')
        .in('user_id', userIds),
    )
    : []

  const organizationIds = uniqueStrings([
    ...organizations.map((organization) => organization.id),
    ...userOrganizations.map((membership) => membership.organization_id),
  ])

  const ledgers = organizationIds.length
    ? await selectAll(
      supabase
        .from('ledgers')
        .select('id, organization_id, business_name, livemode')
        .in('organization_id', organizationIds),
    )
    : []

  const ledgerIds = uniqueStrings(ledgers.map((ledger) => ledger.id))

  const [
    participantLinksByLedger,
    participantLinksByUser,
    taxProfiles,
    payoutProfiles,
    userProfiles,
    ecosystemMembershipsByUser,
    ecosystemMembershipsByEcosystem,
    notificationsByOrg,
    notificationsByUser,
    billingEvents,
    auditLogByLedger,
    auditLogByEntity,
    auditLogByActor,
    auditArchiveByLedger,
    auditArchiveByEntity,
    auditArchiveByActor,
  ] = await Promise.all([
    ledgerIds.length
      ? selectAll(
        supabase
          .from('participant_identity_links')
          .select('id')
          .in('ledger_id', ledgerIds),
      )
      : [],
    userIds.length
      ? selectAll(
        supabase
          .from('participant_identity_links')
          .select('id')
          .in('user_id', userIds),
      )
      : [],
    userIds.length
      ? selectAll(
        supabase
          .from('shared_tax_profiles')
          .select('user_id')
          .in('user_id', userIds),
      )
      : [],
    userIds.length
      ? selectAll(
        supabase
          .from('shared_payout_profiles')
          .select('user_id')
          .in('user_id', userIds),
      )
      : [],
    userIds.length
      ? selectAll(
        supabase
          .from('user_profiles')
          .select('id')
          .in('id', userIds),
      )
      : [],
    userIds.length
      ? selectAll(
        supabase
          .from('ecosystem_memberships')
          .select('id')
          .in('user_id', userIds),
      )
      : [],
    ecosystemIds.length
      ? selectAll(
        supabase
          .from('ecosystem_memberships')
          .select('id')
          .in('ecosystem_id', ecosystemIds),
      )
      : [],
    organizationIds.length
      ? selectAll(
        supabase
          .from('notifications')
          .select('id')
          .in('organization_id', organizationIds),
      )
      : [],
    userIds.length
      ? selectAll(
        supabase
          .from('notifications')
          .select('id')
          .in('user_id', userIds),
      )
      : [],
    organizationIds.length
      ? selectAll(
        supabase
          .from('billing_events')
          .select('id')
          .in('organization_id', organizationIds),
      )
      : [],
    ledgerIds.length
      ? selectAll(
        supabase
          .from('audit_log')
          .select('id')
          .in('ledger_id', ledgerIds),
      )
      : [],
    [...ecosystemIds, ...organizationIds].length
      ? selectAll(
        supabase
          .from('audit_log')
          .select('id')
          .in('entity_id', uniqueStrings([...ecosystemIds, ...organizationIds])),
      )
      : [],
    userIds.length
      ? selectAll(
        supabase
          .from('audit_log')
          .select('id')
          .in('actor_id', userIds),
      )
      : [],
    ledgerIds.length
      ? selectAll(
        supabase
          .from('audit_log_archive')
          .select('id')
          .in('ledger_id', ledgerIds),
      )
      : [],
    [...ecosystemIds, ...organizationIds].length
      ? selectAll(
        supabase
          .from('audit_log_archive')
          .select('id')
          .in('entity_id', uniqueStrings([...ecosystemIds, ...organizationIds])),
      )
      : [],
    userIds.length
      ? selectAll(
        supabase
          .from('audit_log_archive')
          .select('id')
          .in('actor_id', userIds),
      )
      : [],
  ])

  const participantLinkIds = uniqueStrings([
    ...participantLinksByLedger.map((row) => row.id),
    ...participantLinksByUser.map((row) => row.id),
  ])
  const ecosystemMembershipIds = uniqueStrings([
    ...ecosystemMembershipsByUser.map((row) => row.id),
    ...ecosystemMembershipsByEcosystem.map((row) => row.id),
  ])
  const notificationIds = uniqueStrings([
    ...notificationsByOrg.map((row) => row.id),
    ...notificationsByUser.map((row) => row.id),
  ])
  const auditLogIds = uniqueStrings([
    ...auditLogByLedger.map((row) => row.id),
    ...auditLogByEntity.map((row) => row.id),
    ...auditLogByActor.map((row) => row.id),
  ])
  const auditArchiveIds = uniqueStrings([
    ...auditArchiveByLedger.map((row) => row.id),
    ...auditArchiveByEntity.map((row) => row.id),
    ...auditArchiveByActor.map((row) => row.id),
  ])

  const summary = {
    scope: {
      runId: options.runId,
      scopeAll: options.scopeAll,
      dryRun: options.dryRun,
      projectUrl: PROJECT_BASE_URL,
    },
    matches: {
      users: authUsers.map((user) => ({ id: user.id, email: user.email })),
      ecosystems: ecosystems.map((ecosystem) => ({ id: ecosystem.id, slug: ecosystem.slug })),
      organizations: organizations.map((organization) => ({
        id: organization.id,
        slug: organization.slug,
        ecosystemId: organization.ecosystem_id,
      })),
      ledgers: ledgers.map((ledger) => ({
        id: ledger.id,
        organizationId: ledger.organization_id,
        livemode: ledger.livemode,
      })),
      counts: {
        participantIdentityLinks: participantLinkIds.length,
        sharedTaxProfiles: taxProfiles.length,
        sharedPayoutProfiles: payoutProfiles.length,
        userProfiles: userProfiles.length,
        ecosystemMemberships: ecosystemMembershipIds.length,
        notifications: notificationIds.length,
        billingEvents: billingEvents.length,
        auditLog: auditLogIds.length,
        auditLogArchive: auditArchiveIds.length,
      },
    },
  }

  if (options.dryRun) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  const deleted = {}

  deleted.auditLog = await deleteByIds(supabase, 'audit_log', 'id', auditLogIds)
  deleted.auditLogArchive = await deleteByIds(supabase, 'audit_log_archive', 'id', auditArchiveIds)
  deleted.billingEvents = await deleteByIds(supabase, 'billing_events', 'id', billingEvents.map((row) => row.id))
  deleted.notifications = await deleteByIds(supabase, 'notifications', 'id', notificationIds)
  deleted.participantIdentityLinks = await deleteByIds(supabase, 'participant_identity_links', 'id', participantLinkIds)
  deleted.sharedTaxProfiles = await deleteByIds(supabase, 'shared_tax_profiles', 'user_id', taxProfiles.map((row) => row.user_id))
  deleted.sharedPayoutProfiles = await deleteByIds(supabase, 'shared_payout_profiles', 'user_id', payoutProfiles.map((row) => row.user_id))
  deleted.userProfiles = await deleteByIds(supabase, 'user_profiles', 'id', userProfiles.map((row) => row.id))
  deleted.organizationMembers = userIds.length
    ? await deleteByIds(supabase, 'organization_members', 'user_id', userIds)
    : 0
  deleted.ecosystemMemberships = await deleteByIds(supabase, 'ecosystem_memberships', 'id', ecosystemMembershipIds)
  deleted.organizations = await deleteByIds(supabase, 'organizations', 'id', organizationIds)
  deleted.ecosystems = await deleteByIds(supabase, 'ecosystems', 'id', ecosystemIds)

  let deletedAuthUsers = 0
  for (const user of authUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) {
      throw error
    }
    deletedAuthUsers += 1
  }
  deleted.authUsers = deletedAuthUsers

  console.log(JSON.stringify({
    ...summary,
    deleted,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exit(1)
})
