import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import idCommon from '../../../messages/id/common.json'
import enCommon from '../../../messages/en/common.json'
import idLanding from '../../../messages/id/landing.json'
import enLanding from '../../../messages/en/landing.json'
import { LandingPage } from './landing-page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }))
vi.mock('@/i18n/actions', () => ({ setLocale: async () => undefined }))

const catalogs = {
  id: { common: idCommon, landing: idLanding },
  en: { common: enCommon, landing: enLanding },
}

function renderLanding(locale: 'id' | 'en') {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="Asia/Jakarta" onError={error => { throw error }}>
      <LandingPage pricing={null} />
    </NextIntlClientProvider>,
  )
}

function coverSources(html: string) {
  return [...html.matchAll(/<img\b[^>]*\bsrc="(\/covers\/[^" ]+)"/g)].map(match => match[1])
}

// These are SSR contracts only: geometry, lifecycle and animation need browser QA.
describe.each(['id', 'en'] as const)('homepage story (%s)', locale => {
  it('opens with the orbit hero: one page h1, cycling audiences and the Instagram trial form', () => {
    const html = renderLanding(locale)
    const hero = html.match(/<section\b[^>]*\bdata-orbit-hero(?:="[^"]*")?[^>]*>[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(hero).not.toBe('')
    expect(hero).toContain('id="fitur"')
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(hero).toMatch(/<h1\b[^>]*id="hero-title"/)
    const { opening } = catalogs[locale].landing.story
    const trial = catalogs[locale].landing.trial
    for (const text of [opening.title1, opening.title2, opening.body, trial.word0, trial.cta]) expect(hero).toContain(text)
    // Every audience is in the h1 for screen readers, even though only one is painted at a time.
    const title = hero.match(/<h1\b[\s\S]*?<\/h1>/)?.[0] ?? ''
    expect(title).toContain(Object.entries(trial).filter(([key]) => /^word\d$/.test(key)).map(([, word]) => word).join(', '))
    expect(hero).toContain('id="carousely-threshold"')
    const form = hero.match(/<form\b[^>]*data-orbit-trial[\s\S]*?<\/form>/)?.[0] ?? ''
    expect(form).toMatch(/<input\b[^>]*aria-label="[^"]+"[^>]*placeholder="@|<input\b[^>]*placeholder="@[^>]*aria-label="[^"]+"/)
    expect(form).toMatch(/<button\b[^>]*type="submit"/)
    expect(html).not.toContain('onboarding-title')
    for (const hook of ['data-orbit-stage', 'data-orbit-camera', 'data-orbit-ring', 'data-orbit-copy']) {
      expect(hero).toContain(hook)
    }
    expect(hero).toMatch(/<[^>]*data-orbit-stage[^>]*data-paused="(?:true|false)"|<[^>]*data-paused="(?:true|false)"[^>]*data-orbit-stage/)
    expect(html).toContain('id="konten"')
    expect(html).not.toContain('partners-title')
    expect(html).not.toContain('data-opening-chat')
    expect(html).not.toContain('data-mascot')
    expect(html).not.toContain('data-chapter')
    expect(html).not.toContain('id="auto-dm"')

    expect(hero.match(/\bdata-orbit-card(?:=|\s|>)/g)).toHaveLength(20)
    const covers = coverSources(hero)
    expect(covers).toHaveLength(20)
    expect(new Set(covers).size).toBe(20)
    expect(hero).toContain('aria-hidden="true"')
    const images = hero.match(/<img\b[^>]*>/g) ?? []
    expect(images).toHaveLength(20)
    for (const image of images) {
      expect(image).toContain('alt=""')
      expect(image).toMatch(/\bwidth="[1-9]\d*"/)
      expect(image).toMatch(/\bheight="[1-9]\d*"/)
    }
  })

  it('preserves four sample folders and twenty covers below the real RE/MAX work', () => {
    const html = renderLanding(locale)
    const showcase = html.match(/<section[^>]*id="konten"[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(showcase).not.toContain('<details')
    expect(showcase.match(/aria-expanded="false"/g)).toHaveLength(4)
    expect([...showcase.matchAll(/data-folder="([^"]+)"/g)].map(match => match[1]))
      .toEqual(['beauty', 'living', 'spaces', 'business'])
    const covers = coverSources(showcase)
    expect(covers).toHaveLength(20)
    expect(new Set(covers).size).toBe(20)
    expect(html).not.toContain('partners-title')
    expect(html).not.toContain('/testimoni-asset/')
    expect(html).toContain(catalogs[locale].landing.footer.pauseMotion)
  })

  it('shows the published client carousels as a manual RE/MAX ⇄ SUME slideshow above the samples', () => {
    const html = renderLanding(locale)
    const showcase = html.match(/<section[^>]*id="konten"[\s\S]*?<\/section>/)?.[0] ?? ''
    const { realWork } = catalogs[locale].landing
    expect(showcase).toContain(realWork.label)
    expect(showcase.indexOf('data-real-work')).toBeGreaterThan(-1)
    expect(showcase.indexOf('data-real-work')).toBeLessThan(showcase.indexOf('data-folder="beauty"'))
    // Client tabs: RE/MAX first and selected, SUME next, with a visible n/total pager.
    const tabs = [...showcase.matchAll(/<button\b[^>]*role="tab"[^>]*>([^<]*)<\/button>/g)]
    expect(tabs.map(match => match[1])).toEqual(['RE/MAX', 'SUME'])
    expect(tabs[0][0]).toContain('aria-selected="true"')
    expect(tabs[1][0]).toContain('aria-selected="false"')
    expect(showcase).toContain(realWork.prevClient)
    expect(showcase).toContain(realWork.nextClient)
    // Both panels render; only the first is visible. No autoplay hooks on the slideshow.
    expect([...showcase.matchAll(/role="tabpanel"[^>]*data-client="([^"]+)"[^>]*?(hidden="")?>/g)].map(match => [match[1], !!match[2]]))
      .toEqual([['remax', false], ['sume', true]])
    expect(showcase).not.toMatch(/data-autoplay|aria-live="off"/)
    // Brand logos replace the plain-text name, but keep it as the accessible name.
    expect(showcase).toMatch(/<img\b[^>]*alt="RE\/MAX Indonesia"[^>]*src="\/partners\/remax\.svg"/)
    expect(showcase).toMatch(/<img\b[^>]*alt="SUME"[^>]*src="\/partners\/sume\.png"/)
    expect(showcase).not.toContain('remax.indonesia')
    expect([...showcase.matchAll(/data-carousel="([^"]+)"/g)].map(match => match[1])).toEqual(['costs', 'inspect', 'steps', 'ups', 'pue'])
    const slides = [...showcase.matchAll(/<img\b[^>]*\bsrc="\/showcase\/(remax|sume)\/([a-z]+)-(\d)\.webp"[^>]*>/g)]
    const range = (n: number) => Array.from({ length: n }, (_, i) => i)
    expect(slides.map(match => `${match[1]}/${match[2]}-${match[3]}`)).toEqual([
      ...range(5).map(i => `remax/biaya-${i}`), ...range(6).map(i => `remax/cek-${i}`), ...range(6).map(i => `remax/langkah-${i}`),
      ...range(6).map(i => `sume/a-${i}`), ...range(6).map(i => `sume/b-${i}`),
    ])
    const alts = slides.map(([image]) => image.match(/\balt="([^"]*)"/)?.[1] ?? '')
    for (const alt of alts) expect(alt.length).toBeGreaterThan(12)
    expect(new Set(alts).size).toBe(alts.length)
    for (const key of ['costs', 'inspect', 'steps'] as const) expect(showcase).toContain(realWork.remax[key].title)
    for (const key of ['ups', 'pue'] as const) expect(showcase).toContain(realWork.sume[key].title)
    for (const client of ['remax', 'sume'] as const) expect(showcase).toContain(realWork[client].title)
  })

  it('never auto-advances the client slideshow', async () => {
    const source = await import('node:fs').then(fs => fs.readFileSync(new URL('./real-work.tsx', import.meta.url), 'utf8'))
    expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|autoplay/i)
  })

  it('closes the showcase with the same Instagram trial form rules as the hero', () => {
    const html = renderLanding(locale)
    const showcase = html.match(/<section[^>]*id="konten"[\s\S]*?<\/section>/)?.[0] ?? ''
    const prompt = showcase.match(/<div\b[^>]*data-trial-prompt[\s\S]*?<\/form>/)?.[0] ?? ''
    expect(prompt).not.toBe('')
    expect(showcase.indexOf('data-trial-prompt')).toBeGreaterThan(showcase.indexOf('data-folder="business"'))
    const trial = catalogs[locale].landing.trial
    expect(prompt.replaceAll('&#x27;', "'")).toContain(catalogs[locale].landing.trialPrompt.title)
    expect(prompt).toContain(trial.cta)
    expect(prompt).toContain(`placeholder="${trial.placeholder}"`)
    expect(prompt).toContain(`aria-label="${trial.label}"`)
    expect(prompt).toMatch(/<button\b[^>]*type="submit"/)
    expect(prompt).not.toMatch(/3 konten gratis|3 free posts/i)
  })
})
