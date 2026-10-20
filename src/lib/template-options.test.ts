import { describe, expect, it } from 'vitest'
import { pickFirst, type Picker } from './brand-options'
import { cleanStyles, parseTemplateEdit, planTemplates, type PoolTemplate } from './template-options'

const POOL: PoolTemplate[] = [
  { id: 'cover-1', label: 'cover' },
  { id: 'cover-2', label: 'cover' },
  { id: 'isi-1', label: 'isi' },
  { id: 'umum-1', label: 'single' },
]

describe('planTemplates', () => {
  it('gives each role a template of its label, the same for every inner slide', () => {
    const second: Picker = (items) => items[1] ?? items[0]

    expect(planTemplates(POOL, ['cover', 'isi', 'isi', 'cta'], second)).toEqual(['cover-2', 'isi-1', 'isi-1', 'umum-1'])
  })

  it('fills a role without its own label with an Umum template, else nothing', () => {
    expect(planTemplates(POOL, ['cover', 'cta'], pickFirst)).toEqual(['cover-1', 'umum-1'])
    expect(planTemplates([{ id: 'cover-1', label: 'cover' }], ['cover', 'isi', 'cta'], pickFirst)).toEqual([
      'cover-1',
      null,
      null,
    ])
  })

  it('gives a one-image post a cover, and nothing without templates', () => {
    expect(planTemplates(POOL, [null], pickFirst)).toEqual(['cover-1'])
    expect(planTemplates([], ['cover', 'isi'], pickFirst)).toEqual([null, null])
  })
})

describe('cleanStyles', () => {
  it('keeps known styles once, in the styles’ order, whatever their case', () => {
    expect(cleanStyles(['Tech', 'bold', 'tech', 'hilang', 5, ' minimalis '])).toEqual(['minimalis', 'bold', 'tech'])
    expect(cleanStyles('tech')).toEqual([])
  })
})

describe('parseTemplateEdit', () => {
  it('takes known styles and a label', () => {
    expect(parseTemplateEdit({ label: 'cta' }, ['tech', 'bold'])).toEqual({
      styles: ['bold', 'tech'],
      label: 'cta',
    })
  })

  it('refuses no style, an unknown style or an unknown label', () => {
    expect(parseTemplateEdit({ label: 'cta' }, [])).toEqual({
      error: 'Pilih minimal satu gaya.',
    })
    expect(parseTemplateEdit({ label: 'cta' }, ['hilang'])).toEqual({
      error: 'Gaya tidak dikenal.',
    })
    expect(parseTemplateEdit({ label: 'toString' }, ['tech'])).toHaveProperty('error')
  })
})
