import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import idBrand from '../../../../../messages/id/brand.json'
import enBrand from '../../../../../messages/en/brand.json'
import idAssets from '../../../../../messages/id/assets.json'
import enAssets from '../../../../../messages/en/assets.json'
import { parseBrandFields } from '@/lib/brand-options'
import { parseStrategy } from '@/lib/strategy-options'
import { fileTooLargeMessage, storageFullMessage, STORAGE_FULL_MESSAGE } from '@/lib/storage-quota-options'
import { localizeLibraryMessage } from './localized-errors'

function leaves(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof item === 'string' ? [[path, item]] : Object.entries(leaves(item as Record<string, unknown>, path))
  }))
}

describe('Brand and Assets translations', () => {
  it.each([[idBrand, enBrand], [idAssets, enAssets]])('has matching keys and valid ICU messages', (id, en) => {
    expect(Object.keys(leaves(en))).toEqual(Object.keys(leaves(id)))
    for (const [locale, catalog] of [['id', id], ['en', en]] as const) {
      const errors: unknown[] = []
      const messages = leaves(catalog)
      // A flat catalog with safe keys lets every message be parsed without type assertions on translator keys.
      for (const message of Object.values(messages)) {
        const t = createTranslator({ locale, messages: { message }, onError: (error) => errors.push(error) })
        const values = Object.fromEntries([...message.matchAll(/\{(\w+)(?:[,}])/g)].map((match) => [match[1], 2]))
        t('message', values)
      }
      expect(errors).toEqual([])
    }
  })

  it('keeps Indonesian validator defaults and supports English', () => {
    expect(parseBrandFields(null)).toEqual({ error: 'Data brand tidak valid.' })
    expect(parseBrandFields(null, 'en')).toEqual({ error: 'Invalid brand data.' })
    expect(parseStrategy(null)).toEqual({ error: 'Strategi tidak valid.' })
    expect(parseStrategy(null, 'en')).toEqual({ error: 'Invalid strategy.' })
  })

  it('localizes safe library errors while preserving unknown provider text', () => {
    expect(localizeLibraryMessage('Referensi sudah 30. Hapus yang lama dulu.', 'en')).toBe('You already have 30 references. Delete older ones first.')
    expect(localizeLibraryMessage('Server menjawab HTTP 404.', 'en')).toBe('The server returned HTTP 404.')
    expect(localizeLibraryMessage('Sebagian halaman website tidak bisa dibaca.', 'en')).toBe("Some website pages couldn't be read.")
    expect(localizeLibraryMessage('Provider-specific detail', 'en')).toBe('Provider-specific detail')
  })

  it('preserves the storage sentinel and exposes localized display copy', () => {
    expect(storageFullMessage()).toBe(STORAGE_FULL_MESSAGE)
    expect(storageFullMessage('en')).toBe('Storage is full. Clean up unused files in Assets first.')
    expect(fileTooLargeMessage('en')).toBe('File is too large. Try another image.')
  })
})
