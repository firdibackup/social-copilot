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
  buildScriptMessages,
  buildSlideRevisionMessages,
  editCaption,
  parseCaption,
  parseContentPlan,
  parseIdeas,
  parseScriptAnswer,
  parseSlide,
  planContent,
  reviseSlide,
  suggestIdeas,
  writeScript,
} from './content-ai'
import type { ContentRequest } from './content-options'
import { chatCompletion, RouterApiError } from './nine-router'
import { scriptHeadline, type ScriptSlide } from './script-options'

const database = vi.hoisted(() => ({ inserted: [] as { table: string; row: unknown }[] }))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    rpc: vi.fn(async () => ({ data: 'reservation-1', error: null })),
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
  productGroupId: null,
  pillarId: null,
  density: 'lengkap',
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

const SCRIPT: ScriptSlide[] = [
  { label: 'Hook', title: 'Jangan Asal Pakai IN, ON, dan AT!', body: 'Ketiganya berarti "di", tetapi penggunaannya berbeda.' },
  { label: 'IN', title: 'IN = Di dalam', body: '- In the room — Di dalam ruangan' },
]

const rows = () => database.inserted.map((insert) => insert.row)

describe('buildContentMessages', () => {
  it('plans a carousel through hook, bridge, value, recap and CTA', () => {
    const user = buildContentMessages('Tips seduh', 7, null)[1].content

    expect(user).toContain('slide 1 = Hook')
    expect(user).toContain('slide 2 = Bridge')
    expect(user).toContain('slide 3 = Problem')
    expect(user).toContain('slide 4 = Reframe')
    expect(user).toContain('slide 5 = Value')
    expect(user).toContain('slide 6 = Recap/Proof')
    expect(user).toContain('slide 7 = CTA')
  })

  it('uses every detailed role when ten slides are available', () => {
    const user = buildContentMessages('Tips seduh', 10, null)[1].content

    expect(user).toContain('slide 1 = Hook')
    expect(user).toContain('slide 2 = Bridge')
    expect(user).toContain('slide 3 = Problem')
    expect(user).toContain('slide 4 = Reframe')
    expect(user).toContain('slide 5–7 = Value')
    expect(user).toContain('slide 8 = Proof')
    expect(user).toContain('slide 9 = Recap')
    expect(user).toContain('slide 10 = CTA')
  })

  it('keeps short carousels useful instead of forcing empty structural slides', () => {
    expect(buildContentMessages('Tips seduh', 2, null)[1].content).toContain('slide 2 = Value + CTA')
    expect(buildContentMessages('Tips seduh', 3, null)[1].content).toContain('slide 2 = Value')
    expect(buildContentMessages('Tips seduh', 3, null)[1].content).toContain('slide 3 = CTA')
  })

  it('asks for complete words and sentences, up to 300 characters a slide', () => {
    const [system] = buildContentMessages('Tips seduh', 3, null)

    expect(system.content).toContain('maksimal 300 karakter')
    expect(system.content).toContain('jangan pakai singkatan seperti "yg", "dgn"')
  })

  it('shows the planner an attached image and asks what each slide does with it', () => {
    const user = buildContentMessages('Layout ikuti gambar ini', 3, null, 'story', [], 'data:image/jpeg;base64,AQI=')[1].content

    if (typeof user === 'string') throw new Error('expected text and an image')
    expect(user).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AQI=' } })
    const text = user.find((part) => part.type === 'text')
    expect(text).toMatchObject({ text: expect.stringContaining('Owner melampirkan satu gambar') })
    expect(text).toMatchObject({ text: expect.stringContaining('"attachment": "…"') })
    expect(text).toMatchObject({ text: expect.stringContaining('tentukan dari isi gambarnya') })
  })

  it('sends plain text without an attachment field when no image was attached', () => {
    const user = buildContentMessages('Tips seduh', 3, null)[1].content

    expect(typeof user).toBe('string')
    expect(user).not.toContain('"attachment"')
  })

  it('plans two slides as hook and useful value, and one image without roles', () => {
    expect(buildContentMessages('Tips seduh', 2, null)[1].content).toContain('slide 2 = Value + CTA')
    expect(buildContentMessages('Tips seduh', 1, null)[1].content).not.toContain('= Hook')
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
    expect(user).toContain(`Arah struktur yang diminta: ${HOOK_ARCHETYPES.contrarian}`)
    expect(user.indexOf('Panduan carousel')).toBeLessThan(user.indexOf('Topik:'))
  })

  it('asks a single post to copy the owner’s text and visual spec in full', () => {
    const [system, user] = buildContentMessages('Judul: RUMUS SIMPLE PRESENT TENSE', 1, null)

    expect(system.content).toContain('salin SEMUA teks itu persis dan urut')
    expect(system.content).toContain('tulis ulang SEMUA arahan itu di scene')
    expect(system.content).not.toContain('maksimal 300 karakter')
    expect(user.content).toContain('berupa satu gambar (single post)')
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
        { headline: '3 langkah seduh', scene: 'Meja kayu dengan V60', productGroupId: null, attachment: '' },
        { headline: 'Selamat mencoba', scene: 'Cangkir kopi di jendela', productGroupId: null, attachment: '' },
      ],
    })
  })

  it('keeps a known product group and rejects an invented one', () => {
    const product = { id: '00000000-0000-4000-8000-000000000099', title: 'Kopi Botol', description: 'Botol cokelat' }
    const answer = JSON.stringify({
      caption: 'Halo',
      slides: [{ headline: 'Kopi', scene: 'Botol di meja', productGroupId: product.id }],
    })
    expect(parseContentPlan(answer, 1, [product]).slides[0].productGroupId).toBe(product.id)
    expect(() => parseContentPlan(answer, 1)).toThrow(AiOutputError)
  })

  it('keeps only as many slides as were paid for', () => {
    expect(parseContentPlan(PLAN_ANSWER, 1).slides).toEqual([
      { headline: '3 langkah seduh', scene: 'Meja kayu dengan V60', productGroupId: null, attachment: '' },
    ])
  })

  it('drops slides without a scene before counting', () => {
    const answer = JSON.stringify({
      caption: 'Halo',
      slides: [{ headline: 'Tanpa adegan', scene: ' ' }, 'teks', { headline: '', scene: 'Kafe' }],
    })

    expect(parseContentPlan(answer, 1).slides).toEqual([{ headline: '', scene: 'Kafe', productGroupId: null, attachment: '' }])
  })

  const CTA_SLIDE = { headline: 'Ayo', scene: 'Kafe' }

  it('cuts an overlong headline after its last full sentence, never inside a word', () => {
    const sentence = 'Kopi enak itu seimbang. '
    const answer = JSON.stringify({ caption: 'Halo', slides: [{ headline: sentence.repeat(17), scene: 'Kafe' }, CTA_SLIDE] })

    expect(parseContentPlan(answer, 2).slides[0].headline).toBe(sentence.repeat(12).trim())
  })

  it('cuts a carousel headline without spaces at 300, and keeps a full stop that ends right at the limit', () => {
    const headline = (value: string) =>
      parseContentPlan(JSON.stringify({ caption: 'Halo', slides: [{ headline: value, scene: 'Kafe' }, CTA_SLIDE] }), 2).slides[0].headline

    expect(headline('a'.repeat(400))).toBe('a'.repeat(300))
    expect(headline(`${'b'.repeat(299)}. lanjutan kalimat`)).toBe(`${'b'.repeat(299)}.`)
    expect(headline(`${'kata '.repeat(70)}`)).toBe('kata '.repeat(60).trim())
  })

  it('never cuts a web address at one of its dots', () => {
    const answer = JSON.stringify({ caption: 'Halo', slides: [{ headline: `${'b'.repeat(292)} tokoku.co.id ada`, scene: 'Kafe' }, CTA_SLIDE] })

    expect(parseContentPlan(answer, 2).slides[0].headline).toBe('b'.repeat(292))
  })

  it('keeps each slide’s instruction for an attached image only when one was attached, cut to 300', () => {
    const answer = JSON.stringify({
      caption: 'Halo',
      slides: [
        { headline: 'A', scene: 'x', attachment: ' Follow its layout. ' },
        { headline: 'B', scene: 'y', attachment: 'n'.repeat(400) },
      ],
    })

    expect(parseContentPlan(answer, 2, [], true).slides.map((slide) => slide.attachment)).toEqual([
      'Follow its layout.',
      'n'.repeat(300),
    ])
    expect(parseContentPlan(answer, 2).slides.map((slide) => slide.attachment)).toEqual(['', ''])
  })

  it('lets every slide follow an attached image the planner used nowhere', () => {
    const answer = JSON.stringify({
      caption: 'Halo',
      slides: [
        { headline: 'A', scene: 'x', attachment: ' ' },
        { headline: 'B', scene: 'y', attachment: 5 },
      ],
    })

    expect(parseContentPlan(answer, 2, [], true).slides.map((slide) => slide.attachment)).toEqual([
      "Use this image as its content suits: follow its layout and style if it is a finished design, or show it in this slide if it is a photo.",
      "Use this image as its content suits: follow its layout and style if it is a finished design, or show it in this slide if it is a photo.",
    ])
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
      slides: [{ headline: '😀'.repeat(400), scene: '😀'.repeat(1100) }, CTA_SLIDE],
    })

    const plan = parseContentPlan(answer, 2)

    expect(Array.from(plan.title)).toHaveLength(120)
    expect(Array.from(plan.caption)).toHaveLength(2200)
    expect(Array.from(plan.slides[0].headline)).toHaveLength(300)
    expect(Array.from(plan.slides[0].scene)).toHaveLength(1000)
  })

  it('keeps a single post’s long text and visual spec, up to 5,000 and 3,000 code points', () => {
    const examples = Array.from({ length: 20 }, (_, index) => `${index + 1}. She doesn’t eat meat.`).join('\n')
    const keep = JSON.stringify({ caption: 'Halo', slides: [{ headline: examples, scene: 'Latar krem muda. '.repeat(60) }] })
    const kept = parseContentPlan(keep, 1).slides[0]
    expect(kept.headline).toBe(examples)
    expect(kept.scene).toBe('Latar krem muda. '.repeat(60).trim())

    const cut = JSON.stringify({ caption: 'Halo', slides: [{ headline: '😀'.repeat(6000), scene: '😀'.repeat(3100) }] })
    const plan = parseContentPlan(cut, 1)
    expect(Array.from(plan.slides[0].headline)).toHaveLength(5000)
    expect(Array.from(plan.slides[0].scene)).toHaveLength(3000)
  })
})

