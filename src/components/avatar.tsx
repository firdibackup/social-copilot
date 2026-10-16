import { MediaImage } from './media-image'

interface AvatarProps {
  /** A signed logo URL; without one the avatar shows the name's first letter. */
  src: string | null
  name: string
  className?: string
}

/** A round brand mark, for the sidebar's workspace and the post mockup. */
export function Avatar({ src, name, className = 'size-10' }: AvatarProps) {
  if (src) {
    return <MediaImage src={src} alt="" className={`${className} shrink-0 rounded-full border border-hairline bg-white object-contain`} />
  }
  const initial = name.replace(/^@/, '').trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent`}
    >
      {initial}
    </span>
  )
}
