import { describe, expect, it } from 'vitest'
import { describeStrategy, evenShares, normalizeShares, parseStrategy, pillarQuota, readStoredStrategy } from './strategy-options'

const VALID = {
  identity: 'The Engineer',
  pillars: [
    { id: 'p-a', name: 'Edukasi teknis', detail: 'cara kerja sistem', share: 30 },
    { id: 'p-b', name: 'Portofolio', detail: '', share: 25 },
    { id: 'p-c', name: 'Kredibilitas', detail: '', share: 20 },
    { id: 'p-d', name: 'Brand awareness', detail: '', share: 15 },
    { id: 'p-e', name: 'Soft CTA', detail: 'konsultasi via WA', share: 10 },
  ],
  tone: 'Bahasa rapi & profesional',
  focus: 'awareness',
  postsPerWeek: 5,
}

describe('evenShares', () => {
  it('adds up to 100 with the remainder first', () => {
    expect(evenShares(3)).toEqual([34, 33, 33])
    expect(evenShares(6).reduce((a, b) => a + b, 0)).toBe(100)
    expect(evenShares(0)).toEqual([])
  })
})

describe('normalizeShares', () => {
  it('scales weights to whole shares of 100', () => {
    expect(normalizeShares([30, 25, 20, 15, 10])).toEqual([30, 25, 20, 15, 10])
    const shares = normalizeShares([1, 1, 1])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('keeps every share at least 5 and falls back to even shares', () => {
    expect(Math.min(...normalizeShares([100, 0, 0]))).toBeGreaterThanOrEqual(5)
    expect(normalizeShares([0, Number.NaN])).toEqual([50, 50])
  })
})

describe('pillarQuota', () => {
  it('splits ten ideas by share', () => {
    expect(pillarQuota(VALID.pillars, 10)).toEqual([3, 3, 2, 1, 1])
    expect(pillarQuota([{ share: 50 }, { share: 50 }], 3)).toEqual([2, 1])
  })

  it('gives nothing without pillars or count', () => {
    expect(pillarQuota([], 10)).toEqual([])
    expect(pillarQuota([{ share: 100 }], 0)).toEqual([0])
  })
})

describe('parseStrategy', () => {
  it('accepts a valid strategy', () => {
    expect(parseStrategy(VALID)).toEqual({ strategy: VALID })
  })

  it('requires the shares to add up to 100', () => {
    const pillars = VALID.pillars.map((pillar, index) => (index === 0 ? { ...pillar, share: 25 } : pillar))
    expect(parseStrategy({ ...VALID, pillars })).toEqual({ error: 'Total takaran harus 100% (sekarang 95%).' })
  })

  it('rejects bad pillars, focus and frequency', () => {
    expect(parseStrategy({ ...VALID, pillars: VALID.pillars.slice(0, 1) })).toHaveProperty('error')
    expect(parseStrategy({ ...VALID, pillars: [VALID.pillars[0], { ...VALID.pillars[1], id: 'p-a' }] })).toHaveProperty('error')
    expect(parseStrategy({ ...VALID, pillars: [{ ...VALID.pillars[0], share: 97 }, { ...VALID.pillars[1], share: 3 }] })).toHaveProperty('error')
    expect(parseStrategy({ ...VALID, focus: 'viral' })).toEqual({ error: 'Pilih fokus saat ini.' })
    expect(parseStrategy({ ...VALID, postsPerWeek: 15 })).toHaveProperty('error')
    expect(parseStrategy({ ...VALID, identity: ' ' })).toEqual({ error: 'Isi identitas brand.' })
  })

  it('reads a stored strategy or drops a broken one', () => {
    expect(readStoredStrategy(VALID)).toEqual(VALID)
    expect(readStoredStrategy({ identity: 'x' })).toBeNull()
    expect(readStoredStrategy(null)).toBeNull()
  })
})

describe('describeStrategy', () => {
  it('lists the pillars with their shares', () => {
    const text = describeStrategy(VALID as never)
    expect(text).toContain('Identitas: The Engineer')
    expect(text).toContain('- 30% Edukasi teknis (cara kerja sistem)')
    expect(text).toContain('Fokus saat ini: Meningkatkan awareness')
  })
})
