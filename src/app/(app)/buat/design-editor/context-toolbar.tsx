'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Bold, ChevronDown, ChevronUp, Copy, Italic, TextAlignCenter, TextAlignEnd, TextAlignStart, Trash2 } from 'lucide-react'
import { FontPicker } from '@/components/font-picker'
import { colorHex, hexColor, type DesignNode, type DesignPage, type Paint, type TextNode } from '@/lib/design-doc'
import { boxChanges, evalNumber, nodeBox, restyle } from '@/lib/design-nodes'

const BAR = 'pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-hairline bg-white p-1 shadow-[0_6px_20px_-8px_rgba(23,24,39,0.28)]'
const TOOL = 'inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-sm text-ink hover:bg-zinc-100 aria-pressed:bg-accent-soft aria-pressed:text-accent disabled:opacity-40'
const SEP = <span className="mx-1 h-5 w-px shrink-0 bg-hairline" />

/** A number field that accepts expressions (`100+20`, `*2`) and commits on Enter or blur. */
export function NumberField({ label, value, onCommit, min, max, className = 'w-16' }: {
  label: string; value: number; onCommit: (value: number) => void; min?: number; max?: number; className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const next = evalNumber(draft, value)
    setDraft(null)
    if (next === null) return
    onCommit(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, Math.round(next * 100) / 100)))
  }
  return <input aria-label={label} title={label} inputMode="decimal" value={draft ?? String(Math.round(value * 100) / 100)}
    onChange={event => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') { commit(); (event.target as HTMLInputElement).blur() } if (event.key === 'Escape') setDraft(null) }}
    className={`h-8 rounded-lg border border-hairline bg-white px-2 text-center text-sm tabular-nums focus:border-accent focus:outline-none ${className}`} />
}

/** A colour swatch over a native colour input. */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return <label title={label} className={TOOL}>
    <span className="size-5 rounded-md border border-black/10" style={{ background: value }} />
    <input type="color" aria-label={label} value={value} onChange={event => onChange(event.target.value)} className="sr-only" />
  </label>
}
const paintHex = (paint: Paint) => paint.type === 'solid' ? colorHex(paint.color)
  : paint.type === 'gradient' ? colorHex(paint.stops[0].color) : '#ffffff'

