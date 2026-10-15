import 'server-only'
import {
  AUDIENCE_MAX_LENGTH,
  GOALS,
  REWRITE_STYLES,
  TONES,
  TOPIC_MAX_LENGTH,
  type AiRequest,
  type Brief,
  type RewriteStyle,
} from './ai-options'
import { CAPTION_MAX_HASHTAGS, CAPTION_MAX_LENGTH, findHashtags } from './caption'
import type { ChatMessage } from './nine-router'

const MAX_PHOTOS = 10

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
/** Own keys only: `'toString' in GOALS` is true. */
const isChoice = <T extends object>(choices: T, value: unknown): value is keyof T =>
  typeof value === 'string' && Object.hasOwn(choices, value)
/** Code points, as Instagram, the editor counter and Postgres count them. */
const lengthOf = (text: string) => Array.from(text).length

export type ParsedRequest = { request: AiRequest } | { error: string }

function parseBrief(input: unknown): Brief | string {
  if (!isObject(input)) return 'Permintaan tidak valid.'
  const topic = typeof input.topic === 'string' ? input.topic.trim() : ''
  const audience = typeof input.audience === 'string' ? input.audience.trim() : ''
  const { goal, tone, photoCount } = input

  if (!topic) return 'Isi topik dulu.'
  if (lengthOf(topic) > TOPIC_MAX_LENGTH) return `Topik maksimal ${TOPIC_MAX_LENGTH} karakter.`
  if (lengthOf(audience) > AUDIENCE_MAX_LENGTH) return `Audiens maksimal ${AUDIENCE_MAX_LENGTH} karakter.`
  if (!isChoice(GOALS, goal) || !isChoice(TONES, tone)) return 'Tujuan atau nada tidak dikenal.'
  if (typeof photoCount !== 'number' || !Number.isInteger(photoCount) || photoCount < 0 || photoCount > MAX_PHOTOS) {
    return 'Jumlah foto tidak valid.'
  }
  return { topic, goal, tone, audience, photoCount }
}

/** Validates what the editor sent. The server action's parameter type is only a hint. */
export function parseAiRequest(input: unknown): ParsedRequest {
  if (!isObject(input)) return { error: 'Permintaan tidak valid.' }
  const { task } = input
  if (task === 'captions' || task === 'ideas') {
    const brief = parseBrief(input.brief)
    return typeof brief === 'string' ? { error: brief } : { request: { task, brief } }
  }
  if (task !== 'rewrite' && task !== 'hashtags') return { error: 'Permintaan tidak valid.' }

  // Textareas submit CRLF; count newlines once, as the editor and Instagram do.
  const caption = typeof input.caption === 'string' ? input.caption.replace(/\r\n/g, '\n') : ''
  if (!caption.trim()) return { error: 'Tulis caption dulu.' }
  if (lengthOf(caption) > CAPTION_MAX_LENGTH) return { error: 'Caption lebih dari 2.200 karakter.' }
  if (task === 'hashtags') {
    return findHashtags(caption).length >= CAPTION_MAX_HASHTAGS
      ? { error: 'Caption sudah memakai 30 hashtag.' }
      : { request: { task, caption } }
  }
  return isChoice(REWRITE_STYLES, input.style)
    ? { request: { task, style: input.style, caption } }
    : { error: 'Gaya ubah caption tidak dikenal.' }
}

const SYSTEM_PROMPT = [
  'Kamu penulis caption Instagram untuk satu akun bisnis atau kreator di Indonesia.',
  'Aturan:',
  '- Tulis dalam Bahasa Indonesia yang natural, kecuali brief jelas memakai bahasa lain.',
  '- Patuhi batas Instagram: caption maksimal 2.200 karakter, 30 hashtag, dan 20 mention.',
  '- Jangan pakai Markdown seperti **tebal**, _miring_, atau judul. Instagram tidak merendernya.',
  '- Jangan mengarang fakta atau klaim yang tidak ada di brief, misalnya harga, tanggal, lokasi, stok terbatas, atau "kualitas premium".',
  '- Balas HANYA dengan satu objek JSON sesuai format yang diminta, tanpa teks lain.',
].join('\n')

const CAPTION_SHAPE =
  'Setiap caption terdiri dari 2–4 paragraf pendek, sekitar 300–700 karakter sebelum hashtag: kalimat pembuka yang menarik, isi, lalu ajakan bertindak (CTA) yang sesuai tujuan. Tutup dengan 3–8 hashtag relevan di baris terakhir.'

const REWRITE_INSTRUCTIONS: Record<RewriteStyle, string> = {
  santai: 'Tulis ulang caption dengan nada lebih santai dan akrab.',
  profesional: 'Tulis ulang caption dengan nada lebih profesional dan rapi.',
  singkat: 'Tulis ulang caption supaya lebih singkat, kira-kira setengah panjangnya.',
  panjang: 'Tulis ulang caption supaya lebih panjang dan lebih rinci, tanpa menambah fakta baru.',
  cta: 'Tambahkan satu ajakan bertindak (CTA) yang jelas di akhir isi caption, sebelum hashtag. Jangan ubah bagian lain.',
}

/** Owner text goes between triple quotes, apart from the instructions. */
const quote = (text: string) => `"""\n${text}\n"""`

function photoFormat(count: number): string {
  if (count === 0) return 'belum ada foto'
  return count === 1 ? 'foto tunggal' : `carousel ${count} foto`
}

function describeBrief(brief: Brief): string {
  return [
    `Topik:\n${quote(brief.topic)}`,
    `Tujuan: ${GOALS[brief.goal]}`,
    `Nada: ${TONES[brief.tone]}`,
    `Audiens: ${brief.audience || 'umum'}`,
    `Format post: ${photoFormat(brief.photoCount)}`,
  ].join('\n')
}

function taskPrompt(request: AiRequest): string {
  switch (request.task) {
    case 'captions':
      return [
        `Tugas: tulis 3 variasi caption dengan sudut pandang berbeda. ${CAPTION_SHAPE}`,
        'Format JSON: {"captions": ["…", "…", "…"]}',
        '',
        describeBrief(request.brief),
      ].join('\n')
    case 'ideas':
      return [
        'Tugas: beri 5 ide post Instagram yang berbeda-beda untuk topik di bawah. Setiap ide berupa satu kalimat yang cukup jelas untuk dijadikan topik caption.',
        'Format JSON: {"ideas": ["…", "…", "…", "…", "…"]}',
        '',
        describeBrief(request.brief),
      ].join('\n')
    case 'rewrite':
      return [
        `Tugas: ${REWRITE_INSTRUCTIONS[request.style]} Pertahankan fakta, mention, dan hashtag yang ada.`,
        'Format JSON: {"caption": "…"}',
        '',
        `Caption:\n${quote(request.caption)}`,
      ].join('\n')
    case 'hashtags':
      return [
        'Tugas: sarankan 10 hashtag relevan untuk caption di bawah, campuran hashtag populer dan spesifik. Jangan ulangi hashtag yang sudah ada di caption.',
        'Format JSON: {"hashtags": ["#…"]}',
        '',
        `Caption:\n${quote(request.caption)}`,
      ].join('\n')
  }
}

export function buildMessages(request: AiRequest): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: taskPrompt(request) },
  ]
}
