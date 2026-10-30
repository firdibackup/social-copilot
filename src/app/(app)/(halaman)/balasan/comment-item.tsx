'use client'

import { EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Notice } from '@/components/notice'
import { COMMENT_MAX_LENGTH, REPLY_MAX_LENGTH } from '@/lib/inbox-rules'
import { THREADS_TEXT_LIMIT } from '@/lib/thread-items'
import {
  deleteCommentAction,
  draftCommentReply,
  privateReplyAction,
  replyToCommentAction,
  setCommentHiddenAction,
} from './comment-actions'
import { Composer } from './composer'
import { draftThreadsReply, replyToThreadsAction, setThreadsHiddenAction } from './threads-actions'

/** A comment as the browser gets it: times already formatted on the server. */
export interface CommentView {
  commentId: string
  name: string
  text: string
  at: string
  atLabel: string
  isHidden: boolean
  isFromOwner: boolean
  isUnanswered: boolean
  dmSent: boolean
  canDm: boolean
  /** Threads hides only top-level replies; false hides the button. */
  canHide?: boolean
}

export type CommentPlatform = 'instagram' | 'threads'

const ACTION = 'text-xs font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-50'
const FAILED = 'Gagal menghubungi server. Coba lagi.'

/** What a reply does on each platform: Instagram comments, or replies under the account's Threads posts. */
const REPLY = {
  instagram: {
    send: replyToCommentAction,
    hide: setCommentHiddenAction,
    draft: (id: string, text: string) => draftCommentReply(id, 'comment', text),
    maxLength: COMMENT_MAX_LENGTH,
  },
  threads: {
    send: replyToThreadsAction,
    hide: setThreadsHiddenAction,
    draft: (id: string, text: string) => draftThreadsReply(id, text),
    maxLength: THREADS_TEXT_LIMIT,
  },
} as const

interface CommentItemProps {
  comment: CommentView
  replies: CommentView[]
  brand: { name: string; logoUrl: string | null }
  platform?: CommentPlatform
}

export function CommentItem({ comment, replies, brand, platform = 'instagram' }: CommentItemProps) {
  const [removed, setRemoved] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  if (removed) return null
  return (
    <li className="space-y-3 px-4 py-4">
      {removeError && <Notice tone="error">{removeError}</Notice>}
      <CommentBody
        comment={comment}
        brand={brand}
        platform={platform}
        onRemoved={() => { setRemoveError(null); setRemoved(true) }}
        onRestore={(error) => { setRemoveError(error); setRemoved(false) }}
      />
      {replies.length > 0 && (
        <ul className="space-y-3 border-l-2 border-zinc-100 pl-4">
          {replies.map((reply) => (
            <li key={reply.commentId}>
              <CommentBody comment={reply} brand={brand} platform={platform} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

interface CommentBodyProps {
  comment: CommentView
  brand: CommentItemProps['brand']
  platform: CommentPlatform
  onRemoved?: () => void
  onRestore?: (error: string) => void
}

function CommentBody({ comment, brand, platform, onRemoved, onRestore }: CommentBodyProps) {
  const [mode, setMode] = useState<'reply' | 'dm' | null>(null)
  const [hidden, setHidden] = useState(comment.isHidden)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actions = REPLY[platform]
  const isInstagram = platform === 'instagram'

  async function run(action: () => Promise<string | null>) {
    setPending(true)
    setError(null)
    const failure = await action().catch(() => FAILED)
    setError(failure)
    setPending(false)
    return failure
  }

  function toggleHidden() {
    const next = !hidden
    setHidden(next)
    void run(() => actions.hide(comment.commentId, next)).then((failure) => {
      if (failure) setHidden(!next)
    })
  }

  async function remove() {
    if (!window.confirm('Hapus komentar ini dari Instagram? Balasan di bawahnya ikut terhapus.')) return
    onRemoved?.()
    const failure = await deleteCommentAction(comment.commentId).catch(() => FAILED)
    if (failure) onRestore?.(failure)
  }

  return (
    <div className="space-y-2">
      <div className={hidden ? 'opacity-60' : undefined}>
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium text-zinc-900">{comment.isFromOwner ? `${comment.name} (kamu)` : comment.name}</span>
          <time dateTime={comment.at} className="text-xs text-zinc-500">
            {comment.atLabel}
          </time>
          {hidden && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              <EyeOff size={12} aria-hidden="true" />
              Disembunyikan
            </span>
          )}
          {comment.isUnanswered && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-deep">
              Belum dibales
            </span>
          )}
          {comment.dmSent && <span className="text-xs text-zinc-500">· Dibalas lewat DM</span>}
        </p>
        <p className="text-sm whitespace-pre-line text-zinc-800">{comment.text || '(kosong)'}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" onClick={() => setMode(mode === 'reply' ? null : 'reply')} className={ACTION}>
          Balas
        </button>
        {!comment.isFromOwner && comment.canHide !== false && (
          <button
            type="button"
            onClick={toggleHidden}
            disabled={pending}
            className={ACTION}
          >
            {hidden ? 'Tampilkan' : 'Sembunyikan'}
          </button>
        )}
        {isInstagram && !comment.isFromOwner && (
          <button
            type="button"
            onClick={() => setMode(mode === 'dm' ? null : 'dm')}
            disabled={!comment.canDm}
            title={comment.canDm ? undefined : 'Instagram hanya menerima satu DM per komentar, dalam 7 hari setelah komentar.'}
            className={ACTION}
          >
            Balas lewat DM
          </button>
        )}
        {isInstagram && (
          <button type="button" onClick={remove} disabled={pending} className={`${ACTION} hover:text-red-600`}>
            Hapus
          </button>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {mode === 'reply' && (
        <Composer
          key="reply"
          placeholder="Tulis balasan…"
          maxLength={actions.maxLength}
          brand={brand}
          autoFocus
          send={async (text) => {
            const failure = await actions.send(comment.commentId, text)
            if (!failure) setMode(null)
            return failure
          }}
          draft={(text) => actions.draft(comment.commentId, text)}
        />
      )}
      {mode === 'dm' && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-500">
            DM pribadi ke {comment.name}. Instagram hanya menerima satu DM untuk komentar ini.
          </p>
          <Composer
            key="dm"
            placeholder="Tulis DM…"
            maxLength={REPLY_MAX_LENGTH}
            brand={brand}
            autoFocus
            send={async (text) => {
              const failure = await privateReplyAction(comment.commentId, text)
              if (!failure) setMode(null)
              return failure
            }}
            draft={(text) => draftCommentReply(comment.commentId, 'comment_dm', text)}
          />
        </div>
      )}
    </div>
  )
}