describe('parseIdeas', () => {
  const script = [{ label: 'Hook', title: 'Mulai', body: '' }, { label: 'CTA', title: 'Ayo', body: '' }]
  const fillFive = (ideas: object[]) => [...ideas, ...Array.from({ length: 5 - ideas.length }, (_, index) => ({ title: `Tambahan ${index}`, script }))]

  it('trims, drops duplicates and keeps at most five', () => {
    const ideas = [' Satu ', 'Satu', '', ...Array.from({ length: 12 }, (_, index) => `Ide ${index}`)]
      .map((title) => ({ title, script }))

    const parsed = parseIdeas(JSON.stringify({ ideas }))

    expect(parsed).toHaveLength(5)
    expect(parsed.slice(0, 2)).toEqual([
      { title: 'Satu', pillarId: null, script },
      { title: 'Ide 0', pillarId: null, script },
    ])
  })

  it('cuts an idea to 200 code points', () => {
    const ideas = fillFive([{ title: '😀'.repeat(300), script }])
    expect(Array.from(parseIdeas(JSON.stringify({ ideas }))[0].title)).toHaveLength(200)
  })

  it('keeps only valid pillar ids', () => {
    const ideas = fillFive([
      { title: 'Tips seduh', pillarId: 'edukasi', script },
      { title: 'Promo akhir pekan', pillarId: 'tidak-ada', script },
      { title: 'Cerita barista', script },
    ])

    expect(parseIdeas(JSON.stringify({ ideas }), ['edukasi', 'cerita']).slice(0, 3)).toEqual([
      { title: 'Tips seduh', pillarId: 'edukasi', script },
      { title: 'Promo akhir pekan', pillarId: null, script },
      { title: 'Cerita barista', pillarId: null, script },
    ])
  })

  it.each([
    ['no ideas', '{"ideas": []}'],
    ['fewer than five complete ideas', JSON.stringify({ ideas: fillFive([]).slice(0, 4) })],
    ['a provider notice', 'Maaf, coba lagi.'],
  ])('throws an AiOutputError for %s', (_label, answer) => {
    expect(() => parseIdeas(answer)).toThrow(AiOutputError)
  })
})

