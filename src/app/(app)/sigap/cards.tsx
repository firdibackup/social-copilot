'use client'

import {
  BadgeCheck,
  Check,
  CircleAlert,
  CircleDashed,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  LoaderCircle,
  Search,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition, type ReactNode } from 'react'
import { ExternalImage } from '@/components/media-image'
import { formatCount } from '@/lib/analytics-metrics'
import { analyzeRequest, type ChatPart, type CompetitorView, type ScriptItem } from '@/lib/chat-options'
import { BULLET, slideProblem, type ScriptSlide } from '@/lib/script-options'
import { discardScriptAction, resolveConfirmAction } from './actions'

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
