import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

/** The official mark from assets/logo assets, cropped to the icon and served from public/brand. */
const MARK_SRC = '/brand/carousely-mark.webp'
/** The loop as a vertical strip of 90 frames at 30fps. */
const LOOP_SPRITE_SRC = '/brand/carousely-loop-sprite.webp'
const LOOP_FRAMES = 90
const LOOP_MS = 3000

interface LogoProps {
  /** Height of the icon in px; the wordmark scales with it. */
  size?: number
  /** Icon only, e.g. tight spaces. The name then goes to screen readers. */
  iconOnly?: boolean
  className?: string
}

/** Icon plus the Bricolage wordmark, dark on light surfaces. */
export function CarouselyLogo({ size = 28, iconOnly = false, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-[0.4em] ${className}`} style={{ fontSize: size * 0.72 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK_SRC} alt={iconOnly ? 'Carousely' : ''} width={size} height={size} className="shrink-0" />
      {!iconOnly && <span className="font-display leading-none font-bold tracking-[-0.03em] text-ink">Carousely</span>}
    </span>
  )
}

/** The animated mark alone, decorative. Reduced motion shows the still mark instead. */
export function CarouselyLoop({ size = 56 }: { size?: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="carousely-loop block shrink-0 motion-reduce:hidden"
        style={{
          width: size,
          height: size,
          '--loop-size': `${size}px`,
          '--loop-frames': LOOP_FRAMES,
          animationDuration: `${LOOP_MS}ms`,
          animationTimingFunction: `steps(${LOOP_FRAMES})`,
          backgroundImage: `url(${LOOP_SPRITE_SRC})`,
        } as CSSProperties}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK_SRC} alt="" aria-hidden="true" width={size} height={size} className="shrink-0 motion-safe:hidden" />
    </>
  )
}

/** Reserved for initial onboarding. Never delays ready content to finish a loop. */
export function CarouselyLoader({ size = 56, label }: { size?: number; label?: string }) {
  const t = useTranslations('common')
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-sm text-ink-muted">
      <CarouselyLoop size={size} />
      <span>{label ?? t('preparingCarousely')}</span>
    </div>
  )
}
