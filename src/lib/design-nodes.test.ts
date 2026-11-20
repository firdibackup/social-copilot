import { describe, expect, it } from 'vitest'
import { boxChanges, evalNumber, newImageNode, newShapeNode, newTextNode, plainText, withText } from './design-nodes'

const page = { width: 1080, height: 1350 }
const id = '00000000-0000-4000-8000-000000000009'

describe('number expressions', () => {
  it('evaluates absolute and relative input safely', () => {
    expect(evalNumber('120', 5)).toBe(120)
    expect(evalNumber('100+20', 5)).toBe(120)
    expect(evalNumber('*2', 40)).toBe(80)
    expect(evalNumber('-10', 40)).toBe(30)
    expect(evalNumber('+ 5', 40)).toBe(45)
    expect(evalNumber('alert(1)', 0)).toBeNull()
    expect(evalNumber('1/0', 0)).toBeNull()
    expect(evalNumber('', 3)).toBeNull()
  })
})

describe('new nodes', () => {
  it('centres a Bleam-sized heading and keeps text geometry in step', () => {
    const node = newTextNode(page, 'heading', 'Halo', id)
    expect(node).toMatchObject({ size: { width: 904, height: 84 }, transform: { x: 88 } })
    expect(node.content[0].runs[0].style).toMatchObject({ fontSize: 56, axes: { wght: 800 } })
    expect(boxChanges(node, { x: 10.4, y: 20.6, w: 500, h: 90 })).toMatchObject({ transform: { x: 10, y: 21 }, size: { width: 500 }, box: { width: 500, height: 90 } })
    expect(plainText({ ...node, ...withText(node, 'a\nb') })).toBe('a\nb')
  })
  it('fits uploads inside the page and gives photo slots a placeholder fill', () => {
    const image = newImageNode(page, { assetId: id, width: 4000, height: 2000 }, id, 'Foto')
    expect(image.size.width).toBeLessThanOrEqual(648)
    expect(image.transform.x + image.size.width / 2).toBeCloseTo(540, 0)
    expect(newShapeNode(page, 'photo', id, 'Slot').fill.type).toBe('gradient')
  })
})