describe('buildContentMessages text density', () => {
  it.each(['padat', 'ringkas', 'seimbang', 'lengkap'] as const)('allows only an optional short open loop below the %s cover hook', (density) => {
    const direct = String(buildContentMessages('Bedanya IN, ON, AT', 5, BRAND, 'auto', [], null, null, null, density)[1].content)
    const script = String(buildScriptMessages('Bedanya IN, ON, AT', BRAND, 'auto', '', density)[1].content)

    for (const prompt of [direct, script]) {
      expect(prompt).toContain(`Kepadatan teks: ${density}`)
      expect(prompt).toContain('Berlaku hanya untuk slide isi')
      expect(prompt).toContain('subheading opsional satu kalimat pendek')
      expect(prompt).toContain('mengarah alami ke slide 2')
      expect(prompt).toContain('satu hook 3–7 kata')
      expect(prompt).toContain('Template hanya struktur, bukan gaya penulisan')
      expect(prompt).toContain('Gaya bahasa: Santai, pakai "kak"')
      expect(prompt).not.toContain('Teks di gambar setiap slide')
    }
    expect(script).toContain('body cover berisi subheading tersebut atau string kosong ("")')
    expect(script).toContain('body slide isi')
  })

  it('writes balanced slides by default, between ringkas and lengkap', () => {
    const user = String(buildContentMessages('Tips seduh', 3, null)[1].content)

    expect(user).toContain('Kepadatan teks: seimbang')
    expect(user).toContain('1–2 kalimat penjelasan, lalu 2–4 poin')
    expect(user).not.toContain('2–3 kalimat lengkap')
  })

  it('keeps full explanations when lengkap', () => {
    const user = String(buildContentMessages('Tips seduh', 3, null, 'story', [], null, null, null, 'lengkap')[1].content)

    expect(user).toContain('Kepadatan teks: lengkap')
    expect(user).toContain('2–3 kalimat lengkap atau 3–5 poin')
  })

  it('asks for key points only when dense, also on a single image', () => {
    const carousel = String(buildContentMessages('Tips seduh', 3, null, 'story', [], null, null, null, 'padat')[1].content)
    const single = String(buildContentMessages('Tips seduh', 1, null, 'story', [], null, null, null, 'padat')[1].content)

    expect(carousel).toContain('Kepadatan teks: padat')
    expect(carousel).toContain('tanpa kalimat penjelasan')
    expect(carousel).not.toContain('2–3 kalimat lengkap')
    expect(single).toContain('Kepadatan teks: padat')
    expect(single).toContain('salin semuanya dan abaikan target panjang ini')
    expect(single).not.toContain('Berlaku hanya untuk slide isi')
  })
})

