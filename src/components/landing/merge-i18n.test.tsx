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
import { GalleryHero, ProductJourney } from './homepage-story'

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
      expect(html).toContain(locale === 'id' ? 'Social media aktif.' : 'Your social media stays active.')
      expect(html).toContain(locale === 'id' ? 'Kalender &amp; penjadwalan' : 'Calendar &amp; scheduling')
      expect(html).toContain(locale === 'id' ? 'Uji Auto DM' : 'Test Auto DM')
      expect(html).toContain(locale === 'id' ? 'Jeda galeri' : 'Pause gallery')
      expect(html).toContain(`aria-label="${catalogs[locale].common.localeToggleLabel}"`)
      expect(html).toContain('>ID</button>')
      expect(html).toContain('>EN</button>')
      const covers = new Set([...html.matchAll(/\/covers\/(\d\d-[a-z-]+)\.webp/g)].map(match => match[1]))
      expect(covers.size).toBe(20)
      const sections = ['jadwal', 'asisten', 'desain', 'auto-dm'].map(id => html.indexOf(`id="${id}"`))
      expect(sections.every((position, i) => position > 0 && (!i || position > sections[i - 1]))).toBe(true)
      expect(html).toContain('href="/daftar"')
    })

    it(`retains non-animated story rendering in ${locale}`, () => {
      const html = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="Asia/Jakarta" onError={failOnTranslationError}>
          <GalleryHero motionEnabled={false} />
          <ProductJourney motionEnabled={false} />
        </NextIntlClientProvider>,
      )
      expect(html).toContain('data-paused="true"')
      expect(html).toContain('data-motion="false"')
      expect(html).toContain(locale === 'id' ? 'Galeri tanpa animasi' : 'Gallery animation off')
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
