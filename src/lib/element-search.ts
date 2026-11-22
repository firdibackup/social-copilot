/** Pencarian Elemen: plain word matching for the editor's shapes and icons. Pure. */

/** Lower case, without accents or punctuation, single spaces. */
export const normalizeQuery = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Every word of the query starts a word of the haystack ("pan" finds "panah kanan", "ah" does not). */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalizeQuery(haystack).split(' ')
  const terms = normalizeQuery(query).split(' ').filter(Boolean)
  return terms.every((term) => words.some((word) => word.startsWith(term)))
}

/** The items whose text matches; an empty query keeps them all. */
export function searchItems<T>(items: readonly T[], textOf: (item: T) => string, query: string): T[] {
  return normalizeQuery(query) ? items.filter((item) => matchesQuery(textOf(item), query)) : [...items]
}
