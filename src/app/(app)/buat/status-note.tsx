'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Notice } from '@/components/notice'
import { PendingSubmit } from '@/components/pending-submit'
import { formatDateTime, formatTime } from '@/lib/format'
import type { PostStory } from '@/lib/post-stories'
import type { PostThreads } from '@/lib/post-threads'
import type { Post } from '@/lib/posts'
import { retryStoryAction } from './actions'

const LINK = 'font-medium text-ink underline'

/** What the owner should know about the post's publishing state, above the editor. */
export function StatusNote({ post }: { post: Post }) {
  return (
    <>
      <PostNote post={post} />
      {/* A post for Threads only shows Threads on the post itself. */}
      {post.instagramEnabled && post.threads?.enabled && <ThreadsNote post={post} threads={post.threads} />}
      {post.instagramEnabled && post.story?.enabled && <StoryNote post={post} story={post.story} />}
    </>
  )
}

/** The post's own state: Instagram's, or Threads' for a post that goes to Threads only. */
function PostNote({ post }: { post: Post }) {
  const t = useTranslations('editor.statusNote')
  const locale = useLocale()

  const where = post.instagramEnabled ? 'Instagram' : 'Threads'
  const permalink = post.instagramEnabled ? post.permalink : (post.threads?.permalink ?? null)
  const lockedNote = (
    <Notice tone="warning">
       {t('message1')} </Notice>
  )

  switch (post.status) {
    case 'scheduled':
      if (post.lastError && post.nextAttemptAt) {
        return (
          <Notice tone="warning">
             {t('message2')}{post.attemptCount} {t('failed')} {' '}{post.lastError.replace(/[^.!?]$/, '$&.')}  {t('message3')}{' '}
            {formatTime(post.nextAttemptAt, locale)} WIB.
          </Notice>
        )
      }
      return post.scheduledAt ? <p className="text-sm text-ink-muted">{t('published')} {' '}{formatDateTime(post.scheduledAt, locale)}.</p> : null
    case 'publishing':
      return <p className="text-sm text-ink-muted">{t('publishing')}</p>
    case 'published':
      return (
        <p className="text-sm text-ink-muted">
          {t('published')} {' '}{post.publishedAt ? formatDateTime(post.publishedAt, locale) : ''}.{' '}
          {permalink ? (
            <a href={permalink} target="_blank" rel="noreferrer" className={LINK}>
               {t('message4')} {where}
            </a>
          ) : (
            t('message5', { v0: where })
          )}
        </p>
      )
    case 'failed':
      return (
        <div className="space-y-2">
          <Notice tone="error">{post.lastError ?? t('message6')}</Notice>
          {post.isLocked && lockedNote}
        </div>
      )
    case 'cancelled':
      return post.isLocked ? lockedNote : null
    default:
      return null
  }
}

/** The Threads version of a post that also goes to Instagram: it publishes on its own. */
function ThreadsNote({ post, threads }: { post: Post; threads: PostThreads }) {
  const t = useTranslations('editor.statusNote')
  const locale = useLocale()

  switch (threads.status) {
    case 'pending':
      if (threads.lastError && threads.nextAttemptAt) {
        return (
          <Notice tone="warning">
             {t('message7')}{threads.attemptCount} {t('failed')} {' '}{threads.lastError.replace(/[^.!?]$/, '$&.')}  {t('message3')} {formatTime(threads.nextAttemptAt, locale)} WIB.
          </Notice>
        )
      }
      if (threads.dueAt) return <p className="text-sm text-ink-muted">{t('threadsPublished')} {' '}{formatDateTime(threads.dueAt, locale)}.</p>
      return post.status === 'published' || post.status === 'failed' ? (
        <p className="text-sm text-ink-muted">{t('threadsReady')}</p>
      ) : (
        <p className="text-sm text-ink-muted">{t('threadsScheduled')}</p>
      )
    case 'publishing':
      return <p className="text-sm text-ink-muted">{t('threadsPublishing')}</p>
    case 'published':
      return (
        <p className="text-sm text-ink-muted">
          {t('publishedThreads')} {' '}{threads.publishedAt ? formatDateTime(threads.publishedAt, locale) : ''}.{' '}
          {threads.permalink && (
            <a href={threads.permalink} target="_blank" rel="noreferrer" className={LINK}>
               {t('message8')} </a>
          )}
        </p>
      )
    case 'failed':
      return <Notice tone="error">Threads: {threads.lastError ?? t('message9')}</Notice>
    default:
      return null
  }
}

/** The Story of the first slide: it goes out after the feed post and fails on its own. */
function StoryNote({ post, story }: { post: Post; story: PostStory }) {
  const t = useTranslations('editor.statusNote')

  switch (story.status) {
    case 'pending':
      if (post.status !== 'published') {
        return <p className="text-sm text-ink-muted">{t('storyReady')}</p>
      }
      return (
        <p className="text-sm text-ink-muted">
          {story.lastError ? t('message10', { v0: story.lastError.replace(/[^.!?]$/, '$&.') }) : t('message11')}
        </p>
      )
    case 'publishing':
      return <p className="text-sm text-ink-muted">{t('storyPublishing')}</p>
    case 'published':
      return <p className="text-sm text-ink-muted">{t('storyPublished')}</p>
    case 'failed':
      // Not a Notice: its <p> can't hold the Coba lagi form.
      return (
        <div role="alert" className="flex flex-wrap items-center gap-x-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{t('message12')} {story.lastError ?? t('message13')}</span>
          {post.status === 'published' && (
            <form action={retryStoryAction}>
              <input type="hidden" name="id" value={post.id} />
              <PendingSubmit pendingLabel={t('message14')} className="font-medium underline disabled:opacity-60">
                 {t('message15')} </PendingSubmit>
            </form>
          )}
        </div>
      )
    default:
      return null
  }
}
