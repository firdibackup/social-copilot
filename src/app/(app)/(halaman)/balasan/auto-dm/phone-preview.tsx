'use client'

import { BatteryFull, Bookmark, Camera, ChevronLeft, Heart, MessageCircle, Send, Signal, Wifi } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ExternalImage } from '@/components/media-image'
import type { AutoDmRuleInput } from '@/lib/auto-dm-rules'
import type { RulePost } from '../auto-dm-actions'
import { PLACEHOLDERS, Segmented, withoutExample } from './fields'

type View = 'post' | 'komentar' | 'dm'

const VIEWS = [
  { value: 'post', label: 'Post' },
  { value: 'komentar', label: 'Komentar' },
  { value: 'dm', label: 'DM' },
] as const

/** What a commenter writes in "kata apa pun" mode. */
const ANY_COMMENT = 'Keren banget! 🤩'
const EMOJI_BAR = ['❤️', '🙌', '🔥', '👏', '😍', '😮', '😂']

interface PhonePreviewProps {
  rule: AutoDmRuleInput
  username: string
  avatarUrl: string | null
  /** The chosen post, or the newest one for "Semua post"; null leaves the picture dark. */
  post: RulePost | null
}

/** A dark Instagram phone that follows the form as it is filled in. */
export function PhonePreview({ rule, username, avatarUrl, post }: PhonePreviewProps) {
  const [view, setView] = useState<View>('komentar')
  const comment = rule.matchAny ? ANY_COMMENT : (rule.keywords[0] ?? 'MAU')
  const account = { username, avatarUrl }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-[290px] rounded-[44px] bg-zinc-950 p-2.5 shadow-xl">
        <div className="flex h-[580px] flex-col overflow-hidden rounded-[36px] bg-black text-white">
          <StatusBar />
          {view === 'post' && <PostView account={account} post={post} />}
          {view === 'komentar' && <CommentsView account={account} post={post} rule={rule} comment={comment} />}
          {view === 'dm' && <DmView account={account} rule={rule} comment={comment} />}
        </div>
      </div>
      <Segmented label="Pratinjau" options={VIEWS} value={view} onChange={setView} />
    </div>
  )
}

interface Account {
  username: string
  avatarUrl: string | null
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[12px] font-semibold" aria-hidden="true">
      <span>11:45</span>
      <span className="flex items-center gap-1">
        <Signal size={13} />
        <Wifi size={13} />
        <BatteryFull size={16} />
      </span>
    </div>
  )
}

