import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import idCommon from '../../../messages/id/common.json'
import enCommon from '../../../messages/en/common.json'
import idLanding from '../../../messages/id/landing.json'
import enLanding from '../../../messages/en/landing.json'
import { FeatureTour } from './feature-tour'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }))

const catalogs = {
  id: { common: idCommon, landing: idLanding },
  en: { common: enCommon, landing: enLanding },
}
const STOPS = ['chat', 'schedule', 'design', 'autodm', 'analytics'] as const

function leafKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === 'string' ? [path] : leafKeys(child, path)
  })
}

function render(locale: 'id' | 'en', motionEnabled = true) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="Asia/Jakarta" onError={error => { throw error }}>
      <FeatureTour motionEnabled={motionEnabled} />
    </NextIntlClientProvider>,
  )
}

const unescape = (value: string) => value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

it('keeps featureTour keys identical in both locales', () => {
  expect(leafKeys(enLanding.featureTour)).toEqual(leafKeys(idLanding.featureTour))
  expect(idLanding.featureTour.hello).toBeTruthy()
  expect(enLanding.featureTour.cta).toBeTruthy()
})

describe.each(['id', 'en'] as const)('feature tour (%s)', locale => {
  it('renders all five tour stops in order with the DOM contract', () => {
    const html = render(locale)
    const tour = catalogs[locale].landing.featureTour
    const tags = [...html.matchAll(/<article\b[^>]*data-tour-stop="([^"]+)"[^>]*>/g)]
    expect(tags.map(match => match[1])).toEqual([...STOPS])
    for (const [tag, stop] of tags) {
      for (const attr of ['data-tour-anchor', 'data-tour-side', 'data-tour-face', 'data-tour-fx', 'data-tour-aim', 'data-tour-press', 'data-tour-say']) expect(tag).toContain(attr)
      const say = tour.steps[stop as typeof STOPS[number]].say
      expect(unescape(tag)).toContain(`data-tour-say="${say}"`)
      expect(html).toContain(`data-ft-card="${stop}"`)
      expect(html).toContain(`data-ft-press="${stop}"`)
      expect(html).toContain(`data-ft-aim="${stop}"`)
    }
  })

  it('shows the explanation in the section itself and stays static without motion', () => {
    const html = unescape(render(locale, false))
    const tour = catalogs[locale].landing.featureTour
    for (const stop of STOPS) {
      expect(html).toContain(tour.steps[stop].title)
      expect(html).toContain(tour.steps[stop].body)
      expect(html.split(tour.steps[stop].say).length).toBeGreaterThan(2)
    }
    expect(html).toContain(tour.cta)
    expect(html).toContain('data-motion="off"')
    expect(html).toMatch(/<a\b[^>]*href="\/daftar"/)
  })

  it('seats Mimo inside the chat and never asks for a sleepy face', () => {
    const html = render(locale)
    const chat = html.match(/<article\b[^>]*data-tour-stop="chat"[^>]*>/)?.[0] ?? ''
    expect(unescape(chat)).toContain('data-tour-anchor="[data-ft-seat="chat"]"')
    expect(chat).toContain('data-tour-side="center"')
    // The seat sits inside the chat card's log.
    expect(html).toMatch(/data-ft-card="chat"[\s\S]*data-ft-seat="chat"[\s\S]*data-ft-press="chat"/)
    expect(html).not.toContain('data-tour-face="sleepy"')
  })

  it('docks Mimo inside the closing CTA card, with no speech bubble', () => {
    const html = unescape(render(locale))
    const cta = html.match(/<div\b[^>]*data-tour-stop="cta"[^>]*>/)?.[0] ?? ''
    expect(cta).toContain('data-tour-dock')
    expect(cta).toContain('data-tour-anchor="[data-ft-seat="cta"]"')
    expect(cta).not.toContain('data-tour-say')
    expect(html).toMatch(/data-tour-stop="cta"[\s\S]*data-ft-seat="cta"[\s\S]*href="\/daftar"/)
  })

  it('shows carousels from the cover assets in the calendar, the IG analysis and the DM post', () => {
    const html = unescape(render(locale))
    const tour = catalogs[locale].landing.featureTour
    const covers = [...html.matchAll(/src="(\/covers\/[^"]+\.webp)"/g)].map(match => match[1])
    expect(covers.length).toBeGreaterThanOrEqual(15)
    expect(new Set(covers).size).toBeGreaterThanOrEqual(8)
    expect(html).toContain(tour.schedule.button)
    expect(html).toContain(tour.schedule.drafts)
    expect(html).toContain(tour.design.analyze)
    expect(html).toContain(tour.design.kitTitle)
    expect(html).toContain(tour.autodm.caption.replace('{keyword}', 'LINK'))
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/)
  })
})
