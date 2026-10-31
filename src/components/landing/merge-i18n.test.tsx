import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import idCommon from '../../../messages/id/common.json'
import enCommon from '../../../messages/en/common.json'
import idLanding from '../../../messages/id/landing.json'
import enLanding from '../../../messages/en/landing.json'
import { DESIGN_STYLE_IDS, DESIGN_STYLES } from '@/lib/design-styles'
import { DesignStylePicker } from '@/components/design-style-picker'
import { LandingPage } from './landing-page'
import { OrbitHero } from './orbit-hero'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }))
vi.mock('@/i18n/actions', () => ({ setLocale: async () => undefined }))
vi.mock('@/components/font-previews', () => ({ FONT_FAMILY: {}, fontFamilyOf: () => undefined }))

const catalogs = {
  id: { common: idCommon, landing: idLanding },
  en: { common: enCommon, landing: enLanding },
}

function leafKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === 'string' ? [path] : leafKeys(child, path)
  })
}

const failOnTranslationError = (error: Error) => { throw error }

describe('merge localization regressions', () => {
  it('keeps every new story message aligned and valid in both locales', () => {
    const keys = leafKeys(idLanding.story)
    expect(leafKeys(enLanding.story)).toEqual(keys)
    for (const locale of ['id', 'en'] as const) {
      const t = createTranslator({ locale, messages: catalogs[locale].landing.story, onError: failOnTranslationError })
      for (const key of keys) {
        // Runtime traversal validates messages for interactive states as well as the initial render.
        expect(t(key as Parameters<typeof t>[0], { category: 'Skincare', day: 21 })).not.toBe(key)
      }
    }
  })

  for (const locale of ['id', 'en'] as const) {
    it(`retains the incoming homepage and locale control in ${locale}`, () => {
      const html = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="Asia/Jakarta" onError={failOnTranslationError}>
          <LandingPage pricing={null} />
        </NextIntlClientProvider>,
      )
      expect(html).toContain(catalogs[locale].landing.story.opening.title1)
      expect(html).toContain('data-orbit-hero')
      expect(html).toContain('data-orbit-toggle')
      expect(html).toContain(`aria-label="${catalogs[locale].landing.footer.pauseMotion}"`)
      expect(html).not.toContain('data-opening-chat')
      expect(html).not.toContain('data-mascot')
      expect(html).toContain(`aria-label="${catalogs[locale].common.localeToggleLabel}"`)
      expect(html).toContain('>ID</button>')
      expect(html).toContain('>EN</button>')
      const covers = new Set([...html.matchAll(/\/covers\/(\d\d-[a-z-]+)\.webp/g)].map(match => match[1]))
      expect(covers.size).toBe(20)
      expect(html.indexOf('id="konten"')).toBeGreaterThan(html.indexOf('id="fitur"'))
      expect(html).toContain('href="/daftar"')
    })

    it(`retains static reduced-motion orbit rendering in ${locale}`, () => {
      const html = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="Asia/Jakarta" onError={failOnTranslationError}>
          <OrbitHero paused={false} reduceMotion={true} onTogglePause={() => undefined} />
        </NextIntlClientProvider>,
      )
      const { opening, orbit } = catalogs[locale].landing.story
      expect(html).toContain(opening.title1)
      expect(html).toContain(opening.title2)
      expect(html).toContain(opening.body)
      expect(html).toContain(orbit.showcase)
      expect(html).toContain('data-orbit-stage')
      expect(html).toContain('data-paused="true"')
      expect(html).toContain('data-pause-reason="reduced"')
      const control = html.match(/<button\b[^>]*data-orbit-toggle[^>]*>/)?.[0] ?? ''
      expect(control).toContain('disabled=""')
      expect(control).toContain(`aria-label="${catalogs[locale].landing.footer.reducedMotion}"`)
      expect(html).not.toContain('data-opening-chat')
      expect(html).not.toContain('data-mascot')
    })

    it(`renders eight translated cover-only style previews in ${locale}`, () => {
      const html = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={{ common: catalogs[locale].common }} timeZone="Asia/Jakarta" onError={failOnTranslationError}>
          <DesignStylePicker value="minimalis" onChange={() => undefined} large />
        </NextIntlClientProvider>,
      )
      expect(html.match(/type="radio"/g)).toHaveLength(8)
      expect(html.match(/<img /g)).toHaveLength(8)
      expect(html).not.toContain('<button')
      expect(html).not.toContain('1/3')
      for (const id of DESIGN_STYLE_IDS) {
        expect(html).toContain(encodeURIComponent(DESIGN_STYLES[id].sample.image))
        expect(html).toContain(catalogs[locale].common.design.styles[id].samples.cover.title)
      }
    })
  }
})
