import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claimRun, listRules, updateConversationRun, updateRun } from './auto-dm'
import { EMPTY_RULE, type AutoDmRule } from './auto-dm-rules'
import { runAutoDm, type AutoDmTrigger } from './auto-dm-runner'
import { recordOwnReply, type CommentInput } from './comments'
import { getPublishingAccount, markNeedsReconnect } from './connection'
import { getConversation, recordMessage, recordPrivateReply } from './dm'
import { fetchFollowsBusiness, InstagramApiError, replyToComment, sendAutoDm } from './instagram'

vi.mock('./auto-dm', () => ({
  claimRun: vi.fn(),
  listRules: vi.fn(),
  updateConversationRun: vi.fn(),
  updateRun: vi.fn(),
}))
vi.mock('./comments', () => ({ recordOwnReply: vi.fn() }))
vi.mock('./connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./connection')>()),
  getPublishingAccount: vi.fn(),
  markNeedsReconnect: vi.fn(),
}))
vi.mock('./dm', () => ({ getConversation: vi.fn(), recordMessage: vi.fn(), recordPrivateReply: vi.fn() }))
vi.mock('./instagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./instagram')>()),
  fetchFollowsBusiness: vi.fn(),
  replyToComment: vi.fn(),
  sendAutoDm: vi.fn(),
}))

const USER = 'user-1'
const ACCOUNT = '1784'
const CUSTOMER = '9012'
const RULE_ID = '00000000-0000-4000-8000-000000000001'
const PAYLOAD = `autodm:${RULE_ID}`

const rule = (overrides: Partial<AutoDmRule> = {}): AutoDmRule => ({
  ...EMPTY_RULE,
  id: RULE_ID,
  isActive: true,
  createdAt: new Date('2026-10-19T01:00:00Z'),
  name: 'Link ebook',
  keywords: ['MAU'],
  openerText: 'Mau linknya?',
  openerButton: 'Kirim linknya',
  mainText: 'Ini linknya',
  ...overrides,
})

const comment = (overrides: Partial<CommentInput> = {}): AutoDmTrigger => ({
  kind: 'comment',
  comment: {
    id: '555',
    mediaId: '111',
    parentId: null,
    fromId: CUSTOMER,
    username: 'budi',
    text: 'mau dong',
    createdAt: new Date(),
    isHidden: false,
    isFromOwner: false,
    ...overrides,
  },
})

const dm = (text: string): AutoDmTrigger => ({
  kind: 'dm',
  message: { mid: 'm1', igsid: CUSTOMER, fromCustomer: true, text, sentAt: new Date() },
})

const tapEvent = { mid: 'p1', igsid: CUSTOMER, title: 'Kirim linknya', payload: PAYLOAD, sentAt: new Date() }
const tap: AutoDmTrigger = { kind: 'postback', postback: tapEvent }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(listRules).mockResolvedValue([rule()])
  vi.mocked(claimRun).mockResolvedValue('run-1')
  vi.mocked(getPublishingAccount).mockResolvedValue({ accessToken: 'token', instagramUserId: ACCOUNT, username: 'toko' })
  vi.mocked(sendAutoDm).mockResolvedValue({ messageId: 'mid-out', recipientId: CUSTOMER })
  vi.mocked(replyToComment).mockResolvedValue('reply-1')
  vi.mocked(getConversation).mockResolvedValue(null)
  vi.mocked(markNeedsReconnect).mockResolvedValue()
})

