import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AiLimitError,
  aiErrorMessage,
  AiOutputError,
  buildMessages,
  DAILY_LIMIT,
  parseAiRequest,
  parseOptions,
  runAiTask,
} from './ai'
import type { AiRequest, Brief } from './ai-options'
import { getBrandContext } from './brand'
import type { BrandContext } from './brand-options'
import { ConfigError } from './errors'
import { chatCompletion, RouterApiError } from './nine-router'

const database = vi.hoisted(() => ({
  counted: [] as unknown[][],
  recent: 0 as number | null,
  insertError: null as { message: string } | null,
  inserted: [] as unknown[],
}))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    from: () => ({
      select: () => ({
        eq: (...filter: unknown[]) => {
          database.counted.push(filter)
          return { gt: async () => ({ count: database.recent, error: null }) }
        },
      }),
      insert: async (row: unknown) => {
        database.inserted.push(row)
        return { data: null, error: database.insertError }
      },
    }),
  }),
}))

vi.mock('./nine-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./nine-router')>()),
  chatCompletion: vi.fn(),
}))

vi.mock('./brand', () => ({ getBrandContext: vi.fn() }))

const BRAND: BrandContext = {
  name: 'Kopi Sinar',
  category: 'Kedai kopi',
  description: '',
  audience: 'pekerja muda di Bandung',
  voice: 'Santai, pakai "kak"',
  wordsUse: '',
  wordsAvoid: 'murah',
  facts: '- Buka 08.00–22.00 WIB',
}

const BRIEF: Brief = {
  topic: 'Promo kopi susu gula aren 20%',
  goal: 'promosi',
  tone: 'santai',
  audience: 'mahasiswa',
  photoCount: 3,
}
const CAPTIONS: AiRequest = { task: 'captions', brief: BRIEF }

describe('parseAiRequest', () => {
  it('accepts a brief and trims its text', () => {
    const input = { task: 'captions', brief: { ...BRIEF, topic: '  Promo kopi  ', audience: ' ' } }

    expect(parseAiRequest(input)).toEqual({
      request: { task: 'captions', brief: { ...BRIEF, topic: 'Promo kopi', audience: '' } },
    })
  })

  it('accepts a rewrite and hashtag request', () => {
    expect(parseAiRequest({ task: 'rewrite', style: 'cta', caption: 'Halo' })).toEqual({
      request: { task: 'rewrite', style: 'cta', caption: 'Halo' },
    })
    expect(parseAiRequest({ task: 'hashtags', caption: 'Halo\r\nsemua' })).toEqual({
      request: { task: 'hashtags', caption: 'Halo\nsemua' },
    })
  })

  it.each([
    ['a non-object', 'captions'],
    ['an unknown task', { task: 'publish' }],
    ['a missing brief', { task: 'ideas' }],
    ['an empty topic', { task: 'captions', brief: { ...BRIEF, topic: '   ' } }],
    ['a topic over 300 characters', { task: 'captions', brief: { ...BRIEF, topic: 'a'.repeat(301) } }],
    ['an audience over 150 characters', { task: 'captions', brief: { ...BRIEF, audience: 'a'.repeat(151) } }],
    ['an unknown goal', { task: 'captions', brief: { ...BRIEF, goal: 'viral' } }],
    ['a goal inherited from Object.prototype', { task: 'captions', brief: { ...BRIEF, goal: 'toString' } }],
    ['an unknown tone', { task: 'ideas', brief: { ...BRIEF, tone: 'marah' } }],
    ['eleven photos', { task: 'captions', brief: { ...BRIEF, photoCount: 11 } }],
    ['a fractional photo count', { task: 'captions', brief: { ...BRIEF, photoCount: 1.5 } }],
    ['an unknown rewrite style', { task: 'rewrite', style: 'puitis', caption: 'Halo' }],
    ['an empty caption', { task: 'hashtags', caption: ' \n ' }],
  ])('refuses %s', (_label, input) => {
    expect(parseAiRequest(input)).toHaveProperty('error')
  })

  it('counts code points, so 2,200 emoji fit and 2,201 do not', () => {
    expect(parseAiRequest({ task: 'rewrite', style: 'singkat', caption: '😀'.repeat(2200) })).toHaveProperty('request')
    expect(parseAiRequest({ task: 'rewrite', style: 'singkat', caption: '😀'.repeat(2201) })).toEqual({
      error: 'Caption lebih dari 2.200 karakter.',
    })
  })

  it('refuses hashtag suggestions for a caption that already has 30', () => {
    const caption = Array.from({ length: 30 }, (_, index) => `#tag${index}`).join(' ')

    expect(parseAiRequest({ task: 'hashtags', caption })).toEqual({ error: 'Caption sudah memakai 30 hashtag.' })
  })
})

