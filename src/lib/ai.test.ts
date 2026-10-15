import { describe, expect, it } from 'vitest'
import { buildMessages, parseAiRequest } from './ai'
import type { AiRequest, Brief } from './ai-options'

const BRIEF: Brief = {
  topic: 'Promo kopi susu gula aren 20%',
  goal: 'promosi',
  tone: 'santai',
  audience: 'mahasiswa',
  photoCount: 3,
}
const CAPTIONS: AiRequest = { task: 'captions', brief: BRIEF }

describe('parseAiRequest', () => {
  it('accepts a brief and trims its text', () => {
    const input = { task: 'captions', brief: { ...BRIEF, topic: '  Promo kopi  ', audience: ' ' } }

    expect(parseAiRequest(input)).toEqual({
      request: { task: 'captions', brief: { ...BRIEF, topic: 'Promo kopi', audience: '' } },
    })
  })

  it('accepts a rewrite and hashtag request', () => {
    expect(parseAiRequest({ task: 'rewrite', style: 'cta', caption: 'Halo' })).toEqual({
      request: { task: 'rewrite', style: 'cta', caption: 'Halo' },
    })
    expect(parseAiRequest({ task: 'hashtags', caption: 'Halo\r\nsemua' })).toEqual({
      request: { task: 'hashtags', caption: 'Halo\nsemua' },
    })
  })

  it.each([
    ['a non-object', 'captions'],
    ['an unknown task', { task: 'publish' }],
    ['a missing brief', { task: 'ideas' }],
    ['an empty topic', { task: 'captions', brief: { ...BRIEF, topic: '   ' } }],
    ['a topic over 300 characters', { task: 'captions', brief: { ...BRIEF, topic: 'a'.repeat(301) } }],
    ['an audience over 150 characters', { task: 'captions', brief: { ...BRIEF, audience: 'a'.repeat(151) } }],
    ['an unknown goal', { task: 'captions', brief: { ...BRIEF, goal: 'viral' } }],
    ['a goal inherited from Object.prototype', { task: 'captions', brief: { ...BRIEF, goal: 'toString' } }],
    ['an unknown tone', { task: 'ideas', brief: { ...BRIEF, tone: 'marah' } }],
    ['eleven photos', { task: 'captions', brief: { ...BRIEF, photoCount: 11 } }],
    ['a fractional photo count', { task: 'captions', brief: { ...BRIEF, photoCount: 1.5 } }],
    ['an unknown rewrite style', { task: 'rewrite', style: 'puitis', caption: 'Halo' }],
    ['an empty caption', { task: 'hashtags', caption: ' \n ' }],
  ])('refuses %s', (_label, input) => {
    expect(parseAiRequest(input)).toHaveProperty('error')
  })

  it('counts code points, so 2,200 emoji fit and 2,201 do not', () => {
    expect(parseAiRequest({ task: 'rewrite', style: 'singkat', caption: '😀'.repeat(2200) })).toHaveProperty('request')
    expect(parseAiRequest({ task: 'rewrite', style: 'singkat', caption: '😀'.repeat(2201) })).toEqual({
      error: 'Caption lebih dari 2.200 karakter.',
    })
  })

  it('refuses hashtag suggestions for a caption that already has 30', () => {
    const caption = Array.from({ length: 30 }, (_, index) => `#tag${index}`).join(' ')

    expect(parseAiRequest({ task: 'hashtags', caption })).toEqual({ error: 'Caption sudah memakai 30 hashtag.' })
  })
})

describe('buildMessages', () => {
  it('sends the rules as the system message and the brief as the user message', () => {
    const [system, user] = buildMessages(CAPTIONS)

    expect(system).toMatchObject({ role: 'system' })
    expect(system.content).toContain('JSON')
    expect(user.role).toBe('user')
    expect(user.content).toContain('"""\nPromo kopi susu gula aren 20%\n"""')
    expect(user.content).toContain('Tujuan: Promosi atau jualan')
    expect(user.content).toContain('Nada: Santai')
    expect(user.content).toContain('Audiens: mahasiswa')
    expect(user.content).toContain('Format post: carousel 3 foto')
    expect(user.content).toContain('{"captions"')
  })

  it('describes a single photo, no photos and an empty audience', () => {
    expect(buildMessages({ task: 'ideas', brief: { ...BRIEF, photoCount: 1 } })[1].content).toContain('foto tunggal')

    const user = buildMessages({ task: 'ideas', brief: { ...BRIEF, photoCount: 0, audience: '' } })[1].content
    expect(user).toContain('belum ada foto')
    expect(user).toContain('Audiens: umum')
  })

  it('quotes the caption to rewrite', () => {
    const [, user] = buildMessages({ task: 'rewrite', style: 'cta', caption: 'Halo semua' })

    expect(user.content).toContain('"""\nHalo semua\n"""')
    expect(user.content).toContain('ajakan bertindak')
  })
})
