'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarOff, Plus } from 'lucide-react';
import { Avatar, Button, Card, EmptyState, Select, Stat, cn } from '@barberflow/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { todayIso, useFormat } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { dayRange, freeGaps } from '@/lib/calendar';
import { ErrorState, ListSkeleton } from '@/components/states';
import { StatusBadge, statusBar } from '@/components/status-badge';
import { AppointmentSheet } from '@/components/cabinet/appointment-sheet';
import { ManualBookingSheet } from '@/components/cabinet/manual-booking-sheet';
import type { CalendarFeed } from '@/components/cabinet/types';

export default function TodayPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  const f = useFormat(ws.timezone);
  const date = todayIso(ws.timezone);
  const [barberId, setBarberId] = React.useState<string | null>(ws.barberId);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState(false);
  const range = dayRange(date, ws.timezone);
  const feed = useQuery({
    queryKey: ['calendar', ws.businessId, 'today', barberId],
    queryFn: () => api<CalendarFeed>(`/businesses/${ws.businessId}/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}${barberId ? `&barberId=${barberId}` : ''}`),
    refetchInterval: 60_000,
  });
  React.useEffect(() => {
    if (!barberId && feed.data?.barbers.length) setBarberId(feed.data.barbers[0].id);
  }, [barberId, feed.data]);

  const barber = feed.data?.barbers.find((b) => b.id === barberId) ?? feed.data?.barbers[0];
  const appts = (feed.data?.appointments ?? []).filter((a) => a.barberId === barber?.id);
  const live = appts.filter((a) => a.status !== 'CANCELLED');
  const now = Date.now();
  const next = live.find((a) => a.status === 'CONFIRMED' && new Date(a.endsAt).getTime() > now);
  const gaps = feed.data && barber ? freeGaps(feed.data, barber, date, ws.timezone, new Date()) : [];
  const completed = appts.filter((a) => a.status === 'COMPLETED').length;
  const dayOff = barber && !barber.workingHours.some((h) => h.weekday === ((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1);

  return (
    <div className="bf-enter flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13.5px] text-fg-muted">{f.dateWeekday(date)}</p>
          <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{t('cabinet.today')}</h1>
        </div>
        <div className="flex items-center gap-2">
          {ws.isManager && feed.data && feed.data.barbers.length > 1 && (
            <Select value={barber?.id ?? ''} onChange={(e) => setBarberId(e.target.value)} className="h-10 w-auto" aria-label={t('booking.barber')}>
              {feed.data.barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          <Button onClick={() => setManual(true)} data-testid="new-appointment"><Plus />{t('today.newAppointment')}</Button>
        </div>
      </div>

      {feed.isLoading ? <ListSkeleton /> : feed.isError ? <ErrorState error={feed.error} onRetry={() => feed.refetch()} /> : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label={t('today.appointments')} value={live.length} />
            <Stat label={t('today.completed')} value={completed} />
            <Stat label={t('today.free')} value={gaps.length} />
          </div>

          <Card className="p-4">
            <p className="text-[13px] font-medium text-fg-muted">{t('today.next')}</p>
            {next ? (
              <button type="button" onClick={() => setOpenId(next.id)} className="mt-2 flex w-full items-center gap-3 text-left" data-testid="next-client">
                <Avatar name={next.customer?.name ?? '?'} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{next.customer?.name}</p>
                  <p className="text-[13.5px] text-fg-muted">{next.serviceName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[22px] font-extrabold tabular-nums">{f.time(next.startsAt)}</p>
                  <p className="text-[12.5px] text-fg-subtle">
                    {new Date(next.startsAt).getTime() <= now ? t('today.now') : t('today.in', { m: Math.round((new Date(next.startsAt).getTime() - now) / 60000) })}
                  </p>
                </div>
              </button>
            ) : <p className="mt-1.5 text-[14.5px] text-fg-muted">{dayOff ? t('today.dayOff') : t('today.noNext')}</p>}
          </Card>

          {gaps.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] font-medium text-fg-muted">{t('today.free')}</p>
              <div className="flex flex-wrap gap-2">
                {gaps.map((g) => (
                  <span key={g.start.toISOString()} className="rounded-full border border-dashed border-accent/70 bg-surface-2 px-3 py-1.5 text-[13.5px] font-semibold tabular-nums text-primary">
                    {f.timeRange(g.start, g.end)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <section>
            <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t('today.list')}</h2>
            {appts.length === 0 ? (
              <Card><EmptyState icon={CalendarOff} title={dayOff ? t('today.dayOff') : t('today.noAppointments')} className="py-10" /></Card>
            ) : (
              <Card className="divide-y divide-border overflow-hidden">
                {appts.map((a) => (
                  <button key={a.id} type="button" onClick={() => setOpenId(a.id)} className={cn('flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left transition-colors hover:bg-surface-3/40', statusBar[a.status], a.status === 'CANCELLED' && 'opacity-60')}>
                    <span className="w-24 shrink-0 text-[14.5px] font-bold tabular-nums">{f.timeRange(a.startsAt, a.endsAt)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.customer?.name}</span>
                      <span className="block truncate text-[13px] text-fg-muted">{a.serviceName} · {f.money(a.priceUzs)}</span>
                    </span>
                    <StatusBadge status={a.status} />
                  </button>
                ))}
              </Card>
            )}
          </section>
        </>
      )}
      <AppointmentSheet id={openId} onClose={() => setOpenId(null)} />
      <ManualBookingSheet open={manual} onOpenChange={setManual} defaultBarberId={barber?.id} />
    </div>
  );
}
