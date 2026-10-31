'use client'

import { commonTranslations } from './client-translations'
import { HardDrive } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { STORAGE_FULL_CODE, storageFullMessage } from '@/lib/storage-quota-options'
import { confirmDialog } from './confirm-dialog'

/** Where the dialog sends the owner: Aset with the cleanup suggestions open. */
export const STORAGE_CLEANUP_HREF = '/aset?bersihkan=1'

/** Whether an action's error means the owner's storage is full. */
export function isStorageFull(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === STORAGE_FULL_CODE) return true
  const message = error instanceof Error ? error.message : error
  return typeof message === 'string' && [storageFullMessage('id'), storageFullMessage('en')].includes(message.trim())
}

// One dialog at a time: a batch of failed uploads or several cards answering at once still asks only once.
let showing = false

/**
 * Tells the owner their storage is full and offers to clean up in Aset. Never shows sizes or numbers.
 * `navigate` is the caller's `router.push`.
 */
export async function showStorageFullDialog(navigate: (href: string) => void): Promise<void> {
  const t = commonTranslations()
  if (showing) return
  showing = true
  try {
    const clean = await confirmDialog({
      title: t('storage.title'),
      description: (
        <>
          <p>{t('storage.noSpace')}</p>
          <p>
            {t.rich('storage.hint', { b: (chunks) => <strong className="font-semibold text-ink">{chunks}</strong> })}
          </p>
        </>
      ),
      confirmLabel: t('storage.cleanup'),
      cancelLabel: t('storage.later'),
      icon: HardDrive,
    })
    if (clean) navigate(STORAGE_CLEANUP_HREF)
  } finally {
    showing = false
  }
}

/**
 * For components: returns a check that opens the dialog when `error` is the storage-full answer, and says whether
 * it did, so the caller can skip its own inline message.
 */
export function useStorageFull(): (error: unknown) => boolean {
  const router = useRouter()
  return (error) => {
    if (!isStorageFull(error)) return false
    void showStorageFullDialog((href) => router.push(href))
    return true
  }
}
