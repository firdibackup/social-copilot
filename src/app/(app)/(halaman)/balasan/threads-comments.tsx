import { ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { formatListTime, formatShortDateTime } from '@/lib/format'
import {
  COMMENT_DAYS,
  commenterName,
  isCommentUnanswered,
  summarizePosts,
  threadComments,
  type PostCommentSummary,
} from '@/lib/inbox-rules'
import {
  listPostThreadsReplies,
  listRecentThreadsReplies,
  listThreadsPosts,
  type StoredThreadsReply,
  type ThreadsPostView,
} from '@/lib/threads-inbox'
import { CommentItem, type CommentTemplates, type CommentView } from './comment-item'
import { commentsHref, PostThumbnail } from './comments'
import { MarkThreadsPostSeen } from './controls'
import type { Brand, Filter } from './inbox'

const DAY_MS = 24 * 60 * 60 * 1000
const CARD = 'overflow-hidden rounded-xl border border-zinc-200 bg-white'
const NUMERIC_ID = /^\d+$/

interface PostRow extends PostCommentSummary {
  post: ThreadsPostView | null
}

export type ThreadsCommentsData =
  | { view: 'posts'; posts: PostRow[] }
  | { view: 'post'; mediaId: string; post: ThreadsPostView | null; replies: StoredThreadsReply[] }

/** The Threads posts with replies, or one post's replies. Throws on a database error; the page shows the notice. */
export async function loadThreadsComments(
  userId: string,
  accountId: string,
  filter: Filter,
  mediaId: string | undefined,
  now: Date,
): Promise<ThreadsCommentsData> {
  if (mediaId && NUMERIC_ID.test(mediaId)) {
    const [replies, posts] = await Promise.all([
      listPostThreadsReplies(userId, accountId, mediaId),
      listThreadsPosts(userId, [mediaId]),
    ])
    return { view: 'post', mediaId, post: posts.get(mediaId) ?? null, replies }
  }
  const replies = await listRecentThreadsReplies(userId, accountId, new Date(now.getTime() - COMMENT_DAYS * DAY_MS))
  const summaries = summarizePosts(replies).filter((summary) => filter === 'semua' || summary.unanswered > 0)
  const posts = await listThreadsPosts(
    userId,
    summaries.map((summary) => summary.mediaId),
  )
  return { view: 'posts', posts: summaries.map((summary) => ({ ...summary, post: posts.get(summary.mediaId) ?? null })) }
}

const firstLine = (text: string) => text.split('\n', 1)[0].trim()

function toView(reply: StoredThreadsReply): CommentView {
  return {
    commentId: reply.commentId,
    name: commenterName(reply),
    text: reply.text,
    at: reply.createdAt.toISOString(),
    atLabel: formatShortDateTime(reply.createdAt),
    isHidden: reply.isHidden,
    isFromOwner: reply.isFromOwner,
    isUnanswered: isCommentUnanswered(reply),
    dmSent: false,
    canDm: false,
    // Threads hides a branch from its top-level reply only.
    canHide: reply.parentId === null,
  }
}

interface ThreadsCommentsProps {
  data: ThreadsCommentsData
  filter: Filter
  brand: Brand
  now: Date
  templates?: CommentTemplates
}

export function ThreadsComments({ data, filter, brand, now, templates }: ThreadsCommentsProps) {
  if (data.view === 'post') {
    const threads = threadComments(data.replies)
    return (
      <section aria-label="Balasan post Threads" className="space-y-3">
        <MarkThreadsPostSeen mediaId={data.mediaId} />
        <Link
          href={commentsHref(filter, undefined, 'threads')}
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Semua post Threads
        </Link>
        <div className={`${CARD} flex items-start gap-3 p-4`}>
          <PostThumbnail post={data.post} size="size-16" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="line-clamp-3 text-sm whitespace-pre-line text-zinc-900">
              {data.post?.caption || <span className="text-zinc-400">Tanpa teks</span>}
            </p>
            {data.post?.permalink && (
              <a
                href={data.post.permalink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
              >
                Buka di Threads
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
        {threads.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
            Belum ada balasan tersimpan untuk post ini.
          </p>
        ) : (
          <ul className={`${CARD} divide-y divide-zinc-100`}>
            {threads.map(({ comment, replies }) => (
              <CommentItem
                key={comment.commentId}
                comment={toView(comment)}
                replies={replies.map(toView)}
                brand={brand}
                platform="threads"
                templates={templates}
              />
            ))}
          </ul>
        )}
      </section>
    )
  }

  if (data.posts.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        {filter === 'belum'
          ? `Tidak ada balasan Threads yang menunggu dibalas di post ${COMMENT_DAYS} hari terakhir.`
          : `Belum ada balasan di post Threads ${COMMENT_DAYS} hari terakhir.`}
      </p>
    )
  }
  return (
    <ul className={`${CARD} divide-y divide-zinc-100`}>
      {data.posts.map((row) => (
        <li key={row.mediaId}>
          <Link href={commentsHref(filter, row.mediaId, 'threads')} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
            <PostThumbnail post={row.post} />
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className={`block truncate text-sm text-zinc-900 ${row.unread > 0 ? 'font-semibold' : 'font-medium'}`}>
                {(row.post && firstLine(row.post.caption)) || 'Post Threads tanpa teks'}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                <span>
                  {row.total - row.unanswered}/{row.total} dibales
                </span>
                {row.unanswered > 0 && <span className="font-medium text-accent-deep">{row.unanswered} belum dibales</span>}
                {row.unread > 0 && (
                  <span className="inline-flex items-center gap-1 font-medium text-blue-600">
                    <span className="size-2 rounded-full bg-blue-500" aria-hidden="true" />
                    {row.unread} baru
                  </span>
                )}
              </span>
            </span>
            <time dateTime={row.lastCommentAt.toISOString()} className="shrink-0 self-start text-xs text-zinc-500">
              {formatListTime(row.lastCommentAt, now)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  )
}
