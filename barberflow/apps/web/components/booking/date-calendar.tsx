'use client';
import * as React from 'react';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@barberflow/ui';
import { useI18n } from '@/lib/i18n';
import { useFormat } from '@/lib/format';

/**
 * Month calendar. Only `available` dates are selectable; everything else (past, beyond horizon,
 * days off, fully booked) is visibly disabled.
 */
export function DateCalendar({
  available, value, onChange, timezone, horizonDays,
}: { available: string[]; value: string | null; onChange: (d: string) => void; timezone: string; horizonDays: number }) {
  const { t } = useI18n();
  const f = useFormat(timezone);
  const today = DateTime.now().setZone(timezone).startOf('day');
  const last = today.plus({ days: horizonDays });
  const availableSet = React.useMemo(() => new Set(available), [available]);
  const initial = value ? DateTime.fromISO(value, { zone: timezone }) : available[0] ? DateTime.fromISO(available[0], { zone: timezone }) : today;
  const [month, setMonth] = React.useState(initial.startOf('month'));

  const start = month.startOf('week'); // luxon weeks start on Monday
  const days = Array.from({ length: 42 }, (_, i) => start.plus({ days: i }));
  const weeks = days[35].month !== month.month ? days.slice(0, 35) : days;
  const canPrev = month > today.startOf('month');
  const canNext = month.plus({ months: 1 }) <= last.startOf('month');

  return (
    <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(month.minus({ months: 1 }))} disabled={!canPrev} aria-label={t('calendar.prev')} className="grid size-9 place-items-center rounded-full text-fg-muted transition hover:bg-surface-2 disabled:opacity-30">
          <ChevronLeft className="size-5" />
        </button>
        <p className="text-[15px] font-semibold tracking-tight">{f.monthYear(month.toISODate()!)}</p>
        <button type="button" onClick={() => setMonth(month.plus({ months: 1 }))} disabled={!canNext} aria-label={t('calendar.next')} className="grid size-9 place-items-center rounded-full text-fg-muted transition hover:bg-surface-2 disabled:opacity-30">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid">
        {[1, 2, 3, 4, 5, 6, 7].map((w) => (
          <div key={w} className="pb-1 text-[12px] font-medium text-fg-subtle">{f.weekdayShort(w)}</div>
        ))}
        {weeks.map((d) => {
          const iso = d.toISODate()!;
          const inMonth = d.month === month.month;
          const enabled = availableSet.has(iso);
          const selected = value === iso;
          const isToday = d.hasSame(today, 'day');
          return (
            <button
              key={iso}
              type="button"
              disabled={!enabled}
              onClick={() => onChange(iso)}
              aria-pressed={selected}
              aria-label={f.dateWeekday(iso)}
              data-testid={`day-${iso}`}
              className={cn(
                'relative mx-auto grid aspect-square w-full max-w-11 place-items-center rounded-full text-[15px] tabular-nums transition-all duration-150',
                !inMonth && 'invisible',
                enabled ? 'font-semibold text-fg hover:bg-surface-2' : 'text-fg-subtle/50',
                selected && 'bg-primary text-primary-fg hover:bg-primary',
              )}
            >
              {d.day}
              {enabled && !selected && <span className="absolute bottom-1 size-1 rounded-full bg-accent" aria-hidden />}
              {isToday && !selected && <span className="absolute inset-0 rounded-full ring-1 ring-border-strong" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