describe('buildMessages', () => {
  it('sends the rules as the system message and the brief as the user message', () => {
    const [system, user] = buildMessages(CAPTIONS)

    expect(system).toMatchObject({ role: 'system' })
    expect(system.content).toContain('JSON')
    expect(user.role).toBe('user')
    expect(user.content).toContain('"""\nPromo kopi susu gula aren 20%\n"""')
    expect(user.content).toContain('Tujuan: Promosi atau jualan')
    expect(user.content).toContain('Nada: Santai')
    expect(user.content).toContain('Audiens: mahasiswa')
    expect(user.content).toContain('Format post: carousel 3 foto')
    expect(user.content).toContain('{"captions"')
  })

  it('describes a single photo, no photos and an empty audience', () => {
    expect(buildMessages({ task: 'ideas', brief: { ...BRIEF, photoCount: 1 } })[1].content).toContain('foto tunggal')

    const user = buildMessages({ task: 'ideas', brief: { ...BRIEF, photoCount: 0, audience: '' } })[1].content
    expect(user).toContain('belum ada foto')
    expect(user).toContain('Audiens: umum')
  })

  it('ends caption and idea prompts with the no-invented-claims reminder, where the model weighs it most', () => {
    for (const task of ['captions', 'ideas'] as const) {
      const user = buildMessages({ task, brief: BRIEF })[1].content

      expect(user.trimEnd()).toMatch(/Hanya pakai fakta dari brief di atas\.[^\n]*$/)
    }
  })

  it('quotes the caption to rewrite', () => {
    const [, user] = buildMessages({ task: 'rewrite', style: 'cta', caption: 'Halo semua' })

    expect(user.content).toContain('"""\nHalo semua\n"""')
    expect(user.content).toContain('ajakan bertindak')
  })

  it('puts the filled brand fields first and quotes the brand facts', () => {
    const user = buildMessages(CAPTIONS, BRAND)[1].content

    expect(user).toMatch(/^Tentang brand/)
    expect(user).toContain('Nama: Kopi Sinar')
    expect(user).toContain('Gaya bahasa: Santai, pakai "kak"')
    expect(user).toContain('Hindari kata atau gaya ini: murah')
    expect(user).toContain('Fakta brand yang boleh dipakai:\n"""\n- Buka 08.00–22.00 WIB\n"""')
    expect(user).not.toContain('Deskripsi:')
  })

  it('lets brand facts count as facts and fills an empty audience from the brand', () => {
    const user = buildMessages({ task: 'ideas', brief: { ...BRIEF, audience: '' } }, BRAND)[1].content

    expect(user).toContain('Audiens: pekerja muda di Bandung')
    expect(user.trimEnd()).toMatch(/Hanya pakai fakta dari brief dan fakta brand di atas\.[^\n]*$/)
  })

  it('keeps the brief-only reminder when the brand has no facts', () => {
    const user = buildMessages(CAPTIONS, { ...BRAND, facts: '' })[1].content

    expect(user.trimEnd()).toMatch(/Hanya pakai fakta dari brief di atas\.[^\n]*$/)
  })
})

const thrown = (run: () => unknown): unknown => {
  try {
    run()
  } catch (error) {
    return error
  }
  return null
}

