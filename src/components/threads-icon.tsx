import { AtSign, type LucideProps } from 'lucide-react'

/** Threads, drawn with a plain @ like the rest of the app's outline icons; no brand artwork. */
export function ThreadsIcon(props: LucideProps) {
  return <AtSign size={20} strokeWidth={1.75} aria-hidden="true" {...props} />
}
