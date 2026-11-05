import type { DesignNode } from './design-doc'

export type Point = { x: number; y: number }

/** Inverse of the renderer's center rotation followed by local scale. */
export function nodeLocalPoint(node: DesignNode, point: Point): Point {
  const { x, y, scaleX, scaleY, rotation } = node.transform
  const { width, height } = node.size
  const dx = point.x - x - width * scaleX / 2
  const dy = point.y - y - height * scaleY / 2
  const angle = rotation * Math.PI / 180
  return { x: (dx * Math.cos(angle) + dy * Math.sin(angle)) / scaleX + width / 2,
    y: (-dx * Math.sin(angle) + dy * Math.cos(angle)) / scaleY + height / 2 }
}

export function hitDesignNode(nodes: readonly DesignNode[], point: Point): { node: DesignNode; parents: DesignNode[] } | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    if (node.hidden || node.locked) continue
    const local = nodeLocalPoint(node, point)
    if (node.type === 'group') {
      const child = hitDesignNode(node.children, local)
      if (child) return { node: child.node, parents: [node, ...child.parents] }
    }
    if (local.x >= 0 && local.y >= 0 && local.x <= node.size.width && local.y <= node.size.height) return { node, parents: [] }
  }
  return null
}

export function parentLocalPoint(parents: readonly DesignNode[], point: Point): Point {
  return parents.reduce((local, parent) => nodeLocalPoint(parent, local), point)
}
