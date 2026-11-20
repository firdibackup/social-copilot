import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { PiLayoutDuotone } from 'react-icons/pi'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('editor.designEditor')
  return { title: t('comingSoonTitle') }
}

/** Public menu entry while the editor is built; admins work on it at /admin/editor-template. */
export default async function TemplateComingSoon() {
  const t = await getTranslations('editor.designEditor')
  return <div className="grid min-h-[60vh] place-items-center text-center">
    <div className="max-w-md space-y-3">
      <PiLayoutDuotone size={40} aria-hidden="true" className="mx-auto text-accent" />
      <h1 className="text-2xl font-semibold tracking-tight">{t('comingSoonTitle')}</h1>
      <p className="text-ink-muted">{t('comingSoonBody')}</p>
    </div>
  </div>
}
