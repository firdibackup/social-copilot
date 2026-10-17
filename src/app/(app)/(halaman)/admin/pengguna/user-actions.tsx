'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { Notice } from '@/components/notice'
import { MAX_GRANT_DAYS, MIN_PASSWORD, NOTE_MAX_LENGTH } from '@/lib/admin-options'
import { userAction, type FormState, type UserIntent } from '../actions'
import { BUTTON, CARD, CARD_TITLE, DANGER_BUTTON, FIELD, HINT, LABEL, PRIMARY_BUTTON } from '../ui'

const INITIAL: FormState = { error: null, success: null }

interface UserActionsProps {
  userId: string
  email: string
  isSelf: boolean
  banned: boolean
  hasPeriod: boolean
  planDays: number
}

export function UserActions({ userId, email, isSelf, banned, hasPeriod, planDays }: UserActionsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={CARD}>
        <h2 className={CARD_TITLE}>Langganan</h2>
        <ActionForm userId={userId} intent="grant">
          {(pending) => (
            <div className="flex flex-wrap items-end gap-2">
              <label className={`${LABEL} w-32`}>
                <span>Tambah hari</span>
                <input name="days" type="number" min={1} max={MAX_GRANT_DAYS} defaultValue={planDays} required className={FIELD} />
              </label>
              <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
                {pending ? 'Menambah…' : 'Tambah gratis'}
              </button>
            </div>
          )}
        </ActionForm>
        <p className={HINT}>Hari tambahan menyambung setelah periode yang sudah ada, tanpa pembayaran.</p>
        {hasPeriod && (
          <ActionForm userId={userId} intent="end">
            {(pending) => (
              <ConfirmButton
                label="Hentikan langganan"
                confirm="Ya, hentikan sekarang"
                warning="Periode sekarang berakhir saat ini juga dan periode yang sudah dibayar di muka dibatalkan. Post terjadwal tidak akan terbit."
                pending={pending}
              />
            )}
          </ActionForm>
        )}
      </section>

      <section className={CARD}>
        <h2 className={CARD_TITLE}>Kredit AI</h2>
        <ActionForm userId={userId} intent="adjust">
          {(pending) => (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className={`${LABEL} w-36`}>
                  <span>Aksi</span>
                  <select name="kind" defaultValue="add" className={FIELD}>
                    <option value="add">Tambah kredit</option>
                    <option value="remove">Kurangi kredit</option>
                  </select>
                </label>
                <label className={`${LABEL} w-32`}>
                  <span>Jumlah</span>
                  <input name="credits" type="number" min={1} required className={FIELD} />
                </label>
              </div>
              <label className={LABEL}>
                <span>Catatan (opsional)</span>
                <input name="note" maxLength={NOTE_MAX_LENGTH} placeholder="Misalnya: kompensasi gangguan" className={FIELD} />
              </label>
              <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
                {pending ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          )}
        </ActionForm>
        <p className={HINT}>Berlaku untuk periode yang sedang berjalan. Kredit tidak terbawa ke periode berikutnya.</p>
        {hasPeriod && (
          <ActionForm userId={userId} intent="reset">
            {(pending) => (
              <ConfirmButton
                label="Reset pemakaian ke 0%"
                confirm="Ya, reset"
                warning="Semua kredit yang terpakai di periode ini dikembalikan."
                pending={pending}
                danger={false}
              />
            )}
          </ActionForm>
        )}
      </section>

      <section className={CARD}>
        <h2 className={CARD_TITLE}>Akun</h2>
        <ActionForm userId={userId} intent="password">
          {(pending) => (
            <div className="flex flex-wrap items-end gap-2">
              <label className={`${LABEL} min-w-0 flex-1`}>
                <span>Password baru</span>
                <input name="password" type="text" minLength={MIN_PASSWORD} required autoComplete="off" className={FIELD} />
              </label>
              <button type="submit" disabled={pending} className={BUTTON}>
                {pending ? 'Mengganti…' : 'Ganti password'}
              </button>
            </div>
          )}
        </ActionForm>
        <p className={HINT}>Tidak ada email reset password, jadi berikan password baru langsung ke pengguna.</p>
        {!isSelf && (
          <ActionForm userId={userId} intent={banned ? 'unban' : 'ban'}>
            {(pending) =>
              banned ? (
                <button type="submit" disabled={pending} className={BUTTON}>
                  {pending ? 'Membuka…' : 'Buka blokir'}
                </button>
              ) : (
                <ConfirmButton
                  label="Blokir akun"
                  confirm="Ya, blokir"
                  warning="Pengguna tidak bisa masuk lagi; sesi yang terbuka berakhir dalam satu jam. Post terjadwal tetap terbit selama langganan aktif, jadi hentikan langganannya juga kalau perlu."
                  pending={pending}
                />
              )
            }
          </ActionForm>
        )}
      </section>

      {!isSelf && (
        <section className={`${CARD} border-red-200`}>
          <h2 className="text-sm font-semibold text-red-800">Hapus pengguna</h2>
          <p className="text-sm text-zinc-600">
            Akun, koneksi Instagram, post, aset, brand kit, DM, dan riwayat AI-nya ikut terhapus. Tidak bisa dibatalkan.
          </p>
          <ActionForm userId={userId} intent="delete">
            {(pending) => (
              <div className="flex flex-wrap items-end gap-2">
                <label className={`${LABEL} min-w-0 flex-1`}>
                  <span>Ketik {email} untuk konfirmasi</span>
                  <input name="confirmEmail" autoComplete="off" required className={FIELD} />
                </label>
                <button type="submit" disabled={pending} className={DANGER_BUTTON}>
                  {pending ? 'Menghapus…' : 'Hapus permanen'}
                </button>
              </div>
            )}
          </ActionForm>
        </section>
      )}
    </div>
  )
}

/** One action on the user, with its own message under it. */
function ActionForm({
  userId,
  intent,
  children,
}: {
  userId: string
  intent: UserIntent
  children: (pending: boolean) => ReactNode
}) {
  const [state, action, pending] = useActionState(userAction, INITIAL)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="intent" value={intent} />
      {children(pending)}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.success && <Notice tone="success">{state.success}</Notice>}
    </form>
  )
}

/** A submit button that asks once more, in place, before it submits. */
function ConfirmButton({
  label,
  confirm,
  warning,
  pending,
  danger = true,
}: {
  label: string
  confirm: string
  warning: string
  pending: boolean
  danger?: boolean
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={danger ? DANGER_BUTTON : BUTTON}>
        {label}
      </button>
    )
  }
  return (
    <div className="space-y-2 rounded-lg bg-zinc-50 p-3">
      <p className="text-sm text-zinc-700">{warning}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={danger ? DANGER_BUTTON : PRIMARY_BUTTON}>
          {pending ? 'Memproses…' : confirm}
        </button>
        <button type="button" disabled={pending} onClick={() => setAsking(false)} className={BUTTON}>
          Batal
        </button>
      </div>
    </div>
  )
}