describe('buildScriptMessages', () => {
  it('follows the text density in each slide body', () => {
    const dense = String(buildScriptMessages('Bedanya IN, ON, AT', null, 'curiosity', '', 'padat')[1].content)
    const brief = String(buildScriptMessages('Bedanya IN, ON, AT', null, 'curiosity', '', 'ringkas')[1].content)

    expect(dense).toContain('Kepadatan teks: padat')
    expect(dense).toContain('tanpa baris Tips')
    expect(brief).toContain('Kepadatan teks: ringkas')
    expect(brief).not.toContain('Tips: …')
  })

  it('gives the idea-list writer an exact structure for every allowed slide count', () => {
    const user = String(buildScriptMessages('Bedanya IN, ON, AT', BRAND, 'curiosity')[1].content)

    expect(user).toMatch(/^Tentang brand/)
    expect(user).toContain('2–10 slide')
    expect(user).toContain('2 slide: slide 1 = Hook; slide 2 = Value + CTA')
    expect(user).toContain('7 slide: slide 1 = Hook; slide 2 = Bridge; slide 3 = Problem; slide 4 = Reframe; slide 5 = Value; slide 6 = Recap/Proof; slide 7 = CTA')
    expect(user).toContain('10 slide: slide 1 = Hook; slide 2 = Bridge; slide 3 = Problem; slide 4 = Reframe; slide 5–7 = Value; slide 8 = Proof; slide 9 = Recap; slide 10 = CTA')
    expect(user).toContain('Panduan carousel (wajib)')
    expect(user).toContain('"label": "…", "title": "…", "body": "…"')
    expect(user).toContain('Ide:\n"""\nBedanya IN, ON, AT\n"""')
  })
})

