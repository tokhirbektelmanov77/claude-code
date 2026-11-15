'use client';
import { CalendarX2 } from 'lucide-react';
import { cn, EmptyState, Skeleton } from '@barberflow/ui';
import type { SlotDto } from '@barberflow/shared';
import { useI18n } from '@/lib/i18n';
import { minutesInDay, useFormat } from '@/lib/format';

export function SlotGrid({
  slots, loading, value, onChange, timezone,
}: { slots: SlotDto[] | undefined; loading: boolean; value: string | null; onChange: (start: string) => void; timezone: string }) {
  const { t } = useI18n();
  const f = useFormat(timezone);
  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" aria-busy="true">
        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
      </div>
    );
  }
  if (!slots?.length) {
    return <EmptyState icon={CalendarX2} title={t('booking.noSlots')} text={t('booking.noSlotsHint')} className="py-8" />;
  }
  const groups = [
    { key: 'morning', label: t('booking.morning'), items: slots.filter((s) => minutesInDay(s.start, timezone) < 12 * 60) },
    { key: 'afternoon', label: t('booking.afternoon'), items: slots.filter((s) => { const m = minutesInDay(s.start, timezone); return m >= 12 * 60 && m < 17 * 60; }) },
    { key: 'evening', label: t('booking.evening'), items: slots.filter((s) => minutesInDay(s.start, timezone) >= 17 * 60) },
  ].filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-2 text-[13px] font-medium text-fg-subtle">{g.label}</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {g.items.map((s) => {
              const selected = value === s.start;
              const label = f.time(s.start);
              return (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => onChange(s.start)}
                  aria-pressed={selected}
                  data-testid={`slot-${label}`}
                  className={cn(
                    'h-11 rounded-xl border text-[15px] font-medium tabular-nums transition-all duration-150 active:scale-95',
                    selected ? 'border-primary bg-primary text-primary-fg shadow-sm' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
