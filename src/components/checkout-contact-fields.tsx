'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CUSTOMER_NAME_MAX_LENGTH, normalizeWhatsapp, parseCustomerContact, type CustomerContact } from '@/lib/whatsapp'

type Field = 'name' | 'whatsapp'
type Errors = Partial<Record<Field, string>>

function fieldErrors(value: CustomerContact, t: ReturnType<typeof useTranslations<'common'>>): Errors {
  const errors: Errors = {}
  const name = value.name.trim()
  if (!name) errors.name = t('checkout.nameRequired')
  else if (name.length > CUSTOMER_NAME_MAX_LENGTH) errors.name = t('checkout.nameMax', { max: CUSTOMER_NAME_MAX_LENGTH })
  if (!value.whatsapp.trim()) errors.whatsapp = t('checkout.whatsappRequired')
  else if (!normalizeWhatsapp(value.whatsapp)) errors.whatsapp = t('checkout.whatsappInvalid')
  return errors
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The name and WhatsApp number a checkout needs: state, per-field errors and focus on the first one that's wrong. */
export function useCheckoutContact(initial: CustomerContact, idPrefix: string) {
  const t = useTranslations('common')
  const [value, setValue] = useState<CustomerContact>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const ids = { name: `${idPrefix}-nama`, whatsapp: `${idPrefix}-wa` }

  function reveal(field: Field) {
    const input = document.getElementById(ids[field])
    if (!input) return
    // Centered so neither a sticky header nor the mobile pay bar covers it.
    input.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
    input.focus({ preventScroll: true })
  }

  return {
    value,
    errors,
    ids,
    change(field: Field, next: string) {
      setValue((current) => ({ ...current, [field]: next }))
      // Clear as soon as it's fixed; new errors wait for blur or submit.
      if (errors[field] && !fieldErrors({ ...value, [field]: next }, t)[field]) setErrors((current) => ({ ...current, [field]: undefined }))
    },
    blur(field: Field) {
      if (!value[field].trim()) return
      setErrors((current) => ({ ...current, [field]: fieldErrors(value, t)[field] }))
    },
    /** The cleaned contact, or null after showing what to fix. */
    validate(): CustomerContact | null {
      const found = fieldErrors(value, t)
      setErrors(found)
      const first = (['name', 'whatsapp'] as const).find((field) => found[field])
      if (first) { reveal(first); return null }
      const parsed = parseCustomerContact(value)
      return 'error' in parsed ? null : parsed
    },
    /** A rejection from the server, put next to the field it is about. */
    showServerError(message: string) {
      const field: Field = /whatsapp|nomor/i.test(message) ? 'whatsapp' : 'name'
      setErrors({ [field]: message })
      reveal(field)
    },
  }
}

export type CheckoutContact = ReturnType<typeof useCheckoutContact>

const INPUT = 'block min-h-11 w-full rounded-xl border bg-paper px-3.5 py-2.5 text-base text-ink transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:outline-none focus:ring-3 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm'
const VALID = 'border-hairline hover:border-zinc-300 focus:border-primary focus:ring-primary/15'
const INVALID = 'border-red-400 focus:border-red-500 focus:ring-red-500/15'

export function CheckoutContactFields({ contact, disabled, className = '' }: { contact: CheckoutContact; disabled?: boolean; className?: string }) {
  const t = useTranslations('common')
  const { value, errors, ids } = contact
  return (
    <fieldset disabled={disabled} className={`space-y-3.5 ${className}`}>
      <legend className="mb-3 text-sm font-semibold text-ink">{t('checkout.title')}</legend>
      <div>
        <label htmlFor={ids.name} className="mb-1.5 block text-xs font-medium text-ink-muted">{t('checkout.name')}</label>
        <input
          id={ids.name} name="nama" type="text" autoComplete="name" required
          maxLength={CUSTOMER_NAME_MAX_LENGTH} value={value.name}
          onChange={(event) => contact.change('name', event.target.value)} onBlur={() => contact.blur('name')}
          aria-invalid={!!errors.name} aria-describedby={errors.name ? `${ids.name}-error` : undefined}
          className={`${INPUT} ${errors.name ? INVALID : VALID}`}
        />
        {errors.name && <p id={`${ids.name}-error`} className="mt-1.5 text-xs font-medium text-red-700">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor={ids.whatsapp} className="mb-1.5 block text-xs font-medium text-ink-muted">{t('checkout.whatsapp')}</label>
        <input
          id={ids.whatsapp} name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" required
          placeholder="0812 3456 7890" value={value.whatsapp}
          onChange={(event) => contact.change('whatsapp', event.target.value)} onBlur={() => contact.blur('whatsapp')}
          aria-invalid={!!errors.whatsapp} aria-describedby={`${errors.whatsapp ? `${ids.whatsapp}-error ` : ''}${ids.whatsapp}-hint`}
          className={`${INPUT} tabular-nums ${errors.whatsapp ? INVALID : VALID}`}
        />
        {errors.whatsapp && <p id={`${ids.whatsapp}-error`} className="mt-1.5 text-xs font-medium text-red-700">{errors.whatsapp}</p>}
        <p id={`${ids.whatsapp}-hint`} className="mt-1.5 text-xs text-ink-muted text-pretty">{t('checkout.hint')}</p>
      </div>
    </fieldset>
  )
}
