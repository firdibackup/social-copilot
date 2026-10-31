import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiOutputError } from './ai'
import { creditsUsed, getCurrentPeriod } from './billing'
import { DEFAULT_CATALOG } from './billing-catalog-options'
import { getBrandContext } from './brand'
import type { BrandContext } from './brand-options'
import { chatCompletion } from './nine-router'
import {
  buildThreadEditMessages,
  buildThreadWriteMessages,
  editThread,
  parseThreadAnswer,
  writeThread,
} from './threads-ai'

const database = vi.hoisted(() => ({ rows: [] as unknown[] }))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    rpc: vi.fn(async () => ({ data: 'reservation-1', error: null })),
    from: () => ({
      insert: async (row: unknown) => {
        database.rows.push(row)
        return { data: null, error: null }
      },
    }),
  }),
}))
vi.mock('./nine-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./nine-router')>()),
  chatCompletion: vi.fn(),
}))
vi.mock('./brand', () => ({ getBrandContext: vi.fn() }))
vi.mock('./app-settings', () => ({
  textModel: vi.fn(async () => 'test/model'),
  getPlan: vi.fn(async () => ({ name: 'Test', priceIdr: 0, days: 30, credits: 100 })),
}))
vi.mock('./billing', () => ({ creditsUsed: vi.fn(), getCurrentPeriod: vi.fn() }))
vi.mock('./billing-catalog', () => ({ getBillingCatalog: vi.fn(async () => ({ version: 1, catalog: DEFAULT_CATALOG })) }))

const USER = 'user-1'
const BRAND: BrandContext = {
  name: 'Kopi Sinar',
  category: 'Kedai kopi',
  description: 'Kopi susu gula aren',
  audience: 'pekerja muda',
  voice: 'Santai',
  wordsUse: '',
  wordsAvoid: 'murah',
  facts: '- Buka pukul 08.00',
}

beforeEach(() => {
  vi.clearAllMocks()
  database.rows.length = 0
  vi.mocked(getBrandContext).mockResolvedValue(BRAND)
  vi.mocked(creditsUsed).mockResolvedValue(0)
  vi.mocked(getCurrentPeriod).mockResolvedValue({
    start: new Date('2026-10-01T00:00:00Z'),
    end: new Date('2026-11-01T00:00:00Z'),
    activeUntil: new Date('2026-11-01T00:00:00Z'),
  })
})

describe('Threads prompts', () => {
  it('puts the topic, brand, hook and Threads constraints in a write prompt', () => {
    const messages = buildThreadWriteMessages('Cara seduh kopi', BRAND)
    expect(messages[0].content).toContain('Post pertama harus menjadi hook')
    expect(messages[0].content).toContain('maksimal 1 hashtag')
    expect(messages[1].content).toContain('Nama: Kopi Sinar')
    expect(messages[1].content).toContain('Cara seduh kopi')
    expect(messages[1].content).toContain('{"posts": ["…"]}')
  })

  it('includes the instruction, target and whole chain when editing one post', () => {
    const messages = buildThreadEditMessages(['Hook lama', 'Isi lama'], 'lebih santai', 1, BRAND)
    const prompt = String(messages[1].content)
    expect(prompt).toContain('hanya Post #2')
    expect(prompt).toContain('lebih santai')
    expect(prompt).toContain('Post #1')
    expect(prompt).toContain('Hook lama')
    expect(prompt).toContain('Nama: Kopi Sinar')
  })
})

describe('parseThreadAnswer', () => {
  it('reads and normalizes a valid JSON answer', () => {
    expect(parseThreadAnswer('```json\n{"posts":[" Hook ","Isi\\r\\nlanjut"]}\n```')).toEqual(['Hook', 'Isi\nlanjut'])
  })

  it.each([
    'bukan JSON',
    '{"posts":[]}',
    '{"posts":[""]}',
    '{"posts":["ok",7]}',
    JSON.stringify({ posts: Array.from({ length: 11 }, () => 'post') }),
  ])('rejects an invalid answer: %s', (answer) => {
    expect(() => parseThreadAnswer(answer)).toThrow(AiOutputError)
  })

  it('keeps an over-long post for the action to split against final-chain capacity', () => {
    const long = 'kata '.repeat(120).trim()
    expect(parseThreadAnswer(JSON.stringify({ posts: [long] }))).toEqual([long])
  })
})

describe('logged Threads requests', () => {
  it('writes with the brand and charges threads_write credits', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"posts":["Hook","Isi"]}')
    await expect(writeThread(USER, 'Topik kopi')).resolves.toEqual(['Hook', 'Isi'])
    expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).toContain('Nama: Kopi Sinar')
    expect(database.rows).toEqual([
      expect.objectContaining({ task: 'threads_write', credits: 3, input: { topic: 'Topik kopi' } }),
    ])
  })

  it('edits one target, logs only small input metadata, and charges threads_edit credits', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"posts":["Isi baru"]}')
    await expect(editThread(USER, ['Hook', 'Isi'], 'lebih singkat', 1)).resolves.toEqual(['Isi baru'])
    expect(database.rows).toEqual([
      expect.objectContaining({
        task: 'threads_edit',
        credits: 2,
        input: { posts: 2, instruction: 'lebih singkat', target: 1 },
      }),
    ])
  })

  it('rejects multiple posts from a single-target edit', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"posts":["Satu","Dua"]}')
    await expect(editThread(USER, ['Hook'], 'ubah', 0)).rejects.toThrow(AiOutputError)
    expect(database.rows).toEqual([expect.objectContaining({ task: 'threads_edit', status: 'failed', credits: 0 })])
  })
})