describe('a comment', () => {
  it('gets the opener as a private reply, and the run remembers the conversation', async () => {
    await runAutoDm(USER, ACCOUNT, [comment()])

    expect(listRules).toHaveBeenCalledWith(USER, ACCOUNT, true)
    expect(claimRun).toHaveBeenCalledWith(USER, RULE_ID, {
      source: 'comment',
      triggerId: '555',
      personId: CUSTOMER,
      username: 'budi',
      text: 'mau dong',
    })
    expect(replyToComment).not.toHaveBeenCalled()
    expect(sendAutoDm).toHaveBeenCalledWith('token', ACCOUNT, { comment_id: '555' }, {
      text: 'Mau linknya?',
      buttons: [{ type: 'postback', title: 'Kirim linknya', payload: PAYLOAD }],
    })
    expect(recordPrivateReply).toHaveBeenCalledWith(
      USER,
      { commentId: '555', username: 'budi' },
      { messageId: 'mid-out', recipientId: CUSTOMER },
      'Mau linknya?',
    )
    expect(updateRun).toHaveBeenCalledWith(USER, 'run-1', { step: 'opener_sent', error: null, igsid: CUSTOMER })
  })

  it('also gets a public reply under its thread when the rule asks for one', async () => {
    vi.mocked(listRules).mockResolvedValue([rule({ publicReply: true, publicReplies: ['Cek DM ya!'] })])

    await runAutoDm(USER, ACCOUNT, [comment({ id: '556', parentId: '555' })])

    expect(replyToComment).toHaveBeenCalledWith('token', '555', 'Cek DM ya!')
    expect(recordOwnReply).toHaveBeenCalledWith(USER, ACCOUNT, {
      id: 'reply-1',
      mediaId: '111',
      parentId: '555',
      text: 'Cek DM ya!',
    })
    expect(sendAutoDm).toHaveBeenCalledWith('token', ACCOUNT, { comment_id: '556' }, expect.anything())
  })

  it('still gets the DM when the public reply fails, and the run says what failed', async () => {
    vi.mocked(listRules).mockResolvedValue([rule({ publicReply: true, publicReplies: ['Cek DM ya!'] })])
    vi.mocked(replyToComment).mockRejectedValue(new InstagramApiError('Komentar dibatasi', 100, 400))

    await runAutoDm(USER, ACCOUNT, [comment()])

    expect(sendAutoDm).toHaveBeenCalled()
    expect(updateRun).toHaveBeenCalledWith(USER, 'run-1', {
      step: 'opener_sent',
      error: 'Balasan komentar gagal. Instagram menolak: Komentar dibatasi',
      igsid: CUSTOMER,
    })
  })

  it('is skipped when it is the account’s own, matches no rule, or was already answered', async () => {
    await runAutoDm(USER, ACCOUNT, [comment({ isFromOwner: true }), comment({ text: 'bagus banget' })])
    expect(claimRun).not.toHaveBeenCalled()

    vi.mocked(claimRun).mockResolvedValue(null)
    await runAutoDm(USER, ACCOUNT, [comment()])
    expect(sendAutoDm).not.toHaveBeenCalled()
  })

  it('marks the run failed when Instagram refuses, and asks for a reconnect on a dead token', async () => {
    vi.mocked(sendAutoDm).mockRejectedValue(new InstagramApiError('Token expired', 190, 400))

    await runAutoDm(USER, ACCOUNT, [comment()])

    expect(markNeedsReconnect).toHaveBeenCalledWith(USER)
    expect(updateRun).toHaveBeenCalledWith(USER, 'run-1', {
      step: 'failed',
      error: 'Token Instagram kedaluwarsa atau dicabut. Hubungkan ulang di Pengaturan.',
    })
  })

  it('goes on with the next trigger when one throws', async () => {
    vi.mocked(claimRun).mockRejectedValueOnce(new Error('Supabase: down')).mockResolvedValueOnce('run-2')

    await runAutoDm(USER, ACCOUNT, [comment(), comment({ id: '557' })])

    expect(updateRun).toHaveBeenCalledWith(USER, 'run-2', expect.objectContaining({ step: 'opener_sent' }))
  })
})

