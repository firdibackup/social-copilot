import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import id from '../../../../messages/id/mimo.json'
import en from '../../../../messages/en/mimo.json'
import { analyzeRequest, attachmentsProblem, checkAttachment, parseBulkSettings, sessionTitle, suggestionsFor } from '@/lib/chat-options'

function keys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof entry === 'object' && entry !== null ? keys(entry as Record<string, unknown>, path) : [path]
  }).sort()
}

describe('Mimo translations', () => {
  it('has matching Indonesian and English keys', () => {
    expect(keys(en)).toEqual(keys(id))
  })

  it('preserves default Indonesian validation and translates English validation', () => {
    const file = { name: 'notes.txt', type: 'text/plain', size: 10 }
    expect(checkAttachment(file)).toEqual({ error: 'notes.txt: hanya PDF, JPG, PNG, atau WebP.' })
    expect(checkAttachment(file, 'en')).toEqual({ error: 'notes.txt: only PDF, JPG, PNG, or WebP files are supported.' })
    expect(attachmentsProblem(['pdf', 'pdf'], 'en')).toBe('Maximum 1 PDF per message.')
    expect(parseBulkSettings(null, 'en')).toEqual({ error: 'Invalid content settings.' })
    expect(sessionTitle('', '')).toBe('Chat baru')
    expect(sessionTitle('', '', 'en')).toBe('New chat')
  })

  it('localizes the prompts sent by suggestion and analysis buttons', () => {
    expect(suggestionsFor('empty')[0]).toBe('Cari 5 konten yang lagi trending buat niche aku')
    expect(suggestionsFor('after_script', 'en')[0]).toBe('Change the hook')
    expect(analyzeRequest(['brand'], 'en')).toBe('Analyze content patterns for @brand: hooks, posting frequency, and content pillars.')
  })

  it('formats counts and interpolated titles without losing punctuation', () => {
    const t = createTranslator({ locale: 'en', messages: en })
    expect(t('cards.scriptSlides', { count: 1 })).toBe('Script · 1 slide')
    expect(t('cards.scriptSlides', { count: 3 })).toBe('Script · 3 slides')
    expect(t('sessionButtons.confirm', { title: 'My chat' })).toBe('Delete conversation "My chat"?')
  })
})
