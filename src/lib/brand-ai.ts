import 'server-only'
import { AiOutputError, quote, readJson, runLogged, snippetOf } from './ai'
import type { VisualReference } from './brand'
import { BRAND_TEXT_LIMITS, DESCRIPTION_MAX_LENGTH, PROFILE_FIELDS, truncate, type BrandContext } from './brand-options'
import { chatCompletion, type ChatMessage, type ContentPart } from './nine-router'

/** The profile fields as the AI read them from the sources, for the owner to review. */
export type ProfileDraft = BrandContext

export interface ProfileSources {
  website: { url: string; title: string; description: string; text: string } | null
  instagram: { username: string; name: string; biography: string; captions: string[] } | null
}

const RULES = '- Balas HANYA dengan satu objek JSON sesuai format yang diminta, tanpa teks lain.'

const PROFILE_SYSTEM = [
  'Kamu analis brand untuk satu bisnis atau kreator di Indonesia.',
  'Aturan:',
  '- Tulis dalam Bahasa Indonesia, kecuali nama, tagline, atau kutipan dari sumber.',
  '- Hanya pakai informasi yang tertulis di sumber. Jangan menebak harga, alamat, jam buka, atau klaim lain.',
  '- Kalau sumber tidak menyebut sesuatu, isi dengan string kosong.',
  '- Jangan pakai Markdown.',
  RULES,
].join('\n')

const PROFILE_TASK = [
  'Tugas: susun profil brand dari sumber di bawah. Profil ini dipakai saat menulis caption Instagram brand tersebut.',
  'Format JSON: {"name": "…", "category": "…", "description": "…", "audience": "…", "voice": "…", "wordsUse": "…", "wordsAvoid": "…", "facts": "…"}',
  'Isi setiap field:',
  '- name: nama brand.',
  '- category: jenis usaha atau topik akun, maksimal 5 kata, mis. "Kedai kopi" atau "Belajar bahasa Inggris".',
  '- description: 1–2 kalimat tentang apa yang ditawarkan dan apa bedanya.',
  '- audience: siapa yang dituju, satu kalimat.',
  '- voice: gaya bahasa yang terlihat di sumber, 1–3 kalimat: sapaan (aku/kamu, kak, sobat…), santai atau formal, pemakaian emoji, panjang kalimat.',
  '- wordsUse: kata, frasa, atau tagline khas yang sering muncul, dipisah koma.',
  '- wordsAvoid: kata atau gaya yang jelas dihindari; kosongkan kalau tidak terlihat.',
  '- facts: fakta tertulis yang boleh dipakai di caption (produk atau layanan, harga, alamat, jam buka, kontak, jadwal), satu per baris diawali "- ".',
].join('\n')

const CAPTION_SAMPLE_LENGTH = 500

function describeSources({ website, instagram }: ProfileSources): string {
  const parts: string[] = []
  if (website) {
    parts.push(
      [
        `Website (${website.url}):`,
        `Judul: ${website.title || '-'}`,
        `Deskripsi: ${website.description || '-'}`,
        `Teks halaman:\n${quote(website.text)}`,
      ].join('\n'),
    )
  }
  if (instagram) {
    const captions = instagram.captions.map((caption, index) => `${index + 1}.\n${quote(truncate(caption, CAPTION_SAMPLE_LENGTH))}`)
    parts.push(
      [
        `Akun Instagram @${instagram.username}${instagram.name ? ` (${instagram.name})` : ''}:`,
        `Bio:\n${quote(instagram.biography || '-')}`,
        captions.length > 0 ? `Caption terbaru:\n${captions.join('\n')}` : 'Belum ada caption.',
      ].join('\n'),
    )
  }
  return parts.join('\n\n')
}

export function buildProfileMessages(sources: ProfileSources): ChatMessage[] {
  return [
    { role: 'system', content: PROFILE_SYSTEM },
    { role: 'user', content: `${PROFILE_TASK}\n\n${describeSources(sources)}` },
  ]
}

const textOf = (value: unknown, max: number) => (typeof value === 'string' ? truncate(value.trim(), max) : '')

