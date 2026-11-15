'use client';
import { RefreshCw, SearchX, WifiOff } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@barberflow/ui';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { ApiError } from '@/lib/api';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  if (error instanceof ApiError && error.status === 404) {
    return <EmptyState icon={SearchX} title={t('common.notFoundTitle')} text={t('common.notFoundText')} />;
  }
  return (
    <EmptyState
      icon={error instanceof ApiError && error.code === 'NETWORK' ? WifiOff : RefreshCw}
      title={t('common.errorTitle')}
      text={t(errorKey(error))}
      action={onRetry && <Button variant="outline" onClick={onRetry}><RefreshCw />{t('common.retry')}</Button>}
    />
  );
}

export function ListSkeleton({ rows = 4, height = 72 }: { rows?: number; height?: number }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label={t('common.loading')}>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} style={{ height }} />)}
    </div>
  );
}
