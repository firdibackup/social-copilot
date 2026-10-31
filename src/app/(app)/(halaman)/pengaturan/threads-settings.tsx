
import { getLocale, getTranslations } from 'next-intl/server'
import { Notice } from '@/components/notice'
import { ThreadsIcon } from '@/components/threads-icon'
import { requireUser } from '@/lib/auth'
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

async function loadThreads(userId: string): Promise<LoadResult> {
  const t = await getTranslations('settings')

  const ERROR_MESSAGES: Record<string, string> = {
  ditolak: t('threads_settings.threadsPermissionsWerenTApprovedConnectAgain'),
  state_tidak_valid: t('threads_settings.yourLoginSessionHasExpiredOrIs'),
  sesi_lain:
    t('threads_settings.threadsLoginFinishedInADifferentCarousely'),
  perlu_instagram: t('threads_settings.connectInstagramFirstThreadsIsUsedWith'),
  gagal_mulai:
    t('threads_settings.couldnTStartThreadsLoginCheckThreads'),
  gagal_token: t('threads_settings.couldnTExchangeTheLoginCodeFor'),
  gagal_profil: t('threads_settings.gotTheTokenButCouldnTFetch'),
  gagal_database: t('threads_settings.couldnTAccessTheDatabaseCheckThe'),
  gagal_putus: t('threads_settings.couldnTDisconnectThreadsTryAgain'),
  akun_dipakai:
    t('threads_settings.thisThreadsAccountIsAlreadyConnectedTo'),
}

  try {
    // Threads belongs to the connected Instagram account.
    const accountId = await getConnectedAccountId(userId)
    return {
      kind: 'ok',
      hasInstagram: accountId !== null,
      connection: accountId ? await getThreadsConnection(userId, accountId) : null,
    }
  } catch (error) {
    console.error('[pengaturan] koneksi Threads gagal dimuat:', describeError(error))
    const message =
      error instanceof ConfigError ? t('threads_settings.configurationIsIncomplete', { v0: error.message }) : ERROR_MESSAGES.gagal_database
    return { kind: 'error', message }
  }
}

/** Publishing to Threads and answering replies under the account's Threads posts in Balasan. */
export async function ThreadsSettings({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations('settings')

  const UNKNOWN_ERROR = t('threads_settings.somethingWentWrongWhileConnectingThreadsTry')

  const ERROR_MESSAGES: Record<string, string> = {
  ditolak: t('threads_settings.threadsPermissionsWerenTApprovedConnectAgain'),
  state_tidak_valid: t('threads_settings.yourLoginSessionHasExpiredOrIs'),
  sesi_lain:
    t('threads_settings.threadsLoginFinishedInADifferentCarousely'),
  perlu_instagram: t('threads_settings.connectInstagramFirstThreadsIsUsedWith'),
  gagal_mulai:
    t('threads_settings.couldnTStartThreadsLoginCheckThreads'),
  gagal_token: t('threads_settings.couldnTExchangeTheLoginCodeFor'),
  gagal_profil: t('threads_settings.gotTheTokenButCouldnTFetch'),
  gagal_database: t('threads_settings.couldnTAccessTheDatabaseCheckThe'),
  gagal_putus: t('threads_settings.couldnTDisconnectThreadsTryAgain'),
  akun_dipakai:
    t('threads_settings.thisThreadsAccountIsAlreadyConnectedTo'),
}

  const SUCCESS_MESSAGES: Record<string, string> = {
  connected: t('threads_settings.threadsConnectedSuccessfully'),
  disconnected: t('threads_settings.threadsDisconnected'),
}

  const params = await searchParams
  const result = await loadThreads(await requireUser())
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
                {t('threads_settings.connectInstagramFirstThreadsIsUsedWith2')}</p>
            ) : (
              <ThreadsDetails connection={result.connection} />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

async function ThreadsDetails({ connection }: { connection: ThreadsConnection | null }) {
  const locale = await getLocale()

  const t = await getTranslations('settings')

  if (!connection) {
    return (
      <>
        <p className="text-sm text-zinc-600">
          {t('threads_settings.connectYourThreadsAccountToPublishPosts')}</p>
        <ConnectLink label={t('threads_settings.connectThreads')} />
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
          {t('threads_settings.connectedSince')} {formatDay(wibDateKey(connection.connectedAt), locale)}
        </p>
      </div>
      {needsReconnect ? (
        <Notice tone="error">
          {t('threads_settings.yourThreadsTokenExpiredOrPermissionsWere')}</Notice>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
          {t('threads_settings.connectionActive')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <ConnectLink label={t('threads_settings.reconnect')} secondary={!needsReconnect} />
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
