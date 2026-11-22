import { describe, expect, it } from 'vitest'
import { answerCounts, onboardingCsv, onboardingFunnel, type OnboardingRecord } from './onboarding-admin-options'

const record: OnboardingRecord = {
  userId: 'u1', email: 'a@b.id', igUsername: 'kopisinar', igVerified: false, noInstagram: false, name: 'Kopi "Sinar"', followers: 1200,
  goal: 'sales', website: '', captionLanguage: 'id', postsPerWeek: 3, postsLastMonth: 'few', handler: 'self', skillLevel: 'new',
  logoChoice: 'instagram', referralSource: '=HYPERLINK("x")', lastStep: 'done', startedAt: '2026-11-23T00:00:00Z',
  completedAt: '2026-11-23T00:05:00Z', contentUsed: 2, chatUsed: 4, revisionUsed: 0, paywallShown: 1, paywallClicked: 0, paid: false,
}

describe('onboardingFunnel', () => {
  it('counts a user for every step up to the last one reached', () => {
    const funnel = onboardingFunnel([
      { lastStep: 'instagram', completedAt: null },
      { lastStep: 'goal', completedAt: null },
      { lastStep: 'done', completedAt: '2026-11-23T00:00:00Z' },
      // Finished in the earlier wizard: no step was recorded.
      { lastStep: '', completedAt: '2026-11-01T00:00:00Z' },
      { lastStep: '', completedAt: null },
    ])
    const reached = Object.fromEntries(funnel.map(({ step, reached }) => [step, reached]))
    expect(reached.instagram).toBe(4)
    expect(reached.goal).toBe(3)
    expect(reached.website).toBe(2)
    expect(reached.done).toBe(2)
  })
})

describe('answerCounts', () => {
  it('counts the given answers, most frequent first', () => {
    expect(answerCounts(['sales', '', 'time', 'sales'])).toEqual([{ answer: 'sales', count: 2 }, { answer: 'time', count: 1 }])
  })
})

describe('onboardingCsv', () => {
  it('quotes every cell and keeps a spreadsheet from running a typed formula', () => {
    const [header, row] = onboardingCsv([record]).split('\r\n')
    expect(header.startsWith('email,igUsername,')).toBe(true)
    expect(row).toContain('"Kopi ""Sinar"""')
    expect(row).toContain(`"'=HYPERLINK(""x"")"`)
    expect(row).not.toContain('u1')
  })
})
