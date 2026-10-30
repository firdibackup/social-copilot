import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PendingLink } from './pending-link'

vi.mock('next/link', async () => {
  const React = await import('react')
  return {
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', props, children),
    useLinkStatus: () => ({ pending: true }),
  }
})

describe('PendingLink', () => {
  it('shows immediate feedback while Balasan navigation loads', () => {
    const html = renderToStaticMarkup(<PendingLink href="/balasan?c=1">Percakapan</PendingLink>)

    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Memuat balasan')
  })
})
