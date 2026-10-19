import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminError, adjustCredits, deleteUser, grantDays, logAdminAction } from '@/lib/admin'
import { saveAppSettings } from '@/lib/app-settings'
import { requireAdmin } from '@/lib/auth'
import { chatCompletion, RouterApiError } from '@/lib/nine-router'
import { saveSettingsAction, testModelAction, userAction } from './actions'

vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`)
  }),
}))
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/admin', async (importOriginal) => ({
  AdminError: (await importOriginal<typeof import('@/lib/admin')>()).AdminError,
  adjustCredits: vi.fn(),
  deleteUser: vi.fn(),
  endSubscription: vi.fn(),
  grantDays: vi.fn(),
  logAdminAction: vi.fn(),
  resetCredits: vi.fn(),
  setBanned: vi.fn(),
  setPassword: vi.fn(),
}))
vi.mock('@/lib/app-settings', () => ({ saveAppSettings: vi.fn() }))
vi.mock('@/lib/nine-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/nine-router')>()),
  chatCompletion: vi.fn(),
  generateImage: vi.fn(),
}))

const ADMIN = { id: 'admin-1', email: 'owner@example.com' }
const USER = '00000000-0000-4000-8000-000000000001'
const INITIAL = { error: null, success: null }

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

const act = (fields: Record<string, string>) => userAction(INITIAL, form({ userId: USER, ...fields }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(requireAdmin).mockResolvedValue(ADMIN)
})

describe('every admin action', () => {
  it('checks the admin first and does nothing for anyone else', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('NOT_FOUND'))

    await expect(act({ intent: 'grant', days: '7' })).rejects.toThrow('NOT_FOUND')
    await expect(saveSettingsAction(INITIAL, form({}))).rejects.toThrow('NOT_FOUND')
    await expect(testModelAction('text', 'x')).rejects.toThrow('NOT_FOUND')
    expect(grantDays).not.toHaveBeenCalled()
    expect(saveAppSettings).not.toHaveBeenCalled()
    expect(chatCompletion).not.toHaveBeenCalled()
  })
})

describe('userAction', () => {
  it('grants the days typed', async () => {
    await expect(act({ intent: 'grant', days: '14' })).resolves.toEqual({ error: null, success: '14 hari langganan ditambahkan.' })
    expect(grantDays).toHaveBeenCalledWith(ADMIN, USER, 14)
  })

  it('refuses a user id that is not a uuid, and an unknown intent', async () => {
    await expect(userAction(INITIAL, form({ userId: 'x', intent: 'grant', days: '7' }))).resolves.toHaveProperty('error')
    await expect(act({ intent: 'hapus-semua' })).resolves.toEqual({ error: 'Aksi tidak dikenal.', success: null })
    expect(grantDays).not.toHaveBeenCalled()
  })

  it('shows an AdminError as it is and hides anything else', async () => {
    vi.mocked(adjustCredits).mockRejectedValueOnce(new AdminError('Pengguna ini tidak punya periode aktif.'))
    await expect(act({ intent: 'adjust', kind: 'add', credits: '100' })).resolves.toEqual({
      error: 'Pengguna ini tidak punya periode aktif.',
      success: null,
    })

    vi.mocked(adjustCredits).mockRejectedValueOnce(new Error('Supabase: connection refused'))
    const state = await act({ intent: 'adjust', kind: 'add', credits: '100' })
    expect(state.error).not.toContain('connection refused')
  })

  it('takes credits as a negative adjustment', async () => {
    await act({ intent: 'adjust', kind: 'remove', credits: '250', note: 'koreksi' })
    expect(adjustCredits).toHaveBeenCalledWith(ADMIN, USER, -250, 'koreksi')
  })

  it('goes back to the list after a delete', async () => {
    await expect(act({ intent: 'delete', confirmEmail: 'budi@example.com' })).rejects.toThrow('REDIRECT /admin/pengguna?dihapus=1')
    expect(deleteUser).toHaveBeenCalledWith(ADMIN, USER, 'budi@example.com')
  })
})

describe('saveSettingsAction', () => {
  it('saves valid settings and logs them', async () => {
    const state = await saveSettingsAction(
      INITIAL,
      form({ textModel: 'cc/claude-haiku-4-5-20251001', imageModel: '', planName: 'Pro', planPrice: '149.000', planDays: '30', planCredits: '5000' }),
    )

    expect(state.success).toBeTruthy()
    const settings = { textModel: 'cc/claude-haiku-4-5-20251001', imageModel: null, plan: { name: 'Pro', priceIdr: 149_000, days: 30, credits: 5_000 } }
    expect(saveAppSettings).toHaveBeenCalledWith('admin-1', settings)
    expect(logAdminAction).toHaveBeenCalledWith(ADMIN, 'save_settings', null, settings)
  })

  it('saves nothing when a field is invalid', async () => {
    const state = await saveSettingsAction(INITIAL, form({ planName: '', planPrice: '0', planDays: '30', planCredits: '1' }))
    expect(state.error).toBeTruthy()
    expect(saveAppSettings).not.toHaveBeenCalled()
  })
})

describe('testModelAction', () => {
  it('tries the model typed and shows the provider’s own error', async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce(' OK ')
    await expect(testModelAction('text', ' cc/x ')).resolves.toMatchObject({ ok: true, message: 'Jawaban: "OK"' })
    expect(chatCompletion).toHaveBeenCalledWith(expect.any(Array), 'cc/x')

    vi.mocked(chatCompletion).mockRejectedValueOnce(new RouterApiError('model not found', 404))
    await expect(testModelAction('text', 'cc/y')).resolves.toMatchObject({ ok: false, message: 'HTTP 404: model not found' })
  })

  it('asks for a model id first', async () => {
    await expect(testModelAction('image', '  ')).resolves.toMatchObject({ ok: false, message: 'Isi id model dulu.' })
  })
})
