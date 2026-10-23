'use client'

import {
  BadgeCheck,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  RotateCw,
  Search,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition, type ReactNode } from 'react'
import { ExternalImage } from '@/components/media-image'
import { formatCount } from '@/lib/analytics-metrics'
import {
  analyzeRequest,
  BULK_ANGLE_MAX_LENGTH,
  BULK_TITLE_MAX_LENGTH,
  bulkItemCost,
  type BulkEdit,
  type BulkItem,
  type BulkPlanItem,
  type BulkStage,
  type BulkStatus,
  type BulkSettings,
  type ChatPart,
  type CompetitorView,
  type ScriptItem,
} from '@/lib/chat-options'
import { formatCreditShare } from '@/lib/billing-options'
import { AUTO_PRODUCT, type ProductOption } from '@/lib/content-options'
import { DENSITY_ORDER, isTextDensity, TEXT_DENSITIES, type TextDensity } from '@/lib/density-options'
import { BULLET, slideProblem, type ScriptSlide } from '@/lib/script-options'
import { retryContentJobAction } from '../buat/content-actions'
import { cancelBulkAction, discardScriptAction, resolveConfirmAction, startBulkAction } from './actions'
import { useBulkStatus } from './use-bulk-status'
import { ScheduleCard } from './schedule-card'

const FAILED = 'Gagal menghubungi server. Coba lagi.'

const SMALL_BUTTON =
  'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-60'
const PRIMARY = `${SMALL_BUTTON} bg-accent text-white hover:bg-accent-deep`
const SECONDARY = `${SMALL_BUTTON} border border-hairline bg-paper text-ink hover:bg-zinc-50`
const GHOST = `${SMALL_BUTTON} text-ink-muted hover:bg-zinc-100 hover:text-ink`

/** Where a card's buttons act, and how they ask Sigap something next. */
export interface CardContext {
  sessionId: string | null
  messageId: string
  /** Sends a message to Sigap, e.g. from Analisis yang dipilih. Null while an answer is on its way. */
  ask: ((text: string) => void) | null
  products: Pick<ProductOption, 'id' | 'label' | 'imageCount'>[]
  defaultDensity: TextDensity
}

