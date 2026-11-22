import { useId } from 'react'

/** A lightning bolt stroked in the Carousely signature gradient (violet → blue → cyan → mint → pink). */
export function FastIcon({ className, size = 20 }: { className?: string; size?: number }) {
  const id = `fast-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <defs>
      <linearGradient id={id} x1="4" y1="22" x2="20" y2="2" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#6558f5" />
        <stop offset="0.4" stopColor="#4f7bff" />
        <stop offset="0.7" stopColor="#38c6e6" />
        <stop offset="0.88" stopColor="#7ee3b8" />
        <stop offset="1" stopColor="#f59ac8" />
      </linearGradient>
    </defs>
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" stroke={`url(#${id})`} strokeWidth={2} fill={`url(#${id})`} fillOpacity={0.14} />
  </svg>
}
