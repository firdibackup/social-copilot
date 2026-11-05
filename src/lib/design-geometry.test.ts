import { expect, it } from 'vitest'
import { migrateLayerDoc, type DesignNode } from './design-doc'
import { hitDesignNode, nodeLocalPoint, parentLocalPoint } from './design-geometry'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const node = (): DesignNode => migrateLayerDoc({ v: 1, width: 1080, height: 1350, layers: [
  { id: 'image', kind: 'image', assetId: id(4), role: 'upload', x: 100, y: 100, w: 200, h: 100 },
] }, { id: id(1), pageId: id(2), nodeIds: [id(3)] }, id(4)).pages[0].children[0]

it('inverts center rotation and scale and picks the frontmost visible unlocked node', () => {
  const back = node()
  const front = { ...node(), id: id(5), transform: { x: 100, y: 100, scaleX: 2, scaleY: 1, rotation: 90 } }
  const local = nodeLocalPoint(front, { x: 300, y: 350 })
  expect(local.x).toBeCloseTo(200)
  expect(local.y).toBeCloseTo(50)
  expect(hitDesignNode([back, front], { x: 300, y: 150 })?.node.id).toBe(id(5))
  expect(hitDesignNode([back, { ...front, hidden: true }], { x: 200, y: 150 })?.node.id).toBe(id(3))
  expect(hitDesignNode([{ ...front, locked: true }], { x: 300, y: 150 })).toBeNull()
})

it('converts nested drag coordinates and respects ancestor visibility and locks', () => {
  const child = node()
  const group: DesignNode = { id: id(6), name: 'Group', type: 'group', opacity: 1,
    size: { width: 500, height: 500 }, transform: { x: 50, y: 50, scaleX: 2, scaleY: 2, rotation: 0 }, children: [child] }
  const hit = hitDesignNode([group], { x: 450, y: 350 })!
  expect(hit.node.id).toBe(child.id)
  expect(parentLocalPoint(hit.parents, { x: 450, y: 350 })).toEqual({ x: 200, y: 150 })
  for (const flag of ['locked', 'hidden']) expect(hitDesignNode([{ ...group, [flag]: true }], { x: 450, y: 350 })).toBeNull()
})
