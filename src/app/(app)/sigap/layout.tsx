import { Suspense, type ReactNode } from 'react'
import { LoadingState } from '@/components/loading-state'
import { requireAccount } from '@/lib/auth'
import { SigapProvider } from './sigap-provider'

export default function SigapLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState variant="chat" className="h-full" label="Memuat Sigap…" />}><AuthenticatedWorkspace>{children}</AuthenticatedWorkspace></Suspense>
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const { userId, accountId } = await requireAccount()
  const scope = `${userId}:${accountId}`
  return <SigapProvider key={scope} scope={scope} revision={new Date().getTime()}>{children}</SigapProvider>
}
