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
  it('opens with a bilingual orbit hero and real conversion destinations', () => {
    const html = renderLanding(locale)
    const hero = html.match(/<section\b[^>]*\bdata-orbit-hero(?:="[^"]*")?[^>]*>[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(hero).not.toBe('')
    expect(hero).toContain('id="fitur"')
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(hero).toContain('<h1')
    for (const text of Object.values({
      title1: catalogs[locale].landing.story.opening.title1,
      title2: catalogs[locale].landing.story.opening.title2,
      body: catalogs[locale].landing.story.opening.body,
    })) expect(hero).toContain(text)
    for (const hook of ['data-orbit-stage', 'data-orbit-camera', 'data-orbit-ring', 'data-orbit-copy']) {
      expect(hero).toContain(hook)
    }
    expect(hero).toMatch(/<[^>]*data-orbit-stage[^>]*data-paused="(?:true|false)"|<[^>]*data-paused="(?:true|false)"[^>]*data-orbit-stage/)
    expect(hero).toMatch(/<button\b[^>]*data-orbit-toggle/)
    expect(hero).toMatch(/<a\b[^>]*href="\/daftar"/)
    expect(hero).toMatch(/<a\b[^>]*href="#konten"/)
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
