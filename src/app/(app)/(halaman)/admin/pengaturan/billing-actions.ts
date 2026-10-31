'use server'

import { getLocale, getTranslations } from 'next-intl/server'
import { assertPayableTotals, parseBillingCatalog } from '@/lib/billing-catalog-options'

import { refresh } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { saveBillingCatalog } from '@/lib/billing-catalog'
import type { FormState } from '../actions'

export async function saveCatalogAction(_previous: FormState, form: FormData): Promise<FormState> {
  const t = await getTranslations('admin')

  const admin = await requireAdmin()
  try {
    const version = Number(form.get('version'))
    if (!Number.isSafeInteger(version) || version < 1) throw new Error(t('billing_actions.invalidSettingsVersion'))
    const locale = await getLocale()
    const config = parseBillingCatalog(JSON.parse(String(form.get('config'))), locale)
    assertPayableTotals(config, locale)
    await saveBillingCatalog(admin.id, version, config)
  } catch (error) {
    return { error: error instanceof Error ? error.message === 'Pengaturan sudah diubah di tab lain. Muat ulang sebelum menyimpan.' ? t('billing_actions.concurrentChange') : error.message : t('billing_actions.couldnTSaveSettings'), success: null }
  }
  refresh()
  return { error: null, success: t('billing_actions.plansAndRatesSavedEarlierPurchasesKeep') }
}
