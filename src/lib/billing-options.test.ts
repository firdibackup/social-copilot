import { describe, expect, it } from 'vitest'
import { contentCost, formatCreditShare, formatRupiah, usedPercent } from './billing-options'

describe('contentCost', () => {
  it('charges the caption and plan once plus 20 credits for every slide image', () => {
    expect(contentCost(1)).toBe(23)
    expect(contentCost(3)).toBe(63)
    expect(contentCost(10)).toBe(203)
  })
})

describe('usedPercent', () => {
  it('rounds down, so 100% means the credits are truly spent', () => {
    expect(usedPercent(0)).toBe(0)
    expect(usedPercent(99)).toBe(0)
    expect(usedPercent(100)).toBe(1)
    expect(usedPercent(9_999)).toBe(99)
    expect(usedPercent(10_000)).toBe(100)
  })

  it.each([
    [2_900, 29],
    [5_700, 57],
    [5_800, 58],
  ])('stays exact where dividing first loses a percent to floating point: %i credits', (used, percent) => {
    expect(usedPercent(used)).toBe(percent)
  })

  it('caps at 100 when more than the period allows was used', () => {
    expect(usedPercent(15_000)).toBe(100)
  })
})

describe('formatCreditShare', () => {
  it('shows a cost as a share of the period with an id-ID decimal comma', () => {
    expect(formatCreditShare(103)).toBe('1%')
    expect(formatCreditShare(23)).toBe('0,2%')
    expect(formatCreditShare(2_030)).toBe('20,3%')
  })

  it('leaves out a zero decimal', () => {
    expect(formatCreditShare(200)).toBe('2%')
  })
})

describe('formatRupiah', () => {
  it('formats whole rupiah in id-ID, with a no-break space after Rp', () => {
    expect(formatRupiah(99_000)).toBe('Rp 99.000')
  })
})
