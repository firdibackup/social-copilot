/**
 * The Threads version of a post: a chain of up to 10 items, the post and then replies to it in order, each with up to
 * 500 characters and 20 photos. Pure, so the editor, the actions, the worker and the tests share it.
 */
import { isObject } from './brand-options'
import { isUuid } from './params'

export const THREADS_TEXT_LIMIT = 500
/** The counter turns amber from here. */
export const THREADS_TEXT_WARN = 450
export const MAX_THREAD_ITEMS = 10
export const MAX_THREAD_MEDIA = 20

export interface ThreadItemDraft {
  text: string
  /** Aset photos, in order. */
  assetIds: string[]
}

// Threads counts an emoji as its UTF-8 byte length and any other character once.
const BYTE_COUNTED = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣\u{e0020}-\u{e007f}]/u

const utf8Length = (codePoint: number) => (codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4)
const charLength = (char: string) => (BYTE_COUNTED.test(char) ? utf8Length(char.codePointAt(0) ?? 0) : 1)

/** Length as Threads counts it against THREADS_TEXT_LIMIT. */
export function threadsLength(text: string): number {
  let length = 0
  for (const char of text) length += charLength(char)
  return length
}

/** Where a long text may be cut, best first: after a paragraph, a line, a sentence, then at any space. */
const BREAKS = [
  { pattern: /\n\s*\n/g, after: false },
  { pattern: /\n/g, after: false },
  { pattern: /[.!?…](?=\s)/g, after: true },
  { pattern: /\s/g, after: false },
]

/** Code units of the longest start of `text` that fits in `limit`. */
function fittingEnd(text: string, limit: number): number {
  let length = 0
  let end = 0
  for (const char of text) {
    length += charLength(char)
    if (length > limit) break
    end += char.length
  }
  return end
}

/** The last cut of the best kind within `end` that keeps the part at least half full; null when there is none. */
function cutBefore(text: string, end: number): number | null {
  for (const { pattern, after } of BREAKS) {
    let best: number | null = null
    for (const match of text.matchAll(pattern)) {
      const cut = after ? match.index + match[0].length : match.index
      if (cut > end) break
      if (cut >= end / 2) best = cut
    }
    if (best !== null) return best
  }
  return null
}

/** Pecah otomatis: text over the limit becomes several parts, cut where a reader would pause. */
export function splitThreadText(text: string, limit = THREADS_TEXT_LIMIT): string[] {
  const parts: string[] = []
  let rest = text.replace(/\r\n/g, '\n').trim()
  while (threadsLength(rest) > limit) {
    const end = fittingEnd(rest, limit)
    const cut = cutBefore(rest, end) ?? end
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest || parts.length === 0) parts.push(rest)
  return parts
}

/** The chain a post gets until the owner changes it: the caption, split where needed, with every photo on the first. */
export function itemsFromCaption(caption: string, assetIds: readonly string[]): ThreadItemDraft[] {
  return splitThreadText(caption).map((text, index) => ({
    text,
    assetIds: index === 0 ? assetIds.slice(0, MAX_THREAD_MEDIA) : [],
  }))
}

/** Why the chain can't go to Threads, or null. */
export function threadItemsError(items: readonly ThreadItemDraft[]): string | null {
  if (items.length === 0) return 'Post Threads masih kosong.'
  if (items.length > MAX_THREAD_ITEMS) return `Maksimal ${MAX_THREAD_ITEMS} post dalam satu rantai Threads.`
  for (const [index, item] of items.entries()) {
    const number = index + 1
    if (threadsLength(item.text) > THREADS_TEXT_LIMIT) {
      return `Post Threads #${number} lebih dari ${THREADS_TEXT_LIMIT} karakter. Pendekkan atau pakai Pecah otomatis.`
    }
    if (item.assetIds.length > MAX_THREAD_MEDIA) return `Post Threads #${number} punya lebih dari ${MAX_THREAD_MEDIA} foto.`
    if (!item.text.trim() && item.assetIds.length === 0) {
      return `Post Threads #${number} kosong: isi teks atau tambahkan foto.`
    }
  }
  return null
}

/**
 * Reads the chain the editor sent: up to 10 items of text and photo ids. An empty chain is allowed: the post then
 * follows its caption again. Threads' own length count is checked by threadItemsError when the chain is scheduled.
 */
export function parseThreadItems(input: unknown): { items: ThreadItemDraft[] } | { error: string } {
  if (!Array.isArray(input) || input.length > MAX_THREAD_ITEMS) return { error: 'Rantai Threads tidak valid.' }
  const items: ThreadItemDraft[] = []
  for (const item of input) {
    if (!isObject(item) || typeof item.text !== 'string' || !Array.isArray(item.assetIds)) {
      return { error: 'Rantai Threads tidak valid.' }
    }
    const assetIds: unknown[] = item.assetIds
    if (assetIds.length > MAX_THREAD_MEDIA || !assetIds.every(isUuid)) return { error: 'Foto Threads tidak valid.' }
    const text = item.text.replace(/\r\n/g, '\n').trim()
    // The database caps the text at 500 code points.
    if ([...text].length > THREADS_TEXT_LIMIT) {
      return { error: `Post Threads #${items.length + 1} lebih dari ${THREADS_TEXT_LIMIT} karakter.` }
    }
    items.push({ text, assetIds: [...new Set(assetIds)] })
  }
  return { items }
}

/** The container a chain item needs: text only, one photo, or a carousel. */
export const threadsMediaType = (photos: number) => (photos === 0 ? 'TEXT' : photos === 1 ? 'IMAGE' : 'CAROUSEL')
