/** Canvas 2D document renderer, usable in the editor and headless Chromium. No DOM or network access. */
import type { Color, DesignNode, DesignPage, Paint, TextNode, TextStyle } from './design-doc'

export type DesignImages = ReadonlyMap<string, { image: CanvasImageSource; width: number; height: number }>
export const colorCss = ({ srgb: { r, g, b, a } }: Color) => `rgba(${r * 255},${g * 255},${b * 255},${a})`
type Segment = { text: string; style: TextStyle; width: number }
export type DesignTextLine = { segments: Segment[]; width: number; height: number; ascent: number; descent: number; align: 'left' | 'center' | 'right'; direction: 'ltr' | 'rtl' | 'inherit' }

function setFont(ctx: CanvasRenderingContext2D, style: TextStyle, familyOf: (name: string) => string) {
  ctx.font = `${style.fontStyle === 'Italic' ? 'italic ' : ''}${style.axes.wght} ${style.fontSize}px ${familyOf(style.fontFamily)}`
  ctx.letterSpacing = `${(style.letterSpacing ?? 0) * style.fontSize / 100}px`
}

/** Word wrapping retains run styles and uses actual glyph metrics, including letter spacing. */
export function layoutDesignText(ctx: CanvasRenderingContext2D, node: TextNode, familyOf: (name: string) => string, factor = 1): DesignTextLine[] {
  const lines: DesignTextLine[] = []
  const maxWidth = node.box.mode === 'autoWidth' ? Infinity : node.box.width
  for (const paragraph of node.content) {
    const fontSize = (size: number) => node.box.autoFit.enabled
      ? Math.max(node.box.autoFit.min, Math.min(node.box.autoFit.max, size * factor)) : size * factor
    const first = { ...paragraph.runs[0].style, fontSize: fontSize(paragraph.runs[0].style.fontSize) }
    const fresh = (): DesignTextLine => ({ segments: [], width: 0, height: first.fontSize * paragraph.style.lineHeight,
      ascent: 0, descent: 0, align: paragraph.style.align, direction: paragraph.style.direction === 'auto' ? 'inherit' : paragraph.style.direction })
    let line = fresh()
    let pendingSpace: TextStyle | null = null
    const add = (text: string, style: TextStyle) => {
      setFont(ctx, style, familyOf)
      const probe = ctx.measureText('Hg')
      const previous = line.segments.at(-1)
      const sameStyle = previous?.style === style
      const width = ctx.measureText(sameStyle ? previous.text + text : text).width
      if (sameStyle) {
        line.width += width - previous.width
        previous.text += text
        previous.width = width
      } else {
        line.segments.push({ text, style, width })
        line.width += width
      }
      line.ascent = Math.max(line.ascent, probe.fontBoundingBoxAscent ?? style.fontSize * 0.9)
      line.descent = Math.max(line.descent, probe.fontBoundingBoxDescent ?? style.fontSize * 0.25)
      line.height = Math.max(line.height, style.fontSize * paragraph.style.lineHeight)
    }
    const finish = () => { lines.push(line); line = fresh(); pendingSpace = null }
    for (const run of paragraph.runs) {
      const style = { ...run.style, fontSize: fontSize(run.style.fontSize) }
      const text = style.case === 'upper' ? run.text.toUpperCase() : run.text
      for (const token of text.match(/\n|[^\S\n]+|[^\s]+/gu) ?? []) {
        if (token === '\n') { finish(); continue }
        if (/^\s+$/u.test(token)) { pendingSpace = style; continue }
        setFont(ctx, style, familyOf)
        const wordWidth = ctx.measureText(token).width
        let spaceWidth = 0
        if (pendingSpace && line.segments.length) {
          setFont(ctx, pendingSpace, familyOf)
          spaceWidth = ctx.measureText(' ').width
        }
        if (line.segments.length && line.width + spaceWidth + wordWidth > maxWidth) finish()
        if (pendingSpace && line.segments.length) add(' ', pendingSpace)
        pendingSpace = null
        if (wordWidth <= maxWidth) add(token, style)
        else for (const char of Array.from(token)) {
          setFont(ctx, style, familyOf)
          if (line.segments.length && line.width + ctx.measureText(char).width > maxWidth) finish()
          add(char, style)
        }
      }
    }
    finish()
  }
  return lines
}

function paintStyle(ctx: CanvasRenderingContext2D, paint: Exclude<Paint, { type: 'image' }>, w: number, h: number) {
  if (paint.type === 'none') return 'rgba(0,0,0,0)'
  if (paint.type === 'solid') return colorCss(paint.color)
  const angle = paint.angle * Math.PI / 180
  const length = Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle))
  const dx = Math.cos(angle) * length / 2
  const dy = Math.sin(angle) * length / 2
  const gradient = paint.kind === 'radial' ? ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2)
    : ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy)
  for (const stop of paint.stops) gradient.addColorStop(stop.offset, colorCss(stop.color))
  return gradient
}

