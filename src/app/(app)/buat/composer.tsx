'use client'

import { useLocale, useTranslations } from 'next-intl'
import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '@/../messages/id/editor.json'
import enMessages from '@/../messages/en/editor.json'

import { ArrowUp, ImagePlus, LoaderCircle, X } from 'lucide-react'
import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { MediaImage } from '@/components/media-image'
import { CancelGenerationButton } from '@/components/cancel-generation-button'
import { toReferenceJpeg } from '@/lib/image'

interface ComposerProps {
  placeholder: string
  /** What a send costs, e.g. "≈ 6,3% kuota". */
  cost: string | null
  /** Why sending is off right now, shown instead of the cost. */
  blocked: string | null
  /** Set while a request of the editor runs, e.g. "Membuat ulang slide 2…". */
  busyLabel: string | null
  onCancel?: () => void
  cancelling?: boolean
  /** The text, when the editor holds it, e.g. an idea's script the AI writes into it; the box then never clears it. */
  text?: string
  onTextChange?: (text: string) => void
  /** The text can't be changed, e.g. while the AI writes it. */
  readOnly?: boolean
  /** Draws the text formatted, e.g. as a script. It lies under the plain textarea, so it may change color and stroke only. */
  format?: (text: string) => ReactNode
  /** One image may go along with the request. Off for caption edits, which keep it for when it is on again. */
  canAttach: boolean
  /** The attachment is a JPEG data URL. True clears the text and the attachment. */
  onSend: (text: string, attachment: string | null) => Promise<boolean>
  /** Options above the text: new content's slide count and format, or what the edit is for. */
  children?: ReactNode
}



// One box model for the textarea and the copy under it, so both wrap the same.
const TEXT = 'min-h-[43px] w-full whitespace-pre-wrap break-words px-1 text-[13px] leading-relaxed'

/** What the owner picked or pasted, as a JPEG data URL of at most 1080 px; the server makes it smaller again. */
async function toAttachment(file: File, locale: Locale = 'id'): Promise<string> {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'composer' })

  const { blob } = await toReferenceJpeg(file)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error(t('message1')))
    reader.readAsDataURL(blob)
  })
}

/**
 * The AI box at the foot of the editor, typed like a text editor: Enter is a new line, Ctrl/⌘+Enter or the button
 * sends. One image can go along, picked with the image button or pasted, for the AI to follow or show as the text
 * says.
 */
export function Composer({
  placeholder,
  cost,
  blocked,
  busyLabel,
  onCancel,
  cancelling = false,
  text: heldText,
  onTextChange,
  readOnly = false,
  format,
  canAttach,
  onSend,
  children,
}: ComposerProps) {
  const t = useTranslations('editor.composer')
  const locale = useLocale()

  const SEND_HINT = t('message2')

  const ATTACH_PLACEHOLDER = t('message3')

  const [ownText, setOwnText] = useState('')
  const text = heldText ?? ownText
  const [staged, setStaged] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const sendLock = useRef(false)
  const picker = useRef<HTMLInputElement>(null)
  const attachment = canAttach ? staged : null
  const busy = sending || busyLabel !== null
  const canSend = text.trim() !== '' && !busy && !reading && !readOnly && blocked === null

  function type(next: string) {
    setOwnText(next)
    onTextChange?.(next)
    setAttachError(null)
  }

  async function send() {
    if (!canSend || sendLock.current) return
    sendLock.current = true
    const sent = text.trim()
    const sentAttachment = attachment
    setSending(true)
    try {
      if (await onSend(sent, sentAttachment)) {
        // Only what went out: the box stays live during a long request, and what was added meanwhile stays.
        if (heldText === undefined) setOwnText((current) => (current.trim() === sent ? '' : current))
        if (sentAttachment) setStaged((current) => (current === sentAttachment ? null : current))
      }
    } finally {
      sendLock.current = false
      setSending(false)
    }
  }

  async function attach(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAttachError(t('message4'))
      return
    }
    setReading(true)
    setAttachError(null)
    try {
      setStaged(await toAttachment(file, locale))
    } catch {
      setAttachError(t('message5'))
    } finally {
      setReading(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.nativeEvent.isComposing) return
    event.preventDefault()
    void send()
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!canAttach || readOnly) return
    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'))
    if (!image) return
    // A screenshot comes as an image alone and a copied file with its name as text; text copied from a document
    // can carry a picture of itself, and stays text.
    const pasted = event.clipboardData.getData('text/plain')
    if (pasted && pasted !== image.name) return
    event.preventDefault()
    void attach(image)
  }

  const idle = attachError ?? blocked ?? [cost, SEND_HINT].filter(Boolean).join(' · ')

  return (
    <div className="rounded-2xl border border-hairline bg-white p-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
      {children && <div className="mb-2 flex flex-wrap items-center gap-2">{children}</div>}
      {attachment && (
        <div className="mb-2 flex items-center gap-2">
          <span className="relative shrink-0">
            <MediaImage src={attachment} alt={t('message6')} className="size-14 rounded-lg border border-hairline object-cover" />
            <button
              type="button"
              onClick={() => {
                setStaged(null)
                setAttachError(null)
              }}
              aria-label={t('message7')}
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-white"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
          <span className="text-xs text-ink-muted">{t('message8')}</span>
        </div>
      )}
      <div className="max-h-[30vh] overflow-y-auto md:max-h-[40vh] overscroll-contain [scrollbar-width:thin]">
        <div className="relative">
          {/* Sizes the box to its text, also in browsers without field-sizing, and shows the formatted text. */}
          <div
            aria-hidden="true"
            className={`${TEXT} pointer-events-none ${format ? 'text-ink' : 'invisible'} ${readOnly ? 'opacity-50' : ''}`}
          >
            {format ? format(text) : text}
            {'\u200b'}
          </div>
          <textarea
            value={text}
            onChange={(event) => type(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            readOnly={readOnly}
            placeholder={attachment ? ATTACH_PLACEHOLDER : placeholder}
            aria-label={placeholder}
            className={`${TEXT} absolute inset-0 resize-none overflow-hidden border-0 bg-transparent caret-accent selection:bg-accent/20 placeholder:text-ink-soft focus:outline-none ${format ? 'text-transparent' : 'text-ink'}`}
          />
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        {canAttach && (
          <>
            <button
              type="button"
              onClick={() => picker.current?.click()}
              disabled={reading || readOnly}
              aria-label={t('message9')}
              title={t('message10')}
              className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink disabled:opacity-60"
            >
              {reading ? (
                <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus size={20} strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
            <input
              ref={picker}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void attach(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </>
        )}
        <span
          role={busy ? 'status' : attachError ? 'alert' : undefined}
          className={`min-w-0 flex-1 truncate text-xs ${attachError && !busy ? 'text-red-700' : 'text-ink-muted'}`}
        >
          {busy ? (busyLabel ?? t('message11')) : idle}
        </span>
        {busy && onCancel ? <CancelGenerationButton onClick={onCancel} pending={cancelling} /> : <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          aria-label={t('message12')}
          title={SEND_HINT}
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-colors ${canSend ? 'bg-accent hover:bg-accent-deep' : 'bg-zinc-300'}`}
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
        </button>}
      </div>
    </div>
  )
}
