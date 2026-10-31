
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireAdmin } from '@/lib/auth'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { listCoupons } from '@/lib/coupons'
import { ConfigError, describeError } from '@/lib/errors'
import { CouponsPanel, type CouponCatalog, type CouponRow } from './coupons-panel'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin')
  return { title: t('kupon_page.couponsAdmin') }
}

export default async function AdminKuponPage() {
  const t = await getTranslations('admin')

  return (
    <Suspense fallback={<LoadingState variant="table" label={t('kupon_page.loadingCoupons')} />}>
      <Coupons />
    </Suspense>
  )
}

async function Coupons() {
  const t = await getTranslations('admin')
  await connection()
  await requireAdmin()
  let coupons: CouponRow[]
  let catalog: CouponCatalog
  try {
    const [list, billing] = await Promise.all([listCoupons(), getBillingCatalog()])
    coupons = list.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      percent: coupon.percent,
      maxUses: coupon.maxUses,
      active: coupon.active,
      expiresAt: coupon.expiresAt?.toISOString() ?? null,
      planIds: coupon.planIds,
      months: coupon.months,
      used: coupon.used,
      createdAt: coupon.createdAt.toISOString(),
    }))
    catalog = {
      plans: billing.catalog.plans.map((plan) => ({ id: plan.id, name: plan.name, active: plan.active })),
      months: billing.catalog.durations.map((duration) => duration.months),
    }
  } catch (error) {
    console.error('[admin] kupon gagal dimuat:', describeError(error))
    return <Notice tone="warning">{error instanceof ConfigError ? t('loadErrors.configuration', { message: error.message }) : t('loadErrors.database')}</Notice>
  }
  return <CouponsPanel coupons={coupons} catalog={catalog} now={new Date().toISOString()} />
}
