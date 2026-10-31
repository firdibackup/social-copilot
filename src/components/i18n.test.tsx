import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import idCommon from '../../messages/id/common.json'
import enCommon from '../../messages/en/common.json'
import idShell from '../../messages/id/shell.json'
import enShell from '../../messages/en/shell.json'
import { CancelGenerationButton } from './cancel-generation-button'
import { LoadingState } from './loading-state'
import { PlatformBadge } from './platform-badge'
import { LateBadge, PostStatusBadge } from './post-status-badge'

const catalogs = { id: { common: idCommon, shell: idShell }, en: { common: enCommon, shell: enShell } }

function leafKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === 'string' ? [path] : leafKeys(child, path)
  })
}

describe('shared component translations', () => {
  it('keeps Indonesian and English catalog keys aligned', () => {
    expect(leafKeys(catalogs.en)).toEqual(leafKeys(catalogs.id))
  })

  for (const locale of ['id', 'en'] as const) {
    it(`renders shared components with only common messages in ${locale}`, () => {
      const html = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={{ common: catalogs[locale].common }}>
          <LoadingState />
          <PostStatusBadge status="scheduled" />
          <LateBadge />
          <PlatformBadge instagram threads />
          <CancelGenerationButton onClick={() => undefined} pending />
        </NextIntlClientProvider>,
      )
      expect(html).toContain(locale === 'id' ? 'Memuat…' : 'Loading…')
      expect(html).toContain(locale === 'id' ? 'Terjadwal' : 'Scheduled')
      expect(html).toContain(locale === 'id' ? 'Terlambat' : 'Late')
      expect(html).toContain(locale === 'id' ? 'Instagram dan Threads' : 'Instagram and Threads')
      expect(html).toContain(locale === 'id' ? 'Membatalkan…' : 'Cancelling…')
    })

    it(`formats counts and rich text in ${locale}`, () => {
      const t = createTranslator({ locale, messages: catalogs[locale] })
      expect(t('common.upload.progress', { current: 2, total: 3 })).toBe(
        locale === 'id' ? 'Mengunggah 2 dari 3…' : 'Uploading 2 of 3…',
      )
      expect(t('common.slots.posts', { count: 2 })).toBe(locale === 'id' ? '2 post' : '2 posts')
      expect(t.rich('common.slots.count', { count: 2, n: (chunks) => chunks })).toBe(
        locale === 'id' ? '2 slot posting per minggu.' : '2 posting slots per week.',
      )
      expect(t('shell.renewal', { days: 1, date: 'DATE' })).toBe(
        locale === 'id' ? 'Langganan berakhir dalam 1 hari (DATE).' : 'Your subscription ends in 1 day (DATE).',
      )
    })
  }
})
