'use client'

import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { DesignNode, DesignPage } from '@/lib/design-doc'
import { ancestorLocked, type DesignOperation } from '@/lib/design-operations'
import { hitDesignNode, parentLocalPoint, type Point } from '@/lib/design-geometry'

/** Same document coordinates as drawDesignPage; one completed gesture produces one undo step. */
export function DesignCanvasInteraction({ page, selectedId, disabled, onSelect, onChange, label }: {
  page: DesignPage; selectedId: string | null; disabled: boolean; label: string
  onSelect: (id: string | null) => void; onChange: (operation: DesignOperation) => void
}) {
  const gesture = useRef<{ node: DesignNode; parents: DesignNode[]; start: Point; pointerId: number } | null>(null)
  const [offset, setOffset] = useState<Point | null>(null)
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) * page.width / bounds.width, y: (event.clientY - bounds.top) * page.height / bounds.height }
  }
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return null
    const current = parentLocalPoint(active.parents, point(event))
    return { x: Math.max(-8000, Math.min(8000, active.node.transform.x + current.x - active.start.x)),
      y: Math.max(-8000, Math.min(8000, active.node.transform.y + current.y - active.start.y)) }
  }
  const outlines = (nodes: DesignNode[]): ReactNode => nodes.map(node => {
    if (node.hidden) return null
    const { width, height } = node.size
    const t = node.transform
    const selected = selectedId === node.id
    const x = selected && offset ? offset.x : t.x
    const y = selected && offset ? offset.y : t.y
    return <g key={node.id} transform={`translate(${x + width * t.scaleX / 2} ${y + height * t.scaleY / 2}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY}) translate(${-width / 2} ${-height / 2})`}>
      <rect data-node-id={node.id} width={width} height={height} fill="transparent" stroke={selected ? 'var(--color-accent, #6558f5)' : 'none'}
        strokeWidth={2} vectorEffect="non-scaling-stroke" role="button" aria-label={node.name || node.type}
        aria-pressed={selected} tabIndex={disabled ? -1 : 0} onFocus={() => onSelect(node.id)}
        onKeyDown={event => {
          if (disabled || node.locked || ancestorLocked(page.children, node.id)) return
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); return }
          const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
          if (!delta || event.ctrlKey || event.metaKey) return
          event.preventDefault(); event.stopPropagation()
          const step = event.shiftKey ? 10 : 1
          onChange({ type: 'node', pageId: page.id, nodeId: node.id, changes: { transform: { ...t,
            x: Math.max(-8000, Math.min(8000, t.x + delta[0] * step)), y: Math.max(-8000, Math.min(8000, t.y + delta[1] * step)) } } })
        }} />
      {node.type === 'group' && outlines(node.children)}
    </g>
  })
  return <svg viewBox={`0 0 ${page.width} ${page.height}`} className="absolute inset-0 h-full w-full touch-none"
    role="group" aria-label={label} onPointerDown={event => {
      if (disabled || event.button !== 0) return
      const hit = hitDesignNode(page.children, point(event))
      onSelect(hit?.node.id ?? null)
      if (!hit) return
      event.currentTarget.querySelector<SVGRectElement>(`[data-node-id="${hit.node.id}"]`)?.focus()
      gesture.current = { ...hit, start: parentLocalPoint(hit.parents, point(event)), pointerId: event.pointerId }
      event.currentTarget.setPointerCapture(event.pointerId)
    }} onPointerMove={event => { const next = move(event); if (next) setOffset(next) }}
    onPointerUp={event => {
      const active = gesture.current
      const next = move(event)
      gesture.current = null; setOffset(null)
      if (active && next && (Math.abs(next.x - active.node.transform.x) > 0.01 || Math.abs(next.y - active.node.transform.y) > 0.01))
        onChange({ type: 'node', pageId: page.id, nodeId: active.node.id, changes: { transform: { ...active.node.transform, ...next } } })
    }} onPointerCancel={() => { gesture.current = null; setOffset(null) }}
    onLostPointerCapture={() => { gesture.current = null; setOffset(null) }}>
    {outlines(page.children)}
  </svg>
}
