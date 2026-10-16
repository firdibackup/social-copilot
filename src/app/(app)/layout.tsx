import { Suspense, type ReactNode } from 'react'
import { AccountEmail } from '@/components/account-email'
import { Breadcrumb } from '@/components/breadcrumb'
import { InstagramStatus, StatusLine } from '@/components/instagram-status'
import { MobileNav } from '@/components/mobile-nav'
import { Sidebar } from '@/components/sidebar'
import { CreditBar, CreditMeter, RenewalBanner } from '@/components/subscription-status'
import { WorkspaceBadge, WorkspaceLine } from '@/components/workspace-badge'

interface AppLayoutProps {
  children: ReactNode
}

/**
 * The sidebar sits on the grey background and the page in a white card beside it. The window itself never scrolls:
 * each page decides what scrolls inside the card ((halaman)/layout.tsx for ordinary pages, two columns in Buat).
 */
export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="fixed inset-0 flex bg-bg">
      <Sidebar
        workspace={
          <Suspense fallback={<WorkspaceLine name="Memuat…" logoUrl={null} />}>
            <WorkspaceBadge />
          </Suspense>
        }
        instagramStatus={
          <Suspense fallback={<StatusLine tone="muted" label="Memeriksa…" />}>
            <InstagramStatus />
          </Suspense>
        }
        credits={
          <Suspense fallback={<CreditBar percent={null} />}>
            <CreditMeter />
          </Suspense>
        }
        account={
          <Suspense fallback={null}>
            <AccountEmail />
          </Suspense>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col md:py-3 md:pr-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-paper md:rounded-2xl md:border md:border-hairline">
          <header className="flex h-14 shrink-0 items-center border-b border-hairline px-5">
            <Breadcrumb />
          </header>
          <Suspense fallback={null}>
            <RenewalBanner />
          </Suspense>
          {/* Room for the phone's bottom bar. */}
          <div className="min-h-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
        </div>
      </div>
      <MobileNav />
    </div>
  )
}
