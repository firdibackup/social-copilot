import { Notice } from '@/components/notice'
import { requireActiveUser } from '@/lib/auth'
import { getConnectedAccountId } from '@/lib/connection'
import { ConfigError, describeError } from '@/lib/errors'
import { getFacebookConnection, type FacebookConnection } from '@/lib/facebook-connection'
import { firstValue, type SearchParams } from '@/lib/params'
import { DisconnectButton } from './disconnect-button'

type LoadResult = { kind: 'ok'; connection: FacebookConnection | null } | { kind: 'error'; message: string }

const SUCCESS_MESSAGES: Record<string, string> = {
  connected: 'Facebook terhubung. Referensi dari akun lain bisa dicari di halaman Brand.',
  disconnected: 'Koneksi Facebook sudah diputus.',
}

const ERROR_MESSAGES: Record<string, string> = {
  ditolak: 'Izin Facebook tidak disetujui. Hubungkan lagi dan setujui semua izin yang diminta.',
  state_tidak_valid: 'Sesi login kedaluwarsa atau tidak valid. Mulai lagi dari tombol Hubungkan Facebook.',
  gagal_mulai:
    'Login Facebook gagal dimulai. Periksa FACEBOOK_APP_ID, FACEBOOK_REDIRECT_URI, dan konfigurasi Supabase di .env.local.',
  gagal_token: 'Kode login gagal ditukar menjadi token. Periksa FACEBOOK_APP_SECRET dan FACEBOOK_REDIRECT_URI.',
  gagal_page: 'Daftar Facebook Page gagal diambil. Pastikan izin pages_show_list disetujui.',
  tanpa_instagram:
    'Tidak ada Facebook Page dengan akun Instagram profesional. Hubungkan akun Instagram ke Page di Meta Business Suite, lalu coba lagi.',
  gagal_database: 'Database tidak bisa diakses. Periksa konfigurasi Supabase dan migrasi terbaru.',
  gagal_putus: 'Koneksi Facebook gagal diputus. Coba lagi.',
}

const UNKNOWN_ERROR = 'Terjadi kesalahan saat menghubungkan Facebook. Coba lagi.'

async function loadFacebook(userId: string): Promise<LoadResult> {
  try {
    // The Page belongs to the connected Instagram account.
    const accountId = await getConnectedAccountId(userId)
    return { kind: 'ok', connection: accountId ? await getFacebookConnection(userId, accountId) : null }
  } catch (error) {
    console.error('[pengaturan] koneksi Facebook gagal dimuat:', describeError(error))
    const message =
      error instanceof ConfigError ? `Konfigurasi belum lengkap: ${error.message}.` : ERROR_MESSAGES.gagal_database
    return { kind: 'error', message }
  }
}

/** Facebook Login exists only for Business Discovery: reading other accounts' posts as design references. */
export async function FacebookSettings({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const result = await loadFacebook(await requireActiveUser())
  const success = SUCCESS_MESSAGES[firstValue(params.fb) ?? '']
  const errorCode = firstValue(params.fb_error)
  const error = errorCode ? (ERROR_MESSAGES[errorCode] ?? UNKNOWN_ERROR) : undefined

  return (
    <section id="facebook" aria-labelledby="facebook-heading" className="space-y-4">
      {success && <Notice tone="success">{success}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 id="facebook-heading" className="font-medium text-zinc-900">
          Facebook (Business Discovery)
        </h2>
        <p className="text-sm text-zinc-600">
          Dipakai untuk membaca post akun Instagram Business atau Creator lain sebagai referensi desain di halaman Brand.
          Butuh Facebook Page yang terhubung ke akun Instagram profesionalmu.
        </p>
        {result.kind === 'error' ? (
          <Notice tone="warning">{result.message}</Notice>
        ) : (
          <FacebookDetails connection={result.connection} />
        )}
      </div>
    </section>
  )
}

function FacebookDetails({ connection }: { connection: FacebookConnection | null }) {
  if (!connection) return <ConnectLink label="Hubungkan Facebook" />

  const needsReconnect = connection.status === 'needs_reconnect'
  return (
    <>
      <p className="text-sm text-zinc-600">
        Page <span className="font-medium text-zinc-900">{connection.pageName}</span>
        {connection.username && <> · @{connection.username}</>}
      </p>
      {needsReconnect ? (
        <Notice tone="error">Token Facebook ditolak atau izinnya dicabut. Hubungkan ulang.</Notice>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
          Terhubung
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {needsReconnect && <ConnectLink label="Hubungkan ulang" />}
        <DisconnectButton service="facebook" />
      </div>
    </>
  )
}

function ConnectLink({ label }: { label: string }) {
  // A plain <a>: the route handler redirects off-site to Facebook, which a client-side <Link> can't follow.
  return (
    <a
      href="/api/auth/facebook/start"
      className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
    >
      {label}
    </a>
  )
}