describe('parseScriptAnswer', () => {
  it('trims each slide and drops empty ones', () => {
    const answer = JSON.stringify({
      slides: [{ label: ' Hook ', title: ' Judul ', body: ' Isi\r\nbaris ' }, { label: 'x', title: '', body: '' }, { title: 'CTA' }],
    })

    expect(parseScriptAnswer(answer)).toEqual([
      { label: 'Hook', title: 'Judul', body: 'Isi\nbaris' },
      { label: '', title: 'CTA', body: '' },
    ])
  })

  it('cuts the body so title and body fit 300 code points on the image', () => {
    const [, slide] = parseScriptAnswer(JSON.stringify({ slides: [{ title: 'Hook' }, { title: 'Judul', body: '😀'.repeat(400) }] }))

    expect(Array.from(scriptHeadline(slide))).toHaveLength(300)
  })

  it('keeps an optional cover open loop so the image renders it below the hook', () => {
    const inner = { label: 'Bridge', title: 'Penyok itu disengaja', body: 'Zona remuk menyerap energi benturan.' }
    const script = parseScriptAnswer(JSON.stringify({ slides: [
      { label: 'Pembuka', title: 'Kenapa Mobil Sekarang Gampang Penyok?', body: 'Tunggu dulu, penyoknya punya alasan.' },
      inner,
    ] }))

    expect(script[0]).toEqual({ label: 'Hook', title: 'Kenapa Mobil Sekarang Gampang Penyok?', body: 'Tunggu dulu, penyoknya punya alasan.' })
    expect(scriptHeadline(script[0])).toBe('Kenapa Mobil Sekarang Gampang Penyok?\nTunggu dulu, penyoknya punya alasan.')
    expect(script[1]).toEqual(inner)
  })

  it.each([null, { title: '', body: 'Penjelasan tanpa hook' }, { title: '', body: '' }])('rejects a missing hook rather than promoting an inner slide (%j)', (cover) => {
    expect(() => parseScriptAnswer(JSON.stringify({ slides: [cover, { title: 'Isi' }, { title: 'CTA' }] }))).toThrow(AiOutputError)
  })

  it('keeps at most ten slides', () => {
    expect(parseScriptAnswer(JSON.stringify({ slides: Array.from({ length: 12 }, (_, index) => ({ title: `S${index}` })) }))).toHaveLength(10)
  })

  it.each([['one slide', '{"slides": [{"title": "Satu"}]}'], ['no JSON', 'Maaf.']])('throws an AiOutputError for %s', (_label, answer) => {
    expect(() => parseScriptAnswer(answer)).toThrow(AiOutputError)
  })
})

describe('buildContentMessages with a script', () => {
  it('preserves approved text even when the owner chooses a different density', () => {
    const user = String(buildContentMessages('IN, ON, AT', 2, null, 'auto', [], null, SCRIPT, null, 'padat')[1].content)
    expect(user).toContain(SCRIPT[0].body)
    expect(user).not.toContain('body wajib string kosong')
    expect(parseContentPlan(PLAN_ANSWER, 2, [], false, SCRIPT).slides[0].headline).toBe(scriptHeadline(SCRIPT[0]))
  })

  it('fixes the slide count and quotes each slide text to copy', () => {
    const user = String(buildContentMessages('IN, ON, AT', 5, null, 'story', [], null, SCRIPT)[1].content)

    expect(user).toContain('carousel 2 slide')
    expect(user).toContain('tepat 2 slide')
    expect(user).toContain('Slide 1 (Hook):\n"""\nJangan Asal Pakai IN, ON, dan AT!')
    expect(user).not.toContain('Panduan carousel')
  })
})

