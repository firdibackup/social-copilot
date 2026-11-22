import { ONBOARDING_STEPS, type OnboardingStep } from './onboarding-options'

/** One user's onboarding and what came of it, for Admin › Onboarding and its CSV. */
export interface OnboardingRecord {
  userId: string
  email: string
  igUsername: string
  /** Whether the username came from the Instagram login, not from what the user typed. */
  igVerified: boolean
  noInstagram: boolean
  name: string
  followers: number | null
  goal: string
  website: string
  captionLanguage: string
  postsPerWeek: number
  postsLastMonth: string
  handler: string
  skillLevel: string
  logoChoice: string
  referralSource: string
  lastStep: string
  startedAt: string
  completedAt: string | null
  contentUsed: number
  chatUsed: number
  revisionUsed: number
  paywallShown: number
  paywallClicked: number
  paid: boolean
}

export interface FunnelStep {
  step: OnboardingStep
  /** Users who got to this step or beyond. */
  reached: number
}

/**
 * How many users reached each step. A user counts for every step up to the last one they reached; a finished
 * onboarding counts for all. Rows from before the new wizard have no last step and count only when finished.
 */
export function onboardingFunnel(records: Pick<OnboardingRecord, 'lastStep' | 'completedAt'>[]): FunnelStep[] {
  const position = (record: Pick<OnboardingRecord, 'lastStep' | 'completedAt'>) =>
    record.completedAt ? ONBOARDING_STEPS.length - 1 : (ONBOARDING_STEPS as readonly string[]).indexOf(record.lastStep)
  const positions = records.map(position)
  return ONBOARDING_STEPS.map((step, index) => ({ step, reached: positions.filter((reached) => reached >= index).length }))
}

/** How often each answer was given, most frequent first; unanswered rows are left out. */
export function answerCounts(values: string[]): { answer: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].map(([answer, count]) => ({ answer, count })).sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer))
}

const CSV_COLUMNS: (keyof OnboardingRecord)[] = [
  'email', 'igUsername', 'igVerified', 'noInstagram', 'name', 'followers', 'goal', 'website', 'captionLanguage', 'postsPerWeek',
  'postsLastMonth', 'handler', 'skillLevel', 'logoChoice', 'referralSource', 'lastStep', 'startedAt', 'completedAt', 'contentUsed',
  'chatUsed', 'revisionUsed', 'paywallShown', 'paywallClicked', 'paid',
]

/** A cell that a spreadsheet reads as text: quoted, and never as a formula. */
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function onboardingCsv(records: OnboardingRecord[]): string {
  return [CSV_COLUMNS.join(','), ...records.map((record) => CSV_COLUMNS.map((column) => csvCell(record[column])).join(','))].join('\r\n')
}
