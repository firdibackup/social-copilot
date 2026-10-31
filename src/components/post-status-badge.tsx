import { useTranslations } from 'next-intl'
import { type PostStatus } from '@/lib/post-status'

export const STATUS_DOT_CLASS: Record<PostStatus, string> = {
  draft: 'bg-zinc-400',
  scheduled: 'bg-sky-500',
  publishing: 'bg-amber-500',
  published: 'bg-emerald-500',
  failed: 'bg-red-500',
  cancelled: 'bg-zinc-300',
}

const BADGE_CLASS: Record<PostStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  scheduled: 'bg-sky-50 text-sky-700',
  publishing: 'bg-amber-50 text-amber-700',
  published: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  cancelled: 'bg-zinc-100 text-zinc-500',
}

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const t = useTranslations('common')
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASS[status]}`}>
      {t(`postStatus.${status}`)}
    </span>
  )
}

export function LateBadge() {
  const t = useTranslations('common')
  return (
    <span
      title={t('late.title')}
      className="inline-flex shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700"
    >
      {t('late.label')}
    </span>
  )
}
