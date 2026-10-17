import { describe, expect, it } from 'vitest'
import { parseAdjustment, parseAdminEmails, parseGrantDays, parsePassword, parseSettings, parseWhole } from './admin-options'

const SETTINGS = {
  textModel: ' cc/claude-haiku-4-5-20251001 ',
  imageModel: '',
  planName: 'Social Copilot 30 hari',
  planPrice: '99.000',
  planDays: '30',
  planCredits: '10000',
}

describe('parseAdminEmails', () => {
  it('reads a comma-separated list, trimmed and lowercased', () => {
    expect(parseAdminEmails(' Owner@Example.com, ,b@x.id ')).toEqual(new Set(['owner@example.com', 'b@x.id']))
    expect(parseAdminEmails(undefined).size).toBe(0)
  })
})

describe('parseWhole', () => {
  it('accepts whole numbers in range, with id-ID thousand dots', () => {
    expect(parseWhole('99.000', 0, 100_000)).toBe(99_000)
    expect(parseWhole(30, 1, 366)).toBe(30)
  })

  it.each(['', '1,5', 'abc', '0', '367'])('refuses %j for 1–366', (value) => {
    expect(parseWhole(value, 1, 366)).toBeNull()
  })
})

describe('parseSettings', () => {
  it('trims the models and keeps an empty one as null, the default', () => {
    expect(parseSettings(SETTINGS)).toEqual({
      settings: {
        textModel: 'cc/claude-haiku-4-5-20251001',
        imageModel: null,
        plan: { name: 'Social Copilot 30 hari', priceIdr: 99_000, days: 30, credits: 10_000 },
      },
    })
  })

  it('refuses a model id with spaces', () => {
    expect(parseSettings({ ...SETTINGS, imageModel: 'gpt image' })).toEqual({ error: expect.stringContaining('Model gambar') })
  })

  it.each([
    ['planName', ''],
    ['planPrice', '-1'],
    ['planDays', '0'],
    ['planCredits', '0'],
  ])('refuses %s = %j', (field, value) => {
    expect(parseSettings({ ...SETTINGS, [field]: value })).toHaveProperty('error')
  })
})

describe('parseAdjustment', () => {
  it('gives credits as a positive amount and takes them as a negative one', () => {
    expect(parseAdjustment({ kind: 'add', credits: '500', note: ' bonus ' })).toEqual({ amount: 500, note: 'bonus' })
    expect(parseAdjustment({ kind: 'remove', credits: '200', note: '' })).toEqual({ amount: -200, note: null })
  })

  it('refuses a missing kind or a zero amount', () => {
    expect(parseAdjustment({ kind: 'x', credits: '5' })).toHaveProperty('error')
    expect(parseAdjustment({ kind: 'add', credits: '0' })).toHaveProperty('error')
  })
})

describe('parseGrantDays and parsePassword', () => {
  it('checks their ranges', () => {
    expect(parseGrantDays('7')).toBe(7)
    expect(parseGrantDays('400')).toHaveProperty('error')
    expect(parsePassword('rahasia123')).toBe('rahasia123')
    expect(parsePassword('pendek')).toHaveProperty('error')
  })
})
