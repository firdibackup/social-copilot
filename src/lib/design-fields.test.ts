import { describe, expect, it } from 'vitest'
import { fieldMaxChars, fieldReady, isFieldConfig } from './design-fields'
describe('AI fields', () => {
  it('bounds prompts and rejects wrong kinds and unexpected properties', () => {
    expect(isFieldConfig({ kind: 'text', mode: 'ai', prompt: 'Headline', length: 'short' }, 'text')).toBe(true)
    expect(isFieldConfig({ kind: 'image', mode: 'ai_generate', prompt: '' }, 'text')).toBe(false)
    expect(isFieldConfig({ kind: 'text', mode: 'static', prompt: 'ignored?' }, 'text')).toBe(false)
    expect(isFieldConfig({ kind: 'text', mode: 'ai', prompt: 'a'.repeat(2001), length: 'auto' }, 'text')).toBe(false)
    expect(isFieldConfig({ kind: 'text', mode: 'ai', prompt: 'Headline', length: ['auto'] }, 'text')).toBe(false)
  })
  it('requires a nonempty prompt for readiness', () => {
    expect(fieldReady({ kind: 'text', mode: 'ai', prompt: '  ', length: 'auto' })).toBe(false)
    expect(fieldReady({ kind: 'text', mode: 'ai', prompt: 'Headline', length: 'short' })).toBe(true)
    expect(fieldReady({ kind: 'image', mode: 'static' })).toBe(false)
  })
  it('estimates capacity from box and chosen line count', () => {
    expect(fieldMaxChars(904, 84, 56, 1.2, 'auto')).toBe(31)
    expect(fieldMaxChars(904, 84, 56, 1.2, 'medium')).toBe(62)
    expect(fieldMaxChars(904, 84, 56, 1.2, 'long')).toBe(93)
    expect(fieldMaxChars(20, 10, 56, 1.2, 'auto')).toBe(0)
    expect(fieldMaxChars(904, 84, 0, 1.2, 'auto')).toBe(0)
  })
})
