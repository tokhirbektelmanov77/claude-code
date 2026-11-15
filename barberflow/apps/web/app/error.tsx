'use client';
import { RefreshCw } from 'lucide-react';
import { Button, EmptyState } from '@barberflow/ui';
import { useI18n } from '@/lib/i18n';

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <EmptyState icon={RefreshCw} title={t('common.errorTitle')} text={t('common.errorGeneric')} action={<Button variant="outline" onClick={reset}>{t('common.retry')}</Button>} />
    </main>
  );
}
