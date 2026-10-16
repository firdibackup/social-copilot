import 'server-only'
import { AiOutputError, cleanList, describeBrand, loadBrandContext, quote, readJson, runLogged, snippetOf } from './ai'
import { contentCost } from './billing-options'
import { truncate, type BrandContext } from './brand-options'
import { CAPTION_MAX_LENGTH } from './caption'
import type { ContentRequest } from './content-options'
import { HEADLINE_MAX_LENGTH, SCENE_MAX_LENGTH, type Slide } from './image-options'
import { chatCompletion, type ChatMessage } from './nine-router'

export const TITLE_MAX_LENGTH = 120
export const IDEA_MAX_LENGTH = 200
const IDEAS_COUNT = 10

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')
const firstLine = (value: string) => value.split('\n', 1)[0].trim()

const JSON_ONLY = '- Balas HANYA dengan satu objek JSON sesuai format yang diminta, tanpa teks lain.'

const CAPTION_RULES = [
  '- Tulis dalam Bahasa Indonesia yang natural, kecuali topik jelas memakai bahasa lain.',
  '- Patuhi batas Instagram: caption maksimal 2.200 karakter, 30 hashtag, dan 20 mention.',
  '- Jangan pakai Markdown seperti **tebal**, _miring_, atau judul. Instagram tidak merendernya.',
  '- Jangan mengarang fakta atau klaim yang tidak ada di topik atau fakta brand, misalnya harga, tanggal, lokasi, stok terbatas, atau "kualitas premium".',
]

const SLIDE_RULES = [
  '- headline: SEMUA teks yang tertulis di gambar slide itu, dalam bahasa konten: judul, poin, atau contoh kalimat. Boleh 1–4 baris pendek dipisah \\n, maksimal 150 karakter. Kosongkan hanya kalau gambar memang lebih kuat tanpa teks.',
  '- scene: 1–2 kalimat tentang visualnya saja (subjek, tempat, komposisi, suasana). Jangan tulis kata atau kalimat yang harus tampil di gambar di sini; itu tempatnya di headline.',
]

const CONTENT_SYSTEM = [
  'Kamu perancang konten Instagram untuk satu akun bisnis atau kreator di Indonesia: kamu menulis caption dan merancang gambar post-nya sekaligus.',
  'Aturan:',
  ...CAPTION_RULES,
  ...SLIDE_RULES,
  JSON_ONLY,
].join('\n')

const CAPTION_SYSTEM = [
  'Kamu penulis caption Instagram untuk satu akun bisnis atau kreator di Indonesia.',
  'Aturan:',
  ...CAPTION_RULES,
  JSON_ONLY,
].join('\n')

const SLIDE_SYSTEM = ['Kamu perancang konten visual Instagram.', 'Aturan:', ...SLIDE_RULES, JSON_ONLY].join('\n')

const IDEAS_SYSTEM = [
  'Kamu perencana konten Instagram untuk satu akun bisnis atau kreator di Indonesia.',
  'Aturan:',
  '- Tulis dalam Bahasa Indonesia yang natural.',
  '- Ide harus cocok dengan brand dan hanya memakai fakta yang tertulis tentang brand.',
  JSON_ONLY,
].join('\n')

/** Repeated last in the task prompts: Haiku still invented "stok terbatas" with the rule only in the system prompt. */
const NO_INVENTED_CLAIMS = 'Jangan menambah klaim seperti stok terbatas, promo terbatas, atau kualitas premium.'

const allowedFacts = (brand: BrandContext | null) => (brand?.facts ? 'topik dan fakta brand di atas' : 'topik di atas')

export function buildContentMessages(topic: string, slides: number, brand: BrandContext | null): ChatMessage[] {
  const carousel = slides > 1
  return [
    { role: 'system', content: CONTENT_SYSTEM },
    {
      role: 'user',
      content: [
        `${brand ? describeBrand(brand) : ''}Tugas: buat satu post Instagram tentang topik di bawah, berupa ${carousel ? `carousel ${slides} slide` : 'satu gambar'}.`,
        '- title: judul singkat post untuk daftar konten, maksimal 8 kata.',
        `- caption: 2–4 paragraf pendek, sekitar 300–700 karakter sebelum hashtag: kalimat pembuka yang menarik, isi, lalu ajakan bertindak (CTA). Tutup dengan 3–8 hashtag relevan di baris terakhir.${carousel ? ' Ajak pembaca menggeser carousel kalau sesuai.' : ''}`,
        `- slides: tepat ${slides} slide, berurutan.${carousel ? ' Slide pertama harus menarik perhatian; slide terakhir boleh berisi ajakan bertindak.' : ''}`,
        'Format JSON: {"title": "…", "caption": "…", "slides": [{"headline": "…", "scene": "…"}]}',
        '',
        `Topik:\n${quote(topic)}`,
        '',
        `Hanya pakai fakta dari ${allowedFacts(brand)}. ${NO_INVENTED_CLAIMS}`,
      ].join('\n'),
    },
  ]
}

export interface ContentPlan {
  title: string
  caption: string
  slides: Slide[]
}

function parseSlides(value: unknown): Slide[] {
  const listed: unknown[] = Array.isArray(value) ? value : []
  return listed
    .filter(isObject)
    .map((slide) => ({
      headline: truncate(text(slide.headline), HEADLINE_MAX_LENGTH),
      scene: truncate(text(slide.scene), SCENE_MAX_LENGTH),
    }))
    .filter((slide) => slide.scene)
}

