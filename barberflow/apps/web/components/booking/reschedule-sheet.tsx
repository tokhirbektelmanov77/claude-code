'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Field, Input, Sheet, Skeleton } from '@barberflow/ui';
import type { SlotDto } from '@barberflow/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { localDateOf, todayIso, useFormat } from '@/lib/format';
import { DateCalendar } from './date-calendar';
import { SlotGrid } from './slot-grid';

/**
 * Reschedule picker shared by the client ("Мои записи") and staff calendars.
 * Client mode shows only bookable dates; staff mode allows any date (lead time/horizon ignored).
 */
export function RescheduleSheet({
  open, onOpenChange, timezone, currentStart, horizonDays = 30, mode, endpoints, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  timezone: string;
  currentStart: string;
  horizonDays?: number;
  mode: 'client' | 'staff';
  endpoints: { dates?: string; slots: (date: string) => string; submit: string };
  onDone: () => void;
}) {
  const { t } = useI18n();
  const f = useFormat(timezone);
  const [date, setDate] = React.useState<string | null>(mode === 'staff' ? localDateOf(currentStart, timezone) : null);
  const [time, setTime] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const dates = useQuery({
    queryKey: ['reschedule-dates', endpoints.dates],
    queryFn: () => api<{ dates: string[] }>(endpoints.dates!),
    enabled: open && mode === 'client' && Boolean(endpoints.dates),
  });
  const effectiveDate = mode === 'client' ? date ?? dates.data?.dates[0] ?? null : date;
  const slots = useQuery({
    queryKey: ['reschedule-slots', endpoints.submit, effectiveDate],
    queryFn: () => api<{ slots: SlotDto[] }>(endpoints.slots(effectiveDate!)),
    enabled: open && Boolean(effectiveDate),
  });

  async function submit() {
    if (!time) return;
    setBusy(true);
    setError(null);
    try {
      await api(endpoints.submit, { body: { startsAt: time } });
      onDone();
      onOpenChange(false);
    } catch (e) {
      setError(t(errorKey(e)));
      slots.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('me.rescheduleTitle')}
      description={`${f.dateWeekday(currentStart)}, ${f.time(currentStart)}`}
      closeLabel={t('common.close')}
      footer={<Button block size="lg" disabled={!time} loading={busy} onClick={submit} data-testid="reschedule-submit">{t('common.confirm')}</Button>}
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {mode === 'client' ? (
          dates.isLoading ? <Skeleton className="h-72" /> : dates.data && (
            <DateCalendar available={dates.data.dates} value={effectiveDate} onChange={(d) => { setDate(d); setTime(null); }} timezone={timezone} horizonDays={horizonDays} />
          )
        ) : (
          <Field label={t('common.date')}>
            <Input type="date" value={date ?? ''} min={todayIso(timezone)} onChange={(e) => { setDate(e.target.value || null); setTime(null); }} />
          </Field>
        )}
        {effectiveDate && <SlotGrid slots={slots.data?.slots} loading={slots.isLoading} value={time} onChange={setTime} timezone={timezone} />}
      </div>
    </Sheet>
  );
}
