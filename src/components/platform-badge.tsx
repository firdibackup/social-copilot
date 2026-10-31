import { useTranslations } from 'next-intl'
import { InstagramIcon } from '@/components/instagram-icon'
import { ThreadsIcon } from '@/components/threads-icon'

const SIZES = {
  // Month cells: 14px chips, the pair is 24px wide.
  sm: { chip: 'size-3.5', glyph: 9, overlap: '-ml-1' },
  md: { chip: 'size-4', glyph: 10, overlap: '-ml-1.5' },
} as const

const CHIP = 'relative inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-100 ring-[1.5px] ring-white'

interface PlatformBadgeProps {
  instagram: boolean
  threads: boolean
  /** Text colour of the Threads glyph, e.g. its publish status. */
  threadsTone?: string
  /** Appended to "Threads" in the hover title and screen-reader text, e.g. "gagal". */
  threadsStatus?: string
  size?: keyof typeof SIZES
}

/**
 * Where a post goes: one round chip per platform. A post for both reads as one badge, the
 * Threads chip tucked over the Instagram one like an avatar stack.
 */
export function PlatformBadge({ instagram, threads, threadsTone = 'text-zinc-500', threadsStatus, size = 'md' }: PlatformBadgeProps) {
  const t = useTranslations('common')
  if (!instagram && !threads) return null
  const { chip, glyph, overlap } = SIZES[size]
  const threadsText = threadsStatus ? `Threads ${threadsStatus}` : 'Threads'
  const label = instagram && threads ? t('platform.both', { threads: threadsText }) : instagram ? 'Instagram' : threadsText

  return (
    <span title={label} className="inline-flex shrink-0 items-center">
      {instagram && (
        <span className={`${CHIP} ${chip} text-zinc-600`}>
          <InstagramIcon width={glyph} height={glyph} strokeWidth={2.25} />
        </span>
      )}
      {threads && (
        <span className={`${CHIP} ${chip} ${instagram ? overlap : ''} ${threadsTone}`}>
          <ThreadsIcon size={glyph} strokeWidth={2.5} />
        </span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  )
}
