/** Sigap, the AI copilot chat: what the server and the page share. Pure, so tests and the browser can use it. */
import type { ContentStrategy } from './strategy-options'
import type { AutoDmRuleInput } from './auto-dm-rules'
import type { ScriptSlide } from './script-options'
import { contentCost, TASK_CREDITS } from './billing-options'
import { truncate } from './brand-options'
import { wibDateKey } from './format'

/**
 * Sigap costs no credits; these cap it per WIB day through the atomic `sigap_daily_usage` counter. A script it
 * writes still costs `content_script` credits like one written in Buat.
 */
export const DAILY_LIMITS = { chat: 100, deep_search: 10 } as const
export type LimitedTask = keyof typeof DAILY_LIMITS

export const LIMIT_MESSAGES: Record<LimitedTask, string> = {
  chat: `Limit chat harian tercapai (${DAILY_LIMITS.chat}/hari). Reset jam 00:00 WIB.`,
  deep_search: `Limit riset kompetitor harian tercapai (${DAILY_LIMITS.deep_search}/hari). Reset jam 00:00 WIB.`,
}

/** 00:00 WIB of the day `now` falls in: where today's limits start counting. */
export const wibDayStart = (now: Date) => new Date(`${wibDateKey(now)}T00:00:00+07:00`)

export const MESSAGE_MAX_LENGTH = 4_000
export const SESSION_TITLE_MAX_LENGTH = 60
/** Each attachment, checked in the browser before upload and again on the server. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/**
 * At most one PDF. The browser shrinks images to 1080 px JPEGs first; Next's proxy buffer is explicitly 16 MB, so
 * even three server-allowed 5 MB attachments plus multipart overhead reach this route intact.
 */
export const MAX_ATTACHMENTS = 3
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp'

export type AttachmentKind = 'image' | 'pdf'

/** What kind of file it is, or why it can't go along. */
export function checkAttachment(file: { name: string; type: string; size: number }): { kind: AttachmentKind } | { error: string } {
  const pdf = file.type === 'application/pdf' || (file.type === '' && file.name.toLowerCase().endsWith('.pdf'))
  if (!pdf && !IMAGE_TYPES.includes(file.type)) return { error: `${file.name}: hanya PDF, JPG, PNG, atau WebP.` }
  if (file.size > MAX_FILE_BYTES) return { error: `${file.name} lebih dari 5 MB.` }
  if (file.size === 0) return { error: `${file.name} kosong.` }
  return { kind: pdf ? 'pdf' : 'image' }
}

/** Why this set of attachments can't go together, or null. */
export function attachmentsProblem(kinds: AttachmentKind[]): string | null {
  if (kinds.length > MAX_ATTACHMENTS) return `Maksimal ${MAX_ATTACHMENTS} lampiran per pesan.`
  if (kinds.filter((kind) => kind === 'pdf').length > 1) return 'Maksimal 1 PDF per pesan.'
  return null
}

/**
 * An ilike pattern for a topic: its words in order, anything between. Only letters and digits get through, so it is
 * safe inside a PostgREST `or()` filter, where commas, dots and brackets mean something. Null for no words.
 */
export function searchPattern(query: string): string | null {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1)
    .slice(0, 6)
  return words.length > 0 ? `%${words.join('%')}%` : null
}

/** What stays of a PDF in the history: its name only, never its text. */
export const pdfPlaceholder = (name: string) => `[PDF: ${name}]`

/** The first message, on one line and cut short. No AI request just for a title. */
export function sessionTitle(message: string, fallback: string): string {
  const line = message.replace(/\s+/g, ' ').trim() || fallback.trim()
  if (!line) return 'Chat baru'
  const cut = truncate(line, SESSION_TITLE_MAX_LENGTH)
  return cut.length < line.length ? `${cut.trimEnd()}…` : cut
}

/**
 * The rolling summary. The model gets the summary plus every message after it; once 40 are waiting, the oldest 20
 * are folded into the summary in the background, so it sees 20–39 messages verbatim and never loses one between.
 */
export const SUMMARY_BATCH = 20
export const HISTORY_WINDOW = 20
/** The most messages ever sent verbatim, should summaries keep failing. */
export const HISTORY_MAX = HISTORY_WINDOW + SUMMARY_BATCH

/** The messages (by position, oldest first) to fold into the summary now, or null when it isn't time yet. */
export function summaryBatch(total: number, summarizedCount: number): { from: number; to: number } | null {
  if (total - summarizedCount < HISTORY_WINDOW + SUMMARY_BATCH) return null
  return { from: summarizedCount, to: summarizedCount + SUMMARY_BATCH - 1 }
}

/** The positions of the messages the model gets verbatim. */
export function historyRange(total: number, summarizedCount: number): { from: number; to: number } | null {
  const from = Math.max(Math.min(summarizedCount, total), total - HISTORY_MAX)
  return from < total ? { from, to: total - 1 } : null
}

// What a message shows beside its text. Stored in chat_messages.parts, so a reload shows the same cards.

export interface SourceLink {
  title: string
  url: string
}

