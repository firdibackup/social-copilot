'use client'

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
  PLACEHOLDERS,
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
const FAILED = 'Gagal menghubungi server. Coba lagi.'
const SCOPES = [
  { value: 'all', label: 'Semua post' },
  { value: 'one', label: 'Satu post' },
] as const
const PILL = 'rounded-full px-4 py-2 text-sm font-medium disabled:cursor-not-allowed'

/** Buat or Ubah Auto DM: the form on the left, a live phone preview beside it. */
export function AutoDmForm({ ruleId, initial, title, username, avatarUrl }: AutoDmFormProps) {
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
      () => setPostsError('Post gagal dimuat. Muat ulang halaman.'),
    )
  }, [])

  const set: SetField = (key, value) => setRule((current) => ({ ...current, [key]: value }))
  const problem = ruleProblem(normalizeRule(rule))
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
              Batal
            </button>
            <button
              type="button"
              onClick={save}
              disabled={problem !== null || saving}
              className={`${PILL} bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-400`}
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
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
        <aside aria-label="Pratinjau" className="self-start lg:sticky lg:top-0">
          <PhonePreview rule={rule} username={username} avatarUrl={avatarUrl} post={previewPost} />
        </aside>
      </div>

      <dialog
        ref={discardDialog}
        aria-labelledby="buang-judul"
        className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-xl border border-zinc-200 p-5 shadow-xl backdrop:bg-black/30"
      >
        <h2 id="buang-judul" className="font-semibold text-zinc-900">
          Buang perubahan?
        </h2>
        <p className="mt-1 text-sm text-zinc-500">Perubahan yang belum disimpan bakal hilang.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => discardDialog.current?.close()}
            className={`${PILL} border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50`}
          >
            Lanjut edit
          </button>
          <button type="button" onClick={() => router.push(BACK)} className={`${PILL} bg-red-600 text-white hover:bg-red-700`}>
            Buang
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
  return (
    <>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-zinc-900">Nama otomatisasi</span>
        <input
          value={rule.name}
          onChange={(event) => set('name', event.target.value)}
          maxLength={NAME_MAX_LENGTH}
          placeholder={PLACEHOLDERS.name}
          className={FIELD}
        />
      </label>

      <Section title="Kalau ada yang komentar di…">
        <Segmented label="Cakupan post" options={SCOPES} value={rule.scope} onChange={(scope) => set('scope', scope)} />
        {rule.scope === 'one' && (
          <PostPicker posts={posts} error={postsError} selectedId={rule.mediaId} onSelect={(id) => set('mediaId', id)} />
        )}
      </Section>

      <Section title="…dan komentarnya mengandung">
        <div className="space-y-2">
          <RadioCard name="pemicu" checked={!rule.matchAny} onSelect={() => set('matchAny', false)} label="kata tertentu">
            <TagInput
              values={rule.keywords}
              onChange={(keywords) => set('keywords', keywords)}
              placeholder={PLACEHOLDERS.keyword}
              maxLength={KEYWORD_MAX_LENGTH}
              maxCount={MAX_KEYWORDS}
              examples={EXAMPLE_KEYWORDS}
            />
            <Toggle
              checked={rule.wholeWord}
              onChange={(checked) => set('wholeWord', checked)}
              label={'Harus kata utuh ("link" nggak kena di "linknya")'}
            />
          </RadioCard>
          <RadioCard name="pemicu" checked={rule.matchAny} onSelect={() => set('matchAny', true)} label="kata apa pun">
            <Helper>Semua komentar di post itu langsung dibalas.</Helper>
          </RadioCard>
        </div>
        <Toggle
          checked={rule.dmTrigger}
          onChange={(checked) => set('dmTrigger', checked)}
          label="Juga balas kalau ada yang DM kata kuncinya"
          helper={
            rule.matchAny ? (
              <Helper warning>Hati-hati: “kata apa pun” + trigger DM berarti SEMUA DM masuk dibalas otomatis.</Helper>
            ) : (
              <Helper>Buat CTA “DM aku LINK” - DM masuk yang cocok langsung dibalas.</Helper>
            )
          }
        />
        <Toggle checked={rule.publicReply} onChange={(checked) => set('publicReply', checked)} label="Balas juga di kolom komentar">
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
  return (
    <>
      <Section title="Mereka akan dapat…">
        <Toggle
          checked={rule.opener}
          onChange={(checked) => set('opener', checked)}
          label="DM pembuka dengan tombol (chat dulu)"
          helper={
            <Helper>
              Pesan utamanya dikirim setelah tombolnya ditekan - lebih aman dari batas satu-DM-per-komentar.
            </Helper>
          }
        >
          <TextArea
            label="Pesan pembuka"
            value={rule.openerText}
            onChange={(value) => set('openerText', value)}
            placeholder={PLACEHOLDERS.openerText}
            max={TEMPLATE_TEXT_MAX_LENGTH}
            rows={2}
          />
          <CountedInput
            label="Teks tombol"
            value={rule.openerButton}
            onChange={(value) => set('openerButton', value)}
            placeholder={PLACEHOLDERS.openerButton}
            max={BUTTON_MAX_LENGTH}
          />
        </Toggle>
        <Toggle
          checked={rule.followGate}
          onChange={(checked) => set('followGate', checked)}
          label="Minta follow dulu"
          helper={
            <Helper>
              Pesan utamanya cuma dikirim ke yang sudah follow. Yang belum, diminta follow dulu lewat pesan berikut.
            </Helper>
          }
        >
          <TextArea
            label="Pesan ajakan follow"
            value={rule.followText}
            onChange={(value) => set('followText', value)}
            placeholder={PLACEHOLDERS.followText}
            max={TEMPLATE_TEXT_MAX_LENGTH}
            rows={2}
          />
          <CountedInput
            label="Teks tombol"
            value={rule.followButton}
            onChange={(value) => set('followButton', value)}
            placeholder={PLACEHOLDERS.followButton}
            max={BUTTON_MAX_LENGTH}
          />
        </Toggle>
      </Section>

      <Section title={rule.opener ? 'Lalu setelah tombol ditekan, mereka dapat…' : 'Isi DM-nya…'}>
        <div className="space-y-1">
          <textarea
            aria-label="Pesan utama"
            value={rule.mainText}
            onChange={(event) => set('mainText', event.target.value)}
            maxLength={rule.linkButton ? TEMPLATE_TEXT_MAX_LENGTH : TEXT_MAX_LENGTH}
            rows={4}
            placeholder={PLACEHOLDERS.mainText}
            className={FIELD}
          />
          <Helper>Tulis link langsung di pesannya kalau ada.</Helper>
        </div>
        <Toggle
          checked={rule.linkButton}
          onChange={(checked) => set('linkButton', checked)}
          label="Tambah tombol link di bawah pesan"
          helper={<Helper>Tombol yang langsung buka link kamu - halaman booking, WhatsApp, atau katalog.</Helper>}
        >
          <CountedInput
            label="Teks tombol"
            value={rule.linkText}
            onChange={(value) => set('linkText', value)}
            placeholder={PLACEHOLDERS.linkText}
            max={BUTTON_MAX_LENGTH}
          />
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-900">Link tujuan</span>
            <input
              type="url"
              inputMode="url"
              value={rule.linkUrl}
              onChange={(event) => set('linkUrl', event.target.value)}
              maxLength={URL_MAX_LENGTH}
              placeholder={PLACEHOLDERS.linkUrl}
              className={FIELD}
            />
          </label>
        </Toggle>
      </Section>
    </>
  )
}
