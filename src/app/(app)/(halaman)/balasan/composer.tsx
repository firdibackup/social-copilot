'use client'

import { Pencil, Send, Smile, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Avatar } from '@/components/avatar'
import { Notice } from '@/components/notice'
import type { DraftResult } from './action-utils'

/** A template already filled in for this conversation. */
export interface TemplateOption {
  id: string
  label: string
  text: string
}

const EMOJIS = [
  '😊', '😁', '😂', '🥰', '😍', '😘', '🤗', '🤩', '😉', '😅',
  '🙏', '👍', '👌', '👏', '🙌', '💪', '🤝', '👋', '✌️', '🫶',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '💕', '✨', '🔥',
  '🎉', '🎁', '⭐', '✅', '📦', '🚚', '💸', '🛍️', '📍', '⏰',
]

const ICON_BUTTON =
  'inline-flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink disabled:opacity-50'

interface ComposerProps {
  placeholder: string
  maxLength: number
  brand: { name: string; logoUrl: string | null }
  initialText?: string
  /** Sends the text; returns a message for the owner, or null once it is out. */
  send: (text: string) => Promise<string | null>
  /** ✨ AI: a draft from the conversation, or the owner's text tidied. */
  draft: (text: string) => Promise<DraftResult>
  /** Template chips above the box; clicking one fills the draft. */
  templates?: TemplateOption[]
  /** ✎ next to the chips: opens Template balasan. */
  onEditTemplates?: () => void
  /** Under the box while the text is still the suggested template. */
  suggestionNote?: ReactNode
  autoFocus?: boolean
}

/**
 * The reply box of DMs and comments. The draft is controlled state sent through the action directly, not a form
 * action: React resets uncontrolled fields after a form action, which would wipe a reply Instagram refused.
 * Enter is a new line; Ctrl/⌘+Enter sends.
 */
export function Composer({
  placeholder,
  maxLength,
  brand,
  initialText = '',
  send,
  draft,
  templates = [],
  onEditTemplates,
  suggestionNote,
  autoFocus = false,
}: ComposerProps) {
  const [text, setText] = useState(initialText)
  const [isSuggested, setIsSuggested] = useState(initialText !== '')
  const [busy, setBusy] = useState<'send' | 'ai' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!emojiOpen) return
    const close = (event: MouseEvent) => {
      if (!picker.current?.contains(event.target as Node)) setEmojiOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [emojiOpen])

  function replaceText(next: string) {
    setText(next.slice(0, maxLength))
    setIsSuggested(false)
    setError(null)
  }

  function insertEmoji(emoji: string) {
    const element = field.current
    const start = element?.selectionStart ?? text.length
    const end = element?.selectionEnd ?? text.length
    if (text.length - (end - start) + emoji.length > maxLength) return
    replaceText(text.slice(0, start) + emoji + text.slice(end))
    setEmojiOpen(false)
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  async function submit() {
    if (busy || text.trim() === '') return
    setBusy('send')
    setError(null)
    const failure = await send(text).catch(() => 'Gagal mengirim. Coba lagi.')
    setBusy(null)
    if (failure) {
      setError(failure)
    } else {
      setText('')
      setIsSuggested(false)
    }
  }

  async function askAi() {
    if (busy) return
    setBusy('ai')
    setError(null)
    const result = await draft(text).catch((): DraftResult => ({ error: 'Gagal menghubungi server. Coba lagi.' }))
    setBusy(null)
    if ('error' in result) {
      setError(result.error)
    } else {
      replaceText(result.draft)
      field.current?.focus()
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <div className="space-y-2">
      {(templates.length > 0 || onEditTemplates) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => replaceText(template.text)}
              title={template.text}
              className="max-w-[14rem] truncate rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-300 hover:text-ink"
            >
              {template.label}
            </button>
          ))}
          {onEditTemplates && (
            <button type="button" onClick={onEditTemplates} aria-label="Atur template" className={ICON_BUTTON}>
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-hairline bg-paper focus-within:border-zinc-400">
        <div className="flex items-start gap-3 px-3 pt-3">
          <Avatar src={brand.logoUrl} name={brand.name} className="size-8" />
          <textarea
            ref={field}
            value={text}
            onChange={(event) => replaceText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-label={placeholder.replace('…', '')}
            autoFocus={autoFocus}
            className="min-h-[4.5rem] w-full flex-1 resize-y bg-transparent text-sm text-ink placeholder:text-ink-soft focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-2 px-3 pt-1 pb-2">
          <span className="text-xs text-ink-soft tabular-nums">
            {text.length}/{maxLength}
          </span>
          <div className="flex items-center gap-1">
            <div ref={picker} className="relative">
              <button
                type="button"
                onClick={() => setEmojiOpen(!emojiOpen)}
                aria-label="Sisipkan emoji"
                aria-expanded={emojiOpen}
                className={ICON_BUTTON}
              >
                <Smile size={18} aria-hidden="true" />
              </button>
              {emojiOpen && (
                <div className="absolute right-0 bottom-full z-20 mb-2 grid w-64 grid-cols-8 gap-0.5 rounded-xl border border-hairline bg-paper p-2 shadow-lg">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="flex size-7 items-center justify-center rounded-md text-lg hover:bg-zinc-100"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={askAi}
              disabled={busy !== null}
              title={text.trim() ? 'Rapikan dengan AI (1 kredit)' : 'Tulis draf dengan AI (1 kredit)'}
              className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-50"
            >
              <Sparkles size={16} aria-hidden="true" className={busy === 'ai' ? 'animate-pulse' : undefined} />
              {busy === 'ai' ? 'Menulis…' : 'AI'}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy !== null || text.trim() === ''}
              aria-label={busy === 'send' ? 'Mengirim…' : 'Kirim (Ctrl/⌘ + Enter)'}
              title="Kirim (Ctrl/⌘ + Enter)"
              className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-deep disabled:opacity-50"
            >
              <Send size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {isSuggested && suggestionNote && <p className="text-xs text-ink-muted">{suggestionNote}</p>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