function drawImage(ctx: CanvasRenderingContext2D, paint: Extract<Paint, { type: 'image' }>, w: number, h: number, images: DesignImages) {
  const source = images.get(paint.assetId)
  if (!source) throw new Error(`image_unavailable:${paint.assetId}`)
  const crop = paint.crop ?? { x: 0, y: 0, width: source.width, height: source.height }
  const scale = paint.fit === 'contain' ? Math.min(w / crop.width, h / crop.height) : Math.max(w / crop.width, h / crop.height)
  const dw = paint.fit === 'stretch' ? w : crop.width * scale
  const dh = paint.fit === 'stretch' ? h : crop.height * scale
  let image = source.image
  if (paint.maskAssetId) {
    const mask = images.get(paint.maskAssetId)
    if (!mask) throw new Error(`image_unavailable:${paint.maskAssetId}`)
    const masked = new OffscreenCanvas(source.width, source.height)
    const context = masked.getContext('2d')
    if (!context) throw new Error('canvas_unavailable')
    context.drawImage(image, 0, 0, source.width, source.height)
    context.globalCompositeOperation = 'destination-in'
    context.drawImage(mask.image, 0, 0, source.width, source.height)
    image = masked
  }
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function fillPath(ctx: CanvasRenderingContext2D, paint: Paint, w: number, h: number, images: DesignImages) {
  if (paint.type !== 'image') {
    ctx.fillStyle = paintStyle(ctx, paint, w, h)
    ctx.fill()
    return
  }
  ctx.save()
  ctx.clip()
  drawImage(ctx, paint, w, h, images)
  ctx.restore()
}

function shapePath(ctx: CanvasRenderingContext2D, node: Extract<DesignNode, { type: 'shape' }>) {
  const { width: w, height: h } = node.size
  ctx.beginPath()
  if (node.kind === 'rect') ctx.roundRect(0, 0, w, h, Math.min(node.cornerRadius, w / 2, h / 2))
  else if (node.kind === 'ellipse') ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  else if (node.kind === 'triangle') { ctx.moveTo(w / 2, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath() }
  else {
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2)
    if (node.kind === 'arrow') {
      const head = Math.min(w / 3, h / 2)
      ctx.moveTo(w - head, h / 2 - head); ctx.lineTo(w, h / 2); ctx.lineTo(w - head, h / 2 + head)
    }
  }
}

function drawText(ctx: CanvasRenderingContext2D, node: TextNode, familyOf: (name: string) => string) {
  let lines = layoutDesignText(ctx, node, familyOf)
  let height = lines.reduce((sum, line) => sum + line.height, 0)
  if (node.box.autoFit.enabled) {
    const largest = Math.max(...node.content.flatMap(p => p.runs.map(r => r.style.fontSize)))
    for (let size = Math.min(largest, node.box.autoFit.max); size >= node.box.autoFit.min; size--) {
      lines = layoutDesignText(ctx, node, familyOf, size / largest)
      height = lines.reduce((sum, line) => sum + line.height, 0)
      if (height <= node.box.height && lines.every(line => line.width <= node.box.width)) break
    }
  }
  let top = node.box.verticalAlign === 'middle' ? (node.box.height - height) / 2 : node.box.verticalAlign === 'bottom' ? node.box.height - height : 0
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  for (const line of lines) {
    let x = line.align === 'center' ? (node.box.width - line.width) / 2 : line.align === 'right' ? node.box.width - line.width : 0
    const y = top + (line.height - line.ascent - line.descent) / 2 + line.ascent
    ctx.direction = line.direction
    for (const part of line.segments) {
      setFont(ctx, part.style, familyOf)
      if (part.style.fill.type === 'image') throw new Error('image_text_fill_not_supported')
      ctx.fillStyle = paintStyle(ctx, part.style.fill, node.box.width, node.box.height)
      ctx.fillText(part.text, x, y)
      if (part.style.underline) ctx.fillRect(x, y + part.style.fontSize * 0.1, part.width, Math.max(1, part.style.fontSize * 0.06))
      x += part.width
    }
    top += line.height
  }
}

export function drawDesignPage(ctx: CanvasRenderingContext2D, page: DesignPage, images: DesignImages, familyOf: (name: string) => string): void {
  const draw = (node: DesignNode) => {
    if (node.hidden) return
    ctx.save()
    try {
      const { width: w, height: h } = node.size
      const t = node.transform
      ctx.translate(t.x + w * t.scaleX / 2, t.y + h * t.scaleY / 2)
      ctx.rotate(t.rotation * Math.PI / 180)
      ctx.scale(t.scaleX, t.scaleY)
      ctx.translate(-w / 2, -h / 2)
      ctx.globalAlpha *= node.opacity
      if ((node.effects?.length ?? 0) > 1) throw new Error('multiple_shadows_not_supported')
      const shadow = node.effects?.[0]
      if (shadow) {
        ctx.shadowColor = colorCss({ srgb: { ...shadow.color.srgb, a: shadow.color.srgb.a * shadow.opacity } })
        ctx.shadowBlur = shadow.blur; ctx.shadowOffsetX = shadow.dx; ctx.shadowOffsetY = shadow.dy
      }
      if (node.type === 'group') { node.children.forEach(draw); return }
      if (node.type === 'text') { drawText(ctx, node, familyOf); return }
      if (node.type === 'image') { ctx.beginPath(); ctx.rect(0, 0, w, h); fillPath(ctx, node.fill, w, h, images); return }
      shapePath(ctx, node)
      if (node.kind !== 'line' && node.kind !== 'arrow') fillPath(ctx, node.fill, w, h, images)
      if (node.stroke && node.stroke.width > 0) {
        ctx.strokeStyle = colorCss(node.stroke.color); ctx.lineWidth = node.stroke.width; ctx.lineCap = 'round'; ctx.stroke()
      }
    } finally { ctx.restore() }
  }
  ctx.save()
  try {
    ctx.clearRect(0, 0, page.width, page.height)
    ctx.beginPath(); ctx.rect(0, 0, page.width, page.height); ctx.clip()
    fillPath(ctx, page.background, page.width, page.height, images)
    page.children.forEach(draw)
  } finally { ctx.restore() }
}
