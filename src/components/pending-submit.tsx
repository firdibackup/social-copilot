'use client'

import { useFormStatus } from 'react-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function PendingSubmit({ children, pendingLabel, className, ...props }: {
  children: ReactNode
  pendingLabel: ReactNode
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'>) {
  const { pending } = useFormStatus()
  return <button {...props} type="submit" disabled={pending || props.disabled} aria-busy={pending} className={className}>
    {pending ? pendingLabel : children}
  </button>
}
