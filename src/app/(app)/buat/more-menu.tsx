'use client'

import { useLocale, useTranslations } from 'next-intl'
import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '@/../messages/id/editor.json'
import enMessages from '@/../messages/en/editor.json'

import { Ellipsis } from 'lucide-react'
import { alertDialog, confirmDialog } from '@/components/confirm-dialog'
import { PendingSubmit } from '@/components/pending-submit'
import { confirmSubmit } from '@/lib/confirm-submit'
import { useState, useTransition, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Post } from '@/lib/posts'
import { cancelPostAction, deletePostNowAction, duplicatePostAction, publishThreadsNowAction, retryPostAction } from './actions'
import { useEditorScope } from './editor-provider'
import { removePostOptimistically } from './optimistic-events'

const ITEM = 'block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors'

interface MenuFormProps {
  action: (formData: FormData) => Promise<void>
  id: string
  label: string
  confirmMessage?: string
  danger?: boolean
}

function MenuForm({ action, id, label, confirmMessage, danger }: MenuFormProps) {
  const t = useTranslations('editor.moreMenu')

  function confirmFirst(event: FormEvent<HTMLFormElement>) {
    if (!confirmMessage) return
    void confirmSubmit(event, {
      title: confirmMessage.split('?')[0] + '?',
      description: confirmMessage.split('?').slice(1).join('?').trim() || undefined,
      confirmLabel: label,
    })
  }

  return (
    <form action={action} onSubmit={confirmFirst}>
      <input type="hidden" name="id" value={id} />
      <PendingSubmit role="menuitem" pendingLabel={t('message1')}
        className={`${ITEM} ${danger ? 'text-red-600 hover:bg-red-50' : 'text-ink hover:bg-zinc-100'} disabled:opacity-50`}>
        {label}
      </PendingSubmit>
    </form>
  )
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" role="menuitem" className={`${ITEM} text-ink hover:bg-zinc-100`}>
      {label}
    </a>
  )
}

/**
 * Its Instagram schedule already ran (published or failed) while the Threads version failed, or was switched on
 * afterwards: Terbitkan ke Threads sends it on its own.
 */
function canPublishThreads(post: Post): boolean {
  const threads = post.threads
  if (!post.instagramEnabled || !threads?.enabled) return false
  if (post.status !== 'published' && post.status !== 'failed') return false
  return threads.status === 'failed' || (threads.status === 'pending' && threads.dueAt === null)
}

/** Where a deleted post stays: the platforms it already went out on. */
function publishedOn(post: Post, locale: Locale = 'id'): string | null {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'moreMenu' })

  const instagram = post.instagramEnabled && post.status === 'published'
  const threads = post.threads?.status === 'published'
  if (instagram && threads) return t('message2')
  return instagram ? 'Instagram' : threads ? 'Threads' : null
}

interface MoreMenuProps {
  post: Post
  /** Opens Pilih platform. */
  onPlatforms?: () => void
}

/** The ⋯ button: where the post goes, its status changes, a copy, and deleting it. */
export function MoreMenu({ post, onPlatforms }: MoreMenuProps) {
  const t = useTranslations('editor.moreMenu')
  const locale = useLocale()

  const [open, setOpen] = useState(false)
  const [deleting, startDelete] = useTransition()
  const client = useQueryClient()
  const scope = useEditorScope()
  const canRetry = post.status === 'failed' || (post.status === 'cancelled' && post.isLocked)

  async function remove() {
    if (deleting || !(await confirmDialog({
      title: outOn ? t('message3') : t('message4'),
      description: outOn ? t('message5', { v0: outOn }) : t('message6'),
      confirmLabel: t('message7'),
      tone: 'danger',
    }))) return
    setOpen(false)
    startDelete(async () => {
      const restore = await removePostOptimistically(client, scope, post.id)
      // revalidatePath in the action re-renders the list; no second refresh round trip.
      const error = await deletePostNowAction(post.id).catch(() => t('message8'))
      if (error) {
        restore()
        await alertDialog({ title: t('message9'), description: error, tone: 'danger' })
      }
    })
  }
  const outOn = publishedOn(post, locale)

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('message10')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 items-center justify-center rounded-xl border border-hairline bg-white text-ink shadow-[0_1px_3px_-1px_rgba(0,0,0,0.12)] transition-transform hover:scale-105"
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open && (
        <>
          {/* A click anywhere else closes the menu. */}
          <button type="button" aria-label={t('message11')} tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <div
            role="menu"
            className="absolute top-12 left-0 z-40 w-60 animate-fade-in rounded-xl border border-hairline bg-white p-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]"
          >
            {onPlatforms && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onPlatforms()
                }}
                className={`${ITEM} text-ink hover:bg-zinc-100`}
              >
                 {t('message12')} </button>
            )}
            {post.status === 'scheduled' && (
              <MenuForm action={cancelPostAction} id={post.id} label={t('message13')} confirmMessage={t('message14')} />
            )}
            {canRetry && (
              <MenuForm
                action={retryPostAction}
                id={post.id}
                label={t('message15')}
                confirmMessage={t('message16', { v0: post.instagramEnabled ? 'Instagram' : 'Threads' })}
              />
            )}
            {canPublishThreads(post) && (
              <MenuForm
                action={publishThreadsNowAction}
                id={post.id}
                label={post.threads?.status === 'failed' ? t('message17') : t('message18')}
                confirmMessage={t('message19')}
              />
            )}
            <MenuForm action={duplicatePostAction} id={post.id} label={t('message20')} />
            {post.permalink && <MenuLink href={post.permalink} label={t('message21')} />}
            {post.threads?.permalink && <MenuLink href={post.threads.permalink} label={t('message22')} />}
            {post.status !== 'publishing' && post.threads?.status !== 'publishing' && (
              <button type="button" role="menuitem" disabled={deleting} onClick={remove}
                className={`${ITEM} text-red-600 hover:bg-red-50 disabled:opacity-50`}>
                {deleting ? t('message23') : t('message24')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
