import { describe, expect, it } from 'vitest'
import { carouselGuide, HOOK_ARCHETYPES, IDEA_QUALITY_RULE, VOICE_RULE } from './carousel-guide'

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
    expect(guide).toContain('Jika bukti tidak tersedia, pakai benda, kalimat, perbandingan')
    expect(guide).toContain('Mekanisme hook')
    expect(guide).toContain('Hindari:')
    expect(guide).toContain('Hook membuka celah, bukan menutupnya')
    expect(guide).not.toContain('Arah struktur yang diminta:')
  })

  it('gives inner slides a claim, proof and action instead of a label', () => {
    const guide = carouselGuide('auto', 'seimbang', 5)

    expect(guide).toContain('Knowledge slide isi')
    expect(guide).toContain('Judul slide isi adalah klaim')
    expect(guide).toContain('Mitos, fakta, uji')
    expect(guide).toContain('Kuis atau tebakan yang jawabannya sudah kelihatan')
    expect(guide).toContain('sapaan, satu kata atau ungkapan khas, dan sudut bicara')
  })

  it('requires every structural role to do a distinct job', () => {
    const guide = carouselGuide('auto', 'lengkap', 10)

    expect(guide).toContain('Bridge')
    expect(guide).toContain('Problem')
    expect(guide).toContain('Reframe')
    expect(guide).toContain('Value')
    expect(guide).toContain('Proof')
    expect(guide).toContain('Recap')
    expect(guide).toContain('CTA')
  })

  it('asks for a specific hook in a register that is neither stiff nor slangy', () => {
    const guide = carouselGuide()
    expect(guide).toContain('Hindari pertanyaan ya/tidak')
    expect(guide).toContain('masih cocok dipasang di brand lain')
    expect(VOICE_RULE).toContain('Hindari bahasa kaku khas dokumen')
    expect(VOICE_RULE).toContain('hindari bahasa terlalu santai')
    expect(IDEA_QUALITY_RULE).toContain('sudut pandang audiens')
    expect(guide).toContain('slide perbandingan berdampingan')
    expect(guide).toContain('informasi baru yang belum ada di slide lain')
    expect(guide).toContain('gabungkan pertanyaan dan jawabannya di satu slide')
    expect(guide).toContain('kurangi angkanya atau hapus angka dari hook')
    expect(IDEA_QUALITY_RULE).toContain('jangan dua ide dengan format yang sama')
  })

  it('requires payoff rather than a CTA-only ending for two slides', () => {
    expect(carouselGuide('auto', 'lengkap', 2)).toContain('Value + CTA')
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
    expect(guide).toContain('1–2 kalimat penjelasan ATAU 2–4 poin')
    expect(guide).toContain('tanpa singkatan')
  })
})