function AccountAvatar({ account, size = 'size-7' }: { account: Account; size?: string }) {
  if (account.avatarUrl) {
    return <ExternalImage src={account.avatarUrl} className={`${size} shrink-0 rounded-full bg-white object-contain`} />
  }
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-zinc-700 text-[11px] font-semibold`}>
      {account.username.charAt(0).toUpperCase() || '?'}
    </span>
  )
}

function PostImage({ post, className }: { post: RulePost | null; className?: string }) {
  return (
    <div className={`aspect-square w-full bg-zinc-900 ${className ?? ''}`}>
      {post?.thumbnailUrl && <ExternalImage src={post.thumbnailUrl} className="size-full object-cover" />}
    </div>
  )
}

const count = (value: number | null | undefined) => (value ?? 0).toLocaleString('id-ID')

function PostView({ account, post }: { account: Account; post: RulePost | null }) {
  return (
    <div className="flex-1 overflow-hidden text-[13px]">
      <div className="relative flex items-center justify-center py-2">
        <ChevronLeft size={22} className="absolute left-3" aria-hidden="true" />
        <div className="text-center leading-tight">
          <p className="text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">{account.username}</p>
          <p className="font-semibold">Postingan</p>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <AccountAvatar account={account} />
        <span className="font-semibold">{account.username}</span>
      </div>
      <PostImage post={post} />
      <div className="flex items-center gap-4 px-3 py-2.5" aria-hidden="true">
        <span className="flex items-center gap-1">
          <Heart size={20} /> {count(post?.likes)}
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle size={20} /> {count(post?.comments)}
        </span>
        <Send size={20} />
        <Bookmark size={20} className="ml-auto" />
      </div>
      <p className="line-clamp-2 px-3">
        <span className="font-semibold">{account.username}</span> {post?.caption ?? ''}
      </p>
    </div>
  )
}

interface CommentsViewProps {
  account: Account
  post: RulePost | null
  rule: AutoDmRuleInput
  comment: string
}

function CommentsView({ account, post, rule, comment }: CommentsViewProps) {
  const reply = rule.publicReplies.find((variation) => variation.trim()) ?? withoutExample(PLACEHOLDERS.variation)
  return (
    <div className="relative flex-1 overflow-hidden text-[13px]">
      <PostImage post={post} className="opacity-40" />
      <div className="absolute inset-x-0 bottom-0 flex h-[78%] flex-col rounded-t-2xl bg-[#262626]">
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-zinc-500" />
        <div className="relative border-b border-white/10 py-2.5 text-center font-semibold">
          Komentar
          <Send size={18} className="absolute top-2.5 right-3" aria-hidden="true" />
        </div>
        <div className="flex-1 space-y-4 overflow-hidden px-3 py-3">
          <CommentLine
            avatar={<span className="flex size-8 items-center justify-center rounded-full bg-zinc-600 text-[11px]">U</span>}
            name="username"
            text={comment}
          />
          {rule.publicReply && (
            <div className="pl-10">
              <CommentLine avatar={<AccountAvatar account={account} size="size-6" />} name={account.username} text={reply} />
            </div>
          )}
        </div>
        <div className="space-y-2 border-t border-white/10 px-3 py-2.5">
          <p className="flex justify-between text-lg" aria-hidden="true">
            {EMOJI_BAR.map((emoji) => (
              <span key={emoji}>{emoji}</span>
            ))}
          </p>
          <div className="flex items-center gap-2">
            <AccountAvatar account={account} />
            <span className="flex-1 rounded-full border border-white/20 px-3 py-1.5 text-zinc-400">Tambahkan komentar…</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CommentLine({ avatar, name, text }: { avatar: ReactNode; name: string; text: string }) {
  return (
    <div className="flex gap-2">
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="text-[12px]">
          <span className="font-semibold">{name}</span> <span className="text-zinc-400">Baru saja</span>
        </p>
        <p className="break-words whitespace-pre-line">{text}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-zinc-400">Balas</p>
      </div>
      <Heart size={12} className="mt-1 shrink-0 text-zinc-400" aria-hidden="true" />
    </div>
  )
}

interface BubbleProps {
  account: Account
  text: string
  placeholder: string
  button?: { text: string; placeholder: string }
}

function Bubble({ account, text, placeholder, button }: BubbleProps) {
  return (
    <div className="flex items-end gap-2">
      <AccountAvatar account={account} size="size-6" />
      <div className="max-w-[80%] overflow-hidden rounded-2xl bg-[#262626]">
        <p className={`px-3 py-2 break-words whitespace-pre-line ${text.trim() ? '' : 'text-zinc-500'}`}>
          {text.trim() || withoutExample(placeholder)}
        </p>
        {button && (
          <p className={`border-t border-white/10 px-3 py-2 text-center font-semibold ${button.text.trim() ? 'text-[#0095F6]' : 'text-zinc-500'}`}>
            {button.text.trim() || withoutExample(button.placeholder)}
          </p>
        )}
      </div>
    </div>
  )
}

const Divider = ({ children }: { children: string }) => (
  <p className="py-1 text-center text-[10px] font-semibold tracking-[0.08em] text-zinc-500 uppercase">{children}</p>
)

function DmView({ account, rule, comment }: { account: Account; rule: AutoDmRuleInput; comment: string }) {
  const mainDivider = rule.followGate ? 'Setelah follow & tekan tombol' : rule.opener ? 'Setelah tombol ditekan' : null
  return (
    <div className="flex flex-1 flex-col overflow-hidden text-[13px]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <ChevronLeft size={22} aria-hidden="true" />
        <AccountAvatar account={account} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold">{account.username}</p>
          <p className="text-[11px] text-zinc-400">Instagram</p>
        </div>
        <Camera size={20} aria-hidden="true" />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        <p className="text-center text-[11px] text-zinc-500">Membalas komentar: “{comment}”</p>
        {rule.opener && (
          <Bubble
            account={account}
            text={rule.openerText}
            placeholder={PLACEHOLDERS.openerText}
            button={{ text: rule.openerButton, placeholder: PLACEHOLDERS.openerButton }}
          />
        )}
        {rule.followGate && (
          <>
            {rule.opener && <Divider>Setelah tombol ditekan</Divider>}
            <Bubble
              account={account}
              text={rule.followText}
              placeholder={PLACEHOLDERS.followText}
              button={{ text: rule.followButton, placeholder: PLACEHOLDERS.followButton }}
            />
          </>
        )}
        {mainDivider && <Divider>{mainDivider}</Divider>}
        <Bubble
          account={account}
          text={rule.mainText}
          placeholder={PLACEHOLDERS.mainText}
          button={rule.linkButton ? { text: rule.linkText, placeholder: PLACEHOLDERS.linkText } : undefined}
        />
      </div>
      <div className="px-3 pb-4">
        <p className="rounded-full border border-white/20 px-4 py-2 text-zinc-400">Kirim pesan…</p>
      </div>
    </div>
  )
}
