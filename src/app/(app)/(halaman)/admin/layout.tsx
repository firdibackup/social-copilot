import type { ReactNode } from 'react'
import { AdminTabs } from './admin-tabs'

/** Every admin page checks requireAdmin() itself; this only frames them. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Admin</h1>
        <p className="text-zinc-500">Pengguna, langganan, kredit AI, dan model yang dipakai aplikasi.</p>
      </header>
      <AdminTabs />
      {children}
    </div>
  )
}
