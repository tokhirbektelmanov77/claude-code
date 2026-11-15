'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Info } from 'lucide-react';
import { Card, EmptyState, Skeleton, Stat } from '@barberflow/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { ErrorState } from '@/components/states';

interface Dashboard {
  todayCount: number; weekCount: number; completed: number; cancelled: number; noShow: number; activeBarbers: number; completedPriceValueUzs: number;
  upcoming: { id: string; startsAt: string; endsAt: string; serviceName: string; barberName: string; customerName: string; priceUzs: number }[];
}

export default function DashboardPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  const f = useFormat(ws.timezone);
  const q = useQuery({ queryKey: ['dashboard', ws.businessId], queryFn: () => api<Dashboard>(`/businesses/${ws.businessId}/dashboard`), refetchInterval: 60_000 });
  return (
    <div className="bf-enter flex flex-col gap-5">
      <h1 className="text-[26px] font-semibold tracking-tight">{t('dashboard.title')}</h1>
      {q.isLoading ? <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data && (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="dashboard-stats">
              <Stat label={t('dashboard.todayCount')} value={q.data.todayCount} />
              <Stat label={t('dashboard.weekCount')} value={q.data.weekCount} />
              <Stat label={t('dashboard.completed')} value={q.data.completed} />
              <Stat label={t('dashboard.cancelled')} value={q.data.cancelled} />
              <Stat label={t('dashboard.noShow')} value={q.data.noShow} />
              <Stat label={t('dashboard.activeBarbers')} value={q.data.activeBarbers} />
            </div>
            <Card className="p-4">
              <p className="text-[13px] text-fg-muted">{t('dashboard.priceValue')}</p>
              <p className="mt-1.5 text-[26px] font-semibold tracking-tight tabular-nums">{f.money(q.data.completedPriceValueUzs)}</p>
              <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-fg-subtle"><Info className="mt-px size-3.5 shrink-0" />{t('dashboard.priceValueHint')}</p>
            </Card>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold tracking-tight">{t('dashboard.upcoming')}</h2>
                <Link href="/app/calendar" className="text-[13.5px] text-fg-muted hover:text-fg">{t('cabinet.calendar')} →</Link>
              </div>
              {q.data.upcoming.length === 0 ? <Card><EmptyState icon={CalendarClock} title={t('dashboard.noUpcoming')} className="py-8" /></Card> : (
                <Card className="divide-y divide-border">
                  {q.data.upcoming.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-3 text-[14.5px]">
                      <span className="w-[92px] shrink-0 tabular-nums text-fg-muted">{f.dayMonth(a.startsAt)} {f.time(a.startsAt)}</span>
                      <span className="min-w-0 flex-1 truncate"><span className="font-medium">{a.customerName}</span> · {a.serviceName}</span>
                      <span className="hidden text-fg-muted sm:inline">{a.barberName}</span>
                    </div>
                  ))}
                </Card>
              )}
            </section>
          </>
        )}
    </div>
  );
}
