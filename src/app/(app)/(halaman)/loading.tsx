import { useTranslations } from 'next-intl'
import { LoadingState } from '@/components/loading-state'

export default function Loading() {
  const t = useTranslations('common')
  return <LoadingState variant="page" label={t('loadingPage')} />
}