describe('a DM', () => {
  it('starts the flow only for rules that also answer DMs', async () => {
    await runAutoDm(USER, ACCOUNT, [dm('MAU')])
    expect(claimRun).not.toHaveBeenCalled()

    vi.mocked(listRules).mockResolvedValue([rule({ dmTrigger: true, opener: false })])
    vi.mocked(getConversation).mockResolvedValue({ username: 'budi' } as Awaited<ReturnType<typeof getConversation>>)
    await runAutoDm(USER, ACCOUNT, [dm('MAU')])

    expect(claimRun).toHaveBeenCalledWith(USER, RULE_ID, {
      source: 'dm',
      triggerId: 'm1',
      personId: CUSTOMER,
      username: 'budi',
      text: 'MAU',
    })
    expect(sendAutoDm).toHaveBeenCalledWith('token', ACCOUNT, { id: CUSTOMER }, { text: 'Ini linknya', buttons: [] })
    expect(recordMessage).toHaveBeenCalledWith(USER, expect.objectContaining({ mid: 'mid-out', fromCustomer: false }))
    expect(updateRun).toHaveBeenCalledWith(USER, 'run-1', { step: 'main_sent', error: null, igsid: CUSTOMER })
  })
})

describe('a button tap', () => {
  it('gets the main message with its link button when there is no follow gate', async () => {
    vi.mocked(listRules).mockResolvedValue([
      rule({ linkButton: true, linkText: 'Download', linkUrl: 'https://contoh.id/ebook' }),
    ])

    await runAutoDm(USER, ACCOUNT, [tap])

    expect(fetchFollowsBusiness).not.toHaveBeenCalled()
    expect(sendAutoDm).toHaveBeenCalledWith('token', ACCOUNT, { id: CUSTOMER }, {
      text: 'Ini linknya',
      buttons: [{ type: 'web_url', title: 'Download', url: 'https://contoh.id/ebook' }],
    })
    expect(updateConversationRun).toHaveBeenCalledWith(USER, RULE_ID, CUSTOMER, { step: 'main_sent', error: null })
  })

  it('asks a non-follower to follow first, and gives a follower the main message', async () => {
    vi.mocked(listRules).mockResolvedValue([rule({ followGate: true, followText: 'Follow dulu', followButton: 'Sudah follow' })])
    vi.mocked(fetchFollowsBusiness).mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await runAutoDm(USER, ACCOUNT, [tap])
    await runAutoDm(USER, ACCOUNT, [tap])

    expect(vi.mocked(sendAutoDm).mock.calls.map((call) => call[3].text)).toEqual(['Follow dulu', 'Ini linknya'])
    expect(updateConversationRun).toHaveBeenNthCalledWith(1, USER, RULE_ID, CUSTOMER, { step: 'follow_requested', error: null })
    expect(updateConversationRun).toHaveBeenNthCalledWith(2, USER, RULE_ID, CUSTOMER, { step: 'main_sent', error: null })
  })

  it('sends nothing when the follow check fails', async () => {
    vi.mocked(listRules).mockResolvedValue([rule({ followGate: true, followText: 'Follow dulu', followButton: 'Sudah' })])
    vi.mocked(fetchFollowsBusiness).mockRejectedValue(new InstagramApiError('Instagram tidak memberi status follow', null, 200))

    await runAutoDm(USER, ACCOUNT, [tap])

    expect(sendAutoDm).not.toHaveBeenCalled()
    expect(updateConversationRun).toHaveBeenCalledWith(USER, RULE_ID, CUSTOMER, {
      step: 'failed',
      error: 'Instagram menolak: Instagram tidak memberi status follow',
    })
  })

  it('is ignored for a paused or deleted rule and for other buttons', async () => {
    vi.mocked(listRules).mockResolvedValue([rule({ id: '00000000-0000-4000-8000-000000000002' })])
    const other: AutoDmTrigger = { kind: 'postback', postback: { ...tapEvent, payload: 'GET_STARTED' } }

    await runAutoDm(USER, ACCOUNT, [tap, other])

    expect(sendAutoDm).not.toHaveBeenCalled()
  })
})

it('does nothing without active rules', async () => {
  vi.mocked(listRules).mockResolvedValue([])

  await runAutoDm(USER, ACCOUNT, [comment(), tap])

  expect(claimRun).not.toHaveBeenCalled()
  expect(getPublishingAccount).not.toHaveBeenCalled()
})
