import { describe, expect, it } from 'vitest'
import { canBlink, resolveFace, typingExpression, type MascotState } from './mascot-expression'

const calm: MascotState = { mood: 'idle', burst: null, blink: false, sleepy: false, attentive: false, typing: null }
const face = (state: Partial<MascotState>) => resolveFace({ ...calm, ...state })

describe('resolveFace', () => {
  it('follows the mood when nothing else happens', () => {
    expect(face({})).toEqual({ expression: 'idle', blink: false })
    expect(face({ mood: 'thinking' }).expression).toBe('wow')
  })

  it('lets a burst win over everything, eyes open', () => {
    expect(face({ burst: 'happy', blink: true, sleepy: true, typing: 'hmm' })).toEqual({ expression: 'happy', blink: false })
  })

  it('blinks only with open eyes and keeps the face, so the mouth stays', () => {
    expect(face({ blink: true })).toEqual({ expression: 'idle', blink: true })
    expect(face({ blink: true, typing: 'curious' })).toEqual({ expression: 'curious', blink: true })
    expect(face({ blink: true, sleepy: true })).toEqual({ expression: 'sleepy', blink: false })
    expect(face({ blink: true, mood: 'happy' })).toEqual({ expression: 'happy', blink: false })
    expect(face({ blink: true, typing: 'excited' }).blink).toBe(false)
    expect(canBlink('worried')).toBe(true)
    expect(canBlink('shy')).toBe(false)
  })

  it('stays awake and smiles at attention only when idle', () => {
    expect(face({ sleepy: true, mood: 'thinking' }).expression).toBe('wow')
    expect(face({ attentive: true }).expression).toBe('smile')
    expect(face({ attentive: true, mood: 'thinking' }).expression).toBe('wow')
  })

  it('shows the typing face, except while Mimo is thinking', () => {
    expect(face({ typing: 'hmm', sleepy: true, attentive: true }).expression).toBe('hmm')
    expect(face({ typing: 'hmm', mood: 'thinking' }).expression).toBe('wow')
  })
})

describe('typingExpression', () => {
  it('has nothing to react to in an empty field', () => {
    expect(typingExpression({ text: '   ', erasing: 0 })).toBeNull()
  })

  it('listens while the owner types', () => {
    expect(typingExpression({ text: 'Bikin ide konten', erasing: 0 })).toBe('curious')
  })

  it('wonders at questions and cheers at exclamations', () => {
    expect(typingExpression({ text: 'Konten apa yang cocok?', erasing: 0 })).toBe('hmm')
    expect(typingExpression({ text: 'Ayo mulai!', erasing: 0 })).toBe('excited')
  })

  it('gets shy at thanks and winks at a greeting', () => {
    expect(typingExpression({ text: 'Oke makasih ya', erasing: 0 })).toBe('shy')
    expect(typingExpression({ text: 'Halo Mimo', erasing: 0 })).toBe('wink')
    expect(typingExpression({ text: 'Halo Mimo, tolong bikin ide konten kopi', erasing: 0 })).toBe('curious')
  })

  it('worries when the owner keeps erasing, even down to nothing', () => {
    expect(typingExpression({ text: 'Bikin', erasing: 4 })).toBe('worried')
    expect(typingExpression({ text: '', erasing: 6 })).toBe('worried')
    expect(typingExpression({ text: 'Bikin', erasing: 2 })).toBe('curious')
  })

  it('is amazed by long text and big pastes', () => {
    expect(typingExpression({ text: 'a'.repeat(300), erasing: 0 })).toBe('wow')
    expect(typingExpression({ text: 'b'.repeat(150), erasing: 0, pasted: true })).toBe('wow')
    expect(typingExpression({ text: 'b'.repeat(150), erasing: 0 })).toBe('curious')
  })
})