export const formatBytes = (size: number) =>
  size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(size / 1024))} KB`

/** One thin frame for every tool's result: an icon, a label, then what the tool found. */
function ToolResult({ icon: Icon, label, children }: { icon: LucideIcon; label: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-paper">
      <h3 className="flex items-center gap-2 border-b border-hairline px-4 py-2.5 text-xs font-medium text-ink-muted">
        <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 truncate">{label}</span>
      </h3>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}

const ErrorText = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="text-xs text-red-700">
    {children}
  </p>
)

/** A file the owner sent. A PDF's text was read once and not kept, so only its name stays. */
export function AttachmentBubble({ kind, name, size }: { kind: 'image' | 'pdf'; name: string; size: number }) {
  const Icon = kind === 'pdf' ? FileText : ImageIcon
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-xl border border-hairline bg-paper px-3 py-2 text-xs text-ink">
      <Icon size={16} strokeWidth={1.75} className={kind === 'pdf' ? 'shrink-0 text-red-600' : 'shrink-0 text-accent'} aria-hidden="true" />
      <span className="min-w-0 truncate font-medium">{name}</span>
      <span className="shrink-0 text-ink-muted">{formatBytes(size)}</span>
    </span>
  )
}

/** Everything a message shows beside its text, in the order the tools ran. */
export function PartView({ part, context }: { part: ChatPart; context: CardContext }) {
  switch (part.type) {
    case 'attachment':
      return null
    case 'sources':
      return <SourcesCard query={part.query} results={part.results} />
    case 'competitors':
      return <CompetitorList query={part.query} competitors={part.competitors} context={context} />
    case 'analysis':
      return <AnalysisCard part={part} />
    case 'scripts':
      return <ScriptBatch items={part.items} errors={part.errors} context={context} />
    case 'content_status':
      return <ContentStatusCard query={part.query} items={part.items} context={context} />
    case 'bulk':
      return <BulkCard part={part} context={context} />
    case 'schedule':
      return <ScheduleCard sessionId={context.sessionId} messageId={context.messageId} cardId={part.id} />
    case 'confirm':
      return <ToolConfirmCard part={part} context={context} />
    case 'tool_error':
      return (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {part.message}
        </p>
      )
    case 'failed':
      return (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          Sigap gagal menjawab: {part.message}
        </p>
      )
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function SourcesCard({ query, results }: { query: string; results: { title: string; url: string }[] }) {
  return (
    <ToolResult icon={Globe} label={`Hasil web: ${query}`}>
      {results.length === 0 ? (
        <p className="text-sm text-ink-muted">Tidak ada hasil.</p>
      ) : (
        <ol className="space-y-1.5">
          {results.map((result) => (
            <li key={result.url}>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group flex items-baseline gap-2 text-sm text-ink hover:text-accent"
              >
                <span className="min-w-0 truncate group-hover:underline">{result.title || hostOf(result.url)}</span>
                <span className="shrink-0 text-xs text-ink-soft">{hostOf(result.url)}</span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </ToolResult>
  )
}

function CompetitorList({ query, competitors, context }: { query: string; competitors: CompetitorView[]; context: CardContext }) {
  const [picked, setPicked] = useState<string[]>([])
  const ask = context.ask
  const toggle = (username: string) =>
    setPicked((current) => (current.includes(username) ? current.filter((name) => name !== username) : [...current, username]))

  return (
    <ToolResult icon={Users} label={`Intel Kompetitor: ${query}`}>
      {competitors.length === 0 ? (
        <p className="text-sm text-ink-muted">Tidak ada akun publik yang ditemukan. Coba username atau kata kunci lain.</p>
      ) : (
        <>
          <ul className="divide-y divide-hairline">
            {competitors.map((account) => (
              <CompetitorCard
                key={account.username}
                account={account}
                checked={picked.includes(account.username)}
                onToggle={() => toggle(account.username)}
                onAnalyze={ask ? () => ask(analyzeRequest([account.username])) : null}
              />
            ))}
          </ul>
          {competitors.length > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 border-t border-hairline pt-3">
              <span className="text-xs text-ink-muted">{picked.length} dipilih</span>
              <button
                type="button"
                disabled={!ask || picked.length === 0}
                onClick={() => ask?.(analyzeRequest(picked))}
                className={PRIMARY}
              >
                Analisis yang dipilih
              </button>
            </div>
          )}
        </>
      )}
    </ToolResult>
  )
}

function CompetitorCard({
  account,
  checked,
  onToggle,
  onAnalyze,
}: {
  account: CompetitorView
  checked: boolean
  onToggle: () => void
  onAnalyze: (() => void) | null
}) {
  const latest = account.recentPosts[0]
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={`Pilih @${account.username}`}
        className="mt-3 size-4 shrink-0 accent-[var(--color-accent)]"
      />
      {account.avatar ? (
        <ExternalImage src={account.avatar} className="size-10 shrink-0 rounded-full bg-zinc-100 object-cover" />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-ink-muted uppercase">
          {account.username.slice(0, 1)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <a
            href={`https://www.instagram.com/${account.username}/`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 text-sm font-semibold text-ink hover:underline"
          >
            @{account.username}
            {account.verified && <BadgeCheck size={14} className="text-sky-500" aria-label="Terverifikasi" />}
          </a>
          <span className="text-xs text-ink-muted">
            {formatCount(account.followers)} followers · {formatCount(account.postsCount)} post
          </span>
        </div>
        {account.name && <p className="text-xs text-ink-muted">{account.name}</p>}
        {account.bio && <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-ink">{account.bio}</p>}
        {latest && (
          <p className="mt-1 line-clamp-1 text-xs text-ink-muted">
            Post terbaru: {latest.caption || '(tanpa caption)'} · {formatCount(latest.likes)} like
          </p>
        )}
      </div>
      {onAnalyze && (
        <button type="button" onClick={onAnalyze} className={`${GHOST} shrink-0 text-accent`}>
          Analisis pattern-nya
        </button>
      )}
    </li>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-1 space-y-0.5 text-sm text-ink">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="text-accent" aria-hidden="true">
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function AnalysisCard({ part }: { part: Extract<ChatPart, { type: 'analysis' }> }) {
  const label = part.competitors.length > 0 ? `Analisis ${part.competitors.map((name) => `@${name}`).join(', ')}` : 'Analisis kompetitor'
  return (
    <ToolResult icon={Search} label={label}>
      <div className="space-y-3">
        {part.hooks.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-ink-muted">Pola hook</h4>
            <Bullets items={part.hooks} />
          </div>
        )}
        {part.frequency && (
          <div>
            <h4 className="text-xs font-semibold text-ink-muted">Frekuensi posting</h4>
            <p className="mt-1 text-sm text-ink">{part.frequency}</p>
          </div>
        )}
        {part.pillars.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-ink-muted">Pilar konten</h4>
            <Bullets items={part.pillars} />
          </div>
        )}
      </div>
    </ToolResult>
  )
}

