import { DESIGN_LIMITS, parseDesignDoc, walkNodes, type DesignDoc, type DesignNode, type DesignPage } from './design-doc'

export type DesignOperation =
  | { type: 'node'; pageId: string; nodeId: string; changes: Partial<DesignNode> }
  | { type: 'page'; pageId: string; changes: Partial<Pick<DesignPage, 'name' | 'background' | 'repeat'>> }
  | { type: 'removePage'; pageId: string }
  | { type: 'movePage'; pageId: string; direction: -1 | 1 }
  | { type: 'duplicatePage'; pageId: string }
  | { type: 'caption'; caption: DesignDoc['meta']['caption'] }
  | { type: 'insertNode'; pageId: string; node: DesignNode }
  | { type: 'removeNode'; pageId: string; nodeId: string }
  | { type: 'reorderNode'; pageId: string; nodeId: string; to: 'front' | 'back' | 'forward' | 'backward' }
  | { type: 'insertPages'; index: number; pages: DesignPage[] }
  | { type: 'replacePage'; pageId: string; page: DesignPage }

/** A copy with fresh identities for the page and every node, keeping panel-hug references inside the copy. */
export function clonePage(source: DesignPage, newId: () => string = () => crypto.randomUUID()): DesignPage {
  const page = structuredClone(source)
  page.id = newId()
  const nodes = walkNodes(page.children)
  const ids = new Map(nodes.map(node => [node.id, newId()]))
  for (const node of nodes) {
    node.id = ids.get(node.id)!
    const hug = node.data?.carousely?.hug
    if (hug) hug.textId = ids.get(hug.textId) ?? hug.textId
  }
  return page
}

/** A copy of one node (and its children) with fresh identities. */
export function cloneNode(source: DesignNode, newId: () => string = () => crypto.randomUUID()): DesignNode {
  const node = structuredClone(source)
  for (const item of walkNodes([node])) item.id = newId()
  return node
}

/** The list that directly contains a node, so edits keep it inside its own group. */
function siblingsOf(nodes: DesignNode[], id: string): DesignNode[] | null {
  if (nodes.some(node => node.id === id)) return nodes
  for (const node of nodes) {
    if (node.type !== 'group') continue
    const found = siblingsOf(node.children, id)
    if (found) return found
  }
  return null
}

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
  else if (operation.type === 'insertPages') {
    if (doc.pages.length + operation.pages.length > DESIGN_LIMITS.pages) throw new Error('too_many_pages')
    doc.pages.splice(Math.max(0, Math.min(operation.index, doc.pages.length)), 0, ...structuredClone(operation.pages))
  } else {
    const index = doc.pages.findIndex(page => page.id === operation.pageId)
    if (index < 0) throw new Error('page_not_found')
    const page = doc.pages[index]
    if (operation.type === 'node') {
      const node = walkNodes(page.children).find(node => node.id === operation.nodeId)
      if (!node) throw new Error('node_not_found')
      if (ancestorLocked(page.children, node.id)
        || node.locked && Object.keys(operation.changes).some(key => key !== 'locked')) throw new Error('node_locked')
      Object.assign(node, structuredClone(operation.changes), { id: node.id, type: node.type })
    } else if (operation.type === 'insertNode') page.children.push(structuredClone(operation.node))
    else if (operation.type === 'removeNode' || operation.type === 'reorderNode') {
      const list = siblingsOf(page.children, operation.nodeId)
      const at = list?.findIndex(node => node.id === operation.nodeId) ?? -1
      if (!list || at < 0) throw new Error('node_not_found')
      if (list[at].locked || ancestorLocked(page.children, operation.nodeId)) throw new Error('node_locked')
      const [node] = list.splice(at, 1)
      if (operation.type === 'removeNode') {
        const gone = new Set(walkNodes([node]).map(item => item.id))
        for (const item of walkNodes(page.children)) {
          if (item.data?.carousely?.hug && gone.has(item.data.carousely.hug.textId)) delete item.data.carousely.hug
        }
      } else {
        const to = { front: list.length, back: 0, forward: Math.min(at + 1, list.length), backward: Math.max(at - 1, 0) }[operation.to]
        list.splice(to, 0, node)
      }
    } else if (operation.type === 'replacePage') doc.pages[index] = structuredClone(operation.page)
    else if (operation.type === 'page') Object.assign(page, structuredClone(operation.changes))
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
      doc.pages.splice(index + 1, 0, clonePage(page, newId))
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
