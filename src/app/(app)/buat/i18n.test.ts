import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import id from '../../../../messages/id/editor.json'
import en from '../../../../messages/en/editor.json'
import { parseContentRequest, parseInstruction } from '@/lib/content-options'
import { parseScript, readScriptText } from '@/lib/script-options'
import { parseTemplateEdit } from '@/lib/template-options'

function keys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, item]) => {
    const name = prefix ? `${prefix}.${key}` : key
    return typeof item === 'object' && item !== null ? keys(item as Record<string, unknown>, name) : [name]
  }).sort()
}

describe('editor translations', () => {
  it('keeps identical Indonesian and English catalog keys', () => {
    expect(keys(en)).toEqual(keys(id))
  })

  it('retains Indonesian by default and validates content in English when requested', () => {
    expect(parseContentRequest(null)).toEqual({ error: 'Permintaan tidak valid.' })
    expect(parseContentRequest(null, 'en')).toEqual({ error: 'Invalid request.' })
    expect(parseInstruction('', 'en')).toEqual({ error: 'Describe the changes you want first.' })
  })

  it('passes the locale through script validation', () => {
    expect(parseScript([], 'en')).toEqual({ error: 'The script is empty.' })
    expect(readScriptText('Slide 1', 'en')).toEqual({ error: 'Slide 1 in the script is still empty.' })
    expect(readScriptText('Slide 1')).toEqual({ error: 'Slide 1 di skrip masih kosong.' })
  })

  it('validates template choices in English', () => {
    expect(parseTemplateEdit({}, [], 'en')).toEqual({ error: 'Choose at least one style.' })
  })

  it('formats editor counts with ICU', () => {
    const t = createTranslator({ locale: 'en', messages: en, namespace: 'contentList' })
    expect(t('scriptReady', { count: 1 })).toBe('Script ready · 1 slide')
    expect(t('scriptReady', { count: 3 })).toBe('Script ready · 3 slides')
  })
})
