import 'server-only'
import { AiOutputError, describeBrand, loadBrandContext, quote, readJson, runLogged, snippetOf } from './ai'
import { truncate, type BrandContext } from './brand-options'
import { COMMENT_MAX_LENGTH, REPLY_MAX_LENGTH } from './inbox-rules'
import { chatCompletion, type ChatMessage } from './nine-router'
import { THREADS_TEXT_LIMIT } from './thread-items'

/** A DM reply, a public reply under a comment, a private reply (a DM) to a comment, or a reply on Threads. */
export type ReplyChannel = 'dm' | 'comment' | 'comment_dm' | 'threads'

export const REPLY_LIMITS: Record<ReplyChannel, number> = {
  dm: REPLY_MAX_LENGTH,
  comment: COMMENT_MAX_LENGTH,
  comment_dm: REPLY_MAX_LENGTH,
  threads: THREADS_TEXT_LIMIT,
}

/** How many of the latest messages the AI reads. */
export const REPLY_CONTEXT_MESSAGES = 10

/** One message or comment of the conversation; null text is an attachment. */
export interface ReplyLine {
  fromCustomer: boolean
  text: string | null
}

export interface ReplyRequest {
  channel: ReplyChannel
  /** Oldest first. */
  lines: ReplyLine[]
  /** The owner's draft, possibly empty: AI writes one, or tidies this. */
  draft: string
  /** The post's caption, for comments. */
  caption?: string | null
}

const SYSTEM = [
  'Kamu admin akun Instagram satu bisnis atau kreator di Indonesia yang membalas pelanggan.',
  'Aturan:',
  '- Tulis dalam bahasa yang dipakai pelanggan. Umumnya Bahasa Indonesia santai yang sopan, mengikuti gaya bahasa brand.',
  '- Jawab langsung, ramah, dan singkat: 1–3 kalimat pendek.',
  '- Jangan pakai Markdown. Emoji boleh secukupnya kalau cocok dengan gaya brand.',
  '- Jangan mengarang fakta yang tidak ada di percakapan atau fakta brand, misalnya harga, stok, ongkir, jam buka, lokasi, atau promo. Kalau informasinya tidak ada, katakan akan dicek dulu.',
  '- Balas HANYA dengan satu objek JSON sesuai format yang diminta, tanpa teks lain.',
].join('\n')

const CHANNEL_LINES: Record<ReplyChannel, string> = {
  dm: 'Ini balasan DM Instagram ke pelanggan.',
  comment:
    'Ini balasan publik di bawah komentar post Instagram: semua orang bisa membacanya, jadi jangan menulis data pribadi. Untuk pesanan atau hal pribadi, ajak lanjut lewat DM.',
  comment_dm: 'Ini DM pribadi ke orang yang berkomentar di post Instagram, menanggapi komentarnya.',
  threads:
    'Ini balasan publik di bawah balasan orang di post Threads: semua orang bisa membacanya, jadi jangan menulis data pribadi. Untuk pesanan atau hal pribadi, ajak lanjut lewat DM Instagram.',
}

const WRITE_TASK = 'Tugas: tulis draf balasan untuk pesan terakhir pelanggan di bawah.'
const TIDY_TASK =
  'Tugas: rapikan draf balasan owner di bawah. Perbaiki ejaan, tata bahasa, dan nadanya agar ramah dan sesuai gaya brand, dan pertahankan maksud serta semua faktanya. Kalau draf berisi permintaan untukmu (misalnya "buat lebih singkat"), ikuti permintaan itu dan tulis balasannya.'

const describeLine = (line: ReplyLine) => `${line.fromCustomer ? 'Pelanggan' : 'Kamu'}:\n${quote(line.text ?? '(lampiran)')}`

export function buildReplyMessages(request: ReplyRequest, brand: BrandContext | null): ChatMessage[] {
  const draft = request.draft.trim()
  const lines = request.lines.slice(-REPLY_CONTEXT_MESSAGES)
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        `${brand ? describeBrand(brand) : ''}${CHANNEL_LINES[request.channel]}`,
        draft ? TIDY_TASK : WRITE_TASK,
        `Format JSON: {"reply": "…"}, maksimal ${REPLY_LIMITS[request.channel]} karakter.`,
        ...(request.caption ? ['', `Caption post:\n${quote(request.caption)}`] : []),
        '',
        'Percakapan (lama ke baru):',
        ...lines.map(describeLine),
        ...(draft ? ['', `Draf owner:\n${quote(draft)}`] : []),
      ].join('\n'),
    },
  ]
}

/** The reply from the model's JSON, cut to the channel's limit. */
export function parseReply(content: string, limit: number): string {
  const value = readJson(content)?.reply
  const reply = truncate(typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '', limit).trim()
  if (!reply) throw new AiOutputError(snippetOf(content))
  return reply
}

/** A reply draft for the owner to check and send. Costs TASK_CREDITS.reply_draft. */
export function draftReply(userId: string, request: ReplyRequest): Promise<string> {
  return runLogged(userId, 'reply_draft', request, async () => {
    const brand = await loadBrandContext(userId)
    return parseReply(await chatCompletion(buildReplyMessages(request, brand)), REPLY_LIMITS[request.channel])
  })
}
