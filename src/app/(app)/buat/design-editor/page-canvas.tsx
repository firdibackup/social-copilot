'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { fontFamilyOf } from '@/components/font-previews'
import type { DesignNode, DesignPage } from '@/lib/design-doc'
import { renderDesignCanvas } from '@/lib/design-browser'
import { boxChanges, nodeBox } from '@/lib/design-nodes'
import { ancestorLocked } from '@/lib/design-operations'
import { hitDesignNode } from '@/lib/design-geometry'
import { HANDLES, resizeBox, snapBox, SNAP_SCREEN_PX, type Handle } from '@/lib/layer-doc'

const familyOf = (name: string) => fontFamilyOf(name) ?? 'sans-serif'
type Box = { x: number; y: number; w: number; h: number }
type Drag =
  | { kind: 'move'; node: DesignNode; start: { x: number; y: number }; box: Box; pointer: number }
  | { kind: 'resize'; node: DesignNode; handle: Handle; start: { x: number; y: number }; box: Box; pointer: number }
  | { kind: 'rotate'; node: DesignNode; center: { x: number; y: number }; pointer: number }
const HANDLE_CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }

/**
 * One slide of the stack: the shared canvas renderer underneath, a DOM overlay on top for selection, the eight
 * resize handles, the rotate knob, snapping guides and the AI-field outlines (red without prompt, green when ready).
 */
