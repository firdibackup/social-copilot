import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Notice } from './notice'

/** For a user who has not logged in with Instagram yet, on a page that reads from Instagram. */
export async function ConnectInstagramNotice() {
  const t = await getTranslations('shell')
  return (
    <Notice tone="warning">
      {t.rich('connection.connectFirst', {
        link: (chunks) => <Link href="/pengaturan#instagram" className="font-medium underline underline-offset-2">{chunks}</Link>,
      })}
    </Notice>
  )
}
