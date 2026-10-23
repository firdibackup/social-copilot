import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AiLimitError,
  aiErrorMessage,
  AiOutputError,
  cleanList,
  describeBrand,
  loadBrandContext,
  readJson,
  remainingCredits,
  runLogged,
  snippetOf,
} from './ai'
import { creditsUsed, getCurrentPeriod } from './billing'
import { contentCost } from './billing-options'
import { getBrandContext } from './brand'
import type { BrandContext } from './brand-options'
import { ConfigError } from './errors'
import { RouterApiError } from './nine-router'
import { DEFAULT_CATALOG } from './billing-catalog-options'
vi.mock('./billing-catalog', () => ({ getBillingCatalog: vi.fn(async () => ({ version: 1, catalog: DEFAULT_CATALOG })) }))

const database = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: 'reservation-1', error: null })),
  insertError: null as { message: string } | null,
  inserted: [] as { table: string; row: unknown }[],
}))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    rpc: database.rpc,
    from: (table: string) => ({
      insert: async (row: unknown) => {
        database.inserted.push({ table, row })
        return { data: null, error: database.insertError }
      },
    }),
  }),
}))

vi.mock('./brand', () => ({ getBrandContext: vi.fn() }))
vi.mock('./billing', () => ({ creditsUsed: vi.fn(), getCurrentPeriod: vi.fn() }))

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

const USER = 'user-1'
const PERIOD = {
  start: new Date('2026-10-01T00:00:00Z'),
  end: new Date('2026-10-31T00:00:00Z'),
  activeUntil: new Date('2026-10-31T00:00:00Z'),
}

const rows = () => database.inserted.map((insert) => insert.row)

const failure = (promise: Promise<unknown>) => promise.then(() => null, (caught: unknown) => caught)

describe('describeBrand', () => {
  it('lists the filled fields in order, quotes the facts and ends with a blank line', () => {
    expect(describeBrand(BRAND)).toBe(
      [
        'Tentang brand (ikuti gaya bahasanya):',
        'Nama: Kopi Sinar',
        'Kategori: Kedai kopi',
        'Audiens utama: pekerja muda di Bandung',
        'Gaya bahasa: Santai, pakai "kak"',
        'Hindari kata atau gaya ini: murah',
        'Fakta brand yang boleh dipakai:\n"""\n- Buka 08.00–22.00 WIB\n"""',
        '',
        '',
      ].join('\n'),
    )
  })

  it('leaves out empty fields and an empty facts block', () => {
    const text = describeBrand({ ...BRAND, category: '', facts: '' })

    expect(text).not.toContain('Kategori')
    expect(text).not.toContain('Fakta brand')
    expect(text).not.toContain('Deskripsi')
  })
})

describe('snippetOf', () => {
  it('flattens whitespace', () => {
    expect(snippetOf('  Maaf,\n\n  coba   lagi. ')).toBe('Maaf, coba lagi.')
  })

  it('cuts at 120 characters with an ellipsis', () => {
    expect(snippetOf('x'.repeat(500))).toBe(`${'x'.repeat(120)}…`)
    expect(snippetOf('x'.repeat(120))).toBe('x'.repeat(120))
  })

  it('counts code points, so 120 emoji stay whole and 121 are cut', () => {
    expect(snippetOf('😀'.repeat(120))).toBe('😀'.repeat(120))
    expect(snippetOf('😀'.repeat(121))).toBe(`${'😀'.repeat(120)}…`)
  })
})

describe('readJson', () => {
  const json = '{"caption": "Halo", "meta": {"n": 1}}'
  const parsed = { caption: 'Halo', meta: { n: 1 } }

  it('reads plain, fenced and wrapped JSON, taking the outermost braces', () => {
    expect(readJson(json)).toEqual(parsed)
    expect(readJson(`\`\`\`json\n${json}\n\`\`\``)).toEqual(parsed)
    expect(readJson(`Berikut hasilnya:\n${json}\nSemoga membantu.`)).toEqual(parsed)
  })

  it.each([
    ['a provider notice', 'Gemini 3.5 Flash is no longer available.'],
    ['broken JSON', '{"caption": "Halo"'],
    ['a closing brace before the opening one', '} lalu {'],
    ['invalid JSON between braces', '{caption: Halo}'],
  ])('returns null for %s', (_label, content) => {
    expect(readJson(content)).toBeNull()
  })
})

describe('cleanList', () => {
  it('drops non-strings and blanks, trims and removes duplicates', () => {
    expect(cleanList([' Satu ', 'Satu', '', '  ', 3, null, 'Dua'], 10)).toEqual(['Satu', 'Dua'])
  })

  it('counts the maximum after removing duplicates', () => {
    expect(cleanList(['a', 'a', 'b', 'c', 'd'], 3)).toEqual(['a', 'b', 'c'])
  })

  it.each([['a string', 'Satu'], ['an object', { 0: 'Satu' }], ['null', null]])('returns nothing for %s', (_label, value) => {
    expect(cleanList(value, 3)).toEqual([])
  })
})