export interface CompetitorView {
  username: string
  name: string
  bio: string
  followers: number | null
  postsCount: number | null
  verified: boolean
  /** Signed CDN link that expires: live-response only, stripped before persistence and logging. */
  avatar: string | null
  recentPosts: {
    caption: string
    likes: number | null
    comments: number | null
    /** ISO time. */
    postedAt: string | null
    url: string | null
  }[]
}

export interface ScriptItem {
  ideaId: string
  title: string
  script: ScriptSlide[]
  /** Saved as an idea in Buat until the owner throws it away. */
  state: 'saved' | 'discarded'
}

export interface StatusItem {
  kind: 'post' | 'idea'
  id: string
  title: string
  /** e.g. "Draft", "Terbit", "Skrip siap · 5 slide". */
  status: string
}

/** IDEA_MAX_LENGTH of content-ai, which is server-only. */
export const BULK_TITLE_MAX_LENGTH = 200
export const BULK_ANGLE_MAX_LENGTH = 300
export const BULK_POINT_MAX_LENGTH = 160
export const MIN_BULK_SLIDES = 2

/**
 * One planned post of a bulk_content card, before anything is written or charged. The owner can rename a new topic,
 * change the angle of what still needs a script, or drop it; the slides and points are the outline the script follows.
 */
export interface BulkPlanItem {
  /** Server-made: becomes the new idea's id and the job's request key, so starting twice makes nothing twice. */
  key: string
  title: string
  angle: string
  pillarId: string | null
  /** A saved idea in Buat this continues; its title stays as saved. */
  ideaId: string | null
  /** The saved idea already has a script: it is drawn as is, without writing a new one. */
  scripted: boolean
  slides: number
  points: string[]
}

/** proposed → (Setuju) starting → started, or proposed → cancelled. Nothing is charged before `starting`. */
export type BulkState = 'proposed' | 'starting' | 'started' | 'cancelled'

/** What one planned post costs at most: its script (unless it has one) and its images. Pure. */
export const bulkItemCost = (item: Pick<BulkPlanItem, 'scripted' | 'slides'>) =>
  (item.scripted ? 0 : TASK_CREDITS.content_script) + contentCost(item.slides)

/** The owner's changes on the plan card: which posts stay, in order, with their title and angle. */
export interface BulkEdit {
  key: string
  title: string
  angle: string
}

/**
 * The plan as the owner approved it: only posts that were planned, each at most once, with a title and angle that
 * may only change where the card lets them. Pure, for tests.
 */
export function applyBulkEdits(plan: BulkPlanItem[], edits: unknown): { plan: BulkPlanItem[] } | { error: string } {
  if (!Array.isArray(edits)) return { error: 'Rencana tidak valid. Muat ulang halaman.' }
  const byKey = new Map(plan.map((item) => [item.key, item]))
  const seen = new Set<string>()
  const result: BulkPlanItem[] = []
  for (const edit of edits) {
    if (typeof edit !== 'object' || edit === null) return { error: 'Rencana tidak valid. Muat ulang halaman.' }
    const { key, title, angle } = edit as Record<string, unknown>
    const item = typeof key === 'string' ? byKey.get(key) : undefined
    if (!item || seen.has(item.key)) return { error: 'Rencana tidak valid. Muat ulang halaman.' }
    seen.add(item.key)
    const nextTitle = item.ideaId ? item.title : typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : ''
    if (!nextTitle) return { error: 'Judul konten tidak boleh kosong.' }
    if (nextTitle.length > BULK_TITLE_MAX_LENGTH) return { error: `Judul maksimal ${BULK_TITLE_MAX_LENGTH} karakter.` }
    const nextAngle = item.scripted ? item.angle : typeof angle === 'string' ? angle.replace(/\r\n/g, '\n').trim() : ''
    if (nextAngle.length > BULK_ANGLE_MAX_LENGTH) return { error: `Sudut konten maksimal ${BULK_ANGLE_MAX_LENGTH} karakter.` }
    result.push({ ...item, title: nextTitle, angle: nextAngle })
  }
  if (result.length === 0) return { error: 'Pilih minimal satu konten.' }
  return { plan: result }
}

