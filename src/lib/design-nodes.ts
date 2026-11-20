/** New nodes and small edits the template editor makes; pure, so the same rules hold in tests. */
import { hexColor, type DesignNode, type DesignPage, type ImageNode, type ShapeNode, type TextNode } from './design-doc'
import type { Box } from './layer-doc'

export type NewText = 'heading' | 'subheading' | 'body'
const TEXT_PRESETS: Record<NewText, { size: number; wght: number; h: number }> = {
  heading: { size: 56, wght: 800, h: 84 }, subheading: { size: 40, wght: 600, h: 64 }, body: { size: 32, wght: 400, h: 120 },
}
const transform = (x: number, y: number) => ({ x, y, scaleX: 1, scaleY: 1, rotation: 0 })

/** A text box centred on the page, sized like Bleam's defaults (heading 56 px Extrabold, 904 px wide). */
export function newTextNode(page: Pick<DesignPage, 'width' | 'height'>, kind: NewText, text: string, id: string, font = 'Plus Jakarta Sans'): TextNode {
  const preset = TEXT_PRESETS[kind]
  const w = Math.min(904, page.width - 176)
  return { id, name: text.slice(0, 80), type: 'text', transform: transform((page.width - w) / 2, (page.height - preset.h) / 2),
    size: { width: w, height: preset.h }, opacity: 1,
    box: { mode: 'fixed', width: w, height: preset.h, autoFit: { enabled: false, min: 8, max: 512 }, verticalAlign: 'top' },
    content: [{ runs: [{ text, style: { fontFamily: font, fontStyle: 'Regular', fontSize: preset.size, axes: { wght: preset.wght },
      fill: { type: 'solid', color: hexColor('#1a1f29') }, underline: false, letterSpacing: 0, case: 'none' } }],
    style: { align: 'left', direction: 'auto', lineHeight: 1.2 } }] }
}

export type NewShape = 'rect' | 'rounded' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'photo'
export function newShapeNode(page: Pick<DesignPage, 'width' | 'height'>, kind: NewShape, id: string, name: string): ShapeNode {
  const line = kind === 'line' || kind === 'arrow'
  const w = kind === 'photo' ? Math.round(page.width * 0.7) : line ? 400 : 320
  const h = kind === 'photo' ? Math.round(page.height * 0.4) : line ? 40 : 320
  const fill = kind === 'photo'
    ? { type: 'gradient' as const, kind: 'linear' as const, angle: 135, stops: [{ offset: 0, color: hexColor('#e6e8ed') }, { offset: 1, color: hexColor('#c9ccd6') }] }
    : { type: 'solid' as const, color: hexColor('#6558f5') }
  return { id, name, type: 'shape', kind: kind === 'rounded' || kind === 'photo' ? 'rect' : kind,
    transform: transform((page.width - w) / 2, (page.height - h) / 2), size: { width: w, height: h }, opacity: 1,
    cornerRadius: kind === 'rounded' ? 48 : kind === 'photo' ? 24 : 0, fill,
    ...(line ? { stroke: { color: hexColor('#1a1f29'), width: 8 } } : {}),
    ...(kind === 'photo' ? { data: { carousely: { role: 'photo' } } } : {}) }
}

/** An uploaded image or logo, fitted inside 60% of the page and centred. */
export function newImageNode(page: Pick<DesignPage, 'width' | 'height'>, asset: { assetId: string; width: number; height: number },
  id: string, name: string, role?: string): ImageNode {
  const scale = Math.min(1, page.width * 0.6 / asset.width, page.height * 0.6 / asset.height)
  const w = Math.max(24, Math.round(asset.width * scale))
  const h = Math.max(24, Math.round(asset.height * scale))
  return { id, name, type: 'image', transform: transform(Math.round((page.width - w) / 2), Math.round((page.height - h) / 2)),
    size: { width: w, height: h }, opacity: 1, fill: { type: 'image', assetId: asset.assetId, fit: 'contain' },
    ...(role ? { data: { carousely: { role } } } : {}) }
}

/** All of a text node's runs as one string; paragraphs joined by newlines. */
export const plainText = (node: TextNode) => node.content.map(paragraph => paragraph.runs.map(run => run.text).join('')).join('\n')

/** The node with `text` in the first run's style, keeping its first paragraph's alignment and spacing. */
export function withText(node: TextNode, text: string): Pick<TextNode, 'content' | 'name'> {
  const [first] = node.content
  return { name: node.name, content: [{ runs: [{ text, style: structuredClone(first.runs[0].style) }], style: structuredClone(first.style) }] }
}

/** Every run's style changed the same way, e.g. a new font, size or colour for the whole box. */
export function restyle(node: TextNode, change: (style: TextNode['content'][number]['runs'][number]['style']) => void): Pick<TextNode, 'content'> {
  const content = structuredClone(node.content)
  for (const paragraph of content) for (const run of paragraph.runs) change(run.style)
  return { content }
}

/** The geometry change of a resize or move: text boxes keep their wrap width in step with the node. */
export function boxChanges(node: DesignNode, box: Omit<Box, 'id'>): Partial<DesignNode> {
  const changes: Partial<DesignNode> = { transform: { ...node.transform, x: Math.round(box.x), y: Math.round(box.y) },
    size: { width: Math.max(1, Math.round(box.w)), height: Math.max(1, Math.round(box.h)) } }
  if (node.type === 'text') (changes as Partial<TextNode>).box = { ...node.box, width: Math.max(1, Math.round(box.w)), height: Math.max(1, Math.round(box.h)) }
  return changes
}

/** Axis-aligned box of a node in page space (scale included, rotation ignored), as snapping and handles use it. */
export const nodeBox = (node: DesignNode): Omit<Box, 'id'> =>
  ({ x: node.transform.x, y: node.transform.y, w: node.size.width * node.transform.scaleX, h: node.size.height * node.transform.scaleY })

/**
 * Evaluates what someone types into a number field: `120`, `100+20`, or `*2`, `+10`, `-10` relative to the current
 * value (as in Bleam). Only digits, + - * / ( ) and dots are accepted, so nothing else can run.
 */
export function evalNumber(input: string, current: number): number | null {
  const text = input.trim().replace(/,/g, '.')
  if (!text || !/^[\d+\-*/().\s]+$/.test(text)) return null
  const expression = /^[*/+-]/.test(text) ? `(${current})${text}` : text
  try {
    const value = Function(`"use strict";return (${expression})`)() as unknown
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch { return null }
}
