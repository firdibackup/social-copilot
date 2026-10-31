'use client'

import { useTranslations } from 'next-intl'

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
  const t = useTranslations('admin')

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={CARD}>
        <h2 className={CARD_TITLE}>{t('pengguna_user_actions.subscription')}</h2>
        <ActionForm userId={userId} intent="grant">
          {(pending) => (
            <div className="flex flex-wrap items-end gap-2">
              <label className={`${LABEL} w-32`}>
                <span>{t('pengguna_user_actions.addDays')}</span>
                <input name="days" type="number" min={1} max={MAX_GRANT_DAYS} defaultValue={planDays} required className={FIELD} />
              </label>
              <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
                {pending ? t('pengguna_user_actions.adding') : t('pengguna_user_actions.addForFree')}
              </button>
            </div>
          )}
        </ActionForm>
        <p className={HINT}>{t('pengguna_user_actions.extraDaysStartAfterTheExistingPeriod')}</p>
        {hasPeriod && !isSelf && (
          <ActionForm userId={userId} intent="end">
            {(pending) => (
              <ConfirmButton
                label={t('pengguna_user_actions.endSubscription')}
                confirm={t('pengguna_user_actions.yesEndNow')}
                warning={t('pengguna_user_actions.theCurrentPeriodEndsImmediatelyAndPrepaid')}
                pending={pending}
              />
            )}
          </ActionForm>
        )}
      </section>

      <section className={CARD}>
        <h2 className={CARD_TITLE}>{t('pengguna_user_actions.aiCredits')}</h2>
        {!hasPeriod ? (
          <p className={HINT}>{t('pengguna_user_actions.creditsCanBeChangedWhileTheUser')}</p>
        ) : (
        <ActionForm userId={userId} intent="adjust">
          {(pending) => (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className={`${LABEL} w-36`}>
                  <span>{t('pengguna_user_actions.actions')}</span>
                  <select name="kind" defaultValue="add" className={FIELD}>
                    <option value="add">{t('pengguna_user_actions.addCredits')}</option>
                    <option value="remove">{t('pengguna_user_actions.removeCredits')}</option>
                  </select>
                </label>
                <label className={`${LABEL} w-32`}>
                  <span>{t('pengguna_user_actions.amount')}</span>
                  <input name="credits" type="number" min={1} required className={FIELD} />
                </label>
              </div>
              <label className={LABEL}>
                <span>{t('pengguna_user_actions.noteOptional')}</span>
                <input name="note" maxLength={NOTE_MAX_LENGTH} placeholder={t('pengguna_user_actions.forExampleOutageCompensation')} className={FIELD} />
              </label>
              <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
                {pending ? t('pengguna_user_actions.saving') : t('pengguna_user_actions.save')}
              </button>
            </div>
          )}
        </ActionForm>
        )}
        {hasPeriod && (
          <p className={HINT}>{t('pengguna_user_actions.appliesToTheCurrentPeriodCreditsDon')}</p>
        )}
        {hasPeriod && (
          <ActionForm userId={userId} intent="reset">
            {(pending) => (
              <ConfirmButton
                label={t('pengguna_user_actions.resetUsageTo0')}
                confirm={t('pengguna_user_actions.yesReset')}
                warning={t('pengguna_user_actions.allCreditsUsedThisPeriodWillBe')}
                pending={pending}
                danger={false}
              />
            )}
          </ActionForm>
        )}
      </section>

      <section className={CARD}>
        <h2 className={CARD_TITLE}>{t('pengguna_user_actions.account')}</h2>
        <ActionForm userId={userId} intent="password">
          {(pending) => (
            <div className="flex flex-wrap items-end gap-2">
              <label className={`${LABEL} min-w-0 flex-1`}>
                <span>{t('pengguna_user_actions.newPassword')}</span>
                <input name="password" type="text" minLength={MIN_PASSWORD} required autoComplete="off" className={FIELD} />
              </label>
              <button type="submit" disabled={pending} className={BUTTON}>
                {pending ? t('pengguna_user_actions.changing') : t('pengguna_user_actions.changePassword')}
              </button>
            </div>
          )}
        </ActionForm>
        <p className={HINT}>{t('pengguna_user_actions.thereSNoPasswordResetEmailSo')}</p>
        {!isSelf && (
          <ActionForm userId={userId} intent={banned ? 'unban' : 'ban'}>
            {(pending) =>
              banned ? (
                <button type="submit" disabled={pending} className={BUTTON}>
                  {pending ? t('pengguna_user_actions.unblocking') : t('pengguna_user_actions.unblock')}
                </button>
              ) : (
                <ConfirmButton
                  label={t('pengguna_user_actions.blockAccount')}
                  confirm={t('pengguna_user_actions.yesBlock')}
                  warning={t('pengguna_user_actions.theUserWonTBeAbleTo')}
                  pending={pending}
                />
              )
            }
          </ActionForm>
        )}
      </section>

      {!isSelf && (
        <section className={`${CARD} border-red-200`}>
          <h2 className="text-sm font-semibold text-red-800">{t('pengguna_user_actions.deleteUser')}</h2>
          <p className="text-sm text-zinc-600">
            {t('pengguna_user_actions.theirAccountInstagramConnectionPostsAssetsBrand')}</p>
          <ActionForm userId={userId} intent="delete">
            {(pending) => (
              <div className="flex flex-wrap items-end gap-2">
                <label className={`${LABEL} min-w-0 flex-1`}>
                  <span>{t('pengguna_user_actions.confirmEmail', { email })}</span>
                  <input name="confirmEmail" autoComplete="off" required className={FIELD} />
                </label>
                <button type="submit" disabled={pending} className={DANGER_BUTTON}>
                  {pending ? t('pengguna_user_actions.deleting') : t('pengguna_user_actions.deletePermanently')}
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
  const t = useTranslations('admin')

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
          {pending ? t('pengguna_user_actions.processing') : confirm}
        </button>
        <button type="button" disabled={pending} onClick={() => setAsking(false)} className={BUTTON}>
          {t('pengguna_user_actions.cancel')}</button>
      </div>
    </div>
  )
}