describe('buildIdeasMessages', () => {
  it('describes the brand and quotes the recent titles to avoid', () => {
    const user = String(buildIdeasMessages(BRAND, ['Promo Senin', 'Tips seduh'])[1].content)

    expect(user).toMatch(/^Tentang brand/)
    expect(user).toContain('buat 5 ide')
    expect(user).toContain('Jangan ulangi ide atau post yang sudah ada:\n"""\nPromo Senin\nTips seduh\n"""')
  })

  it('leaves out the avoid list when there is nothing to avoid', () => {
    expect(buildIdeasMessages(BRAND, [])[1].content).not.toContain('Jangan ulangi ide atau post yang sudah ada:')
  })

  it('asks for exact per-pillar counts following their shares', () => {
    const brand: BrandContext = {
      ...BRAND,
      strategy: {
        identity: 'Teman ngopi sehari-hari',
        tone: 'Santai',
        focus: 'engagement',
        postsPerWeek: 3,
        pillars: [
          { id: 'edukasi', name: 'Edukasi Kopi', detail: 'Tips seduh', share: 60 },
          { id: 'cerita', name: 'Cerita Kedai', detail: 'Di balik layar', share: 30 },
          { id: 'promo', name: 'Promo', detail: 'Penawaran', share: 10 },
        ],
      },
    }

    const user = String(buildIdeasMessages(brand, [])[1].content)

    expect(user).toContain('Edukasi Kopi (edukasi): 3 ide')
    expect(user).toContain('Cerita Kedai (cerita): 2 ide')
    expect(user).toContain('Promo (promo): 0 ide')
    expect(user).toContain('"pillarId": "…", "script":')
    expect(user).toContain('sesuai strategi konten di atas')
    expect(user).not.toContain('cerita di balik layar, promosi')
  })

  it('falls back to a general mix without a strategy', () => {
    expect(buildIdeasMessages(BRAND, [])[1].content).toContain('cerita di balik layar, promosi')
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

  it('shows an attached image and says it goes to the image model with the request', () => {
    const user = buildSlideRevisionMessages({ headline: 'Pagi', scene: 'Kafe' }, 'pakai foto ini', 'data:image/jpeg;base64,AQI=')[1]
      .content

    if (typeof user === 'string') throw new Error('expected text and an image')
    expect(user).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AQI=' } })
    expect(user.find((part) => part.type === 'text')).toMatchObject({ text: expect.stringContaining('Owner melampirkan satu gambar') })
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
    it('threads English through to the planner system prompt', async () => {
      vi.mocked(chatCompletion).mockResolvedValue(PLAN_ANSWER)
      await planContent(USER, REQUEST, async () => 'post-1', [], null, null, undefined, undefined, 'en')
      expect(vi.mocked(chatCompletion).mock.calls[0][0][0].content).toContain('Write all output in English.')
    })

    it('shows the planner an attached image and logs only that there was one', async () => {
      vi.mocked(chatCompletion).mockResolvedValue(PLAN_ANSWER)

      const { plan } = await planContent(USER, REQUEST, async () => 'post-1', [], 'data:image/jpeg;base64,AQI=')

      expect(JSON.stringify(vi.mocked(chatCompletion).mock.calls[0][0])).toContain('data:image/jpeg;base64,AQI=')
      expect(plan.slides.map((slide) => slide.attachment)).toEqual([
        "Use this image as its content suits: follow its layout and style if it is a finished design, or show it in this slide if it is a photo.",
        "Use this image as its content suits: follow its layout and style if it is a finished design, or show it in this slide if it is a photo.",
      ])
      expect(rows()[0]).toMatchObject({ input: expect.objectContaining({ attachment: true }) })
      expect(JSON.stringify(rows())).not.toContain('AQI=')
    })

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
            input: {
              topic: REQUEST.topic,
              slides: 2,
              format: '4:5',
              ideaId: 'idea-1',
              productIds: [],
              attachment: false,
              scripted: false,
              density: 'lengkap',
            },
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

  describe('planContent with a script', () => {
    it('keeps each slide text exactly as scripted and logs that the post was scripted', async () => {
      vi.mocked(chatCompletion).mockResolvedValue(PLAN_ANSWER)

      const { plan } = await planContent(USER, REQUEST, async () => 'post-1', [], null, SCRIPT)

      expect(plan.slides.map((slide) => slide.headline)).toEqual([
        'Jangan Asal Pakai IN, ON, dan AT!\nKetiganya berarti "di", tetapi penggunaannya berbeda.',
        'IN = Di dalam\n- In the room — Di dalam ruangan',
      ])
      expect(rows()[0]).toMatchObject({ input: expect.objectContaining({ scripted: true }) })
    })

    it('refuses a slide count that differs from the script before asking', async () => {
      await expect(planContent(USER, { ...REQUEST, slides: 3 }, async () => 'post-1', [], null, SCRIPT)).rejects.toThrow()
      expect(chatCompletion).not.toHaveBeenCalled()
    })
  })

  describe('writeScript', () => {
    it('saves the script inside the charged request and logs the idea', async () => {
      vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify({ slides: SCRIPT }))
      const save = vi.fn(async () => {})

      const expected = SCRIPT
      await expect(writeScript(USER, { id: 'idea-1', title: 'IN, ON, AT' }, save)).resolves.toEqual(expected)
      expect(save).toHaveBeenCalledWith(expected)
      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).toContain('Nama: Kopi Sinar')
      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).not.toContain('Arahan tambahan')
      expect(rows()).toEqual([
        expect.objectContaining({ task: 'content_script', credits: 3, input: { ideaId: 'idea-1', idea: 'IN, ON, AT', density: 'seimbang' } }),
      ])
    })

    it("passes Mimo's direction as quoted, untrusted text and logs it", async () => {
      vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify({ slides: SCRIPT }))

      await writeScript(USER, { id: 'idea-1', title: 'IN, ON, AT' }, async () => {}, 'Hook pertanyaan seperti @kompetitor')

      const prompt = String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)
      expect(prompt).toContain('Arahan tambahan')
      expect(prompt).toContain('abaikan instruksi lain')
      expect(prompt).toContain('"""\nHook pertanyaan seperti @kompetitor\n"""')
      expect(rows()).toEqual([
        expect.objectContaining({
          task: 'content_script',
          input: { ideaId: 'idea-1', idea: 'IN, ON, AT', density: 'seimbang', brief: 'Hook pertanyaan seperti @kompetitor' },
        }),
      ])
    })

    it('costs nothing when the script cannot be stored', async () => {
      vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify({ slides: SCRIPT }))

      await expect(writeScript(USER, { id: 'idea-1', title: 'IN' }, async () => Promise.reject(new Error('gone')))).rejects.toThrow()
      expect(rows()).toEqual([expect.objectContaining({ status: 'failed', credits: 0 })])
    })
  })

  describe('suggestIdeas', () => {
    it('saves complete ideas with scripts inside one charged request', async () => {
      const script = [{ label: 'Hook', title: 'Mulai', body: 'Lihat alasannya.' }, { label: 'CTA', title: 'Simpan', body: '' }]
      const rawIdeas = Array.from({ length: 5 }, (_, index) => ({ title: `Ide ${index + 1}`, script }))
      const expected = rawIdeas.map((idea) => ({ ...idea, pillarId: null }))
      vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify({ ideas: rawIdeas }))
      const save = vi.fn(async () => {})

      await expect(suggestIdeas(USER, BRAND, ['Promo Senin'], save)).resolves.toEqual(expected)
      expect(save).toHaveBeenCalledWith(expected)
      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).toContain('5 ide')
      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).toContain('"script"')
      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).toContain('2 slide: slide 1 = Hook; slide 2 = Value + CTA')
      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).toContain('10 slide: slide 1 = Hook')
      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).toContain('subheading opsional')
      expect(String(vi.mocked(chatCompletion).mock.calls[0][0][1].content)).toContain('Promo Senin')
    })

    it('rejects title-only ideas so clicking never starts a second writing job', async () => {
      vi.mocked(chatCompletion).mockResolvedValue('{"ideas": ["Satu"]}')
      await expect(suggestIdeas(USER, BRAND, [], async () => {})).rejects.toThrow(AiOutputError)
    })

    it('logs only how many titles were avoided', async () => {
      const script = [{ label: 'Hook', title: 'Mulai', body: '' }, { label: 'CTA', title: 'Ayo', body: '' }]
      vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify({ ideas: Array.from({ length: 5 }, (_, index) => ({ title: `Ide ${index + 1}`, script })) }))
      const save = vi.fn(async () => {})
      await suggestIdeas(USER, BRAND, ['Promo Senin'], save)
      expect(save).toHaveBeenCalledOnce()
      expect(rows()).toEqual([expect.objectContaining({ task: 'content_ideas', credits: 2, input: { recent: 1 } })])
    })

    it('costs nothing when the ideas cannot be stored', async () => {
      const script = [{ label: 'Hook', title: 'Mulai', body: '' }, { label: 'CTA', title: 'Ayo', body: '' }]
      vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify({ ideas: Array.from({ length: 5 }, (_, index) => ({ title: `Ide ${index + 1}`, script })) }))

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
import { DEFAULT_CATALOG } from './billing-catalog-options'
vi.mock('./billing-catalog', () => ({ getBillingCatalog: vi.fn(async () => ({ version: 1, catalog: DEFAULT_CATALOG })) }))
