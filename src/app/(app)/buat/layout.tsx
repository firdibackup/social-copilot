import { IntlMessages } from '@/i18n/client-messages'

import { getLocale, getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { requireAccount } from '@/lib/auth'
import { getAccountStrategy } from '@/lib/brand'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { listIdeas } from '@/lib/ideas'
import { listContentPosts } from '@/lib/posts'
import { ContentList } from './content-list'
import { WorkspaceFrame } from './workspace-frame'
import { EditorProvider } from './editor-provider'

/** Keep the list mounted when only the selected draft's query string changes. */
export default async function BuatLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('editor.layout')

  return (
    <Suspense fallback={<LoadingState variant="editor" className="h-full" label={t('message1')} />}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  )
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const t = await getTranslations('editor.layout')

  const { userId, accountId } = await requireAccount()
  const scope = `${userId}:${accountId}`
  return (
    <IntlMessages namespaces={['common', 'editor']}><EditorProvider key={scope} scope={scope}>
      <WorkspaceFrame list={
        <Suspense fallback={<div className="w-full shrink-0 md:w-[320px]"><LoadingState variant="line" label={t('message2')} /></div>}>
          <DraftList />
        </Suspense>
      }>{children}</WorkspaceFrame>
    </EditorProvider></IntlMessages>
  )
}

async function DraftList() {
  const { userId, accountId } = await requireAccount()
  let data
  try {
    const [posts, ideas, strategy] = await Promise.all([
      listContentPosts(userId, accountId, await getLocale()),
      listIdeas(userId, accountId),
      getAccountStrategy(userId, accountId).catch(() => null),
    ])
    data = { posts, ideas, strategy }
  } catch (error) {
    console.error('[buat] daftar gagal dimuat:', describeError(error))
    return <div className="max-w-80 p-4"><Notice tone="warning">{loadErrorMessage(error)}</Notice></div>
  }
  return <ContentList {...data} />
}
