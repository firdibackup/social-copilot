import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import { formatCredits, parseAdjustment, parseGrantDays, parsePassword, parseSettings } from '@/lib/admin-options'
import idAdmin from '@/../messages/id/admin.json'
import enAdmin from '@/../messages/en/admin.json'
import idSettings from '@/../messages/id/settings.json'
import enSettings from '@/../messages/en/settings.json'

function keys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const full = prefix ? `${prefix}.${key}` : key
    return typeof child === 'object' && child !== null ? keys(child as Record<string, unknown>, full) : [full]
  }).sort()
}

describe('settings and admin localization', () => {
  it('keeps both catalogs structurally identical', () => {
    expect(keys(enAdmin)).toEqual(keys(idAdmin))
    expect(keys(enSettings)).toEqual(keys(idSettings))
    expect(keys(idAdmin).some((key) => /\.message\d+$/.test(key))).toBe(false)
  })

  it('preserves Indonesian validation by default and supports English', () => {
    expect(parseGrantDays('0')).toEqual({ error: 'Jumlah hari 1–366.' })
    expect(parseGrantDays('0', 'en')).toEqual({ error: 'Number of days must be 1–366.' })
    expect(parsePassword('short', 'en')).toEqual({ error: 'Password must be at least 8 characters.' })
    expect(parseAdjustment({ credits: 0 }, 'en')).toEqual({ error: 'Credit amount must be a number greater than 0.' })
    expect(parseSettings({ textModel: 'bad model' }, 'en')).toEqual({ error: 'Text model is invalid: use a 9Router model ID with no spaces.' })
    expect(formatCredits(1234)).toBe('1.234')
    expect(formatCredits(1234, 'en')).toBe('1,234')
  })

  it('renders English counts and Indonesian connection confirmations', () => {
    const id = createTranslator({ locale: 'id', messages: idSettings })
    const en = createTranslator({ locale: 'en', messages: enSettings })
    expect(id('disconnect_button.returns', { username: 'creator' })).toBe('Semuanya kembali kalau @creator dihubungkan lagi.')
    expect(en('disconnect_button.scheduledDrafts', { count: 1 })).toBe('1 scheduled post will become a draft again.')
    expect(en('disconnect_button.scheduledDrafts', { count: 2 })).toBe('2 scheduled posts will become drafts again.')
  })
})
