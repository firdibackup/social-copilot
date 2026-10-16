import { Suspense, type ReactNode } from 'react'
import { AccountEmail } from '@/components/account-email'
import { InstagramStatus, StatusLine } from '@/components/instagram-status'
import { Sidebar } from '@/components/sidebar'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        instagramStatus={
          <Suspense fallback={<StatusLine tone="muted" label="Memeriksa…" />}>
            <InstagramStatus />
          </Suspense>
        }
        account={
          <Suspense fallback={null}>
            <AccountEmail />
          </Suspense>
        }
      />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
    </div>
  )
}
