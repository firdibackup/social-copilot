import { createTranslator } from 'next-intl'
import adminMessages from '@/../messages/id/admin.json'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logAdminAction } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { deleteHook, listKnowledgeAccounts, previewRetrieval, saveCase, saveHook } from '@/lib/knowledge'
import { knowledgeAction, previewAction } from './actions'

vi.mock('next-intl/server', () => ({ getLocale: async () => 'id', getTranslations: async () => createTranslator({ locale: 'id', messages: adminMessages }) }))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/admin', () => ({ logAdminAction: vi.fn() }))
vi.mock('@/lib/knowledge', () => ({
  deleteCase: vi.fn(), deleteHook: vi.fn(), listKnowledgeAccounts: vi.fn(), previewRetrieval: vi.fn(), saveCase: vi.fn(), saveHook: vi.fn(),
}))

const ADMIN = { id: 'admin-1', email: 'owner@example.com' }
const INITIAL = { error: null, success: null }
const ACCOUNT = { userId: 'u1', accountId: 'a1', label: 'Kopi', connected: true }

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never)
  vi.mocked(listKnowledgeAccounts).mockResolvedValue([ACCOUNT])
})

describe('knowledgeAction', () => {
  it('saves a new hook and logs it', async () => {
    vi.mocked(saveHook).mockResolvedValue('OWN-001')
    const state = await knowledgeAction(INITIAL, form({ intent: 'save_hook', structure: '[HASIL] tanpa [HAMBATAN]', useWhen: 'Tutorial.' }))
    expect(state).toEqual({ error: null, success: 'Hook OWN-001 tersimpan.' })
    expect(saveHook).toHaveBeenCalledWith({ id: null, structure: '[HASIL] tanpa [HAMBATAN]', useWhen: 'Tutorial.', sources: [] }, null)
    expect(logAdminAction).toHaveBeenCalledWith(ADMIN, 'create_hook', null, { id: 'OWN-001', structure: '[HASIL] tanpa [HAMBATAN]' })
  })

  it('returns the validation message and writes nothing', async () => {
    const state = await knowledgeAction(INITIAL, form({ intent: 'save_hook', structure: 'Rumah murah 300 juta', useWhen: 'x' }))
    expect(state.error).toContain('[PLACEHOLDER]')
    expect(saveHook).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it('updates a case for one account and logs its scope', async () => {
    vi.mocked(saveCase).mockResolvedValue('RAG2-PROMO-FEES')
    await knowledgeAction(INITIAL, form({
      intent: 'save_case', originalId: 'RAG2-PROMO-FEES', scope: 'u1:a1', tags: 'kpr', verdict: 'failure', outcome: 'observed_failure', excerpt: 'e', reason: 'r', principle: 'p',
    }))
    expect(vi.mocked(saveCase).mock.calls[0][1]).toBe('RAG2-PROMO-FEES')
    expect(vi.mocked(saveCase).mock.calls[0][0].scope).toEqual(ACCOUNT)
    expect(logAdminAction).toHaveBeenCalledWith(ADMIN, 'update_case', null, expect.objectContaining({ id: 'RAG2-PROMO-FEES', scope: 'u1:a1' }))
  })

  it('deletes and logs, and refuses a delete without an id', async () => {
    await knowledgeAction(INITIAL, form({ intent: 'delete_hook', originalId: 'H001' }))
    expect(deleteHook).toHaveBeenCalledWith('H001')
    expect(logAdminAction).toHaveBeenCalledWith(ADMIN, 'delete_hook', null, { id: 'H001' })
    expect(await knowledgeAction(INITIAL, form({ intent: 'delete_hook' }))).toEqual({ error: 'Data tidak ditemukan.', success: null })
  })

  it('stops when the user is not an admin', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('NEXT_NOT_FOUND'))
    await expect(knowledgeAction(INITIAL, form({ intent: 'delete_hook', originalId: 'H001' }))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(deleteHook).not.toHaveBeenCalled()
  })
})

describe('previewAction', () => {
  it('passes the chosen account and needs a topic', async () => {
    vi.mocked(previewRetrieval).mockResolvedValue({ hooks: [], cases: [] })
    await previewAction({ error: null, topic: '', result: null }, form({ topic: ' kpr ', scope: 'u1:a1' }))
    expect(previewRetrieval).toHaveBeenCalledWith('kpr', ACCOUNT)
    expect((await previewAction({ error: null, topic: '', result: null }, form({ topic: ' ' }))).error).toBe('Tulis topik dulu.')
  })
})
