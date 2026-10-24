import { useId, type SVGProps } from 'react'

/**
 * The Instagram outline glyph (see instagram-icon.tsx) in the brand gradient, with a small AI sparkle on the
 * top-right corner. Marks Riset Instagram/Threads, the flagship feature. The gradient id comes from useId so several
 * icons on one page never share (and break) each other's gradient.
 */
export function InstagramAiIcon(props: SVGProps<SVGSVGElement>) {
  const id = `ig-ai-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const paint = `url(#${id})`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id={id} x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.25" stopColor="#FA7E1E" />
          <stop offset="0.5" stopColor="#D62976" />
          <stop offset="0.75" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <g stroke={paint} strokeWidth={1.9}>
        <rect width="18" height="18" x="2" y="4" rx="5" ry="5" />
        <circle cx="11" cy="13" r="3.6" />
        <line x1="15.6" x2="15.61" y1="8.4" y2="8.4" strokeWidth={2.4} />
      </g>
      {/* AI sparkle, haloed in the surface colour so it reads where it overlaps the frame. */}
      <path
        d="M20 .6Q20.45 3.55 23.4 4 20.45 4.45 20 7.4 19.55 4.45 16.6 4 19.55 3.55 20 .6Z"
        fill={paint}
        stroke="var(--color-paper, #fff)"
        strokeWidth={1.4}
        paintOrder="stroke"
      />
    </svg>
  )
}
