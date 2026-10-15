import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAiTask } from '@/lib/ai'
import type { AiRequest, Brief } from '@/lib/ai-options'
import { assertLocalRequest } from '@/lib/local-only'
import { RouterApiError } from '@/lib/nine-router'
import { generateAction } from './ai-actions'

vi.mock('@/lib/local-only', () => ({ assertLocalRequest: vi.fn() }))
vi.mock('@/lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai')>()),
  runAiTask: vi.fn(),
}))

const BRIEF: Brief = { topic: 'Promo kopi', goal: 'promosi', tone: 'santai', audience: '', photoCount: 1 }
const REQUEST: AiRequest = { task: 'captions', brief: BRIEF }

describe('generateAction', () => {
  beforeEach(() => {
    vi.mocked(assertLocalRequest).mockReset().mockResolvedValue(undefined)
    vi.mocked(runAiTask).mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the options', async () => {
    vi.mocked(runAiTask).mockResolvedValue(['Satu', 'Dua'])

    await expect(generateAction(REQUEST)).resolves.toEqual({ options: ['Satu', 'Dua'] })
    expect(runAiTask).toHaveBeenCalledWith(REQUEST)
  })

  it('refuses requests from outside this machine', async () => {
    vi.mocked(assertLocalRequest).mockRejectedValue(new Error('Tidak diizinkan'))

    await expect(generateAction(REQUEST)).rejects.toThrow('Tidak diizinkan')
    expect(runAiTask).not.toHaveBeenCalled()
  })

  it('answers invalid input without asking the model', async () => {
    await expect(generateAction({ task: 'captions', brief: { ...BRIEF, topic: ' ' } })).resolves.toEqual({
      error: 'Isi topik dulu.',
    })
    expect(runAiTask).not.toHaveBeenCalled()
  })

  it('turns a 9Router error into a message for the owner', async () => {
    vi.mocked(runAiTask).mockRejectedValue(new RouterApiError('[cc/claude] [401]: invalid key', 401))

    await expect(generateAction(REQUEST)).resolves.toEqual({
      error: 'API key 9Router ditolak. Periksa ROUTER_API_KEY di .env.local.',
    })
    expect(console.error).toHaveBeenCalled()
  })
})
