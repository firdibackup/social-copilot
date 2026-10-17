import { beforeEach, describe, expect, it, vi } from 'vitest'
import { filtered, queryMock } from '@/test/query-mock'
import { listAssets } from './assets'
import { getBrandContext, getBrandKit, saveBrandKit } from './brand'
import { EMPTY_BRAND } from './brand-options'
import { getConnectedAccountId } from './connection'
import { getConversation, getVariables, listConversations, listTemplates, saveVariables } from './dm'
import { getDiscoveryAccount, getFacebookConnection } from './facebook-connection'
import { listIdeas, recentTitles } from './ideas'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))
vi.mock('./connection', () => ({ getConnectedAccountId: vi.fn() }))

let calls: unknown[][]

function answer(result: unknown) {
  const mock = queryMock(result)
  calls = mock.calls
  vi.mocked(db).mockReturnValue({ ...mock.query, storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) } } as never)
}

beforeEach(() => {
  vi.mocked(db).mockReset()
  vi.mocked(getConnectedAccountId).mockReset()
})

describe('dashboard reads filter by the connected account', () => {
  it.each([
    ['listAssets', () => listAssets('user-1', 'ig-1')],
    ['listIdeas', () => listIdeas('user-1', 'ig-1')],
    ['recentTitles', () => recentTitles('user-1', 'ig-1')],
    ['listConversations', () => listConversations('user-1', 'ig-1', false)],
    ['getConversation', () => getConversation('user-1', 'ig-1', 'igsid-1')],
    ['listTemplates', () => listTemplates('user-1', 'ig-1')],
    ['getVariables', () => getVariables('user-1', 'ig-1')],
    ['getBrandKit', () => getBrandKit('user-1', 'ig-1')],
  ])('%s', async (_name, read) => {
    answer({ data: [], error: null })
    await read().catch(() => {})
    expect(filtered(calls, 'user_id', 'user-1')).toBe(true)
    expect(filtered(calls, 'account_id', 'ig-1')).toBe(true)
  })

  it('reads the Facebook Page of the connected account', async () => {
    answer({ data: null, error: null })
    await getFacebookConnection('user-1', 'ig-1')
    expect(filtered(calls, 'instagram_user_id', 'ig-1')).toBe(true)
    await expect(getDiscoveryAccount('user-1', 'ig-1')).rejects.toThrow()
    expect(filtered(calls, 'instagram_user_id', 'ig-1')).toBe(true)
  })
})

describe('singleton writes key on user and account', () => {
  it('saves the brand kit for the account', async () => {
    answer({ data: null, error: null })
    await saveBrandKit('user-1', 'ig-1', EMPTY_BRAND)
    const upsert = calls.find((call) => call[0] === 'upsert')
    expect(upsert?.[1]).toMatchObject({ user_id: 'user-1', account_id: 'ig-1' })
    expect(upsert?.[2]).toEqual({ onConflict: 'user_id,account_id' })
  })

  it('clears a failed fill notice once the owner saves the brand', async () => {
    answer({ data: null, error: null })
    await saveBrandKit('user-1', 'ig-1', EMPTY_BRAND)
    expect(calls.find((call) => call[0] === 'upsert')?.[1]).toMatchObject({ sync_status: null })
  })

  it('saves template variables for the account', async () => {
    answer({ data: null, error: null })
    await saveVariables('user-1', 'ig-1', { brand_name: 'Toko' })
    const upsert = calls.find((call) => call[0] === 'upsert')
    expect(upsert?.[1]).toMatchObject({ user_id: 'user-1', account_id: 'ig-1' })
    expect(upsert?.[2]).toEqual({ onConflict: 'user_id,account_id' })
  })
})

describe('AI prompts read the connected account’s brand', () => {
  it('looks up the connected account first', async () => {
    vi.mocked(getConnectedAccountId).mockResolvedValue('ig-2')
    answer({ data: null, error: null })
    await getBrandContext('user-1')
    expect(filtered(calls, 'account_id', 'ig-2')).toBe(true)
  })

  it('has no brand without a connected account', async () => {
    vi.mocked(getConnectedAccountId).mockResolvedValue(null)
    answer({ data: null, error: null })
    await expect(getBrandContext('user-1')).resolves.toBeNull()
    expect(db).not.toHaveBeenCalled()
  })
})
