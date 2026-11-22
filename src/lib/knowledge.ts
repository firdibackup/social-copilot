import { getTranslations } from 'next-intl/server'
import 'server-only'
import {
  isDiagnostic, KnowledgeError, nextId, OWNER_ASSESSMENT, OWNER_PROVENANCE, TOPIC_MAX,
  type CaseInput, type CaseScope, type HookInput,
} from './knowledge-options'
import { db, unwrap } from './supabase'

/** Pengetahuan: admin access to the curated RAG tables. Retrieval itself stays in hook-retrieval / case-retrieval. */

export interface HookRow {
  id: string
  structure: string
  useWhen: string
  sources: string[]
  version: string
}

export interface CaseRow {
  id: string
  userId: string | null
  accountId: string | null
  tags: string[]
  verdict: string
  excerpt: string
  reason: string
  principle: string
  assessment: string
  outcome: string
  /** True for engineering diagnostics: retrieve_study_cases never hands them to the writer. */
  diagnostic: boolean
  provenanceKind: string | null
}

export interface KnowledgeAccount extends CaseScope {
  label: string
  /** retrieve_study_cases only answers for accounts with an Instagram connection. */
  connected: boolean
}

interface HookRecord { id: string; structure: string; use_when: string; sources: unknown; version: string }
interface CaseRecord {
  id: string; user_id: string | null; account_id: string | null; tags: string[]; verdict: string; excerpt: string
  reason: string; principle: string; assessment: string; outcome: string; provenance: unknown
}

const validation = () => getTranslations('admin.knowledge_validation')
const today = () => new Date().toISOString().slice(0, 10)
const duplicate = (error: unknown) => error instanceof Error && /duplicate key|_pkey/.test(error.message)

const toHook = (row: HookRecord): HookRow => ({
  id: row.id, structure: row.structure, useWhen: row.use_when, version: row.version,
  sources: Array.isArray(row.sources) ? row.sources.map(String) : [],
})

const toCase = (row: CaseRecord): CaseRow => ({
  id: row.id, userId: row.user_id, accountId: row.account_id, tags: row.tags ?? [], verdict: row.verdict,
  excerpt: row.excerpt, reason: row.reason, principle: row.principle, assessment: row.assessment, outcome: row.outcome,
  diagnostic: isDiagnostic(row.provenance),
  provenanceKind: typeof (row.provenance as { kind?: unknown } | null)?.kind === 'string' ? (row.provenance as { kind: string }).kind : null,
})

export async function listHooks(): Promise<HookRow[]> {
  return (unwrap(await db().from('hook_templates').select('id, structure, use_when, sources, version').order('id')) as HookRecord[]).map(toHook)
}

/** Creates the row (`originalId` null) or updates it in place; returns its id. The id of a saved row never changes. */
export async function saveHook(input: HookInput, originalId: string | null): Promise<string> {
  const columns = { structure: input.structure, use_when: input.useWhen, sources: input.sources, version: today() }
  if (originalId) {
    const rows = unwrap(await db().from('hook_templates').update(columns).eq('id', originalId).select('id')) as { id: string }[]
    if (rows.length === 0) throw new KnowledgeError((await validation())('hookNotFound'))
    return originalId
  }
  const id = input.id ?? nextId('OWN', (unwrap(await db().from('hook_templates').select('id').like('id', 'OWN-%')) as { id: string }[]).map((row) => row.id))
  try {
    unwrap(await db().from('hook_templates').insert({ id, ...columns }))
  } catch (error) {
    if (duplicate(error)) throw new KnowledgeError((await validation())('idTaken', { id }))
    throw error
  }
  return id
}

export async function deleteHook(id: string): Promise<void> {
  unwrap(await db().from('hook_templates').delete().eq('id', id))
}

export async function listCases(): Promise<CaseRow[]> {
  return (unwrap(await db().from('study_cases')
    .select('id, user_id, account_id, tags, verdict, excerpt, reason, principle, assessment, outcome, provenance').order('id')) as CaseRecord[]).map(toCase)
}

