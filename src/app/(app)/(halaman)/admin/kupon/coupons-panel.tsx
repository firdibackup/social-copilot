'use client'

import { Pencil, Power, PowerOff, Ticket, Trash2, X } from 'lucide-react'
import { Fragment, startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { Notice } from '@/components/notice'
import { confirmSubmit } from '@/lib/confirm-submit'
import { formatDateTime, formatShortDateTime, toWibInput } from '@/lib/format'
import type { FormState } from '../actions'
import { BUTTON, CARD, CARD_TITLE, DANGER_BUTTON, FIELD, HINT, LABEL, PRIMARY_BUTTON, TABLE, TD, TH } from '../ui'
import { couponAction } from './actions'

/** A coupon as the client sees it: dates are ISO strings. */
export interface CouponRow {
  id: string
  code: string
  percent: number
  maxUses: number
  active: boolean
  expiresAt: string | null
  planIds: string[]
  months: number[]
  used: number
  createdAt: string
}

export interface CouponCatalog {
  plans: { id: string; name: string; active: boolean }[]
  months: number[]
}

type Status = 'active' | 'inactive' | 'expired' | 'exhausted'

const INITIAL: FormState = { error: null, success: null }

const STATUS: Record<Status, { label: string; badge: string; dot: string }> = {
  active: { label: 'Aktif', badge: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  inactive: { label: 'Nonaktif', badge: 'bg-zinc-100 text-zinc-600', dot: 'bg-zinc-400' },
  expired: { label: 'Kedaluwarsa', badge: 'bg-red-50 text-red-700 ring-1 ring-red-200', dot: 'bg-red-500' },
  exhausted: { label: 'Habis', badge: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500' },
}

const CHIP =
  'inline-flex cursor-pointer items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700 has-checked:border-zinc-900 has-checked:bg-zinc-900 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-zinc-400'

function statusOf(coupon: CouponRow, now: number): Status {
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now) return 'expired'
  if (coupon.used >= coupon.maxUses) return 'exhausted'
  return coupon.active ? 'active' : 'inactive'
}

const monthsLabel = (months: number[]) => months.map((value) => `${value} bln`).join(', ')

export function CouponsPanel({ coupons, catalog, now }: { coupons: CouponRow[]; catalog: CouponCatalog; now: string }) {
  const nowMs = new Date(now).getTime()
  const [editing, setEditing] = useState<string | null>(null)
  const planName = (id: string) => catalog.plans.find((plan) => plan.id === id)?.name ?? id

  return (
    <div className="space-y-6">
      <section className={CARD}>
        <div className="space-y-1">
          <h2 className={CARD_TITLE}>Buat kupon</h2>
          <p className={HINT}>
            Kupon berlaku untuk langganan baru dan perpanjangan, tidak untuk upgrade paket. Diskon kupon dihitung setelah
            diskon durasi.
          </p>
        </div>
        <CouponForm catalog={catalog} />
      </section>

      <section className="space-y-3">
        <h2 className={CARD_TITLE}>Semua kupon ({coupons.length})</h2>
        {coupons.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center">
            <Ticket aria-hidden="true" className="size-6 text-zinc-300" />
            <p className="text-sm text-zinc-500">Belum ada kupon. Buat kupon pertama lewat formulir di atas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className={TABLE}>
              <thead className="border-b border-zinc-100">
                <tr>
                  <th className={TH}>Kode</th>
                  <th className={TH}>Diskon</th>
                  <th className={TH}>Terpakai</th>
                  <th className={TH}>Berlaku</th>
                  <th className={TH}>Kedaluwarsa</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {coupons.map((coupon) => (
                  <CouponTableRow
                    key={coupon.id}
                    coupon={coupon}
                    catalog={catalog}
                    status={statusOf(coupon, nowMs)}
                    planName={planName}
                    editing={editing === coupon.id}
                    onEdit={(open) => setEditing(open ? coupon.id : null)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function CouponTableRow({
  coupon,
  catalog,
  status,
  planName,
  editing,
  onEdit,
}: {
  coupon: CouponRow
  catalog: CouponCatalog
  status: Status
  planName: (id: string) => string
  editing: boolean
  onEdit: (open: boolean) => void
}) {
  const [state, action, pending] = useActionState(couponAction, INITIAL)
  const usedShare = Math.min(100, Math.round((coupon.used / coupon.maxUses) * 100))
  const locked = coupon.used > 0
  const badge = STATUS[status]
  const plans = coupon.planIds.length ? coupon.planIds.map(planName).join(', ') : 'Semua paket'
  const months = coupon.months.length ? monthsLabel(coupon.months) : 'Semua durasi'

  return (
    <Fragment>
      <tr className={editing ? 'bg-zinc-50' : 'hover:bg-zinc-50'}>
        <td className={`${TD} whitespace-nowrap`}>
          <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-sm font-semibold tracking-wide text-zinc-900">
            {coupon.code}
          </span>
        </td>
        <td className={`${TD} whitespace-nowrap font-semibold tabular-nums text-zinc-900`}>
          {coupon.percent}%{coupon.percent === 100 && <span className="ml-1 text-xs font-normal text-zinc-500">gratis</span>}
        </td>
        <td className={`${TD} min-w-32`}>
          <p className="tabular-nums text-zinc-900">
            {coupon.used} <span className="text-zinc-400">/ {coupon.maxUses}</span>
          </p>
          <div
            role="progressbar"
            aria-label={`Terpakai ${coupon.used} dari ${coupon.maxUses}`}
            aria-valuemin={0}
            aria-valuemax={coupon.maxUses}
            aria-valuenow={coupon.used}
            className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100"
          >
            <div
              className={`h-full rounded-full ${usedShare >= 100 ? 'bg-amber-500' : 'bg-zinc-900'}`}
              style={{ width: `${usedShare}%` }}
            />
          </div>
        </td>
        <td className={`${TD} min-w-40`}>
          <p className="text-zinc-900">{plans}</p>
          <p className="text-xs text-zinc-500">{months}</p>
        </td>
        <td className={`${TD} whitespace-nowrap`}>
          {coupon.expiresAt ? (
            <time
              dateTime={coupon.expiresAt}
              title={formatDateTime(new Date(coupon.expiresAt))}
              className="text-zinc-700"
            >
              {formatShortDateTime(new Date(coupon.expiresAt))}
            </time>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </td>
        <td className={TD}>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${badge.badge}`}
          >
            <span aria-hidden="true" className={`size-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
          {!coupon.active && status !== 'inactive' && <p className="mt-1 text-xs text-zinc-500">Nonaktif</p>}
        </td>
        <td className={TD}>
          <form action={action} className="flex flex-wrap justify-end gap-1.5">
            <input type="hidden" name="couponId" value={coupon.id} />
            <button
              type="button"
              className={BUTTON}
              aria-expanded={editing}
              aria-controls={`kupon-${coupon.id}`}
              onClick={() => onEdit(!editing)}
            >
              {editing ? <X aria-hidden="true" className="size-4" /> : <Pencil aria-hidden="true" className="size-4" />}
              {editing ? 'Tutup' : 'Ubah'}
            </button>
            <button
              type="submit"
              name="intent"
              value={coupon.active ? 'deactivate' : 'activate'}
              className={BUTTON}
              disabled={pending}
            >
              {coupon.active ? <PowerOff aria-hidden="true" className="size-4" /> : <Power aria-hidden="true" className="size-4" />}
              {coupon.active ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
            <button
              type="submit"
              name="intent"
              value="delete"
              className={DANGER_BUTTON}
              disabled={pending || locked}
              aria-label={locked ? 'Kupon sudah dipakai, tidak bisa dihapus' : `Hapus kupon ${coupon.code}`}
              title={locked ? 'Sudah dipakai — tidak bisa dihapus. Nonaktifkan saja.' : 'Hapus kupon'}
              onClick={(event) => void confirmSubmit(event, {
                title: `Hapus kupon ${coupon.code}?`,
                description: 'Kode ini tidak bisa dipakai lagi.',
                confirmLabel: 'Hapus',
                tone: 'danger',
              })}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </form>
          {(state.error || state.success) && (
            <div className="mt-2 min-w-56">
              <Notice tone={state.error ? 'error' : 'success'}>{state.error ?? state.success}</Notice>
            </div>
          )}
        </td>
      </tr>
      {editing && (
        <tr id={`kupon-${coupon.id}`} className="bg-zinc-50">
          <td colSpan={7} className="px-4 pt-1 pb-5">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="mb-4 flex flex-wrap items-baseline gap-2">
                <h3 className={CARD_TITLE}>
                  Ubah kupon <span className="font-mono">{coupon.code}</span>
                </h3>
                {locked && (
                  <p className={HINT}>
                    Sudah dipakai {coupon.used}× — kode dan diskon terkunci, dan kupon tidak bisa dihapus. Nonaktifkan
                    jika tidak ingin dipakai lagi.
                  </p>
                )}
              </div>
              <CouponForm catalog={catalog} coupon={coupon} onCancel={() => onEdit(false)} />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

function CouponForm({ catalog, coupon, onCancel }: { catalog: CouponCatalog; coupon?: CouponRow; onCancel?: () => void }) {
  const [state, action, pending] = useActionState(couponAction, INITIAL)
  const editing = coupon !== undefined
  const locked = editing && coupon.used > 0
  const lockedHint = <span className={`${HINT} block`}>Sudah dipakai — tidak bisa diubah</span>
  const formRef = useRef<HTMLFormElement>(null)

  // Submitted by hand so a rejected form keeps what the admin typed; a created coupon clears the form.
  useEffect(() => {
    if (state.success && !editing) formRef.current?.reset()
  }, [state, editing])

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        startTransition(() => action(formData))
      }}
      className="space-y-4"
    >
      <input type="hidden" name="intent" value={editing ? 'update' : 'create'} />
      {editing && <input type="hidden" name="couponId" value={coupon.id} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={LABEL}>
          <span>Kode</span>
          <input
            name="code"
            required
            minLength={3}
            maxLength={30}
            pattern="[A-Za-z0-9_\-]{3,30}"
            title="3–30 karakter: huruf, angka, - atau _"
            autoComplete="off"
            spellCheck={false}
            placeholder="HEMAT20"
            defaultValue={coupon?.code}
            readOnly={locked}
            onInput={(event) => {
              const input = event.currentTarget
              const caret = input.selectionStart
              input.value = input.value.toUpperCase()
              if (caret !== null) input.setSelectionRange(caret, caret)
            }}
            className={`${FIELD} font-mono tracking-wide uppercase ${locked ? 'cursor-not-allowed bg-zinc-50 text-zinc-500' : ''}`}
          />
          {locked ? lockedHint : <span className={`${HINT} block`}>3–30 karakter: huruf, angka, - atau _.</span>}
        </label>

        <label className={LABEL}>
          <span>Diskon (%)</span>
          <input
            name="percent"
            type="number"
            required
            min={1}
            max={100}
            step={1}
            inputMode="numeric"
            placeholder="20"
            defaultValue={coupon?.percent}
            readOnly={locked}
            className={`${FIELD} tabular-nums ${locked ? 'cursor-not-allowed bg-zinc-50 text-zinc-500' : ''}`}
          />
          {locked ? lockedHint : <span className={`${HINT} block`}>100% = gratis, langsung aktif tanpa pembayaran Mayar.</span>}
        </label>

        <label className={LABEL}>
          <span>Kuantitas</span>
          <input
            name="maxUses"
            type="number"
            required
            min={editing ? Math.max(1, coupon.used) : 1}
            max={1_000_000}
            step={1}
            inputMode="numeric"
            placeholder="100"
            defaultValue={coupon?.maxUses}
            className={`${FIELD} tabular-nums`}
          />
          <span className={`${HINT} block`}>
            Total pemakaian. Setiap akun hanya bisa memakai satu kali.
            {locked && ` Minimal ${coupon.used} (sudah terpakai).`}
          </span>
        </label>

        <label className={LABEL}>
          <span>Kedaluwarsa</span>
          <input
            name="expiresAt"
            type="datetime-local"
            defaultValue={coupon?.expiresAt ? toWibInput(new Date(coupon.expiresAt)) : ''}
            className={FIELD}
          />
          <span className={`${HINT} block`}>Kosongkan jika tanpa batas waktu (WIB).</span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-zinc-900">Paket</legend>
          <div className="flex flex-wrap gap-1.5">
            {catalog.plans.map((plan) => (
              <label key={plan.id} className={CHIP}>
                <input
                  type="checkbox"
                  name="planIds"
                  value={plan.id}
                  defaultChecked={coupon?.planIds.includes(plan.id)}
                  className="sr-only"
                />
                {plan.name}
                {!plan.active && <span className="opacity-60">(nonaktif)</span>}
              </label>
            ))}
          </div>
          <p className={HINT}>Tidak dipilih = semua paket.</p>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-zinc-900">Durasi</legend>
          <div className="flex flex-wrap gap-1.5">
            {catalog.months.map((months) => (
              <label key={months} className={CHIP}>
                <input
                  type="checkbox"
                  name="months"
                  value={months}
                  defaultChecked={coupon?.months.includes(months)}
                  className="sr-only"
                />
                {months} bulan
              </label>
            ))}
          </div>
          <p className={HINT}>Tidak dipilih = semua durasi.</p>
        </fieldset>
      </div>

      <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
        <input
          type="checkbox"
          name="active"
          value="on"
          defaultChecked={coupon ? coupon.active : true}
          className="size-4 rounded border-zinc-300 accent-zinc-900"
        />
        Aktif
      </label>

      {(state.error || state.success) && (
        <Notice tone={state.error ? 'error' : 'success'}>{state.error ?? state.success}</Notice>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={PRIMARY_BUTTON} disabled={pending}>
          {pending ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Buat kupon'}
        </button>
        {onCancel && (
          <button type="button" className={BUTTON} onClick={onCancel} disabled={pending}>
            Batal
          </button>
        )}
      </div>
    </form>
  )
}
