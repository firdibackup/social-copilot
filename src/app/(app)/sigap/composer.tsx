'use client'

import { FileText, Image as ImageIcon, Paperclip, Send, X } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import {
  ATTACHMENT_ACCEPT,
  attachmentsProblem,
  checkAttachment,
  DAILY_LIMITS,
  MESSAGE_MAX_LENGTH,
  type AttachmentKind,
} from '@/lib/chat-options'
import { toReferenceJpeg } from '@/lib/image'
import { formatBytes } from './cards'

const ICON_BUTTON =
  'inline-flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink disabled:opacity-50'

/** Text put in the box from outside, e.g. a suggestion; `at` makes the same text count again. */
export interface Draft {
  text: string
  at: number
}

interface Attachment {
  file: File
  kind: AttachmentKind
}

interface ChatComposerProps {
  busy: boolean
  deepSearch: boolean
  onToggleDeepSearch: () => void
  /** True once the message went out: the box clears. */
  onSend: (text: string, files: File[]) => Promise<boolean>
  draft: Draft | null
}

/** Images go as small JPEGs, like design references: the AI needs no more, and the request stays small. */
async function shrink(attachment: Attachment): Promise<File> {
  if (attachment.kind !== 'image') return attachment.file
  const { blob } = await toReferenceJpeg(attachment.file)
  const name = attachment.file.name.replace(/\.[^.]+$/, '') || 'gambar'
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
}

export function ChatComposer({ busy, deepSearch, onToggleDeepSearch, onSend, draft }: ChatComposerProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [seenDraft, setSeenDraft] = useState<Draft | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  if (draft && draft !== seenDraft) {
    setSeenDraft(draft)
    setText(draft.text)
  }

  const disabled = busy || preparing
  const canSend = !disabled && (text.trim() !== '' || attachments.length > 0)

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    const next = [...attachments]
    for (const file of files) {
      const check = checkAttachment(file)
      if ('error' in check) {
        setProblem(check.error)
        return
      }
      next.push({ file, kind: check.kind })
    }
    const tooMany = attachmentsProblem(next.map((attachment) => attachment.kind))
    if (tooMany) {
      setProblem(tooMany)
      return
    }
    setProblem(null)
    setAttachments(next)
  }

  async function submit() {
    if (!canSend) return
    setProblem(null)
    setPreparing(true)
    let files: File[]
    try {
      files = await Promise.all(attachments.map(shrink))
    } catch {
      setPreparing(false)
      setProblem('Gambar tidak bisa dibaca browser. Coba gambar lain.')
      return
    }
    setPreparing(false)
    const sent = text
    const sentAttachments = attachments
    setText('')
    setAttachments([])
    if (!(await onSend(sent.trim(), files))) {
      // Not sent: give the owner their message back.
      setText((current) => current || sent)
      setAttachments((current) => (current.length > 0 ? current : sentAttachments))
    }
    field.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-hairline bg-paper focus-within:border-zinc-400">
        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-3 pt-3">
            {attachments.map((attachment, index) => (
              <AttachmentChip
                key={`${attachment.file.name}-${index}`}
                attachment={attachment}
                onRemove={() => setAttachments(attachments.filter((_, at) => at !== index))}
              />
            ))}
          </ul>
        )}
        <textarea
          ref={field}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder="Tanya Sigap… (Ctrl/⌘ + Enter untuk kirim)"
          aria-label="Pesan untuk Sigap"
          className="block max-h-48 min-h-[3.5rem] w-full resize-y bg-transparent px-3 pt-3 text-sm text-ink placeholder:text-ink-soft focus:outline-none"
        />
        <div className="flex items-center gap-2 px-2 pt-1 pb-2">
          <input ref={picker} type="file" accept={ATTACHMENT_ACCEPT} multiple onChange={pick} className="hidden" />
          <button
            type="button"
            onClick={() => picker.current?.click()}
            disabled={disabled}
            aria-label="Lampirkan gambar atau PDF (maks. 5 MB)"
            title="Lampirkan gambar atau PDF (maks. 5 MB)"
            className={ICON_BUTTON}
          >
            <Paperclip size={18} aria-hidden="true" />
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 text-xs font-medium text-ink-muted select-none hover:bg-zinc-100">
            <span className="relative inline-flex h-4 w-7 shrink-0">
              <input type="checkbox" role="switch" checked={deepSearch} onChange={onToggleDeepSearch} className="peer sr-only" />
              <span className="absolute inset-0 rounded-full bg-zinc-300 transition-colors peer-checked:ai-gradient peer-focus-visible:ring-2 peer-focus-visible:ring-ink/20" />
              <span className="absolute top-0.5 left-0.5 size-3 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-3" />
            </span>
            <span className={deepSearch ? 'ai-gradient-text font-semibold' : undefined}>Intel Kompetitor</span>
          </label>
          <span className="hidden text-[11px] text-ink-soft sm:inline">
            {deepSearch ? `Aktif · ${DAILY_LIMITS.deep_search} riset/hari` : 'Riset akun IG kompetitor'}
          </span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSend}
            aria-label={disabled ? 'Mengirim…' : 'Kirim (Ctrl/⌘ + Enter)'}
            title="Kirim (Ctrl/⌘ + Enter)"
            className="ml-auto inline-flex size-9 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-deep disabled:opacity-50"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {problem && (
        <p role="alert" className="text-xs text-red-700">
          {problem}
        </p>
      )}
    </div>
  )
}

function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const Icon = attachment.kind === 'pdf' ? FileText : ImageIcon
  return (
    <li className="inline-flex max-w-full items-center gap-2 rounded-lg border border-hairline bg-zinc-50 py-1 pr-1 pl-2 text-xs text-ink">
      <Icon
        size={14}
        strokeWidth={1.75}
        className={attachment.kind === 'pdf' ? 'shrink-0 text-red-600' : 'shrink-0 text-accent'}
        aria-hidden="true"
      />
      <span className="max-w-[12rem] truncate font-medium">{attachment.file.name}</span>
      <span className="shrink-0 text-ink-muted">{formatBytes(attachment.file.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Hapus ${attachment.file.name}`}
        className="rounded p-0.5 text-ink-soft hover:bg-zinc-200 hover:text-ink"
      >
        <X size={12} aria-hidden="true" />
      </button>
    </li>
  )
}
