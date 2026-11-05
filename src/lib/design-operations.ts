import { DESIGN_LIMITS, parseDesignDoc, walkNodes, type DesignDoc, type DesignNode, type DesignPage } from './design-doc'

export type DesignOperation =
  | { type: 'node'; pageId: string; nodeId: string; changes: Partial<DesignNode> }
  | { type: 'page'; pageId: string; changes: Partial<Pick<DesignPage, 'name' | 'background' | 'repeat'>> }
  | { type: 'removePage'; pageId: string }
  | { type: 'movePage'; pageId: string; direction: -1 | 1 }
  | { type: 'duplicatePage'; pageId: string }
  | { type: 'caption'; caption: DesignDoc['meta']['caption'] }

/** Ancestor locks also protect descendants; only the locked group itself can be unlocked. */
export function ancestorLocked(nodes: readonly DesignNode[], id: string, locked = false): boolean {
  for (const node of nodes) {
    if (node.id === id) return locked
    if (node.type === 'group' && ancestorLocked(node.children, id, locked || !!node.locked)) return true
  }
  return false
}

/** A validated, immutable edit: unsupported changes cannot silently strip parts of a template. */
export function applyDesignOperation(source: DesignDoc, operation: DesignOperation, newId = () => crypto.randomUUID()): DesignDoc {
  const doc = structuredClone(source)
  if (operation.type === 'caption') doc.meta.caption = structuredClone(operation.caption)
  else {
    const index = doc.pages.findIndex(page => page.id === operation.pageId)
    if (index < 0) throw new Error('page_not_found')
    const page = doc.pages[index]
    if (operation.type === 'node') {
      const node = walkNodes(page.children).find(node => node.id === operation.nodeId)
      if (!node) throw new Error('node_not_found')
      if (ancestorLocked(page.children, node.id)
        || node.locked && Object.keys(operation.changes).some(key => key !== 'locked')) throw new Error('node_locked')
      Object.assign(node, structuredClone(operation.changes), { id: node.id, type: node.type })
    } else if (operation.type === 'page') Object.assign(page, structuredClone(operation.changes))
    else if (operation.type === 'removePage') {
      if (doc.pages.length === 1) throw new Error('last_page')
      doc.pages.splice(index, 1)
    } else if (operation.type === 'movePage') {
      const target = index + operation.direction
      if (target < 0 || target >= doc.pages.length) return source
      doc.pages.splice(index, 1)
      doc.pages.splice(target, 0, page)
    } else {
      if (doc.pages.length >= DESIGN_LIMITS.pages) throw new Error('too_many_pages')
      const copy = structuredClone(page)
      copy.id = newId()
      const nodes = walkNodes(copy.children)
      const ids = new Map(nodes.map(node => [node.id, newId()]))
      for (const node of nodes) {
        node.id = ids.get(node.id)!
        const hug = node.data?.carousely?.hug
        if (hug) hug.textId = ids.get(hug.textId)!
      }
      doc.pages.splice(index + 1, 0, copy)
    }
  }
  if ('error' in parseDesignDoc(doc)) throw new Error('invalid_document')
  return doc
}

/** Reduce the largest repeats first, retaining at least one occurrence of every source page. */
export function templatePageCounts(pages: readonly DesignPage[], aiCounts: Readonly<Record<string, number>> = {}): number[] {
  if (!pages.length || pages.length > DESIGN_LIMITS.pages) throw new Error('invalid_pages')
  const counts = pages.map(page => {
    if (!page.repeat) return 1
    const count = page.repeat.mode === 'fixed' ? page.repeat.count : aiCounts[page.id] ?? 2
    if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('invalid_repeat')
    return page.repeat.mode === 'ai' ? Math.max(2, Math.min(6, count)) : count
  })
  let total = counts.reduce((sum, count) => sum + count, 0)
  while (total > DESIGN_LIMITS.pages) {
    counts[counts.indexOf(Math.max(...counts))]--
    total--
  }
  return counts
}
