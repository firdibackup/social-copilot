import { useTranslations } from 'next-intl'
import { Square } from 'lucide-react'

export function CancelGenerationButton({ onClick, pending = false, label }: {
  onClick: () => void
  pending?: boolean
  label?: string
}) {
  const t = useTranslations('common')
  return (
    <button type="button" onClick={onClick} disabled={pending} aria-busy={pending}
      className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60">
      <Square size={12} fill="currentColor" aria-hidden="true" />
      {pending ? t('cancelling') : (label ?? t('cancel'))}
    </button>
  )
}
