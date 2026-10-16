import type { Metadata } from 'next'
import { AuthCard, AuthForm } from '../masuk/auth-form'

export const metadata: Metadata = { title: 'Daftar' }

export default function DaftarPage() {
  return (
    <AuthCard
      title="Buat akun"
      description="Setelah daftar, hubungkan satu akun Instagram Business atau Creator."
    >
      <AuthForm mode="daftar" />
    </AuthCard>
  )
}