/** Sigap's direction for one planned script: its angle, slide count and outline. Pure. */
export function bulkBrief(item: Pick<BulkPlanItem, 'angle' | 'slides' | 'points'>): string {
  return [
    item.angle && `Sudut konten: ${item.angle}`,
    `Tulis tepat ${item.slides} slide.`,
    item.points.length > 0 &&
      `Garis besar yang sudah disetujui owner (ikuti urutannya; sesuaikan bila judul berubah):\n${item.points.map((point, index) => `${index + 1}. ${point}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * One post of a started bulk_content card. Only who it is gets stored: how far it got lives in content_jobs and is
 * polled (BulkStatus), so a reload never shows a stale stage.
 */
export interface BulkItem {
  postId: string
  ideaId: string
  title: string
}

/**
 * Where one bulk post stands. `review` is the gate: the script is written and nothing is drawn until the owner
 * approves it. `rendering` is a plan in place whose slide images are still being drawn.
 */
export type BulkStage = 'writing' | 'review' | 'drafting' | 'rendering' | 'done' | 'failed' | 'cancelled' | 'gone'

export interface BulkStatus {
  postId: string
  stage: BulkStage
  error: string | null
  /** Slides whose image failed, once `done`; they are retried in Buat. */
  failedSlides: number
}

export interface BulkStatusResponse {
  items: BulkStatus[]
  /** The plan's credits per period, to show a cost as a share of it. */
  planCredits: number
}

/** Stages the worker is still moving on its own; the card polls while any item is in one. */
export const BULK_MOVING: ReadonlySet<BulkStage> = new Set(['writing', 'drafting', 'rendering'])

/** A bulk post's stage from its job and its slides. Pure, for tests. */
export function bulkStage(
  job: { kind: 'script' | 'content'; status: 'pending' | 'running' | 'ready' | 'failed' | 'cancelled' } | null,
  slides: { inProgress: number },
): BulkStage {
  if (!job) return 'gone'
  if (job.status === 'failed' || job.status === 'cancelled') return job.status
  if (job.status !== 'ready') return job.kind === 'script' ? 'writing' : 'drafting'
  if (job.kind === 'script') return 'review'
  return slides.inProgress > 0 ? 'rendering' : 'done'
}

export type ConfirmKind = 'strategy' | 'auto_dm_rule'

export type ChatPart =
  | { type: 'attachment'; kind: AttachmentKind; name: string; size: number }
  | { type: 'sources'; query: string; results: SourceLink[] }
  | { type: 'competitors'; query: string; competitors: CompetitorView[] }
  | { type: 'analysis'; competitors: string[]; hooks: string[]; frequency: string; pillars: string[] }
  | { type: 'scripts'; items: ScriptItem[]; errors: string[] }
  | { type: 'content_status'; query: string; items: StatusItem[] }
  | { type: 'bulk'; id: string; state: BulkState; plan: BulkPlanItem[]; items: BulkItem[]; errors: string[] }
  | {
      type: 'confirm'
      id: string
      kind: ConfirmKind
      title: string
      lines: string[]
      payload: ContentStrategy | AutoDmRuleInput
      state: 'pending' | 'saved' | 'cancelled'
    }
  | { type: 'tool_error'; tool: string; message: string }
  /** The whole answer failed; the message's text is empty. */
  | { type: 'failed'; message: string }

export interface ChatMessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts: ChatPart[]
  /** ISO time. */
  createdAt: string
}

export interface ChatSessionView {
  id: string
  title: string
  /** ISO time. */
  updatedAt: string
}

/** What the route streams back, one JSON object per line. */
export type ChatEvent =
  | { type: 'tool'; name: string }
  | { type: 'done'; sessionId: string; created: boolean; user: ChatMessageView; assistant: ChatMessageView }
  /** The answer could not be stored; the owner's message was. */
  | { type: 'error'; sessionId: string; message: string }

export const TOOL_LABELS: Record<string, string> = {
  web_search: 'Sigap sedang mencari di web…',
  check_content_status: 'Sigap sedang mengecek konten yang sudah ada…',
  intel_kompetitor: 'Sigap sedang mencari kompetitor…',
  analyze_and_draft: 'Sigap sedang menyusun skrip…',
  bulk_content: 'Sigap sedang menyusun rencana konten massal…',
  update_content_strategy: 'Sigap sedang menyusun strategi…',
  create_auto_dm_rule: 'Sigap sedang menyusun aturan Auto DM…',
}

export const THINKING_LABEL = 'Sigap sedang berpikir…'

export type SuggestionContext = 'empty' | 'after_deep_search' | 'after_script'

const SUGGESTIONS: Record<SuggestionContext, string[]> = {
  empty: [
    'Cari 5 konten yang lagi trending buat niche aku',
    'Analisis kompetitor @username, buatkan konten mirip',
    'Cek apakah ide [topik] sudah pernah dibuat',
    'Rapikan strategi konten aku',
  ],
  after_deep_search: ['Buatkan skrip dari semua ini', 'Analisis pattern-nya aja', 'Cari yang lain'],
  after_script: ['Ubah hook-nya', 'Buat lebih singkat', 'Buatkan 3 ide lain dari topik ini'],
}

/** Static snippets for where the chat stands: no AI request just for suggestions. */
export const suggestionsFor = (context: SuggestionContext) => SUGGESTIONS[context]

/** Which snippets fit after the newest message, or null for none. */
export function suggestionContext(messages: Pick<ChatMessageView, 'role' | 'parts'>[]): SuggestionContext | null {
  const last = messages.at(-1)
  if (!last) return 'empty'
  if (last.role !== 'assistant') return null
  if (last.parts.some((part) => part.type === 'scripts' && part.items.some((item) => item.state === 'saved'))) {
    return 'after_script'
  }
  if (last.parts.some((part) => part.type === 'competitors' && part.competitors.length > 0)) return 'after_deep_search'
  return null
}

/** Asks Sigap to analyze the picked accounts, from the competitor cards. */
export const analyzeRequest = (usernames: string[]) =>
  `Analisis pola konten ${usernames.map((name) => `@${name}`).join(', ')}: hook yang dipakai, frekuensi posting, dan pilar kontennya.`
