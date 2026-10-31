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

describe('homepage story', () => {
  it.each(['id', 'en'] as const)('shows four sample folders separately from real partners in %s', locale => {
    const html = renderLanding(locale)
    const showcase = html.match(/<section[^>]*id="konten"[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(showcase).not.toContain('<details')
    expect(showcase.match(/aria-expanded="false"/g)).toHaveLength(4)
    const covers = [...showcase.matchAll(/src="(\/covers\/[^" ]+)"/g)].map(match => match[1])
    expect(covers).toHaveLength(20)
    expect(new Set(covers).size).toBe(20)
    expect(showcase).toContain(catalogs[locale].landing.story.showcase.disclaimer)
    expect(html.indexOf('id="konten"')).toBeGreaterThan(html.indexOf('id="partners-title"'))
    expect(html.indexOf('id="partners-title"')).toBeGreaterThan(html.indexOf('id="auto-dm"'))
    expect(html).toContain('alt="RE/MAX"')
    expect(html).toContain('alt="SUME"')
    expect(showcase).not.toContain('/partners/')
    expect(html).toContain(catalogs[locale].landing.footer.pauseMotion)
  })
  it('leads with approved copy and twenty real covers, then the ordered product journey', () => {
    const html = renderLanding('id')
    expect(html).toContain('Social media aktif.')
    expect(html).toContain('Kamu tetap fokus.')
    const covers = new Set([...html.matchAll(/\/covers\/(\d\d-[a-z-]+)\.webp/g)].map(match => match[1]))
    expect(covers.size).toBe(20)
    expect(html).not.toContain('Jeda galeri')
    const sections = ['jadwal', 'asisten', 'desain', 'auto-dm'].map(id => html.indexOf(`id="${id}"`))
    expect(sections.every((position, i) => position > 0 && (!i || position > sections[i - 1]))).toBe(true)
  })
})