/** A slide's body as written: points get the accent marker, like the script in Buat. */
function SlideBody({ body }: { body: string }) {
  return (
    <p className="text-sm whitespace-pre-line text-ink">
      {body.split('\n').map((line, index) => {
        const bullet = BULLET.exec(line)
        return (
          <span key={index} className="block">
            {bullet ? (
              <>
                <span className="text-accent">{bullet[1]}</span>
                {bullet[2]}
              </>
            ) : (
              line || '\u00a0'
            )}
          </span>
        )
      })}
    </p>
  )
}

function SlideRow({ slide, number }: { slide: ScriptSlide; number: number }) {
  const problem = slideProblem(slide, number)
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${problem ? 'bg-red-100 text-red-700' : 'bg-accent-soft text-accent'}`}
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        {slide.label && <p className={`text-[11px] font-medium uppercase ${problem ? 'text-red-700' : 'text-ink-muted'}`}>{slide.label}</p>}
        {slide.title && <p className="text-sm font-semibold text-ink">{slide.title}</p>}
        {slide.body && <SlideBody body={slide.body} />}
        {problem && <p className="mt-0.5 text-xs text-red-700">{problem} Perbaiki di Buat.</p>}
      </div>
    </li>
  )
}

function ScriptBatch({ items, errors, context }: { items: ScriptItem[]; errors: string[]; context: CardContext }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ScriptPreviewCard key={item.ideaId} item={item} context={context} />
      ))}
      {errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-medium">Skrip yang gagal ditulis:</p>
          <Bullets items={errors} />
        </div>
      )}
    </div>
  )
}

function ScriptPreviewCard({ item, context }: { item: ScriptItem; context: CardContext }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { sessionId, messageId } = context

  if (item.state === 'discarded') {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-hairline px-4 py-3 text-sm text-ink-muted">
        <Trash2 size={14} aria-hidden="true" />
        Skrip &ldquo;{item.title}&rdquo; dibuang.
      </p>
    )
  }

  return (
    <ToolResult icon={FileText} label={`Skrip · ${item.script.length} slide`}>
      <h4 className="text-[15px] leading-snug font-semibold text-ink">{item.title}</h4>
      <ol className="mt-3 space-y-3">
        {item.script.map((slide, index) => (
          <SlideRow key={index} slide={slide} number={index + 1} />
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        <Link href={`/buat?ide=${item.ideaId}`} className={PRIMARY}>
          <Check size={14} aria-hidden="true" />
          Setuju, buka di Buat
        </Link>
        <button
          type="button"
          disabled={pending || !sessionId}
          onClick={() => {
            if (!sessionId || !window.confirm(`Buang skrip "${item.title}"? Idenya ikut terhapus dari Buat.`)) return
            startTransition(async () => {
              setError(await discardScriptAction(sessionId, messageId, item.ideaId).catch(() => FAILED))
            })
          }}
          className={GHOST}
        >
          {pending ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
          Buang
        </button>
        <span className="text-xs text-ink-muted">Sudah tersimpan sebagai ide. Minta revisi lewat chat.</span>
      </div>
      {error && (
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </ToolResult>
  )
}

function ContentStatusCard({
  query,
  items,
  context,
}: {
  query: string
  items: Extract<ChatPart, { type: 'content_status' }>['items']
  context: CardContext
}) {
  const ask = context.ask
  return (
    <ToolResult icon={Search} label={`Cek konten: ${query}`}>
      {items.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-sm text-ink">
            <CircleDashed size={16} className="text-ink-soft" aria-hidden="true" />
            Belum dibuat.
          </p>
          {ask && (
            <button type="button" onClick={() => ask(`Buatkan skrip untuk topik "${query}".`)} className={SECONDARY}>
              Buatkan sekarang
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3">
              <Check size={16} className="shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                <span className="block text-xs text-ink-muted">{item.status}</span>
              </span>
              <Link
                href={item.kind === 'post' ? `/buat?id=${item.id}` : `/buat?ide=${item.id}`}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                Buka di Buat
                <ExternalLink size={12} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ToolResult>
  )
}

const BULK_STAGES: Record<BulkStage, { text: string; tone: string; spin?: boolean }> = {
  writing: { text: 'Menulis skrip…', tone: 'text-ink-muted', spin: true },
  review: { text: 'Skrip siap, lanjutkan di Buat', tone: 'text-accent' },
  drafting: { text: 'Menyusun caption…', tone: 'text-ink-muted', spin: true },
  rendering: { text: 'Membuat gambar…', tone: 'text-ink-muted', spin: true },
  done: { text: 'Selesai', tone: 'text-emerald-700' },
  failed: { text: 'Gagal', tone: 'text-red-700' },
  cancelled: { text: 'Dibatalkan', tone: 'text-ink-soft' },
  gone: { text: 'Sudah dihapus', tone: 'text-ink-soft' },
}

const LINK = 'inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline'
const FIELD =
  'block w-full rounded-lg border border-hairline bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-soft focus:border-accent/60 focus:outline-none'

/** A cost as owners see it: a share of the plan's quota, never raw credits. Null without a plan to compare to. */
const quotaShare = (cost: number, planCredits: number | undefined) =>
  planCredits && planCredits > 0 ? `≈ ${formatCreditShare(cost, planCredits)} kuota` : null

/** Sigap's bulk card, by where it stands: a plan to edit, a start to finish, a cancelled plan, or posts on their way. */
function BulkCard({ part, context }: { part: Extract<ChatPart, { type: 'bulk' }>; context: CardContext }) {
  switch (part.state) {
    case 'proposed':
    case 'starting':
      return <BulkPlanCard part={part} context={context} />
    case 'cancelled':
      return (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-hairline px-4 py-3 text-sm text-ink-muted">
          <X size={14} aria-hidden="true" />
          Rencana konten massal dibatalkan.
        </p>
      )
    case 'started':
      return <BulkContentCard items={part.items} errors={part.errors} cardId={part.id} context={context} />
  }
}

/**
 * The plan before anything is written or charged. The owner can rename new topics, change angles of what still
 * needs a script, and drop posts; Setuju starts them all. `starting` shows it read-only with a way to finish.
 */
function BulkPlanCard({ part, context }: { part: Extract<ChatPart, { type: 'bulk' }>; context: CardContext }) {
  const { data } = useBulkStatus([])
  const [draft, setPlan] = useState(part.plan)
  const [draftSettings, setSettings] = useState<BulkSettings>(part.settings ?? {
    density: context.defaultDensity,
    productGroupId: AUTO_PRODUCT,
  })
  // Once starting, the saved plan is what runs; local edits no longer apply.
  const plan = part.state === 'starting' ? part.plan : draft
  const settings = part.state === 'starting' ? part.settings ?? draftSettings : draftSettings
  const [pending, setPending] = useState<'start' | 'cancel' | null>(null)
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { sessionId, messageId } = context
  const starting = part.state === 'starting'
  const editable = !starting && pending === null

  const totalShare = quotaShare(
    plan.reduce((sum, item) => sum + bulkItemCost(item, data?.rates), 0),
    data?.planCredits,
  )
  const missingTitle = plan.some((item) => !item.ideaId && !item.title.trim())

  const update = (key: string, change: Partial<Pick<BulkPlanItem, 'title' | 'angle'>>) =>
    setPlan((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)))
  const remove = (key: string) => setPlan((current) => (current.length > 1 ? current.filter((item) => item.key !== key) : current))

  const run = (kind: 'start' | 'cancel') => {
    if (!sessionId || pending) return
    setPending(kind)
    setError(null)
    startTransition(async () => {
      const edits: BulkEdit[] = starting ? [] : plan.map(({ key, title, angle }) => ({ key, title, angle }))
      const result =
        kind === 'start'
          ? startBulkAction(sessionId, messageId, part.id, edits, settings)
          : cancelBulkAction(sessionId, messageId, part.id)
      setError(await result.catch(() => FAILED))
      setPending(null)
    })
  }

  return (
    <section className="rounded-2xl border border-accent/30 bg-paper">
      <h3 className="flex items-center gap-2 border-b border-hairline px-4 py-2.5 text-xs font-medium text-ink-muted">
        <Layers size={14} strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 truncate">Rencana konten massal · {plan.length} konten</span>
      </h3>
      <div className="px-4 py-3">
        <div aria-live="polite">
          {starting ? (
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <LoaderCircle size={14} className="animate-spin text-accent" aria-hidden="true" />
              Sedang memulai…
            </p>
          ) : (
            <p className="text-xs text-ink-muted">
              Belum ada kuota terpakai. Setelah kamu setujui, skrip dan gambar tiap konten dibuat otomatis.
            </p>
          )}
        </div>

        <fieldset disabled={!editable} className="mt-4 min-w-0">
          <legend className="text-xs font-medium text-ink">Pengaturan semua konten</legend>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-xs text-ink-muted">
              Teks
              <select
                value={settings.density}
                onChange={(event) => {
                  const density = event.target.value
                  if (isTextDensity(density)) setSettings((current) => ({ ...current, density }))
                }}
                className={`${FIELD} mt-1 min-h-9 disabled:opacity-60`}
              >
                {DENSITY_ORDER.map((key) => <option key={key} value={key}>{TEXT_DENSITIES[key].label}</option>)}
              </select>
            </label>
            <label className="min-w-0 text-xs text-ink-muted">
              Produk
              <select
                value={settings.productGroupId ?? ''}
                onChange={(event) => setSettings((current) => ({ ...current, productGroupId: event.target.value || null }))}
                className={`${FIELD} mt-1 min-h-9 disabled:opacity-60`}
              >
                <option value={AUTO_PRODUCT}>Otomatis</option>
                {context.products.map((product) => (
                  <option key={product.id} value={product.id}>{product.label} ({product.imageCount})</option>
                ))}
                <option value="">Tanpa</option>
                {settings.productGroupId && settings.productGroupId !== AUTO_PRODUCT && !context.products.some((product) => product.id === settings.productGroupId) && (
                  <option value={settings.productGroupId} disabled>Produk tidak tersedia</option>
                )}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{TEXT_DENSITIES[settings.density].description}</p>
          {plan.some((item) => item.scripted) && (
            <p className="mt-1 text-xs text-ink-muted">Konten dengan skrip tersimpan tetap memakai teks skripnya.</p>
          )}
          {context.products.length === 0 && (
            <p className="mt-1 text-xs text-ink-muted">Belum ada produk dengan foto aktif. Tambahkan di Aset untuk memakai foto produk.</p>
          )}
        </fieldset>

        <ol className="mt-4 divide-y divide-hairline rounded-xl border border-hairline">
          {plan.map((item, index) => (
            <BulkPlanRow
              key={item.key}
              item={item}
              number={index + 1}
              editable={editable}
              removable={editable && plan.length > 1}
              onChange={(change) => update(item.key, change)}
              onRemove={() => remove(item.key)}
            />
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3">
        <button
          type="button"
          disabled={pending !== null || !sessionId || (!starting && (missingTitle || plan.length === 0))}
          onClick={() => run('start')}
          className={PRIMARY}
        >
          {pending === 'start' ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
          {starting ? 'Lanjutkan' : `Setuju, buat ${plan.length} konten`}
        </button>
        {!starting && (
          <button type="button" disabled={pending !== null || !sessionId} onClick={() => run('cancel')} className={GHOST}>
            {pending === 'cancel' && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
            Batal
          </button>
        )}
        {totalShare && <span className="ml-auto text-xs text-ink-muted">Perkiraan total {totalShare}</span>}
      </div>

      {(error || missingTitle || part.errors.length > 0) && (
        <div className="space-y-1 px-4 pb-3">
          {error && <ErrorText>{error}</ErrorText>}
          {missingTitle && !starting && <ErrorText>Judul konten tidak boleh kosong.</ErrorText>}
          {part.errors.map((line) => (
            <ErrorText key={line}>{line}</ErrorText>
          ))}
        </div>
      )}
    </section>
  )
}

function BulkPlanRow({
  item,
  number,
  editable,
  removable,
  onChange,
  onRemove,
}: {
  item: BulkPlanItem
  number: number
  editable: boolean
  removable: boolean
  onChange: (change: Partial<Pick<BulkPlanItem, 'title' | 'angle'>>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const titleEditable = editable && !item.ideaId
  const angleEditable = editable && !item.scripted

  return (
    <li className="flex gap-3 px-3 py-3">
      <span className="mt-1.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        {titleEditable ? (
          <input
            type="text"
            value={item.title}
            maxLength={BULK_TITLE_MAX_LENGTH}
            onChange={(event) => onChange({ title: event.target.value })}
            aria-label={`Judul konten ${number}`}
            placeholder="Judul konten"
            className={`${FIELD} font-semibold`}
          />
        ) : (
          <p className="pt-1 text-sm font-semibold text-ink">
            {item.title}
            {item.ideaId && <span className="ml-2 text-[11px] font-medium text-ink-muted">Ide tersimpan</span>}
          </p>
        )}

        {item.scripted ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <FileText size={12} aria-hidden="true" />
            Pakai skrip yang sudah tersimpan
          </p>
        ) : angleEditable ? (
          <input
            type="text"
            value={item.angle}
            maxLength={BULK_ANGLE_MAX_LENGTH}
            onChange={(event) => onChange({ angle: event.target.value })}
            aria-label={`Sudut konten ${number}`}
            placeholder="Sudut atau hook (opsional)"
            className={`${FIELD} text-xs`}
          />
        ) : (
          item.angle && <p className="text-xs text-ink-muted">{item.angle}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
          <span>{item.slides} slide</span>
          {item.points.length > 0 && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink"
            >
              <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              {open ? 'Sembunyikan garis besar' : 'Lihat garis besar'}
            </button>
          )}
        </div>
        {open && item.points.length > 0 && (
          <ol className="space-y-0.5 border-l-2 border-accent-soft pl-3 text-xs text-ink">
            {item.points.map((point, index) => (
              <li key={index} className="flex gap-2">
                <span className="shrink-0 text-ink-soft tabular-nums">{index + 1}.</span>
                <span>{point}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {editable && (
        <button
          type="button"
          disabled={!removable}
          onClick={onRemove}
          aria-label={`Hapus "${item.title || `konten ${number}`}" dari rencana`}
          title={removable ? 'Hapus dari rencana' : 'Minimal satu konten'}
          className={`${GHOST} -mr-2 shrink-0 px-2`}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

/** Posts a started plan made. The worker writes and draws each one; the stages come from polling. */
function BulkContentCard({ items, errors, cardId, context }: { items: BulkItem[]; errors: string[]; cardId: string; context: CardContext }) {
  const [scheduling, setScheduling] = useState(false)
  const { data, error: pollError, refresh } = useBulkStatus(items.map((item) => item.postId))

  const statusOf = (postId: string): BulkStatus | null =>
    data ? (data.items.find((status) => status.postId === postId) ?? { postId, stage: 'gone', error: null, failedSlides: 0 }) : null
  const rows = items.map((item) => ({ item, status: statusOf(item.postId) }))
  const finished = rows.filter((row) => row.status && !BULK_STAGES[row.status.stage].spin).length

  return (
    <div className="space-y-3">
    <ToolResult icon={Layers} label={`Konten massal · ${items.length} konten`}>
      <div aria-live="polite" className="mb-3 space-y-0.5">
        <p className="text-sm font-medium text-ink">
          {!data
            ? 'Memuat status…'
            : finished === items.length
              ? 'Semua konten sudah diproses'
              : `${finished} dari ${items.length} konten selesai diproses`}
        </p>
        <p className="text-xs text-ink-muted">Skrip dan gambar dibuat otomatis. Kamu bisa menutup halaman ini.</p>
      </div>

      <ul className="divide-y divide-hairline rounded-xl border border-hairline">
        {rows.map(({ item, status }) => (
          <BulkRow key={item.postId} item={item} status={status} onRetried={refresh} />
        ))}
      </ul>

      <button type="button" onClick={() => setScheduling((value) => !value)} aria-expanded={scheduling} className={`${SECONDARY} mt-3`}>
        {scheduling ? 'Tutup pengaturan jadwal' : 'Atur jadwal di Sigap'}
      </button>

      {pollError && (
        <div className="mt-2 flex items-center gap-2">
          <ErrorText>Status belum bisa dimuat.</ErrorText>
          <button type="button" onClick={refresh} className={GHOST}>
            <RotateCw size={12} aria-hidden="true" />
            Coba lagi
          </button>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-2 space-y-1">
          {errors.map((line) => (
            <ErrorText key={line}>{line}</ErrorText>
          ))}
        </div>
      )}
    </ToolResult>
    {scheduling && <ScheduleCard sessionId={context.sessionId} messageId={context.messageId} cardId={cardId} />}
    </div>
  )
}

function BulkRow({
  item,
  status,
  onRetried,
}: {
  item: BulkItem
  status: BulkStatus | null
  /** Polls again, so the retried job's new stage shows up and keeps moving. */
  onRetried: () => void
}) {
  const [retrying, startRetry] = useTransition()
  const [retryError, setRetryError] = useState<string | null>(null)
  const stage = status ? BULK_STAGES[status.stage] : null
  const retryable = status?.stage === 'failed' || status?.stage === 'cancelled'

  const retry = () => {
    setRetryError(null)
    startRetry(async () => {
      setRetryError(await retryContentJobAction(item.postId).catch(() => FAILED))
      onRetried()
    })
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
          <span className={`mt-0.5 flex items-center gap-1.5 text-xs ${stage?.tone ?? 'text-ink-muted'}`}>
            {(!stage || stage.spin) && <LoaderCircle size={12} className="shrink-0 animate-spin" aria-hidden="true" />}
            {status?.stage === 'done' && <Check size={12} className="shrink-0" aria-hidden="true" />}
            {status?.stage === 'failed' && <CircleAlert size={12} className="shrink-0" aria-hidden="true" />}
            <span className="min-w-0">
              {!status ? 'Memuat status…' : status.stage === 'failed' && status.error ? `Gagal: ${status.error}` : stage?.text}
            </span>
          </span>
          {status?.stage === 'done' && status.failedSlides > 0 && (
            <span className="mt-0.5 block text-xs text-amber-700">{status.failedSlides} slide gagal, ulangi di Buat.</span>
          )}
        </span>
        {status?.stage === 'done' && (
          <Link href={`/buat?id=${item.postId}`} className={LINK}>
            Lihat konten
            <ExternalLink size={12} aria-hidden="true" />
          </Link>
        )}
        {status?.stage === 'review' && (
          <Link href={`/buat?id=${item.postId}`} className={LINK}>
            Buka di Buat
            <ExternalLink size={12} aria-hidden="true" />
          </Link>
        )}
        {retryable && (
          <button type="button" disabled={retrying} onClick={retry} className={`${GHOST} -my-1 shrink-0`}>
            {retrying ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> : <RotateCw size={12} aria-hidden="true" />}
            Coba lagi
          </button>
        )}
      </div>
      {retryError && (
        <div className="mt-1">
          <ErrorText>{retryError}</ErrorText>
        </div>
      )}
    </li>
  )
}

const CONFIRM_STATES = {
  saved: { text: 'Tersimpan', className: 'bg-emerald-50 text-emerald-700' },
  cancelled: { text: 'Dibatalkan', className: 'bg-zinc-100 text-ink-muted' },
} as const

/** Sigap's proposal that writes to the account: nothing is saved until the owner picks Simpan. */
function ToolConfirmCard({ part, context }: { part: Extract<ChatPart, { type: 'confirm' }>; context: CardContext }) {
  const [pending, setPending] = useState<'accept' | 'cancel' | null>(null)
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { sessionId, messageId } = context
  const where = part.kind === 'strategy' ? { href: '/brand', label: 'Lihat di Brand' } : { href: '/balasan', label: 'Lihat di Balasan' }

  const resolve = (accept: boolean) => {
    if (!sessionId) return
    setPending(accept ? 'accept' : 'cancel')
    startTransition(async () => {
      setError(await resolveConfirmAction(sessionId, messageId, part.id, accept).catch(() => FAILED))
      setPending(null)
    })
  }

  return (
    <section className="rounded-2xl border border-accent/30 bg-paper">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <h3 className="text-sm font-semibold text-ink">{part.title}</h3>
        {part.state !== 'pending' && (
          <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-medium ${CONFIRM_STATES[part.state].className}`}>
            {CONFIRM_STATES[part.state].text}
          </span>
        )}
      </div>
      <ul className="space-y-1 px-4 py-3 text-sm text-ink">
        {part.lines.map((line) => (
          <li key={line} className="break-words">
            {line}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3">
        {part.state === 'pending' ? (
          <>
            <button type="button" disabled={pending !== null || !sessionId} onClick={() => resolve(true)} className={PRIMARY}>
              {pending === 'accept' && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
              Simpan
            </button>
            <button type="button" disabled={pending !== null || !sessionId} onClick={() => resolve(false)} className={GHOST}>
              Batal
            </button>
            <span className="text-xs text-ink-muted">Belum tersimpan sampai kamu memilih Simpan.</span>
          </>
        ) : part.state === 'saved' ? (
          <Link href={where.href} className="text-xs font-medium text-accent hover:underline">
            {where.label}
          </Link>
        ) : (
          <span className="text-xs text-ink-muted">Tidak ada yang diubah.</span>
        )}
      </div>
      {error && (
        <div className="px-4 pb-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </section>
  )
}
