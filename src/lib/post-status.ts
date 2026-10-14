export const POST_STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'] as const
export type PostStatus = (typeof POST_STATUSES)[number]

export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  publishing: 'Sedang terbit',
  published: 'Terbit',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
}

const LATE_AFTER_MS = 5 * 60 * 1000

export function isPostStatus(value: unknown): value is PostStatus {
  return POST_STATUSES.some((status) => status === value)
}

interface Schedulable {
  status: PostStatus
  scheduledAt: Date | null
  nextAttemptAt: Date | null
}

/** Still waiting more than 5 minutes after its turn: the worker is probably not running. */
export function isLate(post: Schedulable, now: Date): boolean {
  const due = post.nextAttemptAt ?? post.scheduledAt
  return post.status === 'scheduled' && due !== null && now.getTime() - due.getTime() > LATE_AFTER_MS
}
