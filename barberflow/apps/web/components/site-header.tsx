'use client';
import Link from 'next/link';
import { CalendarCheck, LayoutGrid, Scissors, Shield } from 'lucide-react';
import { Button, Logo, cn } from '@barberflow/ui';
import { useMe } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { LanguageSwitch, ThemeToggle } from './prefs';

/** `overlay`: transparent header that sits on top of a photo hero (landing, shop page). */
export function SiteHeader({ className, minimal, overlay }: { className?: string; minimal?: boolean; overlay?: boolean }) {
  const { t } = useI18n();
  const { data: me } = useMe();
  return (
    <header className={cn(overlay ? 'absolute inset-x-0 top-0 z-30' : 'sticky top-0 z-30 border-b border-border/60 bg-bg/88 backdrop-blur-md', className)}>
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
        <Link href="/" className="mr-auto rounded-lg" aria-label="BARBERFLOW">
          <Logo />
        </Link>
        <LanguageSwitch />
        <ThemeToggle />
        {!minimal && (
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label={t('nav.myBookings')} title={t('nav.myBookings')}>
              <Link href="/me" data-testid="nav-my-bookings"><CalendarCheck /></Link>
            </Button>
            {me?.isPlatformAdmin && (
              <Button asChild variant="ghost" size="icon" aria-label={t('nav.platformAdmin')} title={t('nav.platformAdmin')}>
                <Link href="/platform-admin"><Shield /></Link>
              </Button>
            )}
            {me ? (
              <Button asChild variant="ghost" size="icon" aria-label={t('nav.cabinet')} title={t('nav.cabinet')}>
                <Link href={me.memberships.length ? '/app' : '/account'}><LayoutGrid /></Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="ml-1 rounded-full bg-bg/30 px-2.5 backdrop-blur-sm min-[400px]:px-3">
                <Link href="/login" data-testid="nav-staff-login" aria-label={t('nav.forBarbers')} title={t('nav.forBarbers')}>
                  <Scissors className="min-[400px]:hidden" /><span className="hidden min-[400px]:inline">{t('nav.forBarbers')}</span>
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
