import { describe, expect, it } from 'vitest'
import { carouselGuide, HOOK_ARCHETYPES, pickHook } from './carousel-guide'

describe('pickHook', () => {
  it('can pick every archetype, including at the edges of the random range', () => {
    expect(pickHook(() => 0)).toBe('authority')
    expect(pickHook(() => 0.999999)).toBe('contrarian')
    expect(pickHook(() => 1)).toBe('contrarian')
    const picked = new Set([0, 0.2, 0.4, 0.6, 0.8].map((value) => pickHook(() => value)))
    expect(picked).toEqual(new Set(Object.keys(HOOK_ARCHETYPES)))
  })
})

describe('carouselGuide', () => {
  it('names only the chosen archetype', () => {
    const guide = carouselGuide('story')

    expect(guide).toContain(HOOK_ARCHETYPES.story)
    expect(guide).not.toContain(HOOK_ARCHETYPES.curiosity)
  })
})

describe('carouselGuide on inner slides', () => {
  it('asks for complete sentences until the reader understands, without abbreviations', () => {
    const guide = carouselGuide('story')

    expect(guide).toContain('2–3 kalimat lengkap atau 3–5 poin')
    expect(guide).toContain('tanpa singkatan')
    expect(guide).not.toContain('1–3 kalimat pendek')
  })
})
