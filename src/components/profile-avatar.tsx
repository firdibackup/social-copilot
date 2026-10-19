'use client'

import { useState } from 'react'

interface ProfileAvatarProps {
  /** A signed Instagram CDN link, which expires: on error, or without one, the name's initial shows. */
  src: string | null
  name: string
  className?: string
}

/** A customer's round profile picture in Balasan and the bell. */
export function ProfileAvatar({ src, name, className = 'size-10' }: ProfileAvatarProps) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${className} shrink-0 rounded-full border border-hairline bg-zinc-100 object-cover`}
      />
    )
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
