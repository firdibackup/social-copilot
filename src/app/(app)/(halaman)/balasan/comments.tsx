import { getLocale, getTranslations } from 'next-intl/server'
import { ArrowLeft, ExternalLink, MessageSquare } from 'lucide-react'
import { PendingLink } from './pending-link'
import { ExternalImage } from '@/components/media-image'
import {
  listCommentPosts,
  listPostComments,
  listRecentComments,
  type CommentPost,
  type StoredComment,
} from '@/lib/comments'
import { formatListTime, formatShortDateTime } from '@/lib/format'
import {
  canPrivateReply,
  COMMENT_DAYS,
  isCommentUnanswered,
  summarizePosts,
  threadComments,
  type PostCommentSummary,
} from '@/lib/inbox-rules'
import { CommentItem, type CommentPlatform, type CommentView } from './comment-item'
import { MarkPostSeen } from './controls'
import type { Brand, Filter } from './inbox'

const DAY_MS = 24 * 60 * 60 * 1000
const CARD = 'overflow-hidden rounded-xl border border-zinc-200 bg-white'

/** The Komentar tab: Instagram comments, or replies under the account's Threads posts (`platform=threads`). */
export function commentsHref(filter: Filter, mediaId?: string, platform: CommentPlatform = 'instagram'): string {
  const params = new URLSearchParams({ tab: 'komentar' })
  if (platform === 'threads') params.set('platform', 'threads')
  if (filter === 'semua') params.set('filter', 'semua')
  if (mediaId) params.set('post', mediaId)
  return `/balasan?${params.toString()}`
}

interface PostRow extends PostCommentSummary {
  post: CommentPost | null
}

export type CommentsData =
  | { view: 'posts'; posts: PostRow[] }
  | { view: 'post'; mediaId: string; post: CommentPost | null; comments: StoredComment[] }

/** The post list, or one post's comments. Throws on a database error; the page shows the notice. */
export async function loadComments(
  userId: string,
  accountId: string,
  filter: Filter,
  mediaId: string | undefined,
  now: Date,
): Promise<CommentsData> {
  if (mediaId) {
    const [comments, posts] = await Promise.all([
      listPostComments(userId, accountId, mediaId),
      listCommentPosts(userId, [mediaId]),
    ])
    return { view: 'post', mediaId, post: posts.get(mediaId) ?? null, comments }
  }
  const comments = await listRecentComments(userId, accountId, new Date(now.getTime() - COMMENT_DAYS * DAY_MS))
  const summaries = summarizePosts(comments).filter((summary) => filter === 'semua' || summary.unanswered > 0)
  const posts = await listCommentPosts(
    userId,
    summaries.map((summary) => summary.mediaId),
  )
  return { view: 'posts', posts: summaries.map((summary) => ({ ...summary, post: posts.get(summary.mediaId) ?? null })) }
}

const firstLine = (caption: string) => caption.split('\n', 1)[0].trim()

interface CommentsProps {
  data: CommentsData
  filter: Filter
  brand: Brand
  now: Date
  /** Quick replies above the reply box. */
}

export async function Comments({ data, filter, brand, now }: CommentsProps) {
  const t = await getTranslations('inbox.comments')
  const locale = await getLocale()
  if (data.view === 'post') return <PostComments data={data} filter={filter} brand={brand} now={now} />
  if (data.posts.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        {filter === 'belum'
          ? t('noneWaiting', { days: COMMENT_DAYS })
          : t('noneRecent', { days: COMMENT_DAYS })}
      </p>
    )
  }
  return (
    <ul className={`${CARD} divide-y divide-zinc-100`}>
      {data.posts.map((row) => (
        <li key={row.mediaId}>
          <PendingLink
            href={commentsHref(filter, row.mediaId)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50"
          >
            <PostThumbnail post={row.post} />
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className={`block truncate text-sm text-zinc-900 ${row.unread > 0 ? 'font-semibold' : 'font-medium'}`}>
                {(row.post && firstLine(row.post.caption)) || t('postWithoutACaption')}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                <span>{t('commentCount', { count: row.total })}</span>
                {row.unanswered > 0 && <span className="font-medium text-accent-deep">{t('unansweredCount', { count: row.unanswered })}</span>}
                {row.unread > 0 && (
                  <span className="inline-flex items-center gap-1 font-medium text-blue-600">
                    <span className="size-2 rounded-full bg-blue-500" aria-hidden="true" />
                    {t('newCount', { count: row.unread })}
                  </span>
                )}
              </span>
            </span>
            <time dateTime={row.lastCommentAt.toISOString()} className="shrink-0 self-start text-xs text-zinc-500">
              {formatListTime(row.lastCommentAt, now, locale)}
            </time>
          </PendingLink>
        </li>
      ))}
    </ul>
  )
}

export function PostThumbnail({ post, size = 'size-12' }: { post: CommentPost | null; size?: string }) {
  return (
    <span className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 text-zinc-400`}>
      {post?.thumbnailUrl ? (
        <ExternalImage src={post.thumbnailUrl} className="size-full object-cover" />
      ) : (
        <MessageSquare size={18} aria-hidden="true" />
      )}
    </span>
  )
}

function toView(comment: StoredComment, now: Date, locale: import('@/i18n/locale-config').Locale, anonymous: string): CommentView {
  return {
    commentId: comment.commentId,
    name: comment.username ? `@${comment.username}` : anonymous,
    text: comment.text,
    at: comment.createdAt.toISOString(),
    atLabel: formatShortDateTime(comment.createdAt, locale),
    isHidden: comment.isHidden,
    isFromOwner: comment.isFromOwner,
    isUnanswered: isCommentUnanswered(comment),
    dmSent: comment.dmSentAt !== null,
    canDm: canPrivateReply(comment, now),
  }
}

async function PostComments({
  data,
  filter,
  brand,
  now,
}: {
  data: Extract<CommentsData, { view: 'post' }>
  filter: Filter
  brand: Brand
  now: Date
}) {
  const t = await getTranslations('inbox.comments')
  const locale = await getLocale()
  const threads = threadComments(data.comments)
  return (
    <section aria-label={t('postComments')} className="space-y-3">
      <MarkPostSeen mediaId={data.mediaId} />
      <PendingLink
        href={commentsHref(filter)}
        className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {t('allPosts')}
        </PendingLink>
      <div className={`${CARD} flex items-start gap-3 p-4`}>
        <PostThumbnail post={data.post} size="size-16" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="line-clamp-3 text-sm whitespace-pre-line text-zinc-900">
            {data.post?.caption || <span className="text-zinc-400">{t('noCaption')}</span>}
          </p>
          {data.post?.permalink && (
            <a
              href={data.post.permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
               {t('openOnInstagram')} <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      {threads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          {t('noSavedCommentsForThisPostYet')}
          </p>
      ) : (
        <ul className={`${CARD} divide-y divide-zinc-100`}>
          {threads.map(({ comment, replies }) => (
            <CommentItem
              key={comment.commentId}
              comment={toView(comment, now, locale, t('instagramUser'))}
              replies={replies.map((reply) => toView(reply, now, locale, t('instagramUser')))}
              brand={brand}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
