'use server'

import { getLocale, getTranslations } from 'next-intl/server'

import { refresh } from 'next/cache'
import { logAdminAction } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { CouponError, parseCoupon } from '@/lib/coupon-options'
import { createCoupon, deleteCoupon, setCouponActive, updateCoupon } from '@/lib/coupons'
import { describeError } from '@/lib/errors'
import { isUuid } from '@/lib/params'
import type { FormState } from '../actions'

export type CouponIntent = 'create' | 'update' | 'activate' | 'deactivate' | 'delete'

const failed = (error: string): FormState => ({ error, success: null })

/**
 * Every change to a coupon, picked by the form's `intent`. Fields: `code`, `percent`, `maxUses`, `active` ("on"),
 * `expiresAt` (datetime-local, WIB, optional), `planIds` and `months` (repeated, optional), `couponId` for edits.
 */
export async function couponAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations('admin')

  const admin = await requireAdmin()
  const intent = String(formData.get('intent') ?? '') as CouponIntent
  const couponId = String(formData.get('couponId') ?? '')
  if (intent !== 'create' && !isUuid(couponId)) return failed(t('kupon_actions.couponNotFound'))

  let message: string
  try {
    switch (intent) {
      case 'create':
      case 'update': {
        const { catalog } = await getBillingCatalog()
        const input = parseCoupon({
          code: formData.get('code'), percent: formData.get('percent'), maxUses: formData.get('maxUses'),
          active: formData.get('active'), expiresAt: formData.get('expiresAt'),
          planIds: formData.getAll('planIds'), months: formData.getAll('months'),
        }, { planIds: catalog.plans.map((plan) => plan.id), months: catalog.durations.map((duration) => duration.months) }, new Date(), await getLocale())
        const id = intent === 'create' ? await createCoupon(admin.id, input) : (await updateCoupon(couponId, input), couponId)
        await logAdminAction(admin, intent === 'create' ? 'create_coupon' : 'update_coupon', null, {
          couponId: id, ...input, expiresAt: input.expiresAt?.toISOString() ?? null,
        })
        message = intent === 'create' ? t('kupon_actions.couponCreated', { v0: input.code }) : t('kupon_actions.couponSaved', { v0: input.code })
        break
      }
      case 'activate':
      case 'deactivate': {
        const active = intent === 'activate'
        await setCouponActive(couponId, active)
        await logAdminAction(admin, 'toggle_coupon', null, { couponId, active })
        message = active ? t('kupon_actions.couponActivated') : t('kupon_actions.couponDeactivated')
        break
      }
      case 'delete':
        await deleteCoupon(couponId)
        await logAdminAction(admin, 'delete_coupon', null, { couponId })
        message = t('kupon_actions.couponDeleted')
        break
      default:
        return failed(t('kupon_actions.unknownAction'))
    }
  } catch (error) {
    if (error instanceof CouponError) return failed(error.message)
    console.error('[admin] aksi kupon gagal:', describeError(error))
    return failed(t('kupon_actions.couponActionFailedHaveYouRunThe'))
  }
  refresh()
  return { error: null, success: message }
}