/** Bleam's floating toolbar: its contents follow the selection; position, duplicate, order and delete always sit on the right. */
export function ContextToolbar({ page, node, onEdit, onPage, onDuplicate, onDelete, onReorder }: {
  page: DesignPage; node: DesignNode | null
  onEdit: (nodeId: string, changes: Partial<DesignNode>) => void
  onPage: (changes: Partial<Pick<DesignPage, 'background'>>) => void
  onDuplicate: () => void; onDelete: () => void; onReorder: (to: 'front' | 'back') => void
}) {
  const t = useTranslations('editor.designEditor')
  const [position, setPosition] = useState(false)
  if (!node) return <div className={BAR}>
    <span className="px-2 text-xs font-medium text-ink-muted">{t('background')}</span>
    <ColorField label={t('background')} value={paintHex(page.background)} onChange={hex => onPage({ background: { type: 'solid', color: hexColor(hex) } })} />
    <span className="px-2 text-xs text-ink-muted tabular-nums">{page.width} × {page.height}</span>
  </div>
  const locked = !!node.locked
  const edit = (changes: Partial<DesignNode>) => onEdit(node.id, changes)
  let tools: ReactNode = null
  if (node.type === 'text') {
    const style = node.content[0].runs[0].style
    const align = node.content[0].style.align
    const text = (change: Parameters<typeof restyle>[1]) => edit(restyle(node, change))
    tools = <>
      <div className="w-44 shrink-0"><FontPicker label={<span className="sr-only">{t('font')}</span>} labelClassName="sr-only" value={style.fontFamily}
        onChange={font => text(item => { item.fontFamily = font })} className="h-8 text-sm" /></div>
      <NumberField label={t('size')} value={style.fontSize} min={8} max={512} onCommit={size => text(item => { item.fontSize = size })} className="w-14" />
      {SEP}
      <button type="button" className={TOOL} aria-label={t('bold')} aria-pressed={style.axes.wght >= 700}
        onClick={() => text(item => { item.axes = { wght: item.axes.wght >= 700 ? 400 : 800 } })}><Bold size={16} /></button>
      <button type="button" className={TOOL} aria-label={t('italic')} aria-pressed={style.fontStyle === 'Italic'}
        onClick={() => text(item => { item.fontStyle = item.fontStyle === 'Italic' ? 'Regular' : 'Italic' })}><Italic size={16} /></button>
      <button type="button" className={`${TOOL} text-xs font-bold`} aria-label={t('uppercase')} aria-pressed={style.case === 'upper'}
        onClick={() => text(item => { item.case = item.case === 'upper' ? 'none' : 'upper' })}>Aa</button>
      <ColorField label={t('color')} value={paintHex(style.fill)} onChange={hex => text(item => { item.fill = { type: 'solid', color: hexColor(hex) } })} />
      {SEP}
      {(['left', 'center', 'right'] as const).map(value => {
        const Icon = { left: TextAlignStart, center: TextAlignCenter, right: TextAlignEnd }[value]
        return <button key={value} type="button" className={TOOL} aria-label={t(`alignNames.${value}`)} aria-pressed={align === value}
          onClick={() => edit({ content: node.content.map(paragraph => ({ ...paragraph, style: { ...paragraph.style, align: value } })) } as Partial<TextNode>)}><Icon size={16} /></button>
      })}
    </>
  } else if (node.type === 'shape') {
    tools = <>
      {node.kind !== 'line' && node.kind !== 'arrow' && <ColorField label={t('fill')} value={paintHex(node.fill)} onChange={hex => edit({ fill: { type: 'solid', color: hexColor(hex) } })} />}
      {node.stroke && <ColorField label={t('color')} value={colorHex(node.stroke.color)} onChange={hex => edit({ stroke: { ...node.stroke!, color: hexColor(hex) } })} />}
      {node.kind === 'rect' && <>
        <span className="px-1 text-xs text-ink-muted">{t('radius')}</span>
        <NumberField label={t('radius')} value={node.cornerRadius} min={0} max={4000} onCommit={radius => edit({ cornerRadius: radius })} className="w-14" />
      </>}
    </>
  } else if (node.type === 'image') {
    tools = <select aria-label={t('fit_')} value={node.fill.fit} onChange={event => edit({ fill: { ...node.fill, fit: event.target.value as 'cover' | 'contain' | 'stretch' } })}
      className="h-8 rounded-lg border border-hairline bg-white px-2 text-sm">
      {(['cover', 'contain', 'stretch'] as const).map(value => <option key={value} value={value}>{t(`fits.${value}`)}</option>)}
    </select>
  }
  const box = nodeBox(node)
  return <div className="pointer-events-none flex flex-col items-center gap-2">
    <div className={BAR}>
      <fieldset disabled={locked} className="flex items-center gap-0.5">{tools}</fieldset>
      {tools && SEP}
      <button type="button" className={TOOL} aria-pressed={position} onClick={() => setPosition(open => !open)}>{t('position')}</button>
      <button type="button" className={TOOL} aria-label={t('duplicate')} title={t('duplicate')} onClick={onDuplicate}><Copy size={16} /></button>
      <button type="button" className={TOOL} aria-label={t('front')} title={t('front')} disabled={locked} onClick={() => onReorder('front')}><ChevronUp size={16} /></button>
      <button type="button" className={TOOL} aria-label={t('back_')} title={t('back_')} disabled={locked} onClick={() => onReorder('back')}><ChevronDown size={16} /></button>
      <button type="button" className={`${TOOL} text-red-600`} aria-label={t('delete')} title={t('delete')} disabled={locked} onClick={onDelete}><Trash2 size={16} /></button>
    </div>
    {position && <fieldset disabled={locked} className={`${BAR} gap-2 px-3 py-2`}>
      {(['x', 'y', 'w', 'h'] as const).map(key => <label key={key} className="flex items-center gap-1 text-xs text-ink-muted">{t(key)}
        <NumberField label={t(key)} value={box[key]} min={key === 'w' || key === 'h' ? 1 : -8000} max={8000}
          onCommit={value => edit(boxChanges(node, { ...box, [key]: value }))} /></label>)}
      <label className="flex items-center gap-1 text-xs text-ink-muted">∠
        <NumberField label="∠" value={node.transform.rotation} min={-360} max={360} onCommit={rotation => edit({ transform: { ...node.transform, rotation } })} className="w-14" /></label>
      <label className="flex items-center gap-1 text-xs text-ink-muted">{t('opacity')}
        <input type="range" min={0} max={100} value={Math.round(node.opacity * 100)} aria-label={t('opacity')}
          onChange={event => edit({ opacity: Number(event.target.value) / 100 })} className="w-24 accent-accent" /></label>
      <div className="flex gap-0.5">
        {([['L', 0], ['C', (page.width - box.w) / 2], ['R', page.width - box.w]] as const).map(([label, x]) =>
          <button key={label} type="button" className={`${TOOL} text-xs`} onClick={() => edit(boxChanges(node, { ...box, x }))}>{label === 'L' ? '⇤' : label === 'C' ? '↔' : '⇥'}</button>)}
        {([['T', 0], ['M', (page.height - box.h) / 2], ['B', page.height - box.h]] as const).map(([label, y]) =>
          <button key={label} type="button" className={`${TOOL} text-xs`} onClick={() => edit(boxChanges(node, { ...box, y }))}>{label === 'T' ? '⤒' : label === 'M' ? '↕' : '⤓'}</button>)}
      </div>
    </fieldset>}
  </div>
}
