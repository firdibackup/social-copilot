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
    for (const text of [opening.title1, opening.title2, opening.body, trial.word0, trial.cta, trial.note]) expect(hero).toContain(text)
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
    expect(html.indexOf('id="partners-title"')).toBeGreaterThan(html.indexOf('data-orbit-hero'))
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

  it('preserves four sample folders and twenty covers separately from real partners', () => {
    const html = renderLanding(locale)
    const showcase = html.match(/<section[^>]*id="konten"[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(showcase).not.toContain('<details')
    expect(showcase.match(/aria-expanded="false"/g)).toHaveLength(4)
    expect([...showcase.matchAll(/data-folder="([^"]+)"/g)].map(match => match[1]))
      .toEqual(['beauty', 'living', 'spaces', 'business'])
    const covers = coverSources(showcase)
    expect(covers).toHaveLength(20)
    expect(new Set(covers).size).toBe(20)
    expect(showcase).toContain(catalogs[locale].landing.story.showcase.disclaimer)
    expect(html.indexOf('id="konten"')).toBeGreaterThan(html.indexOf('id="partners-title"'))
    expect(html).toContain('alt="RE/MAX"')
    expect(html).toContain('alt="SUME"')
    expect(showcase).not.toContain('/partners/')
    expect(html).toContain(catalogs[locale].landing.footer.pauseMotion)
  })
})