/** Exactly `count` slides and a caption, or an AiOutputError: the user paid for that many slides. */
export function parseContentPlan(content: string, count: number): ContentPlan {
  const json = readJson(content)
  const slides = parseSlides(json?.slides).slice(0, count)
  const caption = truncate(text(json?.caption), CAPTION_MAX_LENGTH)
  if (!json || !caption || slides.length < count) throw new AiOutputError(snippetOf(content))
  const title = text(json.title) || firstLine(slides[0].headline) || firstLine(caption)
  return { title: truncate(title, TITLE_MAX_LENGTH), caption, slides }
}

/**
 * The caption and slide plan of a new post, paid once for the post and all its images. `save` runs inside the
 * charged request, so when storing the post fails the user isn't charged.
 */
export function planContent<T>(
  userId: string,
  request: ContentRequest,
  save: (plan: ContentPlan) => Promise<T>,
): Promise<{ plan: ContentPlan; saved: T }> {
  const input = { topic: request.topic, slides: request.slides, format: request.format, ideaId: request.ideaId }
  return runLogged(
    userId,
    'content',
    input,
    async () => {
      const brand = await loadBrandContext(userId)
      const plan = parseContentPlan(await chatCompletion(buildContentMessages(request.topic, request.slides, brand)), request.slides)
      return { plan, saved: await save(plan) }
    },
    { cost: contentCost(request.slides), logOutput: ({ plan }) => plan },
  )
}

export function buildIdeasMessages(brand: BrandContext, recent: string[]): ChatMessage[] {
  const avoid = recent.length > 0 ? ['', `Jangan ulangi ide atau post yang sudah ada:\n${quote(recent.join('\n'))}`] : []
  return [
    { role: 'system', content: IDEAS_SYSTEM },
    {
      role: 'user',
      content: [
        `${describeBrand(brand)}Tugas: beri ${IDEAS_COUNT} ide post Instagram yang berbeda-beda untuk brand ini: campuran edukasi atau tips, cerita di balik layar, promosi, dan interaksi dengan pengikut. Setiap ide berupa satu kalimat pendek, maksimal 12 kata, yang cukup jelas untuk dijadikan topik post.`,
        `Format JSON: {"ideas": ["…"]}`,
        ...avoid,
      ].join('\n'),
    },
  ]
}

export function parseIdeas(content: string): string[] {
  const ideas = cleanList(readJson(content)?.ideas, IDEAS_COUNT).map((idea) => truncate(idea, IDEA_MAX_LENGTH))
  if (ideas.length === 0) throw new AiOutputError(snippetOf(content))
  return ideas
}

/** New ideas for the brand; `save` stores them inside the charged request. */
export function suggestIdeas(
  userId: string,
  brand: BrandContext,
  recent: string[],
  save: (ideas: string[]) => Promise<void>,
): Promise<string[]> {
  return runLogged(userId, 'content_ideas', { recent: recent.length }, async () => {
    const ideas = parseIdeas(await chatCompletion(buildIdeasMessages(brand, recent)))
    await save(ideas)
    return ideas
  })
}

export function buildCaptionEditMessages(caption: string, instruction: string, brand: BrandContext | null): ChatMessage[] {
  const task = caption
    ? 'Tugas: ubah caption di bawah sesuai permintaan owner. Pertahankan fakta, mention, dan hashtag yang ada, kecuali owner meminta lain.'
    : 'Tugas: tulis caption baru sesuai permintaan owner: 2–4 paragraf pendek dengan ajakan bertindak, lalu 3–8 hashtag relevan di baris terakhir.'
  return [
    { role: 'system', content: CAPTION_SYSTEM },
    {
      role: 'user',
      content: [
        `${brand ? describeBrand(brand) : ''}${task}`,
        'Format JSON: {"caption": "…"}',
        '',
        `Permintaan owner:\n${quote(instruction)}`,
        ...(caption ? ['', `Caption:\n${quote(caption)}`] : []),
        '',
        `${NO_INVENTED_CLAIMS}`,
      ].join('\n'),
    },
  ]
}

export function parseCaption(content: string): string {
  const caption = truncate(text(readJson(content)?.caption), CAPTION_MAX_LENGTH)
  if (!caption) throw new AiOutputError(snippetOf(content))
  return caption
}

/** A caption changed as the owner asked; it only fills the editor. */
export function editCaption(userId: string, caption: string, instruction: string): Promise<string> {
  return runLogged(userId, 'caption_edit', { caption, instruction }, async () => {
    const brand = await loadBrandContext(userId)
    return parseCaption(await chatCompletion(buildCaptionEditMessages(caption, instruction, brand)))
  })
}

export function buildSlideRevisionMessages(slide: Slide, instruction: string): ChatMessage[] {
  return [
    { role: 'system', content: SLIDE_SYSTEM },
    {
      role: 'user',
      content: [
        'Tugas: ubah slide di bawah sesuai permintaan owner. Ubah hanya bagian yang diminta, dan salin sisanya persis.',
        'Format JSON: {"headline": "…", "scene": "…"}',
        '',
        `Permintaan owner:\n${quote(instruction)}`,
        '',
        `headline sekarang:\n${quote(slide.headline || '(kosong: gambar tanpa teks)')}`,
        `scene sekarang:\n${quote(slide.scene || '(belum ada: tulis dari permintaan owner)')}`,
      ].join('\n'),
    },
  ]
}

export function parseSlide(content: string): Slide {
  const [slide] = parseSlides([readJson(content)])
  if (!slide) throw new AiOutputError(snippetOf(content))
  return slide
}

/** The slide's headline and scene with the owner's change. Runs inside the slide_edit request that pays for it. */
export async function reviseSlide(slide: Slide, instruction: string): Promise<Slide> {
  return parseSlide(await chatCompletion(buildSlideRevisionMessages(slide, instruction)))
}
