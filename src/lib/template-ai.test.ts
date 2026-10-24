import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runLogged } from './ai'
import { chatCompletion } from './nine-router'
import { analyzeTemplates, buildTemplateMessages, classifyDesigns, readTemplateAnalyses } from './template-ai'
import { failTemplateAnalysis, listTemplatesToAnalyze, loadTemplateImages, saveTemplateAnalysis } from './templates'

vi.mock('./ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ai')>()),
  runLogged: vi.fn(),
}))
vi.mock('./nine-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./nine-router')>()),
  chatCompletion: vi.fn(),
}))
vi.mock('./templates', () => ({
  failTemplateAnalysis: vi.fn(),
  listTemplatesToAnalyze: vi.fn(),
  loadTemplateImages: vi.fn(),
  saveTemplateAnalysis: vi.fn(),
}))

const ADMIN = 'admin-1'
const image = (id: string) => ({ id, dataUrl: 'data:image/jpeg;base64,AAAA' })

describe('readTemplateAnalyses', () => {
  it('reads styles, label and note per id, and leaves out what it cannot use', () => {
    const content = `Berikut hasilnya:\n${JSON.stringify({
      templates: {
        a: {
          styles: ['Tech', 'bold', 'hilang'],
          label: 'CTA',
          note: '  Tombol besar di bawah.  ',
        },
        b: { styles: ['editorial'], label: 'umum' },
        c: { styles: ['hilang'], label: 'cover' },
        d: { styles: ['tech'], label: 'judul' },
        other: { styles: ['tech'], label: 'cover' },
      },
    })}`

    const read = readTemplateAnalyses(content, ['a', 'b', 'c', 'd', 'e'])

    expect(Object.fromEntries(read)).toEqual({
      a: {
        styles: ['bold', 'tech'],
        label: 'cta',
        note: 'Tombol besar di bawah.',
      },
      b: { styles: ['editorial'], label: 'single', note: '' },
    })
  })

  it('reads nothing from an answer without JSON', () => {
    expect(readTemplateAnalyses('Maaf, tidak bisa.', ['a']).size).toBe(0)
  })
})

describe('buildTemplateMessages', () => {
  it('lists every style id and label, then each image after its id', () => {
    const [system, user] = buildTemplateMessages([image('a'), image('b')])

    expect(system.content).toContain('JSON')
    const parts = user.content as { type: string; text?: string }[]
    const intro = parts[0].text ?? ''
    for (const id of ['minimalis', 'bold', 'elegan', 'ceria', 'editorial', 'profesional', 'natural', 'tech']) {
      expect(intro).toContain(`- ${id}:`)
    }
    expect(intro).toContain('- single:')
    expect(parts.map((part) => part.type)).toEqual(['text', 'text', 'image_url', 'text', 'image_url'])
    expect(parts[1].text).toBe('Gambar 1; ID a')
  })
})

describe('classifyDesigns', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(runLogged).mockImplementation(async (_user, _task, _input, ask) => ask())
  })

  it('reads each design, charged to the owner under reference_labels', async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({ templates: { a: { styles: ['bold'], label: 'cover', note: 'Judul besar' } } }),
    )

    const read = await classifyDesigns('user-1', [image('a'), image('b')])

    expect(Object.fromEntries(read)).toEqual({ a: { styles: ['bold'], label: 'cover', note: 'Judul besar' } })
    const call = vi.mocked(runLogged).mock.calls[0]
    expect(call.slice(0, 3)).toEqual(['user-1', 'reference_labels', { count: 2 }])
    expect(call[4]).not.toHaveProperty('unmetered')
  })

  it('throws when nothing could be read, so the owner sees why', async () => {
    vi.mocked(chatCompletion).mockRejectedValue(new Error('timeout'))

    await expect(classifyDesigns('user-1', [image('a')])).rejects.toThrow('timeout')
  })
})

describe('analyzeTemplates', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(runLogged).mockImplementation(async (_user, _task, _input, ask) => ask())
    vi.mocked(listTemplatesToAnalyze).mockResolvedValue(['a', 'b'])
    vi.mocked(loadTemplateImages).mockResolvedValue([image('a'), image('b')])
  })

  it('saves what the AI read, marks the rest failed, and is never charged', async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      JSON.stringify({
        templates: { a: { styles: ['tech'], label: 'isi', note: 'x' } },
      }),
    )

    expect(await analyzeTemplates(ADMIN, null)).toEqual({
      analyzed: 1,
      failed: 1,
    })

    expect(listTemplatesToAnalyze).toHaveBeenCalledWith(null)
    expect(saveTemplateAnalysis).toHaveBeenCalledWith('a', {
      styles: ['tech'],
      label: 'isi',
      note: 'x',
    })
    expect(failTemplateAnalysis).toHaveBeenCalledWith(['b'], expect.stringContaining('Atur manual'))
    expect(vi.mocked(runLogged).mock.calls[0]).toEqual([
      ADMIN,
      'template_analysis',
      { templateIds: ['a', 'b'], count: 2 },
      expect.any(Function),
      expect.objectContaining({ unmetered: true }),
    ])
  })

  it('marks a whole batch failed when the request fails', async () => {
    vi.mocked(chatCompletion).mockRejectedValue(new Error('timeout'))

    expect(await analyzeTemplates(ADMIN, ['a', 'b'])).toEqual({
      analyzed: 0,
      failed: 2,
    })
    expect(failTemplateAnalysis).toHaveBeenCalledWith(['a', 'b'], 'Analisis gagal. Coba lagi.')
    expect(saveTemplateAnalysis).not.toHaveBeenCalled()
  })

  it('does nothing when no template waits', async () => {
    vi.mocked(listTemplatesToAnalyze).mockResolvedValue([])
    vi.mocked(loadTemplateImages).mockResolvedValue([])

    expect(await analyzeTemplates(ADMIN, null)).toEqual({
      analyzed: 0,
      failed: 0,
    })
    expect(runLogged).not.toHaveBeenCalled()
  })
})
