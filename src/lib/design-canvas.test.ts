import { describe, expect, it } from 'vitest'
import { layoutDesignText } from './design-canvas'
import { migrateLayerDoc, type TextNode } from './design-doc'
import type { LayerDoc } from './layer-doc'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const legacy: LayerDoc = { v: 1, width: 1080, height: 1350, layers: [{
  id: 't', kind: 'text', text: 'One two three', x: 0, y: 0, w: 80, h: 100, font: 'Inter', size: 20,
  weight: 700, color: '#000000', align: 'left', lineHeight: 1.2,
}] }
const text = () => migrateLayerDoc(legacy, { id: id(1), pageId: id(2), nodeIds: [id(3)] }, id(4)).pages[0].children[0] as TextNode
const context = () => ({ font: '', letterSpacing: '', measureText(this: { font: string; letterSpacing: string }, value: string) {
  const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 20)
  return { width: Array.from(value).length * (size / 2 + parseFloat(this.letterSpacing || '0')), fontBoundingBoxAscent: size * 0.8, fontBoundingBoxDescent: size * 0.2 }
} }) as unknown as CanvasRenderingContext2D

describe('design text layout', () => {
  it('wraps words and preserves intentional blank lines', () => {
    const node = text()
    node.content[0].runs[0].text = 'One two\n\nthree'
    const lines = layoutDesignText(context(), node, name => name)
    expect(lines.map(line => line.segments.map(part => part.text).join(''))).toEqual(['One two', '', 'three'])
    expect(lines[0]).toMatchObject({ width: 70, height: 24, ascent: 16, descent: 4 })
  })
  it('keeps rich text styles and uses the tallest run for the baseline', () => {
    const node = text()
    const style = node.content[0].runs[0].style
    node.box.width = 300
    node.content[0].runs = [{ text: 'Hello ', style }, { text: 'world', style: { ...style, fontSize: 40, underline: true } }]
    const [line] = layoutDesignText(context(), node, name => name)
    expect(line.segments.map(part => part.text)).toEqual(['Hello ', 'world'])
    expect(line).toMatchObject({ width: 160, height: 48, ascent: 32, descent: 8 })
  })
  it('applies uppercase and letter spacing and breaks long words by Unicode codepoint', () => {
    const node = text()
    node.content[0].runs[0].text = 'abcd🙂'
    node.content[0].runs[0].style = { ...node.content[0].runs[0].style, case: 'upper', letterSpacing: 10 }
    node.box.width = 36
    expect(layoutDesignText(context(), node, name => name).map(line => line.segments.map(part => part.text).join(''))).toEqual(['ABC', 'D🙂'])
  })
})
