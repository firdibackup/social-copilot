import { useId } from 'react'
import type { NavIconProps } from './nav-items'

const INK = '#1e1b4b'
/** The view is cropped to the body (17.6 of 24 units) so the face reads at 18 px; lines shrink to match the line icons. */
const CROP = 17.6 / 24
const BODY = 'M8.6 4.2 C11 3.8 13 3.8 15.4 4.2 C18.6 4.7 19.9 6.6 19.9 9.6 L19.9 14.6 C19.9 17.8 18.4 19.6 15.4 19.7 L8.6 19.8 C5.6 19.8 4.1 18.2 4.1 15 L4.1 9.5 C4.1 6.6 5.4 4.7 8.6 4.2 Z'

/**
 * Mimo as a 24-unit menu icon, beside the line icons: drawn in their line colour, in full colour on its own page or
 * when hovered, where it also tips its head and smiles with its eyes (CSS in globals.css). It always has a mouth.
 */
export function MimoIcon({ size = 24, strokeWidth = 1.75, className = '' }: NavIconProps) {
  const id = useId()
  const face = (color: string) => (
    <>
      <g className="i-eyes" fill={color}>
        <ellipse cx="9.6" cy="11.4" rx="1.25" ry="1.85" />
        <ellipse cx="14.4" cy="11.4" rx="1.25" ry="1.85" />
      </g>
      <g className="i-glad" stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none">
        <path d="M8.3 12 Q9.6 10.2 10.9 12" />
        <path d="M13.1 12 Q14.4 10.2 15.7 12" />
      </g>
      <path d="M10.6 15 Q12 16.3 13.4 15" stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </>
  )

  return (
    <svg
      className={`mimo-icon ${className}`}
      viewBox="3.2 3 17.6 17.6"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-body`} x1=".05" y1="0" x2=".95" y2="1">
          <stop stopColor="#c9c2ff" />
          <stop offset=".35" stopColor="#8f84ff" />
          <stop offset="1" stopColor="#4b3fd6" />
        </linearGradient>
      </defs>
      <g className="i-line">
        <path d={BODY} fill="none" stroke="currentColor" strokeWidth={strokeWidth * CROP} strokeLinejoin="round" />
        {face('currentColor')}
      </g>
      <g className="i-color">
        <path d={BODY} fill={`url(#${id}-body)`} />
        {face(INK)}
      </g>
    </svg>
  )
}
