import { describe, expect, it, vi } from 'vitest'
import { isStorageFull } from './storage-full'
import { STORAGE_FULL_CODE, STORAGE_FULL_MESSAGE, storageFullMessage } from '@/lib/storage-quota-options'

vi.mock('./confirm-dialog', () => ({ confirmDialog: vi.fn() }))

describe('isStorageFull', () => {
  it('recognizes legacy and localized action responses', () => {
    expect(isStorageFull(STORAGE_FULL_MESSAGE)).toBe(true)
    expect(isStorageFull(` ${storageFullMessage('en')} `)).toBe(true)
    expect(isStorageFull(new Error(storageFullMessage('en')))).toBe(true)
  })

  it('recognizes a stable structured code regardless of message', () => {
    expect(isStorageFull({ code: STORAGE_FULL_CODE, message: 'any language' })).toBe(true)
  })

  it('does not mistake other errors for full storage', () => {
    for (const error of [null, undefined, '', 'Something went wrong', {}, { code: 'other' }]) {
      expect(isStorageFull(error)).toBe(false)
    }
  })
})
