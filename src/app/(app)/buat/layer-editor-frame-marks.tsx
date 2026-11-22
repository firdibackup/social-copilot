'use client'

import { ImagePlus } from 'lucide-react'
import { useId } from 'react'
import type { FrameLayer } from '@/lib/layer-doc'
import { shapeFillRule, traceShape } from '@/lib/shape-paths'
import { SvgPathRecorder } from './layer-editor-shapes'

/** The image badge's diameter in screen px: a share of the frame's shorter side, kept readable and never giant. */
const badgeSize = (w: number, h: number) => Math.max(22, Math.min(52, Math.min(w, h) * 0.34))

/**
 * Editor-only drawing of an empty bingkai (never saved): a see-through tint, a dashed outline traced from the frame's
 * real shape, and a centred "add image" badge, so it reads as "a picture goes here" and not as a plain shape.
 * The dashes ride on a white underlay and the badge is white with an accent glyph, so it holds up on dark, light and
 * busy slides alike.
 */
export function EmptyFrameMark({ frame, scale }: { frame: FrameLayer; scale: number }) {
  const clip = `empty-frame-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const w = Math.max(1, frame.w * scale)
  const h = Math.max(1, frame.h * scale)
  const recorder = new SvgPathRecorder()
  traceShape(recorder, frame.shape, { x: 0, y: 0, w, h }, frame.radius * scale)
  const d = recorder.d
  const rule = shapeFillRule(frame.shape)
  const size = badgeSize(w, h)
  const icon = size * 0.52

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute text-accent"
      style={{
        left: frame.x * scale, top: frame.y * scale, width: frame.w * scale, height: frame.h * scale,
        transform: `rotate(${frame.rotation ?? 0}deg)`, opacity: frame.opacity ?? 1,
      }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 overflow-visible">
        <defs>
          <clipPath id={clip}><path d={d} clipRule={rule} /></clipPath>
        </defs>
        <g clipPath={`url(#${clip})`}>
          {/* A light wash: white lifts dark slides, the accent tint marks it on light ones. */}
          <path d={d} fillRule={rule} fill="white" fillOpacity={0.08} />
          <path d={d} fillRule={rule} fill="currentColor" fillOpacity={0.14} />
          <circle cx={w / 2} cy={h / 2} r={size / 2} fill="white" fillOpacity={0.94} />
          <circle cx={w / 2} cy={h / 2} r={size / 2 - 0.5} fill="none" stroke="currentColor" strokeOpacity={0.25} />
          <ImagePlus x={w / 2 - icon / 2} y={h / 2 - icon / 2} width={icon} height={icon} strokeWidth={2} />
        </g>
        <path d={d} fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={4.5} strokeLinejoin="round" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2.25} strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
