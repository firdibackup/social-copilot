import { Suspense, type ReactNode } from 'react'
import { LoadingState } from '@/components/loading-state'
import { requireAccount } from '@/lib/auth'
import { MimoProvider } from './mimo-provider'

export default function MimoLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState variant="chat" className="h-full" label="Memuat Mimo…" />}><AuthenticatedWorkspace>{children}</AuthenticatedWorkspace></Suspense>
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const { userId, accountId } = await requireAccount()
  const scope = `${userId}:${accountId}`
  return <MimoProvider key={scope} scope={scope} revision={new Date().getTime()}>{children}</MimoProvider>
}
