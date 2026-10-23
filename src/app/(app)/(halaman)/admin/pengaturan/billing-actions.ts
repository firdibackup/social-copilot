'use server'

import { refresh } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { saveBillingCatalog } from '@/lib/billing-catalog'
import type { FormState } from '../actions'

export async function saveCatalogAction(_previous: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  try {
    const version = Number(form.get('version'))
    if (!Number.isSafeInteger(version) || version < 1) throw new Error('Versi pengaturan tidak valid.')
    await saveBillingCatalog(admin.id, version, JSON.parse(String(form.get('config'))))
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Pengaturan gagal disimpan.', success: null }
  }
  refresh()
  return { error: null, success: 'Paket dan tarif disimpan. Pembelian lama tetap mengikuti ketentuan saat dibeli.' }
}
