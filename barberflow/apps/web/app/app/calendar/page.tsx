'use client';
import * as React from 'react';
import { DateTime } from 'luxon';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Plus, UserX } from 'lucide-react';
import { Button, Segmented, Select, Skeleton, cn } from '@barberflow/ui';
import type { AppointmentDto } from '@barberflow/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { minutesInDay, todayIso, useFormat } from '@/lib/format';
import { useBarbers, useWorkspace } from '@/lib/workspace';
import { dayRange } from '@/lib/calendar';
import { ErrorState } from '@/components/states';
import { AppointmentSheet } from '@/components/cabinet/appointment-sheet';
import { ManualBookingSheet } from '@/components/cabinet/manual-booking-sheet';
import type { CalendarBarber, CalendarException, CalendarFeed } from '@/components/cabinet/types';

const PX = 1.15; // pixels per minute

// Status = bar colour + background tint + icon + legend; never colour alone (readability, colour-blind safe).
const tone: Record<AppointmentDto['status'], string> = {
  CONFIRMED: 'border-l-st-confirmed bg-surface text-fg',
  COMPLETED: 'border-l-st-completed bg-st-completed/16 text-fg',
  NO_SHOW: 'border-l-st-noshow bg-st-noshow/18 text-fg',
  CANCELLED: 'border-l-st-cancelled bg-neutral/40 text-fg-muted line-through',
};
const statusIcon: Partial<Record<AppointmentDto['status'], React.ComponentType<{ className?: string }>>> = {
  COMPLETED: Check,
  NO_SHOW: UserX,
};

interface Column { key: string; date: string; barber: CalendarBarber; label: string; sub?: string }

