import { describe, expect, it } from 'vitest'
import { carouselGuide, HOOK_ARCHETYPES } from './carousel-guide'

describe('carouselGuide', () => {
  it('names only the chosen archetype', () => {
    const guide = carouselGuide('story')

    expect(guide).toContain(HOOK_ARCHETYPES.story)
    expect(guide).not.toContain(HOOK_ARCHETYPES.curiosity)
  })

  it('selects structures by context and evidence while preserving the brand voice', () => {
    const guide = carouselGuide()

    expect(guide).toContain('bukan pilihan acak')
    expect(guide).toContain('Template hanya struktur, bukan gaya penulisan')
    expect(guide).toContain('contoh referensi bukan fakta brand')
    expect(guide).toContain('Jika bukti tidak tersedia, pilih pertanyaan')
    expect(guide).not.toContain('Arah struktur yang diminta:')
  })

  it('requires payoff rather than a CTA-only ending for two slides', () => {
    expect(carouselGuide('auto', 'lengkap', 2)).toContain('jangan diganti slide CTA saja')
  })
})

describe('carouselGuide on inner slides', () => {
  it('asks for complete sentences until the reader understands, without abbreviations', () => {
    const guide = carouselGuide('story', 'lengkap')

    expect(guide).toContain('2–3 kalimat lengkap atau 3–5 poin')
    expect(guide).toContain('tanpa singkatan')
    expect(guide).not.toContain('1–3 kalimat pendek')
  })

  it('sits between ringkas and lengkap by default', () => {
    const guide = carouselGuide('story')

    expect(guide).toContain('Tulis seimbang')
    expect(guide).toContain('1–2 kalimat penjelasan, lalu 2–4 poin')
    expect(guide).toContain('tanpa singkatan')
  })
})
