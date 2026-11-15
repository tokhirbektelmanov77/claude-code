'use client';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button, EmptyState } from '@barberflow/ui';
import { SiteHeader } from '@/components/site-header';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-16">
        <EmptyState icon={SearchX} title={t('common.notFoundTitle')} text={t('common.notFoundText')} action={<Button asChild variant="outline"><Link href="/">{t('common.toHome')}</Link></Button>} />
      </main>
    </>
  );
}