describe('with a period', () => {
  beforeEach(() => {
    vi.stubEnv('ROUTER_MODEL', 'test-model')
    vi.mocked(getCurrentPeriod).mockReset().mockResolvedValue(PERIOD)
    vi.mocked(creditsUsed).mockReset().mockResolvedValue(0)
    vi.mocked(getBrandContext).mockReset().mockResolvedValue(null)
    database.insertError = null
    database.inserted = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('remainingCredits', () => {
    it('counts the credits left since the period started', async () => {
      vi.mocked(creditsUsed).mockResolvedValue(2_500)

      await expect(remainingCredits(USER)).resolves.toEqual({ remaining: 7_500, period: PERIOD })
      expect(creditsUsed).toHaveBeenCalledWith(USER, PERIOD.start)
    })

    it('never goes below 0 when two requests at once overspent the period', async () => {
      vi.mocked(creditsUsed).mockResolvedValue(10_020)

      await expect(remainingCredits(USER)).resolves.toMatchObject({ remaining: 0 })
    })
  })

  describe('runLogged', () => {
    it('does not call the provider when another request reserved the last credits first', async () => {
      database.rpc.mockResolvedValueOnce({ data: null as unknown as string, error: null })
      const ask = vi.fn(async () => 'answer')
      await expect(runLogged(USER, 'caption_edit', {}, ask)).rejects.toBeInstanceOf(AiLimitError)
      expect(ask).not.toHaveBeenCalled()
    })
    it('releases the reservation if the provider fails', async () => {
      await expect(runLogged(USER, 'caption_edit', {}, async () => { throw new Error('provider failed') })).rejects.toThrow('provider failed')
      expect(database.rpc).toHaveBeenCalledWith('settle_ai_credits', { p_id: 'reservation-1', p_user: USER, p_success: false })
    })
    it('returns the answer and logs it to ai_generations with the task price', async () => {
      const ask = vi.fn(async () => 'Halo')

      await expect(runLogged(USER, 'caption_edit', { instruction: 'santai' }, ask)).resolves.toBe('Halo')
      expect(database.inserted).toEqual([
        {
          table: 'ai_generations',
          row: {
            user_id: USER,
            reservation_id: 'reservation-1',
            task: 'caption_edit',
            input: { instruction: 'santai' },
            model: 'test-model',
            output: 'Halo',
            status: 'ok',
            error: null,
            credits: 2,
            duration_ms: expect.any(Number),
          },
        },
      ])
    })

    it('charges and checks the given cost instead of the task price', async () => {
      vi.mocked(creditsUsed).mockResolvedValue(10_000 - contentCost(3))

      await runLogged(USER, 'content', {}, async () => 'ok', { cost: contentCost(3) })

      expect(rows()).toEqual([expect.objectContaining({ task: 'content', credits: 63 })])
    })

    it('logs the given model and only what logOutput keeps', async () => {
      const image = { bytes: new Uint8Array(4), prompt: 'Kafe' }

      await runLogged(USER, 'slide_edit', {}, async () => image, {
        model: 'image-model',
        logOutput: (result) => ({ bytes: result.bytes.length, prompt: result.prompt }),
      })

      expect(rows()).toEqual([expect.objectContaining({ model: 'image-model', output: { bytes: 4, prompt: 'Kafe' } })])
    })

    it('still runs a request that uses up the last credits exactly', async () => {
      vi.mocked(creditsUsed).mockResolvedValue(998)

      await expect(runLogged(USER, 'caption_edit', {}, async () => 'ok')).resolves.toBe('ok')
    })

    it('runs a free request with no credits left', async () => {
      vi.mocked(creditsUsed).mockResolvedValue(10_000)

      await expect(runLogged(USER, 'content_slide', {}, async () => 'ok')).resolves.toBe('ok')
      expect(rows()).toEqual([expect.objectContaining({ credits: 0, status: 'ok' })])
    })

    it('stops before asking when the period has fewer credits left than the request costs', async () => {
      vi.mocked(creditsUsed).mockResolvedValue(9_999)
      const ask = vi.fn(async () => 'ok')

      const error = await failure(runLogged(USER, 'caption_edit', {}, ask))

      expect(error).toBeInstanceOf(AiLimitError)
      expect(aiErrorMessage(error)).toBe(
        'Kuota AI periode ini tidak cukup. Kuota baru mulai 31 Okt, atau perpanjang di halaman Langganan.',
      )
      expect(ask).not.toHaveBeenCalled()
      expect(database.inserted).toEqual([])
    })

    it('refuses without an active subscription', async () => {
      vi.mocked(getCurrentPeriod).mockResolvedValue(null)
      const ask = vi.fn(async () => 'ok')

      const error = await failure(runLogged(USER, 'caption_edit', {}, ask))

      expect(aiErrorMessage(error)).toContain('Langganan tidak aktif')
      expect(ask).not.toHaveBeenCalled()
    })

    it('refuses to ask when the credit count cannot be read', async () => {
      vi.mocked(creditsUsed).mockRejectedValue(new Error('Supabase: jumlah kredit tidak terbaca'))
      const ask = vi.fn(async () => 'ok')

      const error = await failure(runLogged(USER, 'caption_edit', {}, ask))

      expect(ask).not.toHaveBeenCalled()
      expect(aiErrorMessage(error)).toBe(
        'AI gagal dijalankan: database tidak bisa diakses. Periksa Supabase dan migrasi terbaru.',
      )
    })

    it('logs a failure at no cost and rethrows the same error', async () => {
      const rejected = new RouterApiError('rate limited', 429)

      await expect(runLogged(USER, 'content', {}, async () => Promise.reject(rejected), { cost: 63 })).rejects.toBe(rejected)
      expect(rows()).toEqual([
        expect.objectContaining({ status: 'failed', output: null, error: 'RouterApiError: rate limited', credits: 0 }),
      ])
    })

    it('still returns the answer when the log insert fails', async () => {
      database.insertError = { message: 'relation "ai_generations" does not exist' }

      await expect(runLogged(USER, 'caption_edit', {}, async () => 'ok')).resolves.toBe('ok')
      expect(console.error).toHaveBeenCalledWith('[ai] gagal mencatat permintaan:', expect.stringContaining('ai_generations'))
    })
  })

  describe('loadBrandContext', () => {
    it('returns the saved brand kit', async () => {
      vi.mocked(getBrandContext).mockResolvedValue(BRAND)

      await expect(loadBrandContext(USER)).resolves.toEqual(BRAND)
      expect(getBrandContext).toHaveBeenCalledWith(USER)
    })

    it('goes on without the brand when the kit cannot be read', async () => {
      vi.mocked(getBrandContext).mockRejectedValue(new Error('relation "brand_kit" does not exist'))

      await expect(loadBrandContext(USER)).resolves.toBeNull()
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('brand kit'), expect.stringContaining('brand_kit'))
    })
  })
})

describe('aiErrorMessage', () => {
  it.each([
    [
      new ConfigError('ROUTER_API_KEY belum diisi di .env.local'),
      'Konfigurasi AI belum lengkap: ROUTER_API_KEY belum diisi di .env.local.',
    ],
    [new AiLimitError('Langganan tidak aktif.'), 'Langganan tidak aktif.'],
    [
      new AiOutputError('Gemini 3.5 Flash is no longer available.'),
      'Jawaban AI tidak bisa dibaca ("Gemini 3.5 Flash is no longer available."). Coba lagi, atau ganti model AI di Admin › Pengaturan kalau terus terjadi.',
    ],
    [new RouterApiError('x', 0), 'Layanan AI tidak bisa dihubungi atau terlalu lama menjawab. Coba lagi.'],
    [new RouterApiError('x', 200), 'Jawaban AI kosong. Coba lagi, atau ganti model AI di Admin › Pengaturan kalau terus terjadi.'],
    [new RouterApiError('x', 401), 'API key 9Router ditolak. Periksa ROUTER_API_KEY di .env.local.'],
    [new RouterApiError('x', 403), 'API key 9Router ditolak. Periksa ROUTER_API_KEY di .env.local.'],
    [new RouterApiError('x', 404), 'Model AI tidak ditemukan. Periksa model AI di Admin › Pengaturan.'],
    [new RouterApiError('x', 413), 'Permintaan ke 9Router terlalu besar. Kurangi atau perkecil gambar referensi.'],
    [new RouterApiError('x', 429), 'Kuota AI sedang habis. Coba lagi beberapa menit lagi.'],
    [new RouterApiError('x', 503), 'Layanan AI sedang bermasalah. Coba lagi nanti.'],
    [new RouterApiError('x', 400), 'Permintaan ditolak layanan AI (HTTP 400). Periksa model AI di Admin › Pengaturan.'],
    [
      new Error('Supabase: fetch failed'),
      'AI gagal dijalankan: database tidak bisa diakses. Periksa Supabase dan migrasi terbaru.',
    ],
  ])('maps %s', (error, message) => {
    expect(aiErrorMessage(error)).toBe(message)
  })
})
