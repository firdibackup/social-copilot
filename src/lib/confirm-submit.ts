'use client'

import type { FormEvent, MouseEvent } from 'react'
import { confirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'

const bypassedForms = new WeakSet<HTMLFormElement>()

type ConfirmSubmitEvent = FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>

/** Confirms a form submission, then repeats it with the original submitter so formAction/name/value are preserved. */
export async function confirmSubmit(event: ConfirmSubmitEvent, options: ConfirmOptions): Promise<void> {
  const target = event.currentTarget
  const form = target instanceof HTMLFormElement ? target : target.form
  if (!form) return

  if (bypassedForms.has(form)) {
    bypassedForms.delete(form)
    return
  }

  event.preventDefault()
  const submitter = target instanceof HTMLButtonElement
    ? target
    : (event.nativeEvent as SubmitEvent).submitter instanceof HTMLElement
      ? (event.nativeEvent as SubmitEvent).submitter
      : undefined

  if (!(await confirmDialog(options))) return

  bypassedForms.add(form)
  form.requestSubmit(submitter)
  bypassedForms.delete(form)
}
