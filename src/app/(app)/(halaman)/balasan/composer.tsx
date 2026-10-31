'use client'

import { useTranslations } from 'next-intl'

import { LoaderCircle, Send, Smile, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Avatar } from '@/components/avatar'
import { Notice } from '@/components/notice'
import type { DraftResult } from './action-utils'

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
  /** Sends the text; returns a message for the owner, or null once it is out. */
  send: (text: string) => Promise<string | null>
  /** ✨ AI: a draft from the conversation, or the owner's text tidied. */
  draft: (text: string) => Promise<DraftResult>
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
  send,
  draft,
  autoFocus = false,
}: ComposerProps) {
  const t = useTranslations('inbox.composer')
  const [text, setText] = useState('')
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
    const failure = await send(text).catch(() => t('couldnTSendTryAgain'))
    setBusy(null)
    if (failure) {
      setError(failure)
    } else {
      setText('')
    }
  }

  async function askAi() {
    if (busy) return
    setBusy('ai')
    setError(null)
    const result = await draft(text).catch((): DraftResult => ({ error: t('couldnTReachTheServerTryAgain') }))
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
                aria-label={t('insertEmoji')}
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
              title={text.trim() ? t('polishWithAi1Credit') : t('draftWithAi1Credit')}
              className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-50"
            >
              <Sparkles size={16} aria-hidden="true" className={busy === 'ai' ? 'animate-pulse' : undefined} />
              {busy === 'ai' ? t('writing') : 'AI'}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy !== null || text.trim() === ''}
              aria-label={busy === 'send' ? t('sending') : t('sendCtrlEnter')}
              title={t('sendCtrlEnter')}
              className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-deep disabled:opacity-50"
            >
              {busy === 'send' ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
