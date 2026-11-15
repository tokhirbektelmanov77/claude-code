'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Building2, CalendarDays, Clock4, CreditCard, LayoutDashboard, Link2, LogOut, MoreHorizontal, Scissors, Settings, Sun, Users, UsersRound,
} from 'lucide-react';
import { Alert, Button, Logo, Select, Sheet, Spinner, cn } from '@barberflow/ui';
import type { TranslationKey } from '@barberflow/shared';
import { LanguageSwitch, ThemeToggle } from '@/components/prefs';
import { useLogout, useMe } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { WorkspaceProvider, useWorkspace } from '@/lib/workspace';

interface NavItem { href: string; key: TranslationKey; icon: React.ComponentType<{ className?: string }>; managerOnly?: boolean; barberOnly?: boolean }

const NAV: NavItem[] = [
  { href: '/app/dashboard', key: 'cabinet.dashboard', icon: LayoutDashboard, managerOnly: true },
  { href: '/app/today', key: 'cabinet.today', icon: Sun },
  { href: '/app/calendar', key: 'cabinet.calendar', icon: CalendarDays },
  { href: '/app/schedule', key: 'cabinet.schedule', icon: Clock4 },
  { href: '/app/clients', key: 'cabinet.clients', icon: UsersRound },
  { href: '/app/staff', key: 'cabinet.staff', icon: Users, managerOnly: true },
  { href: '/app/services', key: 'cabinet.services', icon: Scissors, managerOnly: true },
  { href: '/app/branches', key: 'cabinet.branches', icon: Building2, managerOnly: true },
  { href: '/app/link', key: 'cabinet.link', icon: Link2 },
  { href: '/app/settings', key: 'cabinet.settings', icon: Settings, managerOnly: true },
  { href: '/app/subscription', key: 'cabinet.subscription', icon: CreditCard, managerOnly: true },
];

function Banners() {
  const { business } = useWorkspace();
  const { t } = useI18n();
  const f = useFormat(business?.timezone);
  if (!business) return null;
  const sub = business.subscription;
  return (
    <div className="flex flex-col gap-2 empty:hidden">
      {business.status === 'BLOCKED' && <Alert tone="danger">{t('cabinet.blockedBanner', { reason: business.blockedReason ?? '—' })}</Alert>}
      {business.status === 'ACTIVE' && !business.acceptingBookings && (
        <Alert tone="warning" action={<Button asChild size="sm" variant="outline"><Link href="/app/subscription">{t('cabinet.subscription')}</Link></Button>}>{t('cabinet.expiredBanner')}</Alert>
      )}
      {business.acceptingBookings && sub?.status === 'TRIALING' && sub.trialEndsAt && (
        <p className="text-[13px] text-fg-muted">{t('cabinet.trialBanner', { date: f.date(sub.trialEndsAt) })}</p>
      )}
      {business.onboardingStep < 7 && (
        <Alert tone="info" action={<Button asChild size="sm"><Link href="/onboarding">{t('common.continue')}</Link></Button>}>{t('cabinet.finishOnboarding')}</Alert>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const ws = useWorkspace();
  const logout = useLogout();
  const [more, setMore] = React.useState(false);
  const items = NAV.filter((n) => (!n.managerOnly || ws.isManager));
  const primary = ws.isManager
    ? ['/app/dashboard', '/app/today', '/app/calendar', '/app/clients']
    : ['/app/today', '/app/calendar', '/app/schedule', '/app/clients'];
  const tabItems = primary.map((h) => items.find((i) => i.href === h)!).filter(Boolean);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const switcher = ws.me.memberships.length > 1 && (
    <Select aria-label={t('cabinet.switchBusiness')} value={ws.businessId} onChange={(e) => ws.switchBusiness(e.target.value)} className="h-9 text-[14px]">
      {ws.me.memberships.map((m) => <option key={m.businessId} value={m.businessId}>{m.businessName}</option>)}
    </Select>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-3 py-4 lg:flex">
        <Link href="/" className="mb-5 px-2"><Logo /></Link>
        <div className="mb-4 px-1">
          {switcher || <p className="truncate px-1 text-[14px] font-semibold">{ws.business?.name ?? '…'}</p>}
          <p className="mt-0.5 px-1 text-[12px] text-fg-subtle">{t(`role.${ws.role}`)}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {items.map(({ href, key, icon: Icon }) => (
            <Link key={href} href={href} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-[14.5px] transition-colors', isActive(href) ? 'bg-surface-2 font-medium text-fg' : 'text-fg-muted hover:bg-surface-2/60 hover:text-fg')}>
              <Icon className="size-[18px]" />{t(key)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 border-t border-border pt-3">
          <LanguageSwitch />
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={logout} aria-label={t('common.logout')} className="ml-auto"><LogOut /></Button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-bg/85 px-4 backdrop-blur-md lg:hidden">
          <Link href="/" aria-label="BARBERFLOW"><Logo compact /></Link>
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{ws.business?.name ?? ''}</p>
          <LanguageSwitch />
          <ThemeToggle />
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-8">
          <Banners />
          <div className="mt-1">{children}</div>
        </main>

        {/* Mobile tab bar */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label={t('nav.menu')}>
          <div className="mx-auto grid max-w-md grid-cols-5">
            {tabItems.map(({ href, key, icon: Icon }) => (
              <Link key={href} href={href} className={cn('flex flex-col items-center gap-1 py-2 text-[11px] font-medium', isActive(href) ? 'text-fg' : 'text-fg-subtle')}>
                <Icon className="size-[22px]" /><span className="max-w-full truncate px-1">{t(key)}</span>
              </Link>
            ))}
            <button type="button" onClick={() => setMore(true)} className="flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-fg-subtle">
              <MoreHorizontal className="size-[22px]" />{t('nav.more')}
            </button>
          </div>
        </nav>
        <Sheet open={more} onOpenChange={setMore} title={ws.business?.name ?? t('nav.menu')} closeLabel={t('common.close')}>
          <div className="flex flex-col gap-3">
            {switcher}
            <div className="grid grid-cols-3 gap-2">
              {items.filter((i) => !primary.includes(i.href)).map(({ href, key, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setMore(false)} className="flex flex-col items-center gap-2 rounded-2xl bg-surface-2 px-2 py-4 text-center text-[13px] font-medium">
                  <Icon className="size-5" />{t(key)}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <LanguageSwitch />
              <Button asChild variant="ghost" size="sm"><Link href="/me">{t('nav.myBookings')}</Link></Button>
              <Button variant="ghost" size="sm" onClick={logout} className="ml-auto"><LogOut />{t('common.logout')}</Button>
            </div>
          </div>
        </Sheet>
      </div>
    </div>
  );
}

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const { t } = useI18n();
  React.useEffect(() => {
    if (me.data === null) router.replace('/login?next=/app');
  }, [me.data, router]);
  if (me.isLoading || me.data === null) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  if (me.isError || !me.data) return <div className="grid min-h-dvh place-items-center"><Button onClick={() => me.refetch()}>{t('common.retry')}</Button></div>;
  if (me.data.memberships.length === 0) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo />
        <h1 className="text-[22px] font-semibold tracking-tight">{t('cabinet.noBusiness')}</h1>
        <p className="text-fg-muted">{t('cabinet.noBusinessText')}</p>
        <Button asChild size="lg"><Link href="/onboarding">{t('cabinet.createBusiness')}</Link></Button>
        <Button asChild variant="ghost"><Link href="/me">{t('nav.myBookings')}</Link></Button>
      </div>
    );
  }
  return (
    <WorkspaceProvider me={me.data}>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
