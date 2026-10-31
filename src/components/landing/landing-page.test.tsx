import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { LandingPage } from './landing-page'

describe('homepage story', () => {
  it('leads with approved copy and twenty real covers, then the ordered product journey', () => {
    const html = renderToStaticMarkup(createElement(LandingPage, { pricing: null }))
    expect(html).toContain('Social media aktif.')
    expect(html).toContain('Kamu tetap fokus.')
    const covers = new Set([...html.matchAll(/\/covers\/(\d\d-[a-z-]+)\.webp/g)].map(match => match[1]))
    expect(covers.size).toBe(20)
    expect(html).toContain('Jeda galeri')
    const sections = ['jadwal', 'asisten', 'desain', 'auto-dm'].map(id => html.indexOf(`id="${id}"`))
    expect(sections.every((position, i) => position > 0 && (!i || position > sections[i - 1]))).toBe(true)
  })
})
