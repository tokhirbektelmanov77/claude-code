'use client';
import Link from 'next/link';
import { CalendarCheck, LayoutGrid, Shield } from 'lucide-react';
import { Button, Logo, cn } from '@barberflow/ui';
import { useMe } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { LanguageSwitch, ThemeToggle } from './prefs';

export function SiteHeader({ className, minimal }: { className?: string; minimal?: boolean }) {
  const { t } = useI18n();
  const { data: me } = useMe();
  return (
    <header className={cn('sticky top-0 z-30 border-b border-border/70 bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70', className)}>
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
        <Link href="/" className="mr-auto rounded-lg" aria-label="BARBERFLOW">
          <Logo />
        </Link>
        <LanguageSwitch />
        <ThemeToggle />
        {!minimal && (
          me ? (
            <div className="flex items-center gap-1">
              {me.isPlatformAdmin && (
                <Button asChild variant="ghost" size="icon" aria-label={t('nav.platformAdmin')} title={t('nav.platformAdmin')}>
                  <Link href="/platform-admin"><Shield /></Link>
                </Button>
              )}
              {me.memberships.length > 0 && (
                <Button asChild variant="ghost" size="icon" aria-label={t('nav.cabinet')} title={t('nav.cabinet')}>
                  <Link href="/app"><LayoutGrid /></Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="icon" aria-label={t('nav.myBookings')} title={t('nav.myBookings')}>
                <Link href="/me"><CalendarCheck /></Link>
              </Button>
            </div>
          ) : (
            <Button asChild variant="outline" size="sm" className="ml-1 rounded-full">
              <Link href="/login">{t('common.login')}</Link>
            </Button>
          )
        )}
      </div>
    </header>
  );
}
