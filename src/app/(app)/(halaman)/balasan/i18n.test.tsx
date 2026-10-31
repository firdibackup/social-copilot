import { NextIntlClientProvider } from 'next-intl'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import idInbox from '../../../../../messages/id/inbox.json'
import enInbox from '../../../../../messages/en/inbox.json'
import { EMPTY_RULE, mainDm, ruleProblem, type AutoDmRule } from '@/lib/auto-dm-rules'
import { threadItemsError } from '@/lib/thread-items'
import { PendingLink } from './pending-link'

vi.mock('next/link', async () => {
  const React = await import('react')
  return {
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', props, children),
    useLinkStatus: () => ({ pending: true }),
  }
})

const keys = (value: object, prefix = ''): string[] => Object.entries(value).flatMap(([key, child]) =>
  typeof child === 'string' ? [`${prefix}${key}`] : keys(child, `${prefix}${key}.`),
)

describe('inbox translations', () => {
  it('keeps both catalogs in sync', () => {
    expect(keys(enInbox).sort()).toEqual(keys(idInbox).sort())
  })

  it('renders English navigation feedback', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={{ inbox: enInbox }}>
        <PendingLink href="/balasan">Conversation</PendingLink>
      </NextIntlClientProvider>,
    )
    expect(html).toContain('Loading replies')
    expect(html).not.toContain('Memuat balasan')
  })

  it('localizes validation while retaining the Indonesian default', () => {
    expect(ruleProblem(EMPTY_RULE)).toBe('Isi nama otomatisasi.')
    expect(ruleProblem(EMPTY_RULE, 'en')).toBe('Enter an automation name.')
    expect(threadItemsError([], 'en')).toBe('The Threads post is empty.')
  })

  it('leaves outgoing user-written messages unchanged', () => {
    const rule: AutoDmRule = { ...EMPTY_RULE, id: 'rule', isActive: true, createdAt: new Date(), mainText: 'Ini linknya, terima kasih! 🙌' }
    expect(mainDm(rule).message.text).toBe(rule.mainText)
  })
})
