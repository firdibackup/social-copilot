import { NextIntlClientProvider } from 'next-intl'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import idCommon from '../../messages/id/common.json'
import enCommon from '../../messages/en/common.json'
import idShell from '../../messages/id/shell.json'
import enShell from '../../messages/en/shell.json'

vi.mock('next/navigation', () => ({ usePathname: () => '/kalender', useRouter: () => ({ refresh: () => undefined }) }))
vi.mock('next/link', async () => {
  const React = await import('react')
  return {
    default: ({ children, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
      void prefetch
      return React.createElement('a', props, children)
    },
  }
})
vi.mock('@/app/masuk/actions', () => ({ signOut: async () => undefined }))
vi.mock('@/i18n/actions', () => ({ setLocale: async () => undefined }))

const { MobileNav } = await import('./mobile-nav')
const { Sidebar } = await import('./sidebar')
const { LocaleToggle } = await import('./locale-toggle')
const { CreditBar } = await import('./subscription-status')

const catalogs = { id: { common: idCommon, shell: idShell }, en: { common: enCommon, shell: enShell } }

function render(locale: 'id' | 'en', node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      {node}
    </NextIntlClientProvider>,
  )
}

describe('app shell navigation', () => {
  for (const locale of ['id', 'en'] as const) {
    it(`marks the current page with the signature slides and keeps every label in ${locale}`, () => {
      const html = render(locale, <Sidebar workspace={null} instagramStatus={null} threadsStatus={null} credits={null} account={null} admin={null} />)
      expect(html).toContain(`aria-label="${catalogs[locale].shell.navigation}"`)
      // Exactly one current page, and it carries the three gradient bars.
      expect(html.match(/aria-current="page"/g)).toHaveLength(1)
      expect(html.match(/bg-signature/g)).toHaveLength(3)
      for (const label of Object.values(catalogs[locale].shell.nav).filter((v) => v !== catalogs[locale].shell.nav.mimoShort && v !== catalogs[locale].shell.nav.admin)) {
        expect(html).toContain(label)
      }
      // Labels truncate rather than wrap the 236px rail, in both languages.
      expect(html).toContain('min-w-0 truncate')
      expect(html).toMatch(/<button[^>]*data-logout[^>]*class="[^"]*min-h-11 min-w-11/)
      for (const link of html.matchAll(/<a\b[^>]*href="\/(?!pengaturan#)[^"]*"[^>]*>/g)) {
        expect(link[0]).toContain('min-h-11')
      }
      expect(html).toContain(catalogs[locale].shell.platforms.instagram)
      expect(html).toContain(catalogs[locale].shell.platforms.threads)
      expect(html).toContain(`aria-label="${catalogs[locale].common.localeToggleLabel}"`)
    })

    it(`keeps app locale targets at 44px without changing landing sizing in ${locale}`, () => {
      const app = render(locale, <LocaleToggle variant="app" />)
      expect(app.match(/min-h-11 min-w-11/g)).toHaveLength(2)
      expect(app).toContain(`aria-label="${catalogs[locale].common.indonesian}"`)
      expect(app).toContain(`aria-label="${catalogs[locale].common.english}"`)
      expect(app.match(/aria-pressed="true"/g)).toHaveLength(1)
      const landing = render(locale, <LocaleToggle variant="landing" />)
      expect(landing).not.toContain('min-h-11')
      expect(landing.match(/px-1.5 py-1/g)).toHaveLength(2)
    })

    it(`keeps the phone bar to six truncating items in ${locale}`, () => {
      const html = render(locale, <MobileNav />)
      expect(html.match(/<li /g)).toHaveLength(6)
      expect(html).toContain('pb-[env(safe-area-inset-bottom)]')
      expect(html).toContain('max-w-full truncate')
      expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    })
  }

  it('fills the credit bar with the signature and turns amber from 90%', () => {
    expect(render('id', <CreditBar percent={40} />)).toContain('bg-signature')
    const high = render('en', <CreditBar percent={92} />)
    expect(high).toContain('bg-amber-500')
    expect(high).toContain('92% used')
  })
})
