import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiOutputError } from './ai'
import {
  analyzeProfile,
  analyzeVisual,
  buildProfileMessages,
  buildStrategyMessages,
  buildVisualMessages,
  parseProfile,
  parseStrategyAnswer,
  parseVisual,
  type ProfileSources,
} from './brand-ai'
import { chatCompletion, type ContentPart } from './nine-router'

const database = vi.hoisted(() => ({ inserted: [] as unknown[] }))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    rpc: vi.fn(async () => ({ data: 'reservation-1', error: null })),
    from: () => ({
      insert: async (row: unknown) => {
        database.inserted.push(row)
        return { data: null, error: null }
      },
    }),
  }),
}))

vi.mock('./billing', () => ({
  creditsUsed: async () => 0,
  getCurrentPeriod: async () => ({ start: new Date('2026-10-01'), end: new Date('2026-10-31'), activeUntil: new Date('2026-10-31') }),
}))
vi.mock('./nine-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./nine-router')>()),
  chatCompletion: vi.fn(),
}))

const SOURCES: ProfileSources = {
  website: {
    url: 'https://kopisinar.id/',
    pages: [
      { url: 'https://kopisinar.id/', title: 'Kopi Sinar', description: 'Kopi dari Bandung', text: 'Buka 08.00–22.00' },
      { url: 'https://kopisinar.id/menu', title: 'Menu', description: '', text: 'Kopi susu gula aren' },
    ],
  },
  instagram: { username: 'kopisinar', name: 'Kopi Sinar', biography: 'Ngopi santai ☕', captions: ['Halo kak!', 'Promo hari ini'] },
}

const REFERENCES = [
  { id: 'r1', note: 'ambil layout-nya saja', dataUrl: 'data:image/jpeg;base64,AAAA' },
  { id: 'r2', note: '', dataUrl: 'data:image/png;base64,BBBB' },
]

const BRAND_PROFILE = {
  name: 'Kopi Sinar',
  category: '',
  description: '',
  audience: '',
  voice: '',
  wordsUse: '',
  wordsAvoid: '',
  facts: '',
}

describe('buildProfileMessages', () => {
  it('quotes the page text, bio and captions as sources', () => {
    const [system, user] = buildProfileMessages(SOURCES)

    expect(system.content).toContain('JSON')
    expect(system.content).toContain('data yang tidak dipercaya')
    expect(user.content).toContain('Website (https://kopisinar.id/), 2 halaman:')
    expect(user.content).toContain('Halaman 2 (https://kopisinar.id/menu):')
    expect(user.content).toContain('"""\nBuka 08.00–22.00\n"""')
    expect(user.content).toContain('Akun Instagram @kopisinar (Kopi Sinar):')
    expect(user.content).toContain('"""\nNgopi santai ☕\n"""')
    expect(user.content).toContain('2.\n"""\nPromo hari ini\n"""')
  })

  it('leaves out a source that was not read', () => {
    const user = buildProfileMessages({ ...SOURCES, website: null })[1].content

    expect(user).not.toContain('Website (')
    expect(user).toContain('@kopisinar')
  })
})

describe('parseProfile', () => {
  it('reads every field, trimming and cutting each to its limit', () => {
    const draft = parseProfile(`\`\`\`json\n{"name": " Kopi Sinar ", "category": "Kedai kopi", "facts": "${'a'.repeat(2100)}", "voice": 3}\n\`\`\``)

    expect(draft).toMatchObject({ name: 'Kopi Sinar', category: 'Kedai kopi', voice: '', audience: '' })
    expect(draft.facts).toHaveLength(2000)
  })

  it('treats an answer with nothing usable as unreadable', () => {
    expect(() => parseProfile('{"name": ""}')).toThrow(AiOutputError)
    expect(() => parseProfile('Maaf, saya tidak bisa.')).toThrow(AiOutputError)
  })
})

describe('buildVisualMessages', () => {
  it('numbers each image and quotes the owner note before it', () => {
    const [, user] = buildVisualMessages(REFERENCES)
    const parts = user.content as ContentPart[]

    expect(parts.map((part) => part.type)).toEqual(['text', 'text', 'image_url', 'text', 'image_url'])
    expect(parts[1]).toEqual({ type: 'text', text: 'Referensi 1, catatan owner:\n"""\nambil layout-nya saja\n"""' })
    expect(parts[2]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } })
    expect(parts[3]).toEqual({ type: 'text', text: 'Referensi 2' })
  })
})