describe('parseOptions', () => {
  const json = '{"captions": ["Satu", "Dua"]}'

  it('reads plain, fenced and wrapped JSON', () => {
    expect(parseOptions(CAPTIONS, json)).toEqual(['Satu', 'Dua'])
    expect(parseOptions(CAPTIONS, `\`\`\`json\n${json}\n\`\`\``)).toEqual(['Satu', 'Dua'])
    expect(parseOptions(CAPTIONS, `Berikut hasilnya:\n${json}`)).toEqual(['Satu', 'Dua'])
  })

  it('turns a provider notice sent with status 200 into an AiOutputError', () => {
    const notice =
      'Gemini 3.5 Flash is no longer available. Please switch to Gemini 3.7 Flash in the latest version of Antigravity.'

    const error = thrown(() => parseOptions(CAPTIONS, notice))

    expect(error).toBeInstanceOf(AiOutputError)
    expect(error).toMatchObject({ snippet: notice })
  })

  it('keeps the first 120 characters of a long answer', () => {
    expect(thrown(() => parseOptions(CAPTIONS, 'x'.repeat(500)))).toMatchObject({ snippet: `${'x'.repeat(120)}…` })
  })

  it('rejects the wrong shape and lists with nothing usable', () => {
    expect(() => parseOptions(CAPTIONS, '{"caption": "Satu"}')).toThrow(AiOutputError)
    expect(() => parseOptions(CAPTIONS, '{"captions": ["", "  ", 3]}')).toThrow(AiOutputError)
  })

  it('trims, drops duplicates and keeps at most three captions', () => {
    const answer = JSON.stringify({ captions: [' Satu ', 'Satu', 'Dua', 'Tiga', 'Empat'] })

    expect(parseOptions(CAPTIONS, answer)).toEqual(['Satu', 'Dua', 'Tiga'])
  })

  it('cuts ideas to the topic limit, so Jadikan topik always passes validation', () => {
    const ideas = parseOptions({ task: 'ideas', brief: BRIEF }, JSON.stringify({ ideas: ['😀'.repeat(400)] }))

    expect(Array.from(ideas[0])).toHaveLength(300)
  })

  it('returns a rewrite as one option', () => {
    expect(parseOptions({ task: 'rewrite', style: 'singkat', caption: 'Halo' }, '{"caption": " Hai "}')).toEqual(['Hai'])
  })

  it('normalizes hashtags and leaves out the ones already in the caption', () => {
    const request: AiRequest = { task: 'hashtags', caption: 'Ngopi dulu #KopiSusu' }
    const answer = JSON.stringify({ hashtags: ['#kopisusu', 'gula aren', '#Promo-Weekend', '#', '#GulaAren'] })

    expect(parseOptions(request, answer)).toEqual(['#gulaaren #PromoWeekend'])
  })

  it('adds no more hashtags than the caption has room for', () => {
    const caption = Array.from({ length: 27 }, (_, index) => `#ada${index}`).join(' ')
    const answer = JSON.stringify({ hashtags: ['#a', '#b', '#c', '#d', '#e'] })

    expect(parseOptions({ task: 'hashtags', caption }, answer)).toEqual(['#a #b #c'])
  })
})

const USER = 'user-1'

