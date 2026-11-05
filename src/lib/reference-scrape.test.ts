import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('./supabase', () => ({ db: vi.fn(), unwrap: vi.fn() }))
vi.mock('./apify', () => ({ fetchProfilePosts: vi.fn() }))

const { scrapeWeek } = await import('./reference-scrape')

describe('scrapeWeek', () => {
  it('is the Monday of the WIB week', () => {
    // Thursday 2026-11-05 10:00 WIB.
    expect(scrapeWeek(new Date('2026-11-05T03:00:00Z'))).toBe('2026-11-02')
    // Monday itself.
    expect(scrapeWeek(new Date('2026-11-02T00:00:00+07:00'))).toBe('2026-11-02')
    // Sunday 23:30 WIB still belongs to the week before.
    expect(scrapeWeek(new Date('2026-11-08T23:30:00+07:00'))).toBe('2026-11-02')
    // Sunday 17:30 UTC is already Monday 00:30 WIB.
    expect(scrapeWeek(new Date('2026-11-08T17:30:00Z'))).toBe('2026-11-09')
    // Across a year boundary.
    expect(scrapeWeek(new Date('2027-01-01T05:00:00Z'))).toBe('2026-12-28')
  })
})
