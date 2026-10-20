import { Notice } from '@/components/notice'
import { ThreadsIcon } from '@/components/threads-icon'
import { requireActiveUser } from '@/lib/auth'
import { formatDay } from '@/lib/calendar'
import { getConnectedAccountId } from '@/lib/connection'
import { ConfigError, describeError } from '@/lib/errors'
import { wibDateKey } from '@/lib/format'
import { firstValue, type SearchParams } from '@/lib/params'
import { getThreadsConnection, type ThreadsConnection } from '@/lib/threads-connection'
import { ThreadsDisconnectButton } from './disconnect-button'

type LoadResult =
  | { kind: 'ok'; hasInstagram: boolean; connection: ThreadsConnection | null }
  | { kind: 'error'; message: string }

const SUCCESS_MESSAGES: Record<string, string> = {
  connected: 'Threads berhasil terhubung.',
  disconnected: 'Koneksi Threads sudah diputus.',
}

const ERROR_MESSAGES: Record<string, string> = {
  ditolak: 'Izin Threads tidak disetujui. Hubungkan lagi dan setujui semua izin yang diminta.',
  state_tidak_valid: 'Sesi login kedaluwarsa atau tidak valid. Mulai lagi dari tombol Hubungkan Threads.',
  sesi_lain:
    'Login Threads selesai di sesi akun Carousely yang berbeda dari akun yang memulainya. Buka aplikasi di alamat yang sama dengan alamat tujuan Threads, masuk dengan akun ini, lalu hubungkan lagi.',
  perlu_instagram: 'Hubungkan Instagram dulu: Threads dipakai untuk akun Instagram yang terhubung.',
  gagal_mulai:
    'Login Threads gagal dimulai. Periksa THREADS_APP_ID, THREADS_REDIRECT_URI, dan konfigurasi Supabase di .env.local.',
  gagal_token: 'Kode login gagal ditukar menjadi token. Periksa THREADS_APP_SECRET dan THREADS_REDIRECT_URI.',
  gagal_profil: 'Token didapat, tapi profil Threads gagal diambil. Coba hubungkan lagi.',
  gagal_database: 'Database tidak bisa diakses. Periksa konfigurasi Supabase dan migrasi terbaru.',
  gagal_putus: 'Koneksi Threads gagal diputus. Coba lagi.',
  akun_dipakai:
    'Akun Threads ini sudah terhubung ke pengguna Carousely lain. Putuskan dulu dari akun tersebut, atau masuk dengan akun Threads lain.',
}

const UNKNOWN_ERROR = 'Terjadi kesalahan saat menghubungkan Threads. Coba lagi.'

async function loadThreads(userId: string): Promise<LoadResult> {
  try {
    // Threads belongs to the connected Instagram account, like the Facebook Page.
    const accountId = await getConnectedAccountId(userId)
    return {
      kind: 'ok',
      hasInstagram: accountId !== null,
      connection: accountId ? await getThreadsConnection(userId, accountId) : null,
    }
  } catch (error) {
    console.error('[pengaturan] koneksi Threads gagal dimuat:', describeError(error))
    const message =
      error instanceof ConfigError ? `Konfigurasi belum lengkap: ${error.message}.` : ERROR_MESSAGES.gagal_database
    return { kind: 'error', message }
  }
}

/** Publishing to Threads and answering replies under the account's Threads posts in Balasan. */
export async function ThreadsSettings({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const result = await loadThreads(await requireActiveUser())
  const success = SUCCESS_MESSAGES[firstValue(params.th) ?? '']
  const errorCode = firstValue(params.th_error)
  const error = errorCode ? (ERROR_MESSAGES[errorCode] ?? UNKNOWN_ERROR) : undefined

  return (
    <section id="threads" aria-labelledby="threads-heading" className="space-y-4">
      {success && <Notice tone="success">{success}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-zinc-100 p-2.5 text-zinc-700">
            <ThreadsIcon />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <h2 id="threads-heading" className="font-medium text-zinc-900">
              Threads
            </h2>
            {result.kind === 'error' ? (
              <Notice tone="warning">{result.message}</Notice>
            ) : !result.hasInstagram ? (
              <p className="text-sm text-zinc-600">
                Hubungkan Instagram dulu. Threads dipakai untuk akun Instagram yang terhubung.
              </p>
            ) : (
              <ThreadsDetails connection={result.connection} />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function ThreadsDetails({ connection }: { connection: ThreadsConnection | null }) {
  if (!connection) {
    return (
      <>
        <p className="text-sm text-zinc-600">
          Hubungkan akun Threads untuk menerbitkan post langsung dari Carousely dan membalas komentar orang di tab
          Balasan.
        </p>
        <ConnectLink label="Hubungkan Threads" />
      </>
    )
  }

  const needsReconnect = connection.status === 'needs_reconnect'
  return (
    <>
      <div className="space-y-0.5 text-sm text-zinc-600">
        <p>
          <span className="font-medium text-zinc-900">@{connection.username}</span>
          {' · '}
          Terhubung sejak {formatDay(wibDateKey(connection.connectedAt))}
        </p>
      </div>
      {needsReconnect ? (
        <Notice tone="error">
          Token Threads kedaluwarsa atau izinnya dicabut. Hubungkan ulang agar post Threads tetap terbit.
        </Notice>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
          Koneksi aktif
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <ConnectLink label="Hubungkan ulang" secondary={!needsReconnect} />
        <ThreadsDisconnectButton username={connection.username} />
      </div>
    </>
  )
}

function ConnectLink({ label, secondary = false }: { label: string; secondary?: boolean }) {
  // A plain <a>: the route handler redirects off-site to Threads, which a client-side <Link> can't follow.
  return (
    <a
      href="/api/auth/threads/start"
      className={
        secondary
          ? 'inline-flex items-center rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50'
          : 'inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover'
      }
    >
      {label}
    </a>
  )
}
