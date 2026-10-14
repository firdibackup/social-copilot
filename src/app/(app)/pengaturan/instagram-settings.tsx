import type { ReactNode } from 'react'
import { InstagramIcon } from '@/components/instagram-icon'
import { checkConnectionHealth, getConnection, type Connection, type ConnectionHealth } from '@/lib/connection'
import { ConfigError, describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { DisconnectButton } from './disconnect-button'

export type SearchParams = Record<string, string | string[] | undefined>

type Tone = 'success' | 'warning' | 'error'

type LoadResult =
  | { kind: 'ok'; connection: Connection | null; health: ConnectionHealth | null }
  | { kind: 'error'; message: string }

const SUCCESS_MESSAGES: Record<string, string> = {
  connected: 'Instagram berhasil terhubung.',
  disconnected: 'Koneksi Instagram sudah diputus.',
}

const ERROR_MESSAGES: Record<string, string> = {
  ditolak: 'Izin Instagram tidak disetujui. Hubungkan lagi dan setujui semua izin yang diminta.',
  state_tidak_valid: 'Sesi login kedaluwarsa atau tidak valid. Mulai lagi dari tombol Hubungkan Instagram.',
  gagal_mulai: 'Login Instagram gagal dimulai. Periksa konfigurasi Instagram dan Supabase di .env.local.',
  gagal_token: 'Kode login gagal ditukar menjadi token. Periksa INSTAGRAM_APP_SECRET dan INSTAGRAM_REDIRECT_URI.',
  gagal_profil: 'Token didapat, tapi profil Instagram gagal diambil. Coba hubungkan lagi.',
  gagal_database: 'Database tidak bisa diakses. Periksa konfigurasi Supabase di .env.local.',
  gagal_putus: 'Koneksi gagal diputus. Coba lagi.',
}

const UNKNOWN_ERROR = 'Terjadi kesalahan saat menghubungkan Instagram. Coba lagi.'

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  BUSINESS: 'Akun Bisnis',
  MEDIA_CREATOR: 'Akun Kreator',
}

const NOTICE_CLASS: Record<Tone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-800',
}

const firstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

async function loadInstagram(): Promise<LoadResult> {
  try {
    const connection = await getConnection()
    const health = connection?.status === 'active' ? await checkConnectionHealth() : null
    return { kind: 'ok', connection, health }
  } catch (error) {
    console.error('[pengaturan] koneksi gagal dimuat:', describeError(error))
    const message =
      error instanceof ConfigError
        ? `Konfigurasi belum lengkap: ${error.message}.`
        : ERROR_MESSAGES.gagal_database
    return { kind: 'error', message }
  }
}

interface InstagramSettingsProps {
  searchParams: Promise<SearchParams>
}

export async function InstagramSettings({ searchParams }: InstagramSettingsProps) {
  const params = await searchParams
  const result = await loadInstagram()
  const success = SUCCESS_MESSAGES[firstValue(params.ig) ?? '']
  const errorCode = firstValue(params.ig_error)
  const error = errorCode ? (ERROR_MESSAGES[errorCode] ?? UNKNOWN_ERROR) : undefined

  return (
    <section id="instagram" aria-labelledby="instagram-heading" className="space-y-4">
      {success && <Notice tone="success">{success}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-zinc-100 p-2.5 text-zinc-700">
            <InstagramIcon />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <h2 id="instagram-heading" className="font-medium text-zinc-900">
              Instagram
            </h2>
            {result.kind === 'error' ? (
              <Notice tone="warning">{result.message}</Notice>
            ) : (
              <ConnectionDetails connection={result.connection} health={result.health} />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

interface ConnectionDetailsProps {
  connection: Connection | null
  health: ConnectionHealth | null
}

function ConnectionDetails({ connection, health }: ConnectionDetailsProps) {
  if (!connection) {
    return (
      <>
        <p className="text-sm text-zinc-600">
          Belum ada akun yang terhubung. Hubungkan akun Instagram Business atau Creator untuk menjadwalkan konten dan
          membalas DM.
        </p>
        <ConnectLink label="Hubungkan Instagram" />
      </>
    )
  }

  const needsReconnect = connection.status === 'needs_reconnect' || health === 'needs_reconnect'

  return (
    <>
      <div className="space-y-0.5 text-sm text-zinc-600">
        <p>
          <span className="font-medium text-zinc-900">@{connection.username}</span>
          {' · '}
          {ACCOUNT_TYPE_LABELS[connection.accountType] ?? connection.accountType}
        </p>
        <p>Token berlaku sampai {formatDateTime(connection.tokenExpiresAt)}</p>
      </div>
      <HealthNotice needsReconnect={needsReconnect} health={health} />
      <div className="flex flex-wrap gap-2">
        {needsReconnect && <ConnectLink label="Sambungkan ulang" />}
        <DisconnectButton />
      </div>
    </>
  )
}

interface HealthNoticeProps {
  needsReconnect: boolean
  health: ConnectionHealth | null
}

function HealthNotice({ needsReconnect, health }: HealthNoticeProps) {
  if (needsReconnect) {
    return (
      <Notice tone="error">
        Token kedaluwarsa atau izin dicabut. Sambungkan ulang agar posting dan DM tetap berjalan.
      </Notice>
    )
  }
  if (health === 'unreachable') {
    return <Notice tone="warning">Instagram tidak bisa dicek saat ini. Koneksi yang tersimpan tetap dipakai.</Notice>
  }
  return (
    <p className="flex items-center gap-1.5 text-sm text-emerald-700">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
      Koneksi aktif
    </p>
  )
}

function ConnectLink({ label }: { label: string }) {
  // A plain <a>: the route handler redirects off-site to Instagram, which a client-side <Link> can't follow.
  return (
    <a
      href="/api/auth/instagram/start"
      className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
    >
      {label}
    </a>
  )
}

function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <p role={tone === 'success' ? 'status' : 'alert'} className={`rounded-lg border px-4 py-3 text-sm ${NOTICE_CLASS[tone]}`}>
      {children}
    </p>
  )
}
