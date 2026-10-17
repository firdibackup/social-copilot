import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSettingsCache, getAppSettings, getPlan, imageModel, textModel } from './app-settings'
import { DEFAULT_PLAN } from './billing-options'

const store = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown }, reads: 0 }))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    from: () => ({
      select: () => ({
        maybeSingle: async () => {
          store.reads += 1
          return store.result
        },
      }),
    }),
  }),
}))

const ROW = {
  text_model: 'cc/claude-sonnet',
  image_model: null,
  plan_name: 'Pro',
  plan_price_idr: 149_000,
  plan_days: 30,
  plan_credits: null,
  updated_at: '2026-10-17T00:00:00Z',
}

beforeEach(() => {
  clearSettingsCache()
  store.reads = 0
  store.result = { data: null, error: null }
  vi.stubEnv('ROUTER_MODEL', 'env-model')
  vi.stubEnv('ROUTER_IMAGE_MODEL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('app settings', () => {
  it('uses the defaults from .env and code without a row', async () => {
    expect(await textModel()).toBe('env-model')
    expect(await imageModel()).toBe('cx/gpt-image-2.5')
    expect(await getPlan()).toEqual(DEFAULT_PLAN)
  })

  it("uses the admin's choices and fills what they left empty", async () => {
    store.result = { data: ROW, error: null }

    expect(await textModel()).toBe('cc/claude-sonnet')
    expect(await imageModel()).toBe('cx/gpt-image-2.5')
    expect(await getPlan()).toEqual({ name: 'Pro', priceIdr: 149_000, days: 30, credits: DEFAULT_PLAN.credits })
  })

  it('reads the row once per 30 seconds', async () => {
    store.result = { data: ROW, error: null }

    await getAppSettings(1_000)
    await getAppSettings(20_000)
    expect(store.reads).toBe(1)
    await getAppSettings(31_001)
    expect(store.reads).toBe(2)
  })

  it('falls back to the defaults when the table cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    store.result = { data: null, error: { message: 'relation "app_settings" does not exist' } }

    expect(await textModel()).toBe('env-model')
    expect(console.error).toHaveBeenCalledWith('[pengaturan-app] gagal dibaca, pakai default:', expect.stringContaining('app_settings'))
  })
})
