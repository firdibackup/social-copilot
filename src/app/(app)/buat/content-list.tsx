'use client'

import { useLocale, useTranslations } from 'next-intl'
import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '@/../messages/id/editor.json'
import enMessages from '@/../messages/en/editor.json'

import { Lightbulb, Plus } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { detailQuery } from './editor-query'
import { useEditorScope } from './editor-provider'
import { MediaImage } from '@/components/media-image'
import { formatShortDate, formatTime } from '@/lib/format'
import type { Idea } from '@/lib/ideas'
import type { ContentListItem } from '@/lib/posts'
import { pillarOf, type ContentStrategy } from '@/lib/strategy-options'
import { DeleteIdeaButton, FindIdeasButton, OpenIdeaButton } from './idea-buttons'
import { ContentQueuePoll } from './content-queue-poll'
import { Thumbnail } from './thumbnail'
import { useHiddenPosts } from './optimistic-events'

/** Hover and focus reach past the text, which stays aligned with the section labels. */
const ITEM =
  '-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#f7f7f8] focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:outline-none'
const ACTIVE = 'bg-[#f4f4f5] hover:bg-[#f4f4f5]'

interface ContentListProps {
  posts: ContentListItem[]
  ideas: Idea[]
  strategy: ContentStrategy | null
}

function meta(post: ContentListItem, statusLabel: string, locale: Locale = 'id'): string {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'contentList' })

  const kind = post.slideCount === 1 ? 'Single post' : post.slideCount > 1 ? t('message1', { v0: post.slideCount }) : '0 slide'
  const parts = [post.instagramEnabled ? kind : 'Threads']
  if (post.generation) return post.generation
  if (post.inProgress > 0) parts.push(t('generating'))
  else if (post.status === 'scheduled' && post.scheduledAt) {
    parts.push(t('message2', { v0: formatShortDate(post.scheduledAt, locale), v1: formatTime(post.scheduledAt, locale) }))
  } else if (post.status !== 'draft') parts.push(statusLabel.toLowerCase())
  return parts.join(' · ')
}

/** Buat's left column: the posts still worth editing and the AI's ideas for new ones. */
export function ContentList({ posts, ideas, strategy }: ContentListProps) {
  const t = useTranslations('editor.contentList')
  const statusText = useTranslations('common.postStatus')
  const locale = useLocale()

  const client = useQueryClient()
  const scope = useEditorScope()
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (prefetchTimer.current) clearTimeout(prefetchTimer.current) }, [])
  const prefetch = (id: string) => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current)
    prefetchTimer.current = setTimeout(() => {
      if (client.isFetching({ queryKey: ['editor', scope, 'detail'] }) < 2) void client.prefetchQuery(detailQuery(scope, id, '', locale))
    }, 120)
  }
  const hiddenPosts = useHiddenPosts()
  const [hiddenIdeas, setHiddenIdeas] = useState<Set<string>>(() => new Set())
  const params = useSearchParams()
  const rawSelectedId = params.get('id')
  const selectedId = rawSelectedId && hiddenPosts.has(rawSelectedId) ? null : rawSelectedId
  const selectedIdeaId = params.get('ide')
  const editing = Boolean(selectedId || selectedIdeaId || params.get('baru') || params.get('tanggal') || params.get('slot'))
  const threads = params.get('platform') === 'threads'
  const tab = threads ? '&platform=threads' : ''
  const shown = posts.filter((post) => !hiddenPosts.has(post.id) && (threads ? post.threadsEnabled : post.instagramEnabled))
  const shownIdeas = ideas.filter((idea) => !hiddenIdeas.has(idea.id))
  return (
    <aside aria-label={t('message3')} className={`${editing ? 'hidden md:flex' : 'flex'} min-h-0 w-full shrink-0 flex-col md:w-[320px] md:border-r md:border-hairline`}>
      <ContentQueuePoll posts={posts} />
      <div className="px-4 pt-3 pb-2">
        <Link
          href={`/buat?baru=1${tab}`}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
        >
          <Plus size={16} aria-hidden="true" />
          {threads ? t('message4') : t('message5')}
        </Link>
      </div>
      <div data-content-list-scroll className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-5">
        <ListSection title={t('message6')} count={shown.length}>
          {shown.length === 0 ? (
            <p className="py-2 text-sm text-ink-muted">
              {threads
                ? t('message7')
                : t('message8')}
            </p>
          ) : (
            <ul>
              {shown.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/buat?id=${post.id}${tab}`}
                    onMouseEnter={() => prefetch(post.id)}
                    onFocus={() => prefetch(post.id)}
                    onMouseLeave={() => { if (prefetchTimer.current) clearTimeout(prefetchTimer.current) }}
                    aria-current={post.id === selectedId ? 'page' : undefined}
                    className={`${ITEM} ${post.id === selectedId ? ACTIVE : ''}`}
                  >
                    {post.coverUrl ? (
                      post.coverAssetId ? <Thumbnail id={post.coverAssetId} src={post.coverUrl} size={96} className="size-12 shrink-0 rounded-lg bg-zinc-100 object-cover" />
                        : <MediaImage src={post.coverUrl} className="size-12 shrink-0 rounded-lg bg-zinc-100 object-cover" />
                    ) : (
                      <span className={`size-12 shrink-0 rounded-lg ${post.inProgress > 0 ? 'shimmer' : 'bg-zinc-100'}`} />
                    )}
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[14px] leading-snug font-semibold text-ink">{post.label}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">{meta(post, statusText(post.status), locale)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ListSection>

        <ListSection title={t('message9')} count={shownIdeas.length} action={<FindIdeasButton />}>
          {shownIdeas.length === 0 ? (
            <p className="py-2 text-sm text-ink-muted">{t('emptyIdeas')}</p>
          ) : (
            <ul>
              {shownIdeas.map((idea) => (
                <li key={idea.id} className="group relative">
                  <OpenIdeaButton
                    id={idea.id}
                    ready={idea.script !== null}
                    className={`${ITEM} pr-9 ${idea.id === selectedIdeaId ? ACTIVE : ''}`}
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-hairline bg-white text-ink-muted">
                      <Lightbulb size={18} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] leading-snug font-medium text-ink">{idea.title}</span>
                      {pillarOf(strategy, idea.pillarId) && (
                        <span className="mt-1 inline-flex max-w-full truncate rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] text-ink-muted">
                          {pillarOf(strategy, idea.pillarId)?.name}
                        </span>
                      )}
                      {idea.script && <span className="mt-0.5 block text-xs text-ink-muted">{t('scriptReady', { count: idea.script.length })}</span>}
                    </span>
                  </OpenIdeaButton>
                  <DeleteIdeaButton id={idea.id}
                    hide={() => setHiddenIdeas((current) => new Set(current).add(idea.id))}
                    restore={() => setHiddenIdeas((current) => { const next = new Set(current); next.delete(idea.id); return next })} />
                </li>
              ))}
            </ul>
          )}
        </ListSection>
      </div>
    </aside>
  )
}

function ListSection({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-3 first:mt-0">
      <div className="flex items-center gap-2 border-b border-hairline pt-2 pb-2">
        <h2 className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{title}</h2>
        <span className="text-[11px] text-ink-muted">{count}</span>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="pt-1">{children}</div>
    </section>
  )
}
