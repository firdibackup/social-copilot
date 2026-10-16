'use client'

import { ArrowUp, LoaderCircle, Plus } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'

interface ComposerProps {
  placeholder: string
  /** What a send costs, e.g. "≈ 6,3% kuota". */
  cost: string | null
  /** Why sending is off right now, shown instead of the cost. */
  blocked: string | null
  /** Set while a request of the editor runs, e.g. "Membuat ulang slide 2…". */
  busyLabel: string | null
  initialText?: string
  /** Opens the photo picker. */
  onAttach?: () => void
  /** True clears the text. */
  onSend: (text: string) => Promise<boolean>
  /** Options above the text: new content's slide count and format, or what the edit is for. */
  children?: ReactNode
}

/** The AI box at the foot of the editor. Enter sends; Shift+Enter is a new line. */
export function Composer({ placeholder, cost, blocked, busyLabel, initialText = '', onAttach, onSend, children }: ComposerProps) {
  const [text, setText] = useState(initialText)
  const [sending, setSending] = useState(false)
  const busy = sending || busyLabel !== null
  const canSend = text.trim() !== '' && !busy && blocked === null

  async function send() {
    if (!canSend) return
    setSending(true)
    try {
      if (await onSend(text.trim())) setText('')
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void send()
  }

  return (
    <div className="rounded-2xl border border-hairline bg-white p-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
      {children && <div className="mb-2 flex flex-wrap items-center gap-2">{children}</div>}
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={1}
        className="block max-h-40 min-h-[43px] w-full resize-none border-0 bg-transparent px-1 text-[13px] leading-relaxed text-ink [field-sizing:content] placeholder:text-ink-soft focus:outline-none"
      />
      <div className="mt-1 flex items-center gap-2">
        {onAttach && (
          <button
            type="button"
            onClick={onAttach}
            aria-label="Tambah foto sendiri"
            title="Tambah foto sendiri"
            className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink"
          >
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        <span role={busy ? 'status' : undefined} className="min-w-0 flex-1 truncate text-xs text-ink-muted">
          {busy ? (busyLabel ?? 'Memproses…') : (blocked ?? cost)}
        </span>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          aria-label="Kirim"
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-colors ${canSend ? 'bg-accent hover:bg-accent-deep' : 'bg-zinc-300'}`}
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}
