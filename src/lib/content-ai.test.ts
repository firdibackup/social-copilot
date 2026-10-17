import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiOutputError } from './ai'
import { creditsUsed, getCurrentPeriod } from './billing'
import { getBrandContext } from './brand'
import type { BrandContext } from './brand-options'
import { HOOK_ARCHETYPES } from './carousel-guide'
import {
  buildCaptionEditMessages,
  buildContentMessages,
  buildIdeasMessages,
  buildSlideRevisionMessages,
  editCaption,
  parseCaption,
  parseContentPlan,
  parseIdeas,
  parseSlide,
  planContent,
  reviseSlide,
  suggestIdeas,
} from './content-ai'
import type { ContentRequest } from './content-options'
import { chatCompletion, RouterApiError } from './nine-router'

const database = vi.hoisted(() => ({ inserted: [] as { table: string; row: unknown }[] }))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    from: (table: string) => ({
      insert: async (row: unknown) => {
        database.inserted.push({ table, row })
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
vi.mock('./billing', () => ({ creditsUsed: vi.fn(), getCurrentPeriod: vi.fn() }))

const BRAND: BrandContext = {
  name: 'Kopi Sinar',
  category: 'Kedai kopi',
  description: 'Kopi susu gula aren',
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

const REQUEST: ContentRequest = {
  topic: 'Tips menyeduh kopi di rumah',
  slides: 2,
  format: '4:5',
  referenceId: null,
  includeLogo: false,
  ideaId: null,
}

const PLAN_ANSWER = JSON.stringify({
  title: ' Seduh kopi di rumah ',
  caption: ' Pagi lebih enak dengan kopi buatan sendiri.\r\n\r\n#kopi ',
  slides: [
    { headline: '3 langkah seduh', scene: 'Meja kayu dengan V60' },
    { headline: 'Selamat mencoba', scene: 'Cangkir kopi di jendela' },
  ],
})

const rows = () => database.inserted.map((insert) => insert.row)

describe('buildContentMessages', () => {
  it('plans a carousel as cover, inner slides with one point each, and a CTA', () => {
    const user = buildContentMessages('Tips seduh', 5, null)[1].content

    expect(user).toContain('slide 1 = cover')
    expect(user).toContain('slide 2–4 = isi, satu poin per slide')
    expect(user).toContain('slide 5 = CTA')
  })

  it('plans two slides as cover and inner slide, and one image without roles', () => {
    expect(buildContentMessages('Tips seduh', 2, null)[1].content).toContain('slide 2 = isi')
    expect(buildContentMessages('Tips seduh', 1, null)[1].content).not.toContain('= cover')
  })

  it('asks for a carousel with exactly that many slides and quotes the topic', () => {
    const [system, user] = buildContentMessages('Tips seduh', 3, null)

    expect(system).toMatchObject({ role: 'system' })
    expect(system.content).toContain('headline')
    expect(system.content).toContain('JSON')
    expect(user.role).toBe('user')
    expect(user.content).toContain('berupa carousel 3 slide')
    expect(user.content).toContain('tepat 3 slide')
    expect(user.content).toContain('Ajak pembaca menggeser carousel')
    expect(user.content).toContain('Topik:\n"""\nTips seduh\n"""')
    expect(user.content).not.toContain('Tentang brand')
  })

  it('asks for one image without carousel wording', () => {
    const user = buildContentMessages('Tips seduh', 1, null)[1].content

    expect(user).toContain('berupa satu gambar')
    expect(user).not.toContain('carousel')
  })

  it('puts the brand first and ends with the no-invented-claims reminder, where the model weighs it most', () => {
    const user = String(buildContentMessages('Tips seduh', 2, BRAND)[1].content)

    expect(user).toMatch(/^Tentang brand/)
    expect(user).toContain('Fakta brand yang boleh dipakai:\n"""\n- Buka 08.00–22.00 WIB\n"""')
    expect(user.trimEnd()).toMatch(/Hanya pakai fakta dari topik dan fakta brand di atas\. Jangan menambah klaim[^\n]*$/)
  })

  it('adds the carousel guide with the chosen hook archetype, before the topic', () => {
    const user = String(buildContentMessages('Tips seduh', 5, null, 'contrarian')[1].content)

    expect(user).toContain('Panduan carousel (wajib):')
    expect(user).toContain(`Gaya hook post ini: ${HOOK_ARCHETYPES.contrarian}`)
    expect(user.indexOf('Panduan carousel')).toBeLessThan(user.indexOf('Topik:'))
  })

  it('leaves the carousel guide out of a single image', () => {
    expect(buildContentMessages('Tips seduh', 1, null)[1].content).not.toContain('Panduan carousel')
  })

  it('allows only the topic as facts when the brand has none', () => {
    const user = String(buildContentMessages('Tips seduh', 2, { ...BRAND, facts: '' })[1].content)

    expect(user.trimEnd()).toMatch(/Hanya pakai fakta dari topik di atas\.[^\n]*$/)
  })
})

describe('parseContentPlan', () => {
  it('reads the title, caption and slides, trimmed, with CRLF as LF', () => {
    expect(parseContentPlan(`\`\`\`json\n${PLAN_ANSWER}\n\`\`\``, 2)).toEqual({
      title: 'Seduh kopi di rumah',
      caption: 'Pagi lebih enak dengan kopi buatan sendiri.\n\n#kopi',
      slides: [
        { headline: '3 langkah seduh', scene: 'Meja kayu dengan V60' },
        { headline: 'Selamat mencoba', scene: 'Cangkir kopi di jendela' },
      ],
    })
  })

  it('keeps only as many slides as were paid for', () => {
    expect(parseContentPlan(PLAN_ANSWER, 1).slides).toEqual([{ headline: '3 langkah seduh', scene: 'Meja kayu dengan V60' }])
  })

  it('drops slides without a scene before counting', () => {
    const answer = JSON.stringify({
      caption: 'Halo',
      slides: [{ headline: 'Tanpa adegan', scene: ' ' }, 'teks', { headline: '', scene: 'Kafe' }],
    })

    expect(parseContentPlan(answer, 1).slides).toEqual([{ headline: '', scene: 'Kafe' }])
  })

  it.each([
    ['a provider notice', 'Gemini 3.5 Flash is no longer available.'],
    ['fewer slides than were paid for', PLAN_ANSWER.replace(/,\s*\{"headline":"Selamat[^}]*\}/, '')],
    ['no caption', JSON.stringify({ title: 'T', caption: ' ', slides: [{ headline: '', scene: 'Kafe' }] })],
    ['slides that are not a list', JSON.stringify({ caption: 'Halo', slides: { headline: '', scene: 'Kafe' } })],
  ])('throws an AiOutputError for %s', (_label, answer) => {
    expect(() => parseContentPlan(answer, 2)).toThrow(AiOutputError)
  })

  it('falls back to the first headline line, then the caption, for a missing title', () => {
    const slides = [{ headline: 'Baris satu\nBaris dua', scene: 'Kafe' }]
    expect(parseContentPlan(JSON.stringify({ caption: 'Halo\nsemua', slides }), 1).title).toBe('Baris satu')

    const plain = [{ headline: '', scene: 'Kafe' }]
    expect(parseContentPlan(JSON.stringify({ caption: 'Halo\nsemua', slides: plain }), 1).title).toBe('Halo')
  })

  it('cuts the title, caption, headline and scene to their limits in code points', () => {
    const answer = JSON.stringify({
      title: '😀'.repeat(200),
      caption: '😀'.repeat(2300),
      slides: [{ headline: '😀'.repeat(200), scene: '😀'.repeat(1100) }],
    })

    const plan = parseContentPlan(answer, 1)

    expect(Array.from(plan.title)).toHaveLength(120)
    expect(Array.from(plan.caption)).toHaveLength(2200)
    expect(Array.from(plan.slides[0].headline)).toHaveLength(150)
    expect(Array.from(plan.slides[0].scene)).toHaveLength(1000)
  })
})

describe('parseIdeas', () => {
  it('trims, drops duplicates and keeps at most ten', () => {
    const ideas = [' Satu ', 'Satu', '', ...Array.from({ length: 12 }, (_, index) => `Ide ${index}`)]

    const parsed = parseIdeas(JSON.stringify({ ideas }))

    expect(parsed).toHaveLength(10)
    expect(parsed.slice(0, 2)).toEqual(['Satu', 'Ide 0'])
  })

  it('cuts an idea to 200 code points', () => {
    expect(Array.from(parseIdeas(JSON.stringify({ ideas: ['😀'.repeat(300)] }))[0])).toHaveLength(200)
  })

  it.each([['no ideas', '{"ideas": []}'], ['a provider notice', 'Maaf, coba lagi.']])('throws an AiOutputError for %s', (_label, answer) => {
    expect(() => parseIdeas(answer)).toThrow(AiOutputError)
  })
})

describe('buildIdeasMessages', () => {
  it('describes the brand and quotes the recent titles to avoid', () => {
    const user = String(buildIdeasMessages(BRAND, ['Promo Senin', 'Tips seduh'])[1].content)

    expect(user).toMatch(/^Tentang brand/)
    expect(user).toContain('beri 10 ide')
    expect(user).toContain('Jangan ulangi ide atau post yang sudah ada:\n"""\nPromo Senin\nTips seduh\n"""')
  })

  it('leaves out the avoid list when there is nothing to avoid', () => {
    expect(buildIdeasMessages(BRAND, [])[1].content).not.toContain('Jangan ulangi')
  })
})

describe('buildCaptionEditMessages', () => {
  it('quotes the instruction and the caption to change', () => {
    const user = String(buildCaptionEditMessages('Halo semua', 'tambahkan CTA', null)[1].content)

    expect(user).toContain('ubah caption di bawah')
    expect(user).toContain('Permintaan owner:\n"""\ntambahkan CTA\n"""')
    expect(user).toContain('Caption:\n"""\nHalo semua\n"""')
    expect(user.trimEnd()).toMatch(/Jangan menambah klaim[^\n]*$/)
  })

  it('writes a new caption when there is none yet', () => {
    const user = String(buildCaptionEditMessages('', 'caption untuk foto latte', BRAND)[1].content)

    expect(user).toMatch(/^Tentang brand/)
    expect(user).toContain('tulis caption baru')
    expect(user).not.toContain('Caption:\n')
  })
})

describe('parseCaption', () => {
  it('reads the caption, trimmed, and cuts it to 2,200 code points', () => {
    expect(parseCaption('{"caption": " Hai\\r\\nsemua "}')).toBe('Hai\nsemua')
    expect(Array.from(parseCaption(JSON.stringify({ caption: '😀'.repeat(2300) })))).toHaveLength(2200)
  })

  it.each([['an empty caption', '{"caption": " "}'], ['the wrong shape', '{"captions": ["Hai"]}']])('throws an AiOutputError for %s', (_label, answer) => {
    expect(() => parseCaption(answer)).toThrow(AiOutputError)
  })
})

describe('buildSlideRevisionMessages', () => {
  it('quotes the instruction and the current slide', () => {
    const user = String(buildSlideRevisionMessages({ headline: 'Judul', scene: 'Kafe' }, 'ganti jadi malam hari')[1].content)

    expect(user).toContain('Permintaan owner:\n"""\nganti jadi malam hari\n"""')
    expect(user).toContain('headline sekarang:\n"""\nJudul\n"""')
    expect(user).toContain('scene sekarang:\n"""\nKafe\n"""')
  })

  it('explains an empty headline and a missing scene, as an uploaded photo has', () => {
    const user = String(buildSlideRevisionMessages({ headline: '', scene: '' }, 'tambahkan judul')[1].content)

    expect(user).toContain('(kosong: gambar tanpa teks)')
    expect(user).toContain('(belum ada: tulis dari permintaan owner)')
  })
})

describe('parseSlide', () => {
  it('reads one slide', () => {
    expect(parseSlide('{"headline": " Malam ", "scene": " Kafe malam "}')).toEqual({ headline: 'Malam', scene: 'Kafe malam' })
  })

  it.each([['no scene', '{"headline": "Malam", "scene": ""}'], ['no JSON', 'Maaf.']])('throws an AiOutputError for %s', (_label, answer) => {
    expect(() => parseSlide(answer)).toThrow(AiOutputError)
  })
})

describe('requests', () => {
  beforeEach(() => {
    vi.stubEnv('ROUTER_MODEL', 'test-model')
    vi.mocked(getCurrentPeriod).mockReset().mockResolvedValue(PERIOD)
    vi.mocked(creditsUsed).mockReset().mockResolvedValue(0)
    vi.mocked(getBrandContext).mockReset().mockResolvedValue(BRAND)
    vi.mocked(chatCompletion).mockReset()
    database.inserted = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('planContent', () => {
    it('charges the post and every slide once, saves the plan and logs it', async () => {
      vi.mocked(chatCompletion).mockResolvedValue(PLAN_ANSWER)
      const save = vi.fn(async () => 'post-1')

      const { plan, saved } = await planContent(USER, { ...REQUEST, ideaId: 'idea-1' }, save)

      expect(saved).toBe('post-1')
      expect(save).toHaveBeenCalledWith(plan)
      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).toContain('Nama: Kopi Sinar')
      expect(database.inserted).toEqual([
        {
          table: 'ai_generations',
          row: expect.objectContaining({
            task: 'content',
            credits: 43,
            input: { topic: REQUEST.topic, slides: 2, format: '4:5', ideaId: 'idea-1' },
            output: plan,
            status: 'ok',
          }),
        },
      ])
    })

    it('refuses before asking when the period cannot pay for every slide', async () => {
      vi.mocked(creditsUsed).mockResolvedValue(10_000 - 42)
      const save = vi.fn()

      await expect(planContent(USER, REQUEST, save)).rejects.toThrow('Kuota AI periode ini tidak cukup')
      expect(chatCompletion).not.toHaveBeenCalled()
      expect(save).not.toHaveBeenCalled()
    })

    it('costs nothing when the post cannot be stored', async () => {
      vi.mocked(chatCompletion).mockResolvedValue(PLAN_ANSWER)

      await expect(planContent(USER, REQUEST, async () => Promise.reject(new Error('Supabase: down')))).rejects.toThrow('down')
      expect(rows()).toEqual([expect.objectContaining({ status: 'failed', credits: 0 })])
    })

    it('costs nothing and saves nothing for an unreadable answer', async () => {
      vi.mocked(chatCompletion).mockResolvedValue('{"caption": "Halo", "slides": []}')
      const save = vi.fn()

      await expect(planContent(USER, REQUEST, save)).rejects.toThrow(AiOutputError)
      expect(save).not.toHaveBeenCalled()
      expect(rows()).toEqual([expect.objectContaining({ status: 'failed', credits: 0 })])
    })

    it('still plans without the brand when the kit cannot be read', async () => {
      vi.mocked(getBrandContext).mockRejectedValue(new Error('relation "brand_kit" does not exist'))
      vi.mocked(chatCompletion).mockResolvedValue(PLAN_ANSWER)

      await planContent(USER, REQUEST, async () => 'post-1')

      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).not.toContain('Tentang brand')
    })
  })

  describe('suggestIdeas', () => {
    it('saves the ideas inside the charged request and logs only how many titles were avoided', async () => {
      vi.mocked(chatCompletion).mockResolvedValue('{"ideas": ["Satu", "Dua"]}')
      const save = vi.fn(async () => {})

      await expect(suggestIdeas(USER, BRAND, ['Promo Senin'], save)).resolves.toEqual(['Satu', 'Dua'])
      expect(save).toHaveBeenCalledWith(['Satu', 'Dua'])
      expect(rows()).toEqual([expect.objectContaining({ task: 'content_ideas', credits: 2, input: { recent: 1 } })])
    })

    it('costs nothing when the ideas cannot be stored', async () => {
      vi.mocked(chatCompletion).mockResolvedValue('{"ideas": ["Satu"]}')

      await expect(suggestIdeas(USER, BRAND, [], async () => Promise.reject(new Error('Supabase: down')))).rejects.toThrow()
      expect(rows()).toEqual([expect.objectContaining({ status: 'failed', credits: 0 })])
    })
  })

  describe('editCaption', () => {
    it('returns the changed caption with the brand in the prompt and logs the request', async () => {
      vi.mocked(chatCompletion).mockResolvedValue('{"caption": "Halo kak"}')

      await expect(editCaption(USER, 'Halo', 'pakai kak')).resolves.toBe('Halo kak')
      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).toContain('Nama: Kopi Sinar')
      expect(rows()).toEqual([
        expect.objectContaining({ task: 'caption_edit', credits: 2, input: { caption: 'Halo', instruction: 'pakai kak' } }),
      ])
    })

    it('logs a provider error as a failure', async () => {
      vi.mocked(chatCompletion).mockRejectedValue(new RouterApiError('rate limited', 429))

      await expect(editCaption(USER, 'Halo', 'pakai kak')).rejects.toMatchObject({ status: 429 })
      expect(rows()).toEqual([expect.objectContaining({ status: 'failed', credits: 0 })])
    })
  })

  describe('reviseSlide', () => {
    it('asks for the revised slide without logging it, since slide_edit pays for it', async () => {
      vi.mocked(chatCompletion).mockResolvedValue('{"headline": "Malam", "scene": "Kafe malam"}')

      await expect(reviseSlide({ headline: 'Pagi', scene: 'Kafe pagi' }, 'jadi malam')).resolves.toEqual({
        headline: 'Malam',
        scene: 'Kafe malam',
      })
      expect(database.inserted).toEqual([])
    })
  })
})
