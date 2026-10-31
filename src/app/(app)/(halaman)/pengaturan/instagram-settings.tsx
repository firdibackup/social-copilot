
import { getLocale, getTranslations } from 'next-intl/server'
import { InstagramIcon } from '@/components/instagram-icon'
import { Notice } from '@/components/notice'
import { requireUser } from '@/lib/auth'
import {
  checkConnectionHealth,
  getConnectedAccountId,
  getConnection,
  type Connection,
  type ConnectionHealth,
} from '@/lib/connection'
import { ConfigError, describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { firstValue, type SearchParams } from '@/lib/params'
import { countScheduledPosts } from '@/lib/posts'
import { InstagramDisconnectButton } from './disconnect-button'

type LoadResult =
  | { kind: 'ok'; connection: Connection | null; health: ConnectionHealth | null; scheduledCount: number }
  | { kind: 'error'; message: string }

async function loadInstagram(userId: string): Promise<LoadResult> {
  const t = await getTranslations('settings')

  const ERROR_MESSAGES: Record<string, string> = {
  ditolak: t('instagram_settings.instagramPermissionsWerenTApprovedConnectAgain'),
  state_tidak_valid: t('instagram_settings.yourLoginSessionHasExpiredOrIs'),
  sesi_lain:
    t('instagram_settings.instagramLoginFinishedInADifferentCarousely'),
  gagal_mulai: t('instagram_settings.couldnTStartInstagramLoginCheckThe'),
  gagal_token:
    t('instagram_settings.couldnTExchangeTheLoginCodeFor'),
  gagal_token_panjang:
    t('instagram_settings.gotTheInitialTokenButCouldnT'),
  gagal_profil: t('instagram_settings.gotTheTokenButCouldnTFetch'),
  gagal_database: t('instagram_settings.couldnTAccessTheDatabaseCheckThe'),
  gagal_putus: t('instagram_settings.couldnTDisconnectTryAgain'),
  akun_dipakai:
    t('instagram_settings.thisInstagramAccountIsAlreadyConnectedTo'),
}

  try {
    const connection = await getConnection(userId)
    const health = connection?.status === 'active' ? await checkConnectionHealth(userId) : null
    // For the Putuskan dialog: these posts become drafts.
    const accountId = connection ? await getConnectedAccountId(userId) : null
    const scheduledCount = accountId ? await countScheduledPosts(userId, accountId) : 0
    return { kind: 'ok', connection, health, scheduledCount }
  } catch (error) {
    console.error('[pengaturan] koneksi gagal dimuat:', describeError(error))
    const message =
      error instanceof ConfigError
        ? t('instagram_settings.configurationIsIncomplete', { v0: error.message })
        : ERROR_MESSAGES.gagal_database
    return { kind: 'error', message }
  }
}

interface InstagramSettingsProps {
  searchParams: Promise<SearchParams>
}

export async function InstagramSettings({ searchParams }: InstagramSettingsProps) {
  const t = await getTranslations('settings')

  const UNKNOWN_ERROR = t('instagram_settings.somethingWentWrongWhileConnectingInstagramTry')

  const ERROR_MESSAGES: Record<string, string> = {
  ditolak: t('instagram_settings.instagramPermissionsWerenTApprovedConnectAgain'),
  state_tidak_valid: t('instagram_settings.yourLoginSessionHasExpiredOrIs'),
  sesi_lain:
    t('instagram_settings.instagramLoginFinishedInADifferentCarousely'),
  gagal_mulai: t('instagram_settings.couldnTStartInstagramLoginCheckThe'),
  gagal_token:
    t('instagram_settings.couldnTExchangeTheLoginCodeFor'),
  gagal_token_panjang:
    t('instagram_settings.gotTheInitialTokenButCouldnT'),
  gagal_profil: t('instagram_settings.gotTheTokenButCouldnTFetch'),
  gagal_database: t('instagram_settings.couldnTAccessTheDatabaseCheckThe'),
  gagal_putus: t('instagram_settings.couldnTDisconnectTryAgain'),
  akun_dipakai:
    t('instagram_settings.thisInstagramAccountIsAlreadyConnectedTo'),
}

  const SUCCESS_MESSAGES: Record<string, string> = {
  connected: t('instagram_settings.instagramConnectedSuccessfully'),
  disconnected: t('instagram_settings.instagramDisconnected'),
}

  const params = await searchParams
  const result = await loadInstagram(await requireUser())
  const success = SUCCESS_MESSAGES[firstValue(params.ig) ?? '']
  const errorCode = firstValue(params.ig_error)
  const error = errorCode ? (ERROR_MESSAGES[errorCode] ?? UNKNOWN_ERROR) : undefined
  const errorDetail = ['gagal_token', 'gagal_token_panjang', 'gagal_profil'].includes(errorCode ?? '')
    ? firstValue(params.ig_error_detail)?.slice(0, 700)
    : undefined
  // requireAccount() sends pages that show one account's data here while nothing is connected.
  const needsAccount = firstValue(params.perlu) === 'instagram' && result.kind === 'ok' && !result.connection
  // Straight from the onboarding wizard: the last step.
  const fromWizard = firstValue(params.baru) === '1' && result.kind === 'ok' && !result.connection

  return (
    <section id="instagram" aria-labelledby="instagram-heading" className="space-y-4">
      {fromWizard && (
        <Notice tone="success">
          {t('instagram_settings.brandStyleSavedOneLastStepConnect')}</Notice>
      )}
      {needsAccount && !fromWizard && (
        <Notice tone="warning">
          {t('instagram_settings.connectInstagramFirstToUseBrandCreate')}</Notice>
      )}
      {success && <Notice tone="success">{success}</Notice>}
      {error && (
        <Notice tone="error">
          {error}
          {errorDetail && <span className="mt-2 block break-words text-xs">{t('instagram_settings.details')} {errorDetail}</span>}
        </Notice>
      )}

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
              <ConnectionDetails
                connection={result.connection}
                health={result.health}
                scheduledCount={result.scheduledCount}
              />
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
  scheduledCount: number
}

async function ConnectionDetails({ connection, health, scheduledCount }: ConnectionDetailsProps) {
  const locale = await getLocale()

  const t = await getTranslations('settings')

  const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  BUSINESS: t('instagram_settings.businessAccount'),
  MEDIA_CREATOR: t('instagram_settings.creatorAccount'),
}

  if (!connection) {
    return (
      <>
        <p className="text-sm text-zinc-600">
          {t('instagram_settings.noAccountConnectedYetConnectAnInstagram')}</p>
        <ConnectLink label={t('instagram_settings.connectInstagram')} />
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
        <p>{t('instagram_settings.tokenValidUntil')} {formatDateTime(connection.tokenExpiresAt, locale)}</p>
      </div>
      <HealthNotice needsReconnect={needsReconnect} health={health} />
      <div className="flex flex-wrap gap-2">
        {needsReconnect && <ConnectLink label={t('instagram_settings.reconnect')} />}
        <InstagramDisconnectButton username={connection.username} scheduledCount={scheduledCount} />
      </div>
      {needsReconnect && (
        // Instagram's login page can't show our warning: another account logging in here counts as switching.
        <p className="text-xs text-zinc-500">
          {t('instagram_settings.reconnectWarning', { username: connection.username })}</p>
      )}
    </>
  )
}

interface HealthNoticeProps {
  needsReconnect: boolean
  health: ConnectionHealth | null
}

async function HealthNotice({ needsReconnect, health }: HealthNoticeProps) {
  const t = await getTranslations('settings')

  if (needsReconnect) {
    return (
      <Notice tone="error">
        {t('instagram_settings.theTokenExpiredOrPermissionsWereRevoked')}</Notice>
    )
  }
  if (health === 'unreachable') {
    return <Notice tone="warning">{t('instagram_settings.instagramCanTBeCheckedRightNow')}</Notice>
  }
  return (
    <p className="flex items-center gap-1.5 text-sm text-emerald-700">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
      {t('instagram_settings.connectionActive')}</p>
  )
}

function ConnectLink({ label }: { label: string }) {
  // A plain <a>: the route handler redirects off-site to Instagram, which a client-side <Link> can't follow.
  return (
    <a
      href="/api/auth/instagram/start"
      className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
    >
      {label}
    </a>
  )
}
