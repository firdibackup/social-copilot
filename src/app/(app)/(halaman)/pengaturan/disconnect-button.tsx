'use client'

import { useTranslations } from 'next-intl'

import { useRef, type FormEvent } from 'react'
import { PendingSubmit } from '@/components/pending-submit'
import { confirmSubmit } from '@/lib/confirm-submit'
import { disconnectInstagram, disconnectThreads } from './actions'

const BUTTON = 'rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50'

/** What Putuskan hides until the account is connected again. */


interface InstagramDisconnectProps {
  username: string
  /** Scheduled posts of this account, which become drafts. */
  scheduledCount: number
}

/**
 * Putuskan Instagram asks in a dialog what the owner loses sight of: the account's data stays, hidden until it is
 * connected again, and its scheduled posts become drafts.
 */
export function InstagramDisconnectButton({ username, scheduledCount }: InstagramDisconnectProps) {
  const t = useTranslations('settings')

  const HIDDEN = t('disconnect_button.brandKitDesignReferencesAssetsPostsAnd')

  const dialog = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={BUTTON}>
        {t('disconnect_button.disconnect')}</button>
      <dialog
        ref={dialog}
        aria-labelledby="putuskan-judul"
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl border border-zinc-200 bg-white p-6 shadow-xl backdrop:bg-zinc-900/40"
      >
        <form action={disconnectInstagram} className="space-y-4">
          <h2 id="putuskan-judul" className="text-lg font-semibold text-zinc-900">
            {t('disconnect_button.disconnect2')}{username}?
          </h2>
          <div className="space-y-2 text-sm text-zinc-600">
            <p>{t('disconnect_button.whileAnotherAccountIsConnectedTheseWill')} {HIDDEN}.</p>
            <p>{t('disconnect_button.yourInstagramAccessTokenWillBeDeleted')}</p>
            {scheduledCount > 0 && (
              <p className="font-medium text-zinc-900">{t('disconnect_button.scheduledDrafts', { count: scheduledCount })}</p>
            )}
            <p>{t('disconnect_button.returns', { username })}</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t('disconnect_button.cancel')}</button>
            <PendingSubmit pendingLabel={t('disconnect_button.disconnecting')} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
              {t('disconnect_button.disconnect')}</PendingSubmit>
          </div>
        </form>
      </dialog>
    </>
  )
}

export function ThreadsDisconnectButton({ username }: { username: string }) {
  const t = useTranslations('settings')

  function confirmDisconnect(event: FormEvent<HTMLFormElement>) {
    void confirmSubmit(event, {
      title: t('disconnect_button.disconnect3', { v0: username }),
      description: t('disconnect_button.scheduledPostsThatIncludeThreadsWillFail'),
      confirmLabel: t('disconnect_button.disconnect'),
      tone: 'danger',
    })
  }

  return (
    <form action={disconnectThreads} onSubmit={confirmDisconnect}>
      <PendingSubmit pendingLabel={t('disconnect_button.disconnecting')} className={`${BUTTON} disabled:opacity-60`}>
        {t('disconnect_button.disconnectAccount')}</PendingSubmit>
    </form>
  )
}