describe('parseVisual', () => {
  it('pads missing descriptions so each reference keeps its place', () => {
    expect(parseVisual('{"visualStyle": "Minimalis, banyak ruang putih.", "references": ["Satu"]}', 2)).toEqual({
      visualStyle: 'Minimalis, banyak ruang putih.',
      descriptions: ['Satu', ''],
    })
  })

  it('requires the style guide', () => {
    expect(() => parseVisual('{"references": ["Satu"]}', 1)).toThrow(AiOutputError)
  })
})

describe('logging', () => {
  beforeEach(() => {
    vi.stubEnv('ROUTER_MODEL', 'test-model')
    database.inserted = []
    vi.mocked(chatCompletion).mockReset()
  })

  afterEach(() => vi.unstubAllEnvs())

  it('logs the profile request with its sources and draft', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"name": "Kopi Sinar"}')

    await expect(analyzeProfile('user-1', SOURCES)).resolves.toMatchObject({ name: 'Kopi Sinar' })
    expect(database.inserted).toEqual([
      expect.objectContaining({ task: 'brand_profile', input: SOURCES, output: expect.objectContaining({ name: 'Kopi Sinar' }) }),
    ])
  })

  it('logs reference ids and notes, never the image data', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"visualStyle": "Hangat", "references": ["a", "b"]}')

    await analyzeVisual('user-1', REFERENCES)

    expect(database.inserted).toEqual([
      expect.objectContaining({
        task: 'brand_visual',
        input: [
          { id: 'r1', note: 'ambil layout-nya saja' },
          { id: 'r2', note: '' },
        ],
      }),
    ])
    expect(JSON.stringify(database.inserted)).not.toContain('base64')
  })

  it('logs a free request at 0 credits when asked, as the new-account fill does', async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce('{"name": "Kopi Sinar"}')
    vi.mocked(chatCompletion).mockResolvedValueOnce('{"visualStyle": "Hangat", "references": ["a", "b"]}')

    await analyzeProfile('user-1', SOURCES, { cost: 0 })
    await analyzeVisual('user-1', REFERENCES, { cost: 0 })

    expect(database.inserted).toEqual([expect.objectContaining({ credits: 0 }), expect.objectContaining({ credits: 0 })])
  })
})

describe('parseStrategyAnswer', () => {
  it('normalises the shares to 100 and gives every pillar an id', () => {
    const strategy = parseStrategyAnswer(
      JSON.stringify({
        identity: 'The Engineer',
        pillars: [
          { name: 'Edukasi', detail: 'tips', share: 50 },
          { name: 'Portofolio', detail: '', share: 30 },
          { name: 'CTA', detail: '', share: 30 },
        ],
        tone: 'Rapi',
        focus: 'trust',
        postsPerWeek: 40,
      }),
    )
    expect(strategy.pillars.reduce((sum, pillar) => sum + pillar.share, 0)).toBe(100)
    expect(new Set(strategy.pillars.map((pillar) => pillar.id)).size).toBe(3)
    expect(strategy.focus).toBe('trust')
    expect(strategy.postsPerWeek).toBe(14)
  })

  it('falls back on an unknown focus and rejects too few pillars', () => {
    const answer = { identity: 'X', pillars: [{ name: 'A', share: 1 }, { name: 'B', share: 1 }], focus: 'viral' }
    expect(parseStrategyAnswer(JSON.stringify(answer)).focus).toBe('awareness')
    expect(() => parseStrategyAnswer(JSON.stringify({ identity: 'X', pillars: [{ name: 'A' }] }))).toThrow(AiOutputError)
  })
})

describe('buildStrategyMessages', () => {
  it('sends the profile and the captions, but not the old strategy', () => {
    const brand = { ...BRAND_PROFILE, strategy: { identity: 'Lama', pillars: [], tone: '', focus: 'sales' as const, postsPerWeek: 3 } }
    const text = String(buildStrategyMessages({ brand, recent: ['Promo minggu ini'] })[1].content)
    expect(text).toContain('Nama: Kopi Sinar')
    expect(text).toContain('Promo minggu ini')
    expect(text).not.toContain('Strategi konten brand')
  })
})
import { DEFAULT_CATALOG } from './billing-catalog-options'
vi.mock('./billing-catalog', () => ({ getBillingCatalog: vi.fn(async () => ({ version: 1, catalog: DEFAULT_CATALOG })) }))
