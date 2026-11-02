'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useActionState, useId, useRef, useState } from 'react'
import { Notice } from '@/components/notice'
import { PendingSubmit } from '@/components/pending-submit'
import { deleteAccount, type DeleteAccountState } from './actions'

const INITIAL: DeleteAccountState = { error: null }

const sameEmail = (typed: string, email: string) => email !== '' && typed.trim().toLowerCase() === email.trim().toLowerCase()

interface DeleteAccountProps {
  email: string
  /** Whether a paid period is running, so the dialog can mention refunds. */
  hasActivePlan: boolean
}

/**
 * Hapus akun closes the account: the backend archives it and signs the user out. The dialog lists what happens and
 * only enables the button once the account's email is typed; the server checks the email again.
 */
export function DeleteAccount({ email, hasActivePlan }: DeleteAccountProps) {
  const t = useTranslations('settings')
  const dialog = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState('')
  const [state, formAction] = useActionState(deleteAccount, INITIAL)
  const id = useId()
  const titleId = `${id}-title`
  const inputId = `${id}-email`
  const matches = sameEmail(typed, email)

  const consequences = [
    t('delete_account.consequenceConnections'),
    t('delete_account.consequenceScheduled'),
    t('delete_account.consequenceArchive'),
  ]

  return (
    <section aria-labelledby={`${id}-card`} className="rounded-xl border border-red-200 bg-white p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 id={`${id}-card`} className="font-medium text-zinc-900">{t('delete_account.title')}</h2>
          <p className="text-sm text-zinc-500">{t('delete_account.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => dialog.current?.showModal()}
          className="shrink-0 self-start rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          {t('delete_account.open')}
        </button>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setTyped('')}
        className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-xl border border-zinc-200 bg-white p-6 shadow-xl backdrop:bg-zinc-900/40"
      >
        <form action={formAction} className="space-y-4">
          <h2 id={titleId} className="text-lg font-semibold text-zinc-900">{t('delete_account.dialogTitle')}</h2>

          <div className="space-y-3 text-sm text-zinc-600">
            <ul className="space-y-2">
              {consequences.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-zinc-300" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="rounded-lg bg-zinc-50 px-3 py-2.5 text-zinc-700">{t('delete_account.consequenceFresh')}</p>
            {hasActivePlan && (
              <p className="font-medium text-zinc-900">
                {t.rich('delete_account.activePlan', {
                  refund: (chunks) => <Link href="/refund" className="underline underline-offset-2">{chunks}</Link>,
                })}
              </p>
            )}
            <p className="text-zinc-500">
              {t.rich('delete_account.learnMore', {
                link: (chunks) => <Link href="/hapus-data" className="underline underline-offset-2">{chunks}</Link>,
              })}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={inputId} className="block break-words text-sm text-zinc-700">
              {t('delete_account.confirmLabel', { email })}
            </label>
            <input
              id={inputId}
              name="confirmEmail"
              type="email"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={email}
              required
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
          </div>

          {state.error && <Notice tone="error">{state.error}</Notice>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t('delete_account.cancel')}
            </button>
            <PendingSubmit
              disabled={!matches}
              pendingLabel={t('delete_account.pending')}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('delete_account.submit')}
            </PendingSubmit>
          </div>
        </form>
      </dialog>
    </section>
  )
}
