import { Notice } from '@/components/notice'
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
  const where = post.instagramEnabled ? 'Instagram' : 'Threads'
  const permalink = post.instagramEnabled ? post.permalink : (post.threads?.permalink ?? null)
  const lockedNote = (
    <Notice tone="warning">
      Status percobaan terakhir belum pasti, jadi isi post dikunci agar tidak terbit dua kali. Pilih Coba lagi (worker
      memeriksa Instagram dulu) atau Duplikat untuk mengedit salinannya.
    </Notice>
  )

  switch (post.status) {
    case 'scheduled':
      if (post.lastError && post.nextAttemptAt) {
        return (
          <Notice tone="warning">
            Percobaan ke-{post.attemptCount} gagal: {post.lastError.replace(/[^.!?]$/, '$&.')} Dicoba lagi pukul{' '}
            {formatTime(post.nextAttemptAt)} WIB.
          </Notice>
        )
      }
      return post.scheduledAt ? <p className="text-sm text-ink-muted">Terbit {formatDateTime(post.scheduledAt)}.</p> : null
    case 'publishing':
      return <p className="text-sm text-ink-muted">Worker sedang menerbitkan post ini.</p>
    case 'published':
      return (
        <p className="text-sm text-ink-muted">
          Terbit {post.publishedAt ? formatDateTime(post.publishedAt) : ''}.{' '}
          {permalink ? (
            <a href={permalink} target="_blank" rel="noreferrer" className={LINK}>
              Lihat di {where}
            </a>
          ) : (
            `Link ${where} tidak tersedia.`
          )}
        </p>
      )
    case 'failed':
      return (
        <div className="space-y-2">
          <Notice tone="error">{post.lastError ?? 'Post gagal terbit.'}</Notice>
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
  switch (threads.status) {
    case 'pending':
      if (threads.lastError && threads.nextAttemptAt) {
        return (
          <Notice tone="warning">
            Threads: percobaan ke-{threads.attemptCount} gagal: {threads.lastError.replace(/[^.!?]$/, '$&.')} Dicoba lagi
            pukul {formatTime(threads.nextAttemptAt)} WIB.
          </Notice>
        )
      }
      if (threads.dueAt) return <p className="text-sm text-ink-muted">Threads ikut terbit {formatDateTime(threads.dueAt)}.</p>
      return post.status === 'published' || post.status === 'failed' ? (
        <p className="text-sm text-ink-muted">Versi Threads belum terbit. Pilih Terbitkan ke Threads di menu ⋯.</p>
      ) : (
        <p className="text-sm text-ink-muted">Threads ikut terbit saat post dijadwalkan.</p>
      )
    case 'publishing':
      return <p className="text-sm text-ink-muted">Worker sedang menerbitkan versi Threads.</p>
    case 'published':
      return (
        <p className="text-sm text-ink-muted">
          Terbit di Threads {threads.publishedAt ? formatDateTime(threads.publishedAt) : ''}.{' '}
          {threads.permalink && (
            <a href={threads.permalink} target="_blank" rel="noreferrer" className={LINK}>
              Lihat di Threads
            </a>
          )}
        </p>
      )
    case 'failed':
      return <Notice tone="error">Threads: {threads.lastError ?? 'Post gagal terbit di Threads.'}</Notice>
    default:
      return null
  }
}

/** The Story of the first slide: it goes out after the feed post and fails on its own. */
function StoryNote({ post, story }: { post: Post; story: PostStory }) {
  switch (story.status) {
    case 'pending':
      if (post.status !== 'published') {
        return <p className="text-sm text-ink-muted">Slide pertama ikut dibagikan ke Story setelah post terbit.</p>
      }
      return (
        <p className="text-sm text-ink-muted">
          {story.lastError ? `Story: ${story.lastError.replace(/[^.!?]$/, '$&.')} Dicoba lagi sebentar lagi.` : 'Story menunggu giliran terbit.'}
        </p>
      )
    case 'publishing':
      return <p className="text-sm text-ink-muted">Worker sedang membagikan slide pertama ke Story.</p>
    case 'published':
      return <p className="text-sm text-ink-muted">Story terbit.</p>
    case 'failed':
      // Not a Notice: its <p> can't hold the Coba lagi form.
      return (
        <div role="alert" className="flex flex-wrap items-center gap-x-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>Story gagal: {story.lastError ?? 'Story tidak terbit.'}</span>
          {post.status === 'published' && (
            <form action={retryStoryAction}>
              <input type="hidden" name="id" value={post.id} />
              <button type="submit" className="font-medium underline">
                Coba lagi
              </button>
            </form>
          )}
        </div>
      )
    default:
      return null
  }
}
