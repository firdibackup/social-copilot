import { describe, expect, it } from 'vitest'
import { resolveExpression, type MascotState } from './mascot-expression'

const calm: MascotState = { mood: 'idle', burst: null, blink: false, sleepy: false, attentive: false }

describe('resolveExpression', () => {
  it('follows the mood when nothing else happens', () => {
    expect(resolveExpression(calm)).toBe('idle')
    expect(resolveExpression({ ...calm, mood: 'thinking' })).toBe('wow')
  })

  it('lets a burst win over everything', () => {
    expect(resolveExpression({ ...calm, burst: 'happy', blink: true, sleepy: true })).toBe('happy')
  })

  it('blinks only with open eyes, never while sleepy', () => {
    expect(resolveExpression({ ...calm, blink: true })).toBe('blink')
    expect(resolveExpression({ ...calm, blink: true, sleepy: true })).toBe('sleepy')
    expect(resolveExpression({ ...calm, blink: true, mood: 'happy' })).toBe('happy')
  })

  it('stays awake and smiles at attention only when idle', () => {
    expect(resolveExpression({ ...calm, sleepy: true, mood: 'thinking' })).toBe('wow')
    expect(resolveExpression({ ...calm, attentive: true })).toBe('smile')
    expect(resolveExpression({ ...calm, attentive: true, mood: 'thinking' })).toBe('wow')
  })
})
