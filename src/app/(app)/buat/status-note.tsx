import { Notice } from '@/components/notice'
import { formatDateTime, formatTime } from '@/lib/format'
import type { Post } from '@/lib/posts'

/** What the owner should know about the post's publishing state, above the editor. */
export function StatusNote({ post }: { post: Post }) {
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
          {post.permalink ? (
            <a href={post.permalink} target="_blank" rel="noreferrer" className="font-medium text-ink underline">
              Lihat di Instagram
            </a>
          ) : (
            'Link Instagram tidak tersedia.'
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
