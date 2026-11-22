import { describe, expect, it } from 'vitest'
import { pickFirst, type Picker } from './brand-options'
import { chooseRoleTemplates, cleanStyles, parseTemplateEdit, planTemplates, templateCoverage, type BankTemplate } from './template-options'

const BANK: BankTemplate[] = [
  { id: 'pro-cover-1', label: 'cover', styles: ['profesional'] },
  { id: 'pro-cover-2', label: 'cover', styles: ['profesional'] },
  { id: 'pro-isi', label: 'isi', styles: ['profesional', 'minimalis'] },
  { id: 'pro-cta', label: 'cta', styles: ['profesional'] },
  { id: 'elegan-isi', label: 'isi', styles: ['elegan'] },
  { id: 'editorial-cover', label: 'cover', styles: ['editorial'] },
  { id: 'min-umum', label: 'single', styles: ['minimalis'] },
]

describe('planTemplates', () => {
  it('gives each role a template of the brand style, the same for every inner slide', () => {
    const second: Picker = (items) => items[1] ?? items[0]

    expect(planTemplates(BANK, 'profesional', ['cover', 'isi', 'isi', 'cta'], second)).toEqual(['pro-cover-2', 'pro-isi', 'pro-isi', 'pro-cta'])
  })

  it('borrows a missing role from the nearest style before an Umum template', () => {
    // Elegan has only an inner template. Its chain is elegan → editorial → minimalis → profesional: the cover comes
    // from Editorial, and the CTA from Profesional, because a template of the role beats Minimalis's Umum one.
    expect(chooseRoleTemplates(BANK, 'elegan', pickFirst)).toEqual({
      cover: { id: 'editorial-cover', label: 'cover', style: 'editorial' },
      isi: { id: 'elegan-isi', label: 'isi', style: 'elegan' },
      cta: { id: 'pro-cta', label: 'cta', style: 'profesional' },
    })
  })

  it('falls back to Umum of the chain, then the role from any style, and leaves a role empty only for an empty bank', () => {
    const bank: BankTemplate[] = [{ id: 'umum', label: 'single', styles: ['minimalis'] }, { id: 'tech-cta', label: 'cta', styles: ['tech'] }]
    expect(planTemplates(bank, 'ceria', ['cover', 'isi', 'cta'], pickFirst)).toEqual(['umum', 'umum', 'umum'])
    expect(planTemplates([{ id: 'tech-cta', label: 'cta', styles: ['tech'] }], 'natural', ['cover', 'cta'], pickFirst)).toEqual([null, 'tech-cta'])
    expect(planTemplates([], 'minimalis', ['cover', 'isi'], pickFirst)).toEqual([null, null])
  })

  it('gives a one-image post the cover template', () => {
    expect(planTemplates(BANK, 'profesional', [null], pickFirst)).toEqual(['pro-cover-1'])
  })
})

describe('templateCoverage', () => {
  it('counts ready, active templates per style and lists the empty roles', () => {
    const coverage = templateCoverage([
      { styles: ['elegan'], label: 'isi', status: 'ready', active: true },
      { styles: ['elegan', 'bold'], label: 'cover', status: 'ready', active: true },
      { styles: ['elegan'], label: 'cta', status: 'ready', active: false },
      { styles: ['elegan'], label: 'cta', status: 'pending', active: true },
      { styles: ['elegan'], label: null, status: 'ready', active: true },
    ])
    const elegan = coverage.find((row) => row.style === 'elegan')!
    expect(elegan.counts).toEqual({ cover: 1, isi: 1, cta: 0, single: 0 })
    expect(elegan.missing).toEqual(['cta'])
    expect(coverage.find((row) => row.style === 'tech')!.missing).toEqual(['cover', 'isi', 'cta'])
    expect(coverage).toHaveLength(8)
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
