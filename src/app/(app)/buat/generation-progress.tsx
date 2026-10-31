import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { CarouselyLoop } from '@/components/brand-mark'

const STEPS = [
  'Membaca brief dan konteks brand',
  'Menyusun hook, slide, dan caption',
  'Menyiapkan visual carousel',
  'Merender pratinjau akhir',
] as const

export type GenerationPhase = 'writing' | 'visual' | 'render'

const PHASE_STEP: Record<GenerationPhase, number> = { writing: 1, visual: 2, render: 3 }

function progressFor(phase: GenerationPhase, done: number, total: number) {
  if (phase === 'writing') return 0.32
  const share = total > 0 ? done / total : 0
  if (phase === 'render') return Math.min(0.96, 0.82 + share * 0.14)
  return 0.48 + share * 0.34
}

interface GenerationProgressProps {
  phase: GenerationPhase
  /** Slides finished so far and slides in the post, for step 3 and the bar. */
  done?: number
  total?: number
  /** A quiet line under the steps, e.g. an automatic retry. */
  note?: string | null
  /** Bottom of the stage: reassurance, and anything else that belongs with the job. */
  footer?: ReactNode
  /** Top-right of the stage, e.g. the cancel button. */
  corner?: ReactNode
  /** Room on the sides for the carousel arrows. */
  roomy?: boolean
}

/** Stands in for the image while the post is being made: the brand loop, the steps and a progress bar. */
export function GenerationProgress({ phase, done = 0, total = 0, note, footer, corner, roomy = false }: GenerationProgressProps) {
  const current = PHASE_STEP[phase]
  const progress = progressFor(phase, done, total)
  const count = phase !== 'writing' && total > 1 ? `${Math.min(done + 1, total)}/${total}` : null

  return (
    <div className={`absolute inset-0 flex flex-col bg-bg text-left ${roomy ? 'px-11' : 'px-6'} pt-5 pb-4`}>
      {corner && <div className="absolute top-2.5 right-2.5 z-10">{corner}</div>}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <CarouselyLoop size={40} />
        <ol aria-label="Langkah pembuatan" className="w-full divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_1px_2px_rgba(23,24,39,0.04)]">
          {STEPS.map((label, index) => {
            const state = index < current ? 'done' : index === current ? 'active' : 'next'
            return (
              <li
                key={label}
                aria-current={state === 'active' ? 'step' : undefined}
                className={`flex items-center gap-2.5 px-3 py-2 text-[12.5px] leading-snug transition-colors duration-500 ${state === 'active' ? 'bg-accent-soft/35' : ''}`}
              >
                <StepBadge state={state} number={index + 1} />
                <span className={`min-w-0 flex-1 ${state === 'active' ? 'font-semibold text-ink' : state === 'done' ? 'text-ink' : 'text-ink-muted'}`}>
                  {label}
                  {state === 'done' && <span className="sr-only"> (selesai)</span>}
                </span>
                {state === 'active' && (
                  <span className="flex shrink-0 items-center gap-2">
                    {index === 2 && count && <span className="text-[11px] font-medium text-accent tabular-nums">{count}</span>}
                    <TypingDots />
                  </span>
                )}
              </li>
            )
          })}
        </ol>
        {note && <p className="w-full text-center text-[11.5px] text-ink-muted">{note}</p>}
      </div>
      <div className="mt-4 space-y-2.5">
        <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
          <div
            className="relative h-full overflow-hidden rounded-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          >
            <span className="generation-sheen absolute inset-0 motion-reduce:hidden" />
          </div>
        </div>
        {footer && <div className="text-center text-[11.5px] leading-snug text-ink-muted">{footer}</div>}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {`Langkah ${current + 1} dari ${STEPS.length}: ${STEPS[current]}${count && current === 2 ? `, slide ${count}` : ''}.`}
      </p>
    </div>
  )
}

function StepBadge({ state, number }: { state: 'done' | 'active' | 'next'; number: number }) {
  if (state === 'done') {
    return (
      <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
        <Check size={13} strokeWidth={3} />
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums ${
        state === 'active' ? 'bg-accent text-white shadow-[0_2px_6px_-1px_rgba(101,88,245,0.5)]' : 'border border-hairline bg-white text-ink-muted'
      }`}
    >
      {number}
    </span>
  )
}

function TypingDots() {
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      {[0, 160, 320].map((delay) => (
        <span key={delay} className="typing-dot size-1.5 rounded-full bg-accent" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  )
}
