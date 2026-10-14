import { describe, expect, it } from 'vitest'
import { inspectCaption } from './caption'

describe('inspectCaption', () => {
  it('counts hashtags written in any script', () => {
    expect(inspectCaption('Ngopi pagi #kopi #コーヒー #ramadan2026').hashtags).toBe(3)
  })

  it('counts mentions with dots and underscores', () => {
    expect(inspectCaption('Bareng @kopi.kenangan dan @teman_baik').mentions).toBe(2)
  })

  it('counts emoji as single characters', () => {
    expect(inspectCaption('☕️').length).toBe(2)
    expect(inspectCaption('😀').length).toBe(1)
  })

  it('accepts a caption within every limit', () => {
    expect(inspectCaption('Halo #dunia @teman').errors).toEqual([])
  })

  it('rejects a caption longer than 2200 characters', () => {
    expect(inspectCaption('a'.repeat(2201)).errors).toEqual(['Caption lebih dari 2.200 karakter.'])
  })

  it('rejects more than 30 hashtags', () => {
    const caption = Array.from({ length: 31 }, (_, index) => `#tag${index}`).join(' ')
    expect(inspectCaption(caption).errors).toEqual(['Hashtag lebih dari 30.'])
  })

  it('rejects more than 20 mentions', () => {
    const caption = Array.from({ length: 21 }, (_, index) => `@user${index}`).join(' ')
    expect(inspectCaption(caption).errors).toEqual(['Mention lebih dari 20.'])
  })
})