describe('runAiTask', () => {
  beforeEach(() => {
    vi.stubEnv('ROUTER_MODEL', 'test-model')
    database.counted = []
    database.recent = 0
    database.insertError = null
    database.inserted = []
    vi.mocked(chatCompletion).mockReset()
    vi.mocked(getBrandContext).mockReset().mockResolvedValue(null)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('stops at the daily limit without asking the model', async () => {
    database.recent = DAILY_LIMIT

    await expect(runAiTask(USER, CAPTIONS)).rejects.toThrow(AiLimitError)
    expect(chatCompletion).not.toHaveBeenCalled()
    expect(database.inserted).toEqual([])
  })

  it('refuses to ask the model when the request count cannot be read', async () => {
    // postgrest-js turns a HEAD 404 with no body (the table is not migrated yet) into no error and no count.
    database.recent = null

    const error = await runAiTask(USER, CAPTIONS).then(() => null, (caught: unknown) => caught)

    expect(chatCompletion).not.toHaveBeenCalled()
    expect(aiErrorMessage(error)).toBe(
      'AI gagal dijalankan: database tidak bisa diakses. Periksa Supabase dan migrasi terbaru.',
    )
  })

  it('returns the options and logs the request', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"captions": ["Satu"]}')

    await expect(runAiTask(USER, CAPTIONS)).resolves.toEqual(['Satu'])
    expect(database.counted).toEqual([['user_id', USER]])
    expect(database.inserted).toEqual([
      expect.objectContaining({
        user_id: USER,
        task: 'captions',
        input: CAPTIONS,
        output: ['Satu'],
        model: 'test-model',
        status: 'ok',
        error: null,
      }),
    ])
  })

  it('logs a failure and rethrows it', async () => {
    vi.mocked(chatCompletion).mockRejectedValue(new RouterApiError('rate limited', 429))

    await expect(runAiTask(USER, CAPTIONS)).rejects.toMatchObject({ status: 429 })
    expect(database.inserted).toEqual([
      expect.objectContaining({ status: 'failed', output: null, error: 'RouterApiError: rate limited' }),
    ])
  })

  it('logs an unreadable answer as a failure', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('Gemini 3.5 Flash is no longer available.')

    await expect(runAiTask(USER, CAPTIONS)).rejects.toThrow(AiOutputError)
    expect(database.inserted).toEqual([expect.objectContaining({ status: 'failed' })])
  })

  it('sends the saved brand kit with the request', async () => {
    vi.mocked(getBrandContext).mockResolvedValue(BRAND)
    vi.mocked(chatCompletion).mockResolvedValue('{"captions": ["Satu"]}')

    await runAiTask(USER, CAPTIONS)

    expect(vi.mocked(chatCompletion).mock.calls[0][0][1].content).toContain('Nama: Kopi Sinar')
  })

  it('still writes captions when the brand kit cannot be read', async () => {
    vi.mocked(getBrandContext).mockRejectedValue(new Error('relation "brand_kit" does not exist'))
    vi.mocked(chatCompletion).mockResolvedValue('{"captions": ["Satu"]}')

    await expect(runAiTask(USER, CAPTIONS)).resolves.toEqual(['Satu'])
    expect(vi.mocked(chatCompletion).mock.calls[0][0][1].content).not.toContain('Tentang brand')
  })

  it('still returns the options when the log insert fails', async () => {
    database.insertError = { message: 'relation "ai_generations" does not exist' }
    vi.mocked(chatCompletion).mockResolvedValue('{"captions": ["Satu"]}')

    await expect(runAiTask(USER, CAPTIONS)).resolves.toEqual(['Satu'])
    expect(console.error).toHaveBeenCalled()
  })
})

describe('aiErrorMessage', () => {
  it.each([
    [
      new ConfigError('ROUTER_API_KEY belum diisi di .env.local'),
      'Konfigurasi AI belum lengkap: ROUTER_API_KEY belum diisi di .env.local.',
    ],
    [new AiLimitError('limit'), 'Batas 100 permintaan AI per 24 jam sudah tercapai. Coba lagi nanti.'],
    [
      new AiOutputError('Gemini 3.5 Flash is no longer available.'),
      'Jawaban AI tidak bisa dibaca ("Gemini 3.5 Flash is no longer available."). Coba lagi, atau ganti ROUTER_MODEL kalau terus terjadi.',
    ],
    [new RouterApiError('x', 0), 'Layanan AI tidak bisa dihubungi atau terlalu lama menjawab. Coba lagi.'],
    [new RouterApiError('x', 200), 'Jawaban AI kosong. Coba lagi, atau ganti ROUTER_MODEL kalau terus terjadi.'],
    [new RouterApiError('x', 401), 'API key 9Router ditolak. Periksa ROUTER_API_KEY di .env.local.'],
    [new RouterApiError('x', 403), 'API key 9Router ditolak. Periksa ROUTER_API_KEY di .env.local.'],
    [new RouterApiError('x', 404), 'Model AI tidak ditemukan. Periksa ROUTER_MODEL di .env.local.'],
    [new RouterApiError('x', 429), 'Kuota AI sedang habis. Coba lagi beberapa menit lagi.'],
    [new RouterApiError('x', 503), 'Layanan AI sedang bermasalah. Coba lagi nanti.'],
    [new RouterApiError('x', 400), 'Permintaan ditolak layanan AI (HTTP 400). Periksa ROUTER_MODEL di .env.local.'],
    [
      new Error('Supabase: fetch failed'),
      'AI gagal dijalankan: database tidak bisa diakses. Periksa Supabase dan migrasi terbaru.',
    ],
  ])('maps %s', (error, message) => {
    expect(aiErrorMessage(error)).toBe(message)
  })
})
