import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CalendarPeriodLink } from './calendar-period-link'

vi.mock('next/link', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }))
vi.mock('next/link', async () => {
  const React = await import('react')
  return {
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', props, children),
    useLinkStatus: () => ({ pending: true }),
  }
})

describe('CalendarPeriodLink', () => {
  it('shows navigation progress while the target period is loading', () => {
    const html = renderToStaticMarkup(<CalendarPeriodLink href="/kalender?bulan=2026-11" label="Bulan berikutnya">Berikutnya</CalendarPeriodLink>)

    expect(html).toContain('h-11 min-w-11')
    expect(html).toContain('href="/kalender?bulan=2026-11"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Memuat kalender')
  })

  it('uses the server-translated progress label for English', () => {
    const html = renderToStaticMarkup(
      <CalendarPeriodLink href="/kalender?bulan=2026-11" label="Next month" loadingLabel="Loading calendar">Next</CalendarPeriodLink>,
    )

    expect(html).toContain('aria-label="Next month"')
    expect(html).toContain('Loading calendar')
    expect(html).not.toContain('Memuat kalender')
  })
})
