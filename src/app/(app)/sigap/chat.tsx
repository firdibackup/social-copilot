'use client'

import { History, LoaderCircle, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Notice } from '@/components/notice'
import {
  pdfPlaceholder,
  suggestionContext,
  suggestionsFor,
  THINKING_LABEL,
  TOOL_LABELS,
  type ChatEvent,
  type ChatMessageView,
  type ChatPart,
} from '@/lib/chat-options'
import { AttachmentBubble, PartView, type CardContext } from './cards'
import { ChatComposer, type Draft } from './composer'

const FAILED = 'Gagal menghubungi server. Coba lagi.'
const CUT_OFF = 'Koneksi terputus sebelum jawaban selesai. Muat ulang halaman untuk melihat jawabannya.'

interface SigapChatProps {
  sessionId: string | null
  messages: ChatMessageView[]
}

/** The message on its way: shown at once, with what Sigap is doing, until the stored one comes back. */
interface Pending {
  text: string
  parts: ChatPart[]
  tool: string | null
}

/** Reads the route's NDJSON lines as they arrive. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as ChatEvent
    if (done) break
  }
  if (buffer.trim()) yield JSON.parse(buffer) as ChatEvent
}

/**
 * The open conversation with Sigap. Sent messages show from the stream's `done` event until the page's own data has
 * them; opening another conversation starts over, but keeps the Deep Search toggle.
 */
