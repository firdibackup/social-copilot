'use client'

import { useLocale, useTranslations } from 'next-intl'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Notice } from '@/components/notice'
import {
  BUTTON_MAX_LENGTH,
  EXAMPLE_KEYWORDS,
  KEYWORD_MAX_LENGTH,
  MAX_KEYWORDS,
  MAX_VARIATIONS,
  NAME_MAX_LENGTH,
  normalizeRule,
  ruleProblem,
  TEMPLATE_TEXT_MAX_LENGTH,
  TEXT_MAX_LENGTH,
  URL_MAX_LENGTH,
  VARIATION_MAX_LENGTH,
  type AutoDmRuleInput,
} from '@/lib/auto-dm-rules'
import { listRulePostsAction, saveAutoDmRuleAction, type RulePost } from '../auto-dm-actions'
import {
  CountedInput,
  FIELD,
  Helper,
  usePlaceholders,
  PostPicker,
  RadioCard,
  Section,
  Segmented,
  TagInput,
  TextArea,
  Toggle,
  Variations,
} from './fields'
import { PhonePreview } from './phone-preview'

interface AutoDmFormProps {
  /** Null for a new rule. */
  ruleId: string | null
  initial: AutoDmRuleInput
  /** "Buat Auto DM", or the rule's name. */
  title: string
  username: string
  avatarUrl: string | null
}

type SetField = <K extends keyof AutoDmRuleInput>(key: K, value: AutoDmRuleInput[K]) => void

const BACK = '/balasan#aturan-auto-dm'

const PILL = 'rounded-full px-4 py-2 text-sm font-medium disabled:cursor-not-allowed'

/** Buat or Ubah Auto DM: the form on the left, a live phone preview beside it. */
export function AutoDmForm({ ruleId, initial, title, username, avatarUrl }: AutoDmFormProps) {
  const t = useTranslations('inbox.builderAutoDmForm')
  const FAILED = t('couldnTReachTheServerTryAgain')
  const locale = useLocale()
  const router = useRouter()
  const [rule, setRule] = useState(initial)
  const [posts, setPosts] = useState<RulePost[] | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const discardDialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    listRulePostsAction().then(
      (result) => ('error' in result ? setPostsError(result.error) : setPosts(result.posts)),
      () => setPostsError(t('couldnTLoadPostsReloadThePage')),
    )
  }, [t])

  const set: SetField = (key, value) => setRule((current) => ({ ...current, [key]: value }))
  const problem = ruleProblem(normalizeRule(rule), locale)
  const isDirty = JSON.stringify(rule) !== JSON.stringify(initial)
  const previewPost = rule.scope === 'one' ? (posts?.find((post) => post.id === rule.mediaId) ?? null) : (posts?.[0] ?? null)

  async function save() {
    setSaving(true)
    setError(null)
    const failure = await saveAutoDmRuleAction(ruleId, normalizeRule(rule)).catch(() => FAILED)
    if (failure) {
      setError(failure)
      setSaving(false)
      return
    }
    router.push(BACK)
  }

  function cancel() {
    if (isDirty) discardDialog.current?.showModal()
    else router.push(BACK)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase">Auto DM</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <button type="button" onClick={cancel} className={`${PILL} border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50`}>
              {t('cancel')}
              </button>
            <button
              type="button"
              onClick={save}
              disabled={problem !== null || saving}
              className={`${PILL} bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-400`}
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
          {problem && <p className="text-xs text-zinc-500">{problem}</p>}
        </div>
      </header>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="max-w-xl space-y-8">
          <TriggerSections rule={rule} set={set} posts={posts} postsError={postsError} />
          <MessageSections rule={rule} set={set} />
        </div>
        <aside aria-label={t('preview')} className="self-start lg:sticky lg:top-0">
          <PhonePreview rule={rule} username={username} avatarUrl={avatarUrl} post={previewPost} />
        </aside>
      </div>

      <dialog
        ref={discardDialog}
        aria-labelledby="buang-judul"
        className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-xl border border-zinc-200 p-5 shadow-xl backdrop:bg-black/30"
      >
        <h2 id="buang-judul" className="font-semibold text-zinc-900">
          {t('discardChanges')}
          </h2>
        <p className="mt-1 text-sm text-zinc-500">{t('yourUnsavedChangesWillBeLost')}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => discardDialog.current?.close()}
            className={`${PILL} border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50`}
          >
            {t('keepEditing')}
            </button>
          <button type="button" onClick={() => router.push(BACK)} className={`${PILL} bg-red-600 text-white hover:bg-red-700`}>
            {t('discard')}
            </button>
        </div>
      </dialog>
    </div>
  )
}

interface SectionsProps {
  rule: AutoDmRuleInput
  set: SetField
}

