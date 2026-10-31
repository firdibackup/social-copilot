import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { PiCreditCard, PiShieldCheck, PiSignOut } from 'react-icons/pi'
import { signOut } from '@/app/masuk/actions'
import { AccountEmail } from '@/components/account-email'
import { Breadcrumb } from '@/components/breadcrumb'
import { LoadingState } from '@/components/loading-state'
import { LocaleToggle } from '@/components/locale-toggle'
import { InstagramStatus } from '@/components/instagram-status'
import { ThreadsStatus } from '@/components/threads-status'
import { MobileNav } from '@/components/mobile-nav'
import { NotificationBell } from '@/components/notification-bell'
import { AdminSection, Sidebar } from '@/components/sidebar'
import { CreditMeter, RenewalBanner } from '@/components/subscription-status'
import { WorkspaceBadge } from '@/components/workspace-badge'
import { currentUser, isAdmin } from '@/lib/auth'

interface AppLayoutProps {
  children: ReactNode
}

const PHONE_ACTION =
  'inline-flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-ink-muted transition-colors duration-150 hover:bg-zinc-100 hover:text-ink'

/**
 * The sidebar sits on the grey background and the page in a white card beside it. The window itself never scrolls:
 * each page decides what scrolls inside the card ((halaman)/layout.tsx for ordinary pages, two columns in Buat).
 */
export default async function AppLayout({ children }: AppLayoutProps) {
  const t = await getTranslations('shell')
  return (
    <div className="bg-sidebar fixed inset-0 flex">
      <Sidebar
        workspace={
          <Suspense fallback={<LoadingState variant="workspace" label={t('loading.workspace')} />}>
            <WorkspaceBadge />
          </Suspense>
        }
        instagramStatus={
          <Suspense fallback={<LoadingState variant="line" label={t('loading.instagram')} className="px-3 py-2" />}>
            <InstagramStatus />
          </Suspense>
        }
        threadsStatus={
          <Suspense fallback={<LoadingState variant="line" label={t('loading.threads')} className="px-3 py-2" />}>
            <ThreadsStatus />
          </Suspense>
        }
        credits={
          <Suspense fallback={<LoadingState variant="credits" label={t('loading.quota')} />}>
            <CreditMeter />
          </Suspense>
        }
        account={
          <Suspense fallback={<LoadingState variant="line" label={t('loading.account')} className="px-3 py-2" />}>
            <AccountEmail />
          </Suspense>
        }
        admin={
          <Suspense fallback={null}>
            <AdminNav />
          </Suspense>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col md:py-3 md:pr-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-paper md:rounded-2xl md:border md:border-hairline">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-4 md:px-5">
            <Breadcrumb />
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <NotificationBell />
              {/* The sidebar's language control, Langganan and Keluar, which the phone's bottom bar has no room for. */}
              <div className="flex items-center gap-1 md:hidden">
                <LocaleToggle variant="app" />
                <Suspense fallback={null}>
                  <AdminNav phone />
                </Suspense>
                <Link href="/pengaturan#paket" aria-label={t('plansCredits')} className={PHONE_ACTION}>
                  <PiCreditCard size={18} aria-hidden="true" />
                  <span className="hidden sm:inline">{t('plansCredits')}</span>
                </Link>
                <form action={signOut}>
                  <button type="submit" aria-label={t('signOut')} className={PHONE_ACTION}>
                    <PiSignOut size={18} aria-hidden="true" />
                  </button>
                </form>
              </div>
            </div>
          </header>
          <Suspense fallback={null}>
            <RenewalBanner />
          </Suspense>
          {/* Room for the phone's bottom bar. */}
          <main className="min-h-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
        </div>
      </div>
      <MobileNav />
    </div>
  )
}

/** The Admin link, for admins only: in the sidebar, or in the phone's header, whose bottom bar has no room. */
async function AdminNav({ phone = false }: { phone?: boolean }) {
  const t = await getTranslations('shell')
  const user = await currentUser()
  if (!user || !isAdmin(user)) return null
  if (!phone) return <AdminSection />
  return (
    <Link href="/admin" aria-label={t('admin')} className={PHONE_ACTION}>
      <PiShieldCheck size={18} aria-hidden="true" />
      <span className="hidden sm:inline">{t('admin')}</span>
    </Link>
  )
}
