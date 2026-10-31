
import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '@/../messages/id/editor.json'
import enMessages from '@/../messages/en/editor.json'
export type CancelTarget = 'content' | 'images' | 'slide' | 'edit'

export async function cancelGeneration(postId: string, target: CancelTarget, id?: string, locale: Locale = 'id'): Promise<{ cancelled: boolean; error?: string }> {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'cancelGeneration' })

  try {
    const response = await fetch('/api/generation/cancel', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postId, target, id }),
    })
    const result = await response.json()
    if (!response.ok || typeof result.cancelled !== 'boolean') {
      return { cancelled: false, error: result.error ?? t('message1') }
    }
    return result
  } catch {
    return { cancelled: false, error: t('message2') }
  }
}
