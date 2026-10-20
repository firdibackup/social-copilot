'use client'

import { useRef, type FormEvent } from 'react'
import { disconnectFacebook, disconnectInstagram, disconnectThreads } from './actions'

const BUTTON = 'rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50'

/** What Putuskan hides until the account is connected again. */
const HIDDEN = 'brand kit, referensi desain, Aset, posting dan draft, ide, DM, dan template Auto DM'

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
  const dialog = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={BUTTON}>
        Putuskan
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="putuskan-judul"
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl border border-zinc-200 bg-white p-6 shadow-xl backdrop:bg-zinc-900/40"
      >
        <form action={disconnectInstagram} className="space-y-4">
          <h2 id="putuskan-judul" className="text-lg font-semibold text-zinc-900">
            Putuskan @{username}?
          </h2>
          <div className="space-y-2 text-sm text-zinc-600">
            <p>Selama akun lain terhubung, ini akan disembunyikan: {HIDDEN}.</p>
            <p>Token akses Instagram dihapus, begitu juga koneksi Facebook dan Threads-nya kalau ada.</p>
            {scheduledCount > 0 && (
              <p className="font-medium text-zinc-900">{scheduledCount} posting terjadwal akan kembali jadi draft.</p>
            )}
            <p>Semuanya kembali kalau @{username} dihubungkan lagi.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Batal
            </button>
            <button type="submit" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
              Putuskan
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

const FACEBOOK_CONFIRM = 'Putuskan Facebook? Referensi dari akun lain tidak bisa dicari sampai Facebook dihubungkan lagi.'

export function ThreadsDisconnectButton({ username }: { username: string }) {
  function confirmDisconnect(event: FormEvent<HTMLFormElement>) {
    const message = `Putuskan @${username}? Post terjadwal yang ikut ke Threads akan gagal terbit di Threads sampai Threads dihubungkan lagi.`
    if (!window.confirm(message)) event.preventDefault()
  }

  return (
    <form action={disconnectThreads} onSubmit={confirmDisconnect}>
      <button type="submit" className={BUTTON}>
        Putuskan koneksi
      </button>
    </form>
  )
}

export function FacebookDisconnectButton() {
  function confirmDisconnect(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(FACEBOOK_CONFIRM)) event.preventDefault()
  }

  return (
    <form action={disconnectFacebook} onSubmit={confirmDisconnect}>
      <button type="submit" className={BUTTON}>
        Putuskan
      </button>
    </form>
  )
}
