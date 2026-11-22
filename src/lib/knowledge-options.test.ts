import { describe, expect, it } from 'vitest'
import { isDiagnostic, KnowledgeError, nextId, parseCase, parseHook, parseId, splitList } from './knowledge-options'

const ACCOUNT = { userId: '00000000-0000-4000-8000-000000000001', accountId: '17841400000000001' }
const CASE = {
  scope: 'all', tags: 'KPR, dp, kpr', verdict: 'failure', outcome: 'observed_failure',
  excerpt: ' Hook: DP 0% pasti lolos ', reason: 'Janji tanpa dasar.', principle: 'Jangan menjanjikan persetujuan bank.',
}

const errorOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    if (error instanceof KnowledgeError) return error.message
    throw error
  }
  return null
}

describe('parseHook', () => {
  it('keeps a placeholder pattern, trims it and leaves an empty id to the data layer', () => {
    expect(parseHook({ id: '', structure: '  [JUMLAH]  tanda [MASALAH_SPESIFIK] ', useWhen: ' Indikator yang bisa diperiksa. ', sources: 'S01, S02, S01' }))
      .toEqual({ id: null, structure: '[JUMLAH] tanda [MASALAH_SPESIFIK]', useWhen: 'Indikator yang bisa diperiksa.', sources: ['S01', 'S02'] })
    expect(parseHook({ id: 'own-7', structure: '[A] atau [B] untuk [KEBUTUHAN]?', useWhen: 'Perbandingan.' }).id).toBe('OWN-7')
  })

  it('refuses finished sentences, written numbers and missing fields', () => {
    expect(errorOf(() => parseHook({ structure: 'Cicilan rumah murah di Bekasi', useWhen: 'x' }))).toContain('[PLACEHOLDER]')
    expect(errorOf(() => parseHook({ structure: '3 tanda [MASALAH]', useWhen: 'x' }))).toContain('[JUMLAH]')
    expect(errorOf(() => parseHook({ structure: '', useWhen: 'x' }))).toBe('Struktur hook wajib diisi.')
    expect(errorOf(() => parseHook({ structure: '[HASIL] tanpa [HAMBATAN]', useWhen: '  ' }))).toBe('"Dipakai saat" wajib diisi.')
    expect(errorOf(() => parseHook({ structure: '[HASIL]', useWhen: 'x' }, 'en'))).toBeNull()
    expect(errorOf(() => parseHook({ structure: 'plain', useWhen: 'x' }, 'en'))).toContain('not a finished sentence')
  })
})

describe('parseCase', () => {
  it('lowercases and dedupes tags and maps "all" to no scope', () => {
    expect(parseCase(CASE, [])).toEqual({
      id: null, scope: null, tags: ['kpr', 'dp'], verdict: 'failure', outcome: 'observed_failure',
      excerpt: 'Hook: DP 0% pasti lolos', reason: 'Janji tanpa dasar.', principle: 'Jangan menjanjikan persetujuan bank.',
    })
  })

  it('accepts only an account that the form offered', () => {
    expect(parseCase({ ...CASE, scope: `${ACCOUNT.userId}:${ACCOUNT.accountId}` }, [ACCOUNT]).scope).toEqual(ACCOUNT)
    expect(errorOf(() => parseCase({ ...CASE, scope: `${ACCOUNT.userId}:999` }, [ACCOUNT]))).toContain('Akun tidak ditemukan')
  })

  it('requires tags, because retrieval only matches tags against the topic', () => {
    expect(errorOf(() => parseCase({ ...CASE, tags: ' , ' }, []))).toContain('minimal satu tag')
    expect(errorOf(() => parseCase({ ...CASE, tags: 'dp, a' }, []))).toBe('Setiap tag 2–40 karakter.')
  })

  it('mirrors the table checks for verdict and outcome', () => {
    expect(errorOf(() => parseCase({ ...CASE, verdict: 'success' }, []))).toBe('Pilih penilaian yang tersedia.')
    expect(errorOf(() => parseCase({ ...CASE, outcome: 'great' }, []))).toBe('Pilih status hasil yang tersedia.')
    expect(errorOf(() => parseCase({ ...CASE, outcome: 'verified_correction' }, []))).toContain('Kasus gagal')
    expect(parseCase({ ...CASE, verdict: 'qualified_success', outcome: 'verified_correction' }, []).outcome).toBe('verified_correction')
  })

  it('requires the example, reason and principle and caps the example like the table', () => {
    expect(errorOf(() => parseCase({ ...CASE, excerpt: '' }, []))).toBe('Contoh teks wajib diisi.')
    expect(errorOf(() => parseCase({ ...CASE, excerpt: 'x'.repeat(1201) }, []))).toContain('1200')
    expect(errorOf(() => parseCase({ ...CASE, principle: '' }, []))).toBe('Prinsip wajib diisi.')
  })
})

describe('helpers', () => {
  it('parses ids, lists, diagnostics and the next free id', () => {
    expect(parseId(' h-01 ')).toBe('H-01')
    expect(errorOf(() => parseId('bad id'))).toContain('ID hanya')
    expect(splitList('a\nb, a')).toEqual(['a', 'b'])
    expect(isDiagnostic({ kind: 'engineering_diagnostic_not_writer_exemplar' })).toBe(true)
    expect(isDiagnostic({ kind: 'owner_lesson' })).toBe(false)
    expect(isDiagnostic(null)).toBe(false)
    expect(nextId('OWN', [])).toBe('OWN-001')
    expect(nextId('OWN', ['OWN-002', 'OWN-010', 'OWNER-099', 'H001'])).toBe('OWN-011')
  })
})