function TriggerSections({ rule, set, posts, postsError }: SectionsProps & { posts: RulePost[] | null; postsError: string | null }) {
  const placeholders = usePlaceholders()
  const t = useTranslations('inbox.builderAutoDmForm')
  const SCOPES = [
  { value: 'all', label: t('allPosts') },
  { value: 'one', label: t('onePost') },
] as const
  return (
    <>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-zinc-900">{t('automationName')}</span>
        <input
          value={rule.name}
          onChange={(event) => set('name', event.target.value)}
          maxLength={NAME_MAX_LENGTH}
          placeholder={placeholders.name}
          className={FIELD}
        />
      </label>

      <Section title={t('whenSomeoneCommentsOn')}>
        <Segmented label={t('postScope')} options={SCOPES} value={rule.scope} onChange={(scope) => set('scope', scope)} />
        {rule.scope === 'one' && (
          <PostPicker posts={posts} error={postsError} selectedId={rule.mediaId} onSelect={(id) => set('mediaId', id)} />
        )}
      </Section>

      <Section title={t('andTheirCommentContains')}>
        <div className="space-y-2">
          <RadioCard name="pemicu" checked={!rule.matchAny} onSelect={() => set('matchAny', false)} label={t('specificWords')}>
            <TagInput
              values={rule.keywords}
              onChange={(keywords) => set('keywords', keywords)}
              placeholder={placeholders.keyword}
              maxLength={KEYWORD_MAX_LENGTH}
              maxCount={MAX_KEYWORDS}
              examples={EXAMPLE_KEYWORDS}
            />
            <Toggle
              checked={rule.wholeWord}
              onChange={(checked) => set('wholeWord', checked)}
              label={t('matchWholeWordsLinkWonTMatchLinks')}
            />
          </RadioCard>
          <RadioCard name="pemicu" checked={rule.matchAny} onSelect={() => set('matchAny', true)} label={t('anyWords')}>
            <Helper>{t('everyCommentOnThatPostGetsAReply')}</Helper>
          </RadioCard>
        </div>
        <Toggle
          checked={rule.dmTrigger}
          onChange={(checked) => set('dmTrigger', checked)}
          label={t('alsoReplyWhenSomeoneDmsTheKeyword')}
          helper={
            rule.matchAny ? (
              <Helper warning>{t('carefulAnyWordsTheDmTriggerMeansAllIncoming')}</Helper>
            ) : (
              <Helper>{t('tryADmMeLinkCtaMatchingDmsGet')}</Helper>
            )
          }
        />
        <Toggle checked={rule.publicReply} onChange={(checked) => set('publicReply', checked)} label={t('alsoReplyInTheComments')}>
          <Variations
            values={rule.publicReplies.length > 0 ? rule.publicReplies : ['']}
            onChange={(variations) => set('publicReplies', variations)}
            maxLength={VARIATION_MAX_LENGTH}
            maxCount={MAX_VARIATIONS}
          />
        </Toggle>
      </Section>
    </>
  )
}

function MessageSections({ rule, set }: SectionsProps) {
  const placeholders = usePlaceholders()
  const t = useTranslations('inbox.builderAutoDmForm')
  return (
    <>
      <Section title={t('theyLlReceive')}>
        <Toggle
          checked={rule.opener}
          onChange={(checked) => set('opener', checked)}
          label={t('openingDmWithAButtonStartAChat')}
          helper={
            <Helper>
              {t('theMainMessageIsSentAfterTheyTapThe')}
              </Helper>
          }
        >
          <TextArea
            label={t('openingMessage')}
            value={rule.openerText}
            onChange={(value) => set('openerText', value)}
            placeholder={placeholders.openerText}
            max={TEMPLATE_TEXT_MAX_LENGTH}
            rows={2}
          />
          <CountedInput
            label={t('buttonText')}
            value={rule.openerButton}
            onChange={(value) => set('openerButton', value)}
            placeholder={placeholders.openerButton}
            max={BUTTON_MAX_LENGTH}
          />
        </Toggle>
        <Toggle
          checked={rule.followGate}
          onChange={(checked) => set('followGate', checked)}
          label={t('askThemToFollowFirst')}
          helper={
            <Helper>
              {t('onlyFollowersGetTheMainMessageEveryoneElseIs')}
              </Helper>
          }
        >
          <TextArea
            label={t('followRequestMessage')}
            value={rule.followText}
            onChange={(value) => set('followText', value)}
            placeholder={placeholders.followText}
            max={TEMPLATE_TEXT_MAX_LENGTH}
            rows={2}
          />
          <CountedInput
            label={t('buttonText')}
            value={rule.followButton}
            onChange={(value) => set('followButton', value)}
            placeholder={placeholders.followButton}
            max={BUTTON_MAX_LENGTH}
          />
        </Toggle>
      </Section>

      <Section title={rule.opener ? t('thenAfterTappingTheButtonTheyReceive') : t('theDmMessage')}>
        <div className="space-y-1">
          <textarea
            aria-label={t('mainMessage')}
            value={rule.mainText}
            onChange={(event) => set('mainText', event.target.value)}
            maxLength={rule.linkButton ? TEMPLATE_TEXT_MAX_LENGTH : TEXT_MAX_LENGTH}
            rows={4}
            placeholder={placeholders.mainText}
            className={FIELD}
          />
          <Helper>{t('addAnyLinksDirectlyInTheMessage')}</Helper>
        </div>
        <Toggle
          checked={rule.linkButton}
          onChange={(checked) => set('linkButton', checked)}
          label={t('addALinkButtonBelowTheMessage')}
          helper={<Helper>{t('aButtonThatOpensYourLinkABookingPage')}</Helper>}
        >
          <CountedInput
            label={t('buttonText')}
            value={rule.linkText}
            onChange={(value) => set('linkText', value)}
            placeholder={placeholders.linkText}
            max={BUTTON_MAX_LENGTH}
          />
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-900">{t('destinationUrl')}</span>
            <input
              type="url"
              inputMode="url"
              value={rule.linkUrl}
              onChange={(event) => set('linkUrl', event.target.value)}
              maxLength={URL_MAX_LENGTH}
              placeholder={placeholders.linkUrl}
              className={FIELD}
            />
          </label>
        </Toggle>
      </Section>
    </>
  )
}
