/** The four public legal pages: their path, nav label key (common.site.*) and document in legal.json. */
export const LEGAL_PAGES = [
  { doc: 'privacy', href: '/privasi', label: 'privacy' },
  { doc: 'terms', href: '/syarat', label: 'terms' },
  { doc: 'refund', href: '/refund', label: 'refund' },
  { doc: 'deletion', href: '/hapus-data', label: 'deletion' },
] as const

export type LegalDocName = (typeof LEGAL_PAGES)[number]['doc']