export function PageCanvas({ page, zoom, selectedId, active, disabled, onSelect, onCommit, onContextMenu, onEditText, onRendered, label }: {
  page: DesignPage; zoom: number; selectedId: string | null; active: boolean; disabled: boolean; label: string
  onSelect: (id: string | null) => void
  onCommit: (nodeId: string, changes: Partial<DesignNode>) => void
  onContextMenu: (x: number, y: number, nodeId: string | null) => void
  onEditText: (nodeId: string) => void
  onRendered?: (canvas: HTMLCanvasElement) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [live, setLive] = useState<{ id: string; box: Box; rotation: number } | null>(null)
  const [guides, setGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] })
  const [failed, setFailed] = useState(false)

  // Re-render whenever the page changes; the offscreen render keeps the old pixels until the new ones are ready.
  useEffect(() => {
    let current = true
    const doc = { format: 'carousely.design' as const, schemaVersion: 1 as const, id: page.id, title: '', unit: 'px' as const, dpi: 96 as const,
      pages: [page], assets: [], fonts: [], meta: {} }
    void renderDesignCanvas(doc, 0, familyOf).then(image => {
      if (!current || !canvas.current) return
      const context = canvas.current.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, page.width, page.height)
      context.drawImage(image, 0, 0)
      setFailed(false)
      onRendered?.(canvas.current)
    }).catch(() => { if (current) setFailed(true) })
    return () => { current = false }
  }, [page, onRendered])

  const toPage = (event: { clientX: number; clientY: number }) => {
    const bounds = overlay.current!.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) / zoom, y: (event.clientY - bounds.top) / zoom }
  }
  const editable = (node: DesignNode) => !disabled && !node.locked && !ancestorLocked(page.children, node.id)
  const others = (id: string) => page.children.filter(node => node.id !== id && !node.hidden).map(nodeBox)

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || disabled) return
    const point = toPage(event)
    const hit = hitDesignNode(page.children, point)
    // A group is picked whole, as in Bleam; its children are edited from the Layers panel.
    const top = hit ? (hit.parents[0] ?? hit.node) : null
    onSelect(top?.id ?? null)
    if (!top || !editable(top)) return
    drag.current = { kind: 'move', node: top, start: point, box: nodeBox(top), pointer: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function startHandle(event: ReactPointerEvent, node: DesignNode, handle: Handle | 'rotate') {
    event.stopPropagation()
    if (event.button !== 0 || !editable(node)) return
    const box = nodeBox(node)
    drag.current = handle === 'rotate'
      ? { kind: 'rotate', node, center: { x: box.x + box.w / 2, y: box.y + box.h / 2 }, pointer: event.pointerId }
      : { kind: 'resize', node, handle, start: toPage(event), box, pointer: event.pointerId }
    overlay.current!.setPointerCapture(event.pointerId)
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    const point = toPage(event)
    if (active.kind === 'rotate') {
      let angle = Math.atan2(point.y - active.center.y, point.x - active.center.x) * 180 / Math.PI + 90
      if (event.shiftKey) angle = Math.round(angle / 15) * 15
      else if (Math.abs(((angle % 90) + 90) % 90) < 3) angle = Math.round(angle / 90) * 90
      angle = ((angle + 540) % 360) - 180
      setLive({ id: active.node.id, box: nodeBox(active.node), rotation: angle })
      return
    }
    const dx = point.x - active.start.x
    const dy = point.y - active.start.y
    if (active.kind === 'move') {
      const moved = { ...active.box, x: active.box.x + dx, y: active.box.y + dy }
      const snap = event.altKey ? { x: moved.x, y: moved.y, guides: { vertical: [], horizontal: [] } }
        : snapBox(moved, page, others(active.node.id), SNAP_SCREEN_PX / zoom)
      setGuides(snap.guides)
      setLive({ id: active.node.id, box: { ...moved, x: snap.x, y: snap.y }, rotation: active.node.transform.rotation })
    } else {
      const keepRatio = event.shiftKey !== (active.node.type === 'image')
      setLive({ id: active.node.id, box: resizeBox(active.box, active.handle, dx, dy, keepRatio), rotation: active.node.transform.rotation })
    }
  }
  function up(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    drag.current = null
    setGuides({ vertical: [], horizontal: [] })
    const result = live
    setLive(null)
    if (!result || result.id !== active.node.id) return
    const before = nodeBox(active.node)
    if (active.kind === 'rotate') {
      if (Math.abs(result.rotation - active.node.transform.rotation) > 0.01)
        onCommit(active.node.id, { transform: { ...active.node.transform, rotation: Math.round(result.rotation * 10) / 10 } })
      return
    }
    if (['x', 'y', 'w', 'h'].some(key => Math.abs(result.box[key as keyof Box] - before[key as keyof Box]) > 0.5)) {
      // Scale-free: the node keeps scale 1 and takes the new size, so text rewraps rather than stretching.
      const scaled = { ...active.node, transform: { ...active.node.transform, scaleX: 1, scaleY: 1 } }
      onCommit(active.node.id, boxChanges(scaled, result.box))
    }
  }

  const selected = page.children.find(node => node.id === selectedId) ?? null
  const shown = (node: DesignNode) => live?.id === node.id ? { box: live.box, rotation: live.rotation } : { box: nodeBox(node), rotation: node.transform.rotation }
  const outlined = page.children.filter(node => !node.hidden && node.type !== 'group' && node.data?.carousely?.field && node.data.carousely.field.mode !== 'static')

  return (
    <div className="relative bg-white shadow-[0_1px_3px_rgba(23,24,39,0.12),0_8px_24px_-12px_rgba(23,24,39,0.18)]"
      style={{ width: page.width * zoom, height: page.height * zoom }}>
      <canvas ref={canvas} width={page.width} height={page.height} aria-label={label} role="img"
        className="absolute inset-0 h-full w-full" />
      {failed && <div className="absolute inset-0 grid place-items-center bg-zinc-50 text-sm text-ink-muted">⚠</div>}
      <div ref={overlay} className="absolute inset-0 touch-none" style={{ cursor: drag.current?.kind === 'move' ? 'grabbing' : 'default' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerCancel={() => { drag.current = null; setLive(null); setGuides({ vertical: [], horizontal: [] }) }}
        onDoubleClick={event => {
          const hit = hitDesignNode(page.children, toPage(event))
          if (hit?.node.type === 'text' && editable(hit.node)) onEditText(hit.node.id)
        }}
        onContextMenu={event => {
          event.preventDefault()
          const hit = hitDesignNode(page.children, toPage(event))
          const top = hit ? (hit.parents[0] ?? hit.node) : null
          if (top) onSelect(top.id)
          onContextMenu(event.clientX, event.clientY, top?.id ?? null)
        }}>
        {outlined.map(node => {
          const { box, rotation } = shown(node)
          const field = node.data!.carousely!.field!
          const ready = field.mode === 'folder' ? !!field.folderId : (field.mode === 'stock' ? field.stockQuery : 'prompt' in field ? field.prompt : '').trim().length > 0
          return <div key={node.id} aria-hidden="true" className="pointer-events-none absolute border-2 border-dashed"
            style={{ left: box.x * zoom, top: box.y * zoom, width: box.w * zoom, height: box.h * zoom, transform: `rotate(${rotation}deg)`,
              borderColor: ready ? '#16a34a' : '#ef4444' }} />
        })}
        {guides.vertical.map(x => <div key={`v${x}`} aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#ff3ea5]" style={{ left: x * zoom }} />)}
        {guides.horizontal.map(y => <div key={`h${y}`} aria-hidden="true" className="pointer-events-none absolute right-0 left-0 h-px bg-[#ff3ea5]" style={{ top: y * zoom }} />)}
        {active && selected && !selected.hidden && (() => {
          const { box, rotation } = shown(selected)
          const locked = !editable(selected)
          return <div className="pointer-events-none absolute" style={{ left: box.x * zoom, top: box.y * zoom, width: box.w * zoom, height: box.h * zoom,
            transform: `rotate(${rotation}deg)` }}>
            <div className="absolute inset-0 border-2 border-[#3b82f6]" />
            {!locked && <>
              <div className="absolute left-1/2 h-5 w-px -translate-x-1/2 bg-[#3b82f6]" style={{ top: -22 }} />
              <button type="button" aria-label="rotate" onPointerDown={event => startHandle(event, selected, 'rotate')}
                className="pointer-events-auto absolute left-1/2 size-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-[#3b82f6] bg-white" style={{ top: -36 }} />
              {HANDLES.map(handle => {
                const left = handle.includes('w') ? 0 : handle.includes('e') ? 100 : 50
                const top = handle.includes('n') ? 0 : handle.includes('s') ? 100 : 50
                const edge = handle.length === 1
                return <button key={handle} type="button" aria-label={handle} onPointerDown={event => startHandle(event, selected, handle)}
                  className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 border-2 border-[#3b82f6] bg-white ${edge ? 'rounded-full' : 'rounded-[3px]'}`}
                  style={{ left: `${left}%`, top: `${top}%`, width: edge && (handle === 'n' || handle === 's') ? 18 : edge ? 8 : 11,
                    height: edge && (handle === 'e' || handle === 'w') ? 18 : edge ? 8 : 11, cursor: HANDLE_CURSOR[handle] }} />
              })}
            </>}
          </div>
        })()}
      </div>
    </div>
  )
}