export function SigapChat({ sessionId, messages }: SigapChatProps) {
  const router = useRouter()
  const [received, setReceived] = useState<ChatMessageView[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deepSearch, setDeepSearch] = useState(false)
  const [openId, setOpenId] = useState(sessionId)
  const scroller = useRef<HTMLDivElement>(null)
  /** Synchronous per-conversation guard for two clicks before React commits the pending state. */
  const sending = useRef(new Set<string | null>())
  /** The conversation on screen, for a stream that ends after the owner opened another one. */
  const live = useRef(sessionId)

  useLayoutEffect(() => {
    // Before old async work can paint into a newly committed conversation.
    live.current = sessionId
  }, [sessionId])
  if (openId !== sessionId) {
    setOpenId(sessionId)
    setReceived([])
    setPending(null)
    // The error stays when the first message just opened its conversation (its answer failed to save).
    if (openId !== null) setError(null)
  }

  const known = new Set(messages.map((message) => message.id))
  const shown = [...messages, ...received.filter((message) => !known.has(message.id))]
  const context = pending ? null : suggestionContext(shown)
  const count = shown.length
  const waiting = pending !== null
  const tool = pending?.tool

  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [count, waiting, tool])

  /** Sends one message; true once the route took it (the composer then clears). */
  async function send(text: string, files: File[]): Promise<boolean> {
    const startedIn = sessionId
    if (sending.current.has(startedIn) || pending) return false
    sending.current.add(startedIn)
    const unlock = () => sending.current.delete(startedIn)
    /** Still on the conversation the message went to. */
    const here = () => live.current === startedIn
    setError(null)
    const form = new FormData()
    form.set('text', text)
    if (sessionId) form.set('sessionId', sessionId)
    if (deepSearch) form.set('deepSearch', '1')
    for (const file of files) form.append('files', file)
    const parts: ChatPart[] = files.map((file) => ({
      type: 'attachment',
      kind: file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
      name: file.name,
      size: file.size,
    }))
    setPending({ text, parts, tool: null })

    let response: Response
    try {
      response = await fetch('/api/sigap/chat', { method: 'POST', body: form })
    } catch {
      if (here()) {
        setPending(null)
        setError(FAILED)
        unlock()
        return false
      }
      unlock()
      return true
    }
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      if (here()) {
        setPending(null)
        setError(body?.error ?? FAILED)
        unlock()
        return false
      }
      unlock()
      return true
    }

    let finished = false
    try {
      for await (const event of readEvents(response.body)) {
        // Keep consuming the body after navigation: aborting it can cancel the route before the answer is stored.
        if (!here()) continue
        if (event.type === 'tool') {
          setPending((current) => current && { ...current, tool: event.name })
        } else if (event.type === 'done') {
          finished = true
          setReceived((current) => [...current, event.user, event.assistant])
          setPending(null)
          if (event.created) router.replace(`/sigap?sesi=${event.sessionId}`)
          else router.refresh()
        } else {
          finished = true
          setPending(null)
          setError(event.message)
          if (!sessionId) router.replace(`/sigap?sesi=${event.sessionId}`)
          else router.refresh()
        }
      }
    } catch {
      // A cut connection: the server still stores the answer.
    }
    if (!finished && here()) {
      setPending(null)
      setError(CUT_OFF)
    }
    unlock()
    return true
  }

  const ask = (text: string) => void send(text, [])
  const cardContext = (message: ChatMessageView): CardContext => ({ sessionId, messageId: message.id, ask: pending ? null : ask })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 md:hidden">
        <Link href="/sigap?riwayat=1" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-ink-muted hover:bg-zinc-100">
          <History size={16} aria-hidden="true" />
          Riwayat
        </Link>
        {sessionId && (
          <Link href="/sigap" className="ml-auto inline-flex h-8 items-center rounded-lg px-2 text-sm font-medium text-accent hover:bg-accent-soft">
            Chat baru
          </Link>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
          {shown.length === 0 && !pending && <EmptyState />}
          {shown.map((message) =>
            message.role === 'user' ? (
              <UserMessage key={message.id} content={message.content} parts={message.parts} />
            ) : (
              <AssistantMessage key={message.id} message={message} context={cardContext(message)} />
            ),
          )}
          {pending && (
            <>
              <UserMessage content={pending.text} parts={pending.parts} />
              <ToolCallIndicator tool={pending.tool} />
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-hairline bg-paper">
        <div className="mx-auto w-full max-w-3xl space-y-2 px-4 pt-3 pb-4">
          {context && (
            <SuggestedPrompts
              suggestions={suggestionsFor(context)}
              onPick={(text) => setDraft({ text, at: Date.now() })}
            />
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <ChatComposer
            busy={pending !== null}
            deepSearch={deepSearch}
            onToggleDeepSearch={() => setDeepSearch(!deepSearch)}
            onSend={send}
            draft={draft}
          />
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Sparkles size={22} aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">Halo, saya Sigap</h1>
      <p className="mt-1 max-w-md text-sm text-ink-muted">
        Tanya soal tren, cek konten yang sudah ada, riset akun kompetitor dengan Deep Search, tulis skrip carousel,
        atau rapikan strategi dan Auto DM. Skrip langsung tersimpan sebagai ide di Buat.
      </p>
    </div>
  )
}

/** The owner's text without the PDF's placeholder line, which the file chip already shows. */
function userText(content: string, parts: ChatPart[]): string {
  const placeholders = new Set(
    parts.flatMap((part) => (part.type === 'attachment' && part.kind === 'pdf' ? [pdfPlaceholder(part.name)] : [])),
  )
  return content
    .split('\n')
    .filter((line) => !placeholders.has(line))
    .join('\n')
    .trim()
}

function UserMessage({ content, parts }: { content: string; parts: ChatPart[] }) {
  const text = userText(content, parts)
  const files = parts.flatMap((part) => (part.type === 'attachment' ? [part] : []))
  return (
    <div className="flex flex-col items-end gap-1.5">
      {files.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {files.map((file, index) => (
            <AttachmentBubble key={`${file.name}-${index}`} kind={file.kind} name={file.name} size={file.size} />
          ))}
        </div>
      )}
      {text && (
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 text-sm break-words whitespace-pre-wrap text-ink">
          {text}
        </p>
      )}
    </div>
  )
}

function SigapMark() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
      <Sparkles size={14} />
    </span>
  )
}

function AssistantMessage({ message, context }: { message: ChatMessageView; context: CardContext }) {
  return (
    <div className="flex gap-3">
      <SigapMark />
      <div className="min-w-0 flex-1 space-y-3">
        {message.parts.map((part, index) => (
          <PartView key={index} part={part} context={context} />
        ))}
        {message.content && <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">{message.content}</p>}
      </div>
    </div>
  )
}

/** What Sigap is doing while the answer is on its way. */
function ToolCallIndicator({ tool }: { tool: string | null }) {
  return (
    <div className="flex items-center gap-3" role="status">
      <SigapMark />
      <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
        {(tool && TOOL_LABELS[tool]) || THINKING_LABEL}
      </span>
    </div>
  )
}

function SuggestedPrompts({ suggestions, onPick }: { suggestions: string[]; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Saran pesan">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onPick(suggestion)}
          className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:text-ink"
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