export default function CalendarPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  const f = useFormat(ws.timezone);
  const [view, setView] = React.useState<'day' | 'week'>('day');
  const [date, setDate] = React.useState(todayIso(ws.timezone));
  const [barberFilter, setBarberFilter] = React.useState<string>(ws.isManager ? 'all' : ws.barberId ?? 'all');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState<{ date: string; barberId: string | null } | null>(null);

  const anchor = DateTime.fromISO(date, { zone: ws.timezone });
  const start = view === 'week' ? anchor.startOf('week') : anchor;
  const days = view === 'week' ? 7 : 1;
  const range = dayRange(start.toISODate()!, ws.timezone, days);
  const feed = useQuery({
    queryKey: ['calendar', ws.businessId, view, start.toISODate(), barberFilter],
    queryFn: () => api<CalendarFeed>(`/businesses/${ws.businessId}/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}${barberFilter !== 'all' ? `&barberId=${barberFilter}` : ''}`),
    refetchInterval: 60_000,
  });
  // Week view shows one barber.
  React.useEffect(() => {
    if (view === 'week' && barberFilter === 'all' && feed.data?.barbers.length) setBarberFilter(feed.data.barbers[0].id);
  }, [view, barberFilter, feed.data]);

  const allBarbers = feed.data?.barbers ?? [];
  const barberOptions = (useBarbers().data ?? []).filter((b) => b.isActive);
  const columns: Column[] = view === 'day'
    ? allBarbers.map((b) => ({ key: b.id, date, barber: b, label: b.name }))
    : allBarbers.slice(0, 1).flatMap((b) => Array.from({ length: 7 }, (_, i) => {
      const d = start.plus({ days: i });
      return { key: d.toISODate()!, date: d.toISODate()!, barber: b, label: `${f.weekdayShort(d.weekday)} ${d.day}`, sub: d.toISODate() === todayIso(ws.timezone) ? t('common.today') : undefined };
    }));

  const hours = allBarbers.flatMap((b) => b.workingHours);
  const minStart = Math.max(0, Math.floor((Math.min(...hours.map((h) => h.startMin), 9 * 60) - 30) / 60) * 60);
  const maxEnd = Math.min(24 * 60, Math.ceil((Math.max(...hours.map((h) => h.endMin), 20 * 60) + 30) / 60) * 60);
  const height = (maxEnd - minStart) * PX;
  const y = (min: number) => (min - minStart) * PX;

  const shift = (dir: 1 | -1) => setDate(anchor.plus(view === 'week' ? { weeks: dir } : { days: dir }).toISODate()!);
  const title = view === 'day' ? f.dateWeekday(date) : `${f.dayMonth(start.toISODate()!)} – ${f.dayMonth(start.plus({ days: 6 }).toISODate()!)}`;
  const nowMin = minutesInDay(new Date().toISOString(), ws.timezone);
  const today = todayIso(ws.timezone);

  return (
    <div className="bf-enter flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{t('cabinet.calendar')}</h1>
        <Button onClick={() => setManual({ date, barberId: barberFilter !== 'all' ? barberFilter : ws.barberId })}><Plus />{t('today.newAppointment')}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: 'day', label: t('calendar.day') }, { value: 'week', label: t('calendar.week') }]} />
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label={t('calendar.prev')}><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => setDate(today)}>{t('calendar.goToday')}</Button>
          <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label={t('calendar.next')}><ChevronRight /></Button>
        </div>
        <p className="text-[15px] font-medium" data-testid="calendar-title">{title}</p>
        {ws.isManager && (
          <Select value={barberFilter} onChange={(e) => setBarberFilter(e.target.value)} className="ml-auto h-10 w-auto" aria-label={t('booking.barber')}>
            {view === 'day' && <option value="all">{t('calendar.allBarbers')}</option>}
            {barberOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
      </div>

      {feed.isLoading ? <Skeleton className="h-[480px]" /> : feed.isError ? <ErrorState error={feed.error} onRetry={() => feed.refetch()} /> : (
        <div className="overflow-hidden rounded-2xl border border-border bg-bg">
          <div className="overflow-x-auto">
            <div className="min-w-full" style={{ width: Math.max(columns.length * (view === 'week' ? 110 : 160) + 52, 0) }}>
              <div className="sticky top-0 z-10 flex border-b border-border bg-bg">
                <div className="w-[52px] shrink-0" />
                {columns.map((c) => (
                  <div key={c.key} className="min-w-0 flex-1 border-l border-border px-2 py-2.5 text-center">
                    <p className={cn('truncate text-[13.5px] font-bold', c.date === today && view === 'week' && 'text-primary underline decoration-accent decoration-2 underline-offset-4')}>{c.label}</p>
                    {c.sub && <p className="text-[11px] text-fg-subtle">{c.sub}</p>}
                  </div>
                ))}
              </div>
              <div className="relative flex" style={{ height }}>
                <div className="relative w-[52px] shrink-0">
                  {Array.from({ length: (maxEnd - minStart) / 60 + 1 }, (_, i) => minStart + i * 60).map((m) => (
                    <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-fg-subtle" style={{ top: y(m) }}>{String(m / 60).padStart(2, '0')}:00</span>
                  ))}
                </div>
                {columns.map((c) => (
                  <DayColumn
                    key={c.key}
                    column={c}
                    feed={feed.data!}
                    y={y}
                    height={height}
                    minStart={minStart}
                    maxEnd={maxEnd}
                    nowMin={c.date === today ? nowMin : null}
                    onOpen={setOpenId}
                    onEmpty={() => setManual({ date: c.date, barberId: c.barber.id })}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-fg-muted" data-testid="calendar-legend">
        {(['CONFIRMED', 'COMPLETED', 'NO_SHOW'] as const).map((st) => {
          const Icon = statusIcon[st];
          return (
            <span key={st} className="inline-flex items-center gap-1.5">
              <span className={cn('inline-flex h-4 w-5 items-center justify-center rounded-[4px] border border-l-[3px] border-border', tone[st])}>{Icon && <Icon className="size-2.5" />}</span>
              {t(`status.${st}`)}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1.5"><span className="h-4 w-5 rounded-[4px] border border-border bg-surface-2" />{t('calendar.free')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="bf-hatch h-4 w-5 rounded-[4px] border border-border" />{t('calendar.off')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-4 w-5 rounded-[4px] border border-st-block/50 bg-st-block/20" />{t('calendar.blocked')}</span>
      </div>
      <AppointmentSheet id={openId} onClose={() => setOpenId(null)} />
      <ManualBookingSheet open={Boolean(manual)} onOpenChange={(o) => !o && setManual(null)} defaultDate={manual?.date} defaultBarberId={manual?.barberId} />
    </div>
  );
}

function DayColumn({
  column, feed, y, height, minStart, maxEnd, nowMin, onOpen, onEmpty,
}: {
  column: Column; feed: CalendarFeed; y: (m: number) => number; height: number; minStart: number; maxEnd: number; nowMin: number | null;
  onOpen: (id: string) => void; onEmpty: () => void;
}) {
  const { t } = useI18n();
  const { timezone } = useWorkspace();
  const f = useFormat(timezone);
  const dt = DateTime.fromISO(column.date, { zone: timezone });
  const work = column.barber.workingHours.filter((h) => h.weekday === dt.weekday);
  const dayStart = dt.startOf('day').toMillis();
  const dayEnd = dt.endOf('day').toMillis();
  const clampMin = (iso: string) => Math.min(maxEnd, Math.max(minStart, Math.round((new Date(iso).getTime() - dayStart) / 60000)));
  const inDay = (s: string, e: string) => new Date(s).getTime() < dayEnd && new Date(e).getTime() > dayStart;
  const appts = feed.appointments.filter((a) => a.barberId === column.barber.id && a.status !== 'CANCELLED' && inDay(a.startsAt, a.endsAt));
  const exceptions: CalendarException[] = feed.exceptions.filter((e) => e.barberId === column.barber.id && inDay(e.startsAt, e.endsAt));

  return (
    <div className="bf-hatch relative min-w-0 flex-1 border-l border-border" style={{ height }}>
      {work.map((w) => (
        <button
          key={w.startMin}
          type="button"
          onClick={onEmpty}
          aria-label={t('today.newAppointment')}
          className="absolute inset-x-0 bg-surface-2 transition-colors hover:bg-surface-3/50"
          style={{ top: y(w.startMin), height: (w.endMin - w.startMin) * PX }}
        />
      ))}
      {Array.from({ length: (maxEnd - minStart) / 60 }, (_, i) => (
        <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-border/60" style={{ top: i * 60 * PX }} />
      ))}
      {exceptions.map((e) => {
        const s = clampMin(e.startsAt);
        const en = clampMin(e.endsAt);
        return (
          <div key={e.id} className="pointer-events-none absolute inset-x-1 rounded-lg border border-st-block/50 bg-st-block/18 px-2 py-1 text-[11.5px] font-semibold text-st-block" style={{ top: y(s), height: Math.max(18, (en - s) * PX) }}>
            {t(`schedule.type_${e.type}`)}{e.note ? ` · ${e.note}` : ''}
          </div>
        );
      })}
      {appts.map((a) => {
        const s = clampMin(a.startsAt);
        const en = clampMin(a.endsAt);
        const buf = clampMin(a.blockedUntil);
        const h = Math.max(22, (en - s) * PX - 2);
        return (
          <React.Fragment key={a.id}>
            {buf > en && <div className="bf-hatch pointer-events-none absolute inset-x-1 rounded-b-lg border border-t-0 border-border" style={{ top: y(en), height: (buf - en) * PX }} />}
            <button
              type="button"
              onClick={() => onOpen(a.id)}
              data-testid="calendar-appointment"
              aria-label={`${f.time(a.startsAt)} ${a.customer?.name ?? ''} · ${t(`status.${a.status}`)}`}
              className={cn('absolute inset-x-1 overflow-hidden rounded-lg border border-l-4 border-border px-2 py-1 text-left shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform hover:z-10 hover:scale-[1.015]', tone[a.status])}
              style={{ top: y(s) + 1, height: h }}
            >
              <p className="flex items-center gap-1 truncate text-[12.5px] font-bold tabular-nums">
                {(() => { const Icon = statusIcon[a.status]; return Icon ? <Icon className="size-3.5 shrink-0" /> : null; })()}
                <span className="truncate">{f.time(a.startsAt)} {a.customer?.name}</span>
              </p>
              {h > 36 && <p className="truncate text-[11.5px] text-fg-muted">{a.serviceName}</p>}
            </button>
          </React.Fragment>
        );
      })}
      {nowMin !== null && nowMin >= minStart && nowMin <= maxEnd && (
        <div className="pointer-events-none absolute inset-x-0 z-[5] h-px bg-accent" style={{ top: y(nowMin) }}>
          <span className="absolute -left-1 -top-1 size-2 rounded-full bg-accent" />
        </div>
      )}
    </div>
  );
}