/**
 * Creates an owner lesson (human-approved, provenance owner_lesson) or updates the content of an existing case. An
 * update keeps the row's assessment and provenance: editing a model or diagnostic case doesn't relabel where it came from.
 */
export async function saveCase(input: CaseInput, originalId: string | null): Promise<string> {
  const columns = {
    user_id: input.scope?.userId ?? null, account_id: input.scope?.accountId ?? null, tags: input.tags, verdict: input.verdict,
    outcome: input.outcome, excerpt: input.excerpt, reason: input.reason, principle: input.principle,
  }
  if (originalId) {
    const rows = unwrap(await db().from('study_cases').update(columns).eq('id', originalId).select('id')) as { id: string }[]
    if (rows.length === 0) throw new KnowledgeError((await validation())('caseNotFound'))
    return originalId
  }
  const id = input.id ?? nextId('OWNER', (unwrap(await db().from('study_cases').select('id').like('id', 'OWNER-%')) as { id: string }[]).map((row) => row.id))
  try {
    unwrap(await db().from('study_cases').insert({ id, ...columns, assessment: OWNER_ASSESSMENT, provenance: OWNER_PROVENANCE }))
  } catch (error) {
    if (duplicate(error)) throw new KnowledgeError((await validation())('idTaken', { id }))
    throw error
  }
  return id
}

export async function deleteCase(id: string): Promise<void> {
  unwrap(await db().from('study_cases').delete().eq('id', id))
}

/** Connected Instagram accounts first, then brand kits without a connection; labelled with the brand name. */
export async function listKnowledgeAccounts(): Promise<KnowledgeAccount[]> {
  const [connections, kits] = await Promise.all([
    db().from('instagram_connections').select('user_id, instagram_user_id, username'),
    db().from('brand_kit').select('user_id, account_id, name'),
  ])
  const brands = new Map((unwrap(kits) as { user_id: string; account_id: string; name: string | null }[]).map((kit) => [`${kit.user_id}:${kit.account_id}`, kit.name]))
  const accounts: KnowledgeAccount[] = (unwrap(connections) as { user_id: string; instagram_user_id: string; username: string | null }[]).map((row) => {
    const brand = brands.get(`${row.user_id}:${row.instagram_user_id}`)
    brands.delete(`${row.user_id}:${row.instagram_user_id}`)
    return { userId: row.user_id, accountId: row.instagram_user_id, connected: true, label: [brand, row.username ? `@${row.username}` : null].filter(Boolean).join(' · ') || row.instagram_user_id }
  })
  for (const [key, name] of brands) {
    const [userId, accountId] = key.split(':')
    accounts.push({ userId, accountId, connected: false, label: name || accountId })
  }
  return accounts
}

export interface RetrievalPreview {
  hooks: { id: string; structure: string; use_when: string }[]
  /** Null when no account was given: the writer then uses no cases at all (retrieveCases returns []). */
  cases: { id: string; verdict: string; principle: string }[] | null
}

/** Calls the same RPCs the writer calls, with the topic as the query, so the owner sees what would be retrieved. */
export async function previewRetrieval(topic: string, account: CaseScope | null): Promise<RetrievalPreview> {
  const query = topic.slice(0, TOPIC_MAX)
  const [hooks, cases] = await Promise.all([
    db().rpc('retrieve_hooks', { query_text: query }),
    account ? db().rpc('retrieve_study_cases', { p_user_id: account.userId, p_account_id: account.accountId, query_text: query }) : null,
  ])
  return {
    hooks: (unwrap(hooks) ?? []) as RetrievalPreview['hooks'],
    cases: cases ? ((unwrap(cases) ?? []) as { id: string; verdict: string; principle: string }[]).map(({ id, verdict, principle }) => ({ id, verdict, principle })) : null,
  }
}
