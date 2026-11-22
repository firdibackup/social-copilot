import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCase, listCases, listKnowledgeAccounts, previewRetrieval, saveCase, saveHook } from './knowledge'
import { KnowledgeError, OWNER_PROVENANCE } from './knowledge-options'

vi.mock('server-only', () => ({}))
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const { createTranslator } = await import('next-intl')
    const { default: admin } = await import('../../messages/id/admin.json')
    return createTranslator({ locale: 'id', messages: { admin }, namespace: namespace as 'admin' })
  },
}))

/** A query builder that records each call and resolves to the next queued result. */
const fake = vi.hoisted(() => ({
  results: [] as { data: unknown; error: unknown }[],
  queries: [] as { table: string; steps: [string, unknown[]][] }[],
  rpc: vi.fn(),
}))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    from: (table: string) => {
      const query = { table, steps: [] as [string, unknown[]][] }
      fake.queries.push(query)
      const result = fake.results.shift() ?? { data: null, error: null }
      const builder: object = new Proxy({}, {
        get: (_target, step) => step === 'then'
          ? (resolve: (value: unknown) => void) => resolve(result)
          : (...args: unknown[]) => {
              query.steps.push([String(step), args])
              return builder
            },
      })
      return builder
    },
    rpc: fake.rpc,
  }),
}))

const ok = (data: unknown) => ({ data, error: null })
const step = (table: string, name: string) =>
  fake.queries.filter((query) => query.table === table).flatMap((query) => query.steps.filter(([called]) => called === name).map(([, args]) => args))
const CASE = { id: null, scope: null, tags: ['kpr'], verdict: 'failure' as const, outcome: 'observed_failure' as const, excerpt: 'e', reason: 'r', principle: 'p' }

beforeEach(() => {
  fake.results = []
  fake.queries = []
  fake.rpc.mockReset()
})

describe('saveHook', () => {
  it('numbers a new hook after the highest OWN- id and stamps today as its version', async () => {
    fake.results.push(ok([{ id: 'OWN-004' }]), ok(null))
    const id = await saveHook({ id: null, structure: '[HASIL] tanpa [HAMBATAN]', useWhen: 'u', sources: [] }, null)
    expect(id).toBe('OWN-005')
    expect(step('hook_templates', 'insert')[0][0]).toEqual({
      id: 'OWN-005', structure: '[HASIL] tanpa [HAMBATAN]', use_when: 'u', sources: [], version: new Date().toISOString().slice(0, 10),
    })
  })

  it('turns a taken id into a message and an update of a missing row into not found', async () => {
    fake.results.push({ data: null, error: { message: 'duplicate key value violates unique constraint "hook_templates_pkey"' } })
    await expect(saveHook({ id: 'H001', structure: '[A]', useWhen: 'u', sources: [] }, null)).rejects.toThrow('ID H001 sudah dipakai.')
    fake.results.push(ok([]))
    await expect(saveHook({ id: null, structure: '[A]', useWhen: 'u', sources: [] }, 'H404')).rejects.toBeInstanceOf(KnowledgeError)
    expect(step('hook_templates', 'eq')).toContainEqual(['id', 'H404'])
  })
})

describe('saveCase', () => {
  it('writes an owner lesson as human-approved with owner provenance', async () => {
    fake.results.push(ok([]), ok(null))
    expect(await saveCase(CASE, null)).toBe('OWNER-001')
    expect(step('study_cases', 'insert')[0][0]).toMatchObject({
      id: 'OWNER-001', user_id: null, account_id: null, tags: ['kpr'], assessment: 'human_approved', provenance: OWNER_PROVENANCE,
    })
  })

  it('updates content only, keeping where an existing case came from', async () => {
    fake.results.push(ok([{ id: 'RAG2-PROMO-FEES' }]))
    await saveCase({ ...CASE, scope: { userId: 'u1', accountId: 'a1' } }, 'RAG2-PROMO-FEES')
    const columns = step('study_cases', 'update')[0][0] as Record<string, unknown>
    expect(columns).toMatchObject({ user_id: 'u1', account_id: 'a1' })
    expect(columns).not.toHaveProperty('assessment')
    expect(columns).not.toHaveProperty('provenance')
  })

  it('deletes by id', async () => {
    await deleteCase('OWNER-001')
    expect(step('study_cases', 'eq')).toEqual([['id', 'OWNER-001']])
  })
})

describe('listCases', () => {
  it('flags engineering diagnostics so the page can label them', async () => {
    fake.results.push(ok([
      { id: 'A', user_id: null, account_id: null, tags: ['x'], verdict: 'failure', excerpt: '', reason: '', principle: '', assessment: 'model', outcome: 'observed_failure', provenance: { kind: 'engineering_diagnostic_not_writer_exemplar' } },
      { id: 'B', user_id: null, account_id: null, tags: ['x'], verdict: 'failure', excerpt: '', reason: '', principle: '', assessment: 'model', outcome: 'observed_failure', provenance: { review: 'r.md' } },
    ]))
    const cases = await listCases()
    expect(cases.map((c) => [c.id, c.diagnostic, c.provenanceKind])).toEqual([['A', true, 'engineering_diagnostic_not_writer_exemplar'], ['B', false, null]])
  })
})

describe('listKnowledgeAccounts', () => {
  it('lists connected accounts with their brand, then brand kits without a connection', async () => {
    fake.results.push(
      ok([{ user_id: 'u1', instagram_user_id: 'a1', username: 'kopi' }]),
      ok([{ user_id: 'u1', account_id: 'a1', name: 'Kopi Sinar' }, { user_id: 'u2', account_id: 'a2', name: 'Lama' }]),
    )
    expect(await listKnowledgeAccounts()).toEqual([
      { userId: 'u1', accountId: 'a1', connected: true, label: 'Kopi Sinar · @kopi' },
      { userId: 'u2', accountId: 'a2', connected: false, label: 'Lama' },
    ])
  })
})

describe('previewRetrieval', () => {
  it('asks the writer RPCs with the topic, and skips cases without an account like retrieveCases', async () => {
    fake.rpc.mockResolvedValue(ok([{ id: 'H070', structure: '[A] atau [B]', use_when: 'u' }]))
    expect(await previewRetrieval('KPR atau cash', null)).toEqual({ hooks: [{ id: 'H070', structure: '[A] atau [B]', use_when: 'u' }], cases: null })
    expect(fake.rpc).toHaveBeenCalledTimes(1)
    expect(fake.rpc).toHaveBeenCalledWith('retrieve_hooks', { query_text: 'KPR atau cash' })

    fake.rpc.mockReset()
    fake.rpc.mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([{ id: 'C1', verdict: 'failure', principle: 'p', excerpt: 'e' }]))
    const preview = await previewRetrieval('kpr', { userId: 'u1', accountId: 'a1' })
    expect(fake.rpc).toHaveBeenCalledWith('retrieve_study_cases', { p_user_id: 'u1', p_account_id: 'a1', query_text: 'kpr' })
    expect(preview.cases).toEqual([{ id: 'C1', verdict: 'failure', principle: 'p' }])
  })
})