/** Every field as a string within its limit. An answer with nothing usable is an AiOutputError. */
export function parseProfile(content: string): ProfileDraft {
  const json = readJson(content)
  const draft = Object.fromEntries(
    PROFILE_FIELDS.map((field) => [field, textOf(json?.[field], BRAND_TEXT_LIMITS[field])]),
  ) as ProfileDraft
  if (!PROFILE_FIELDS.some((field) => draft[field])) throw new AiOutputError(snippetOf(content))
  return draft
}

/** Only the new-account fill passes `cost: 0`; owner-started requests pay TASK_CREDITS. */
interface CostOption {
  cost?: number
}

/** One request: the profile draft the brand form shows. Nothing is saved here. */
export function analyzeProfile(userId: string, sources: ProfileSources, options: CostOption = {}): Promise<ProfileDraft> {
  return runLogged(
    userId,
    'brand_profile',
    sources,
    async () => parseProfile(await chatCompletion(buildProfileMessages(sources))),
    options,
  )
}

const VISUAL_SYSTEM = [
  'Kamu desainer grafis yang menyusun panduan visual brand untuk konten Instagram.',
  'Aturan:',
  '- Tulis dalam Bahasa Indonesia.',
  '- Jelaskan hanya yang terlihat di gambar. Jangan menebak nama font kalau tidak yakin; jelaskan jenisnya (mis. sans-serif tebal, serif klasik, tulisan tangan).',
  '- Jangan pakai Markdown.',
  RULES,
].join('\n')

const VISUAL_TASK = [
  'Tugas:',
  '1. Untuk setiap referensi, tulis 1–2 kalimat tentang komposisi atau layout, warna dan mood, tipografi, jenis foto atau ilustrasi, dan elemen grafis.',
  '2. Susun "visualStyle": panduan gaya visual bersama, 3–6 kalimat, yang bisa dipakai desainer atau AI gambar untuk membuat post baru yang konsisten dengan referensi.',
  'Ikuti catatan owner pada referensi. Kalau owner hanya ingin layout-nya, jangan ambil warnanya, dan seterusnya.',
  'Format JSON: {"visualStyle": "…", "references": ["deskripsi referensi 1", "deskripsi referensi 2", …]}, urut sesuai nomor referensi.',
].join('\n')

export function buildVisualMessages(references: VisualReference[]): ChatMessage[] {
  const parts: ContentPart[] = [{ type: 'text', text: VISUAL_TASK }]
  references.forEach((reference, index) => {
    const note = reference.note ? `, catatan owner:\n${quote(reference.note)}` : ''
    parts.push({ type: 'text', text: `Referensi ${index + 1}${note}` })
    parts.push({ type: 'image_url', image_url: { url: reference.dataUrl } })
  })
  return [
    { role: 'system', content: VISUAL_SYSTEM },
    { role: 'user', content: parts },
  ]
}

export interface VisualAnalysis {
  visualStyle: string
  /** One per reference, in the order sent; empty when the model skipped one. */
  descriptions: string[]
}

export function parseVisual(content: string, count: number): VisualAnalysis {
  const json = readJson(content)
  const visualStyle = textOf(json?.visualStyle, BRAND_TEXT_LIMITS.visualStyle)
  if (!visualStyle) throw new AiOutputError(snippetOf(content))
  const listed: unknown[] = Array.isArray(json?.references) ? json.references : []
  const descriptions = Array.from({ length: count }, (_, index) => textOf(listed[index], DESCRIPTION_MAX_LENGTH))
  return { visualStyle, descriptions }
}

/** One vision request over the given references. The log keeps their ids and notes, not the images. */
export function analyzeVisual(
  userId: string,
  references: VisualReference[],
  options: CostOption = {},
): Promise<VisualAnalysis> {
  const input = references.map(({ id, note }) => ({ id, note }))
  return runLogged(
    userId,
    'brand_visual',
    input,
    async () => parseVisual(await chatCompletion(buildVisualMessages(references)), references.length),
    options,
  )
}
