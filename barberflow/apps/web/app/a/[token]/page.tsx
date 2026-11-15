'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, CalendarPlus, Clock, ListChecks, MapPin, RotateCcw, Scissors, Wallet, XCircle } from 'lucide-react';
import { Alert, Avatar, Button, Card, Skeleton } from '@barberflow/ui';
import type { AppointmentDto } from '@barberflow/shared';
import { SiteHeader } from '@/components/site-header';
import { ErrorState } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { CopyField } from '@/components/copy-field';
import { RescheduleSheet } from '@/components/booking/reschedule-sheet';
import { CancelSheet } from '@/components/booking/cancel-sheet';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { localDateOf, mapUrl, useFormat } from '@/lib/format';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { rememberToken } from '@/lib/device-bookings';

/**
 * A client's booking, opened by its secret link. No account: possession of the link is the
 * permission to view, reschedule or cancel. The client pays the barber on site.
 */
function Detail() {
  const { token } = useParams<{ token: string }>();
  const isNew = useSearchParams().get('new') === '1';
  const { t } = useI18n();
  const base = `/public/appointments/${token}`;
  const q = useQuery({ queryKey: ['guest-appointment', token], queryFn: () => api<AppointmentDto>(base) });
  const a = q.data;
  const f = useFormat(a?.business?.timezone);
  const [resched, setResched] = React.useState(false);
  const [cancel, setCancel] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [link, setLink] = React.useState('');

  React.useEffect(() => {
    setLink(`${window.location.origin}/a/${token}`);
    // Opening a link on another device adds it to that device's "Мои записи".
    if (q.data) rememberToken(token);
  }, [token, q.data]);

  const refresh = (msg: string) => {
    setFlash(msg);
    q.refetch();
  };

  if (q.isLoading) return <div className="flex flex-col gap-3 pt-6"><Skeleton className="h-28" /><Skeleton className="h-56" /></div>;
  if (q.isError || !a || !a.business) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const tooLate = new Date(a.startsAt).getTime() - Date.now() < a.business.cancellationMinHours * 3600_000;
  const active = a.status === 'CONFIRMED' && new Date(a.startsAt).getTime() > Date.now();
  const showSuccess = isNew && a.status === 'CONFIRMED' && !flash;

  return (
    <div className="bf-enter pt-6">
      {showSuccess ? (
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="bf-scale-in grid size-[72px] place-items-center rounded-full bg-primary text-primary-fg">
            <svg viewBox="0 0 24 24" className="bf-check size-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <h1 className="bf-display mt-5 max-w-xs text-[32px]" data-testid="success-title">{t('booking.successTitle')}</h1>
          <p className="mt-3 max-w-sm text-[14.5px] text-fg-muted">{t('booking.successText')}</p>
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{t('appointment.title')}</h1>
          <StatusBadge status={a.status} />
        </div>
      )}
      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Avatar name={a.barber?.name ?? '?'} src={a.barber?.photoUrl} size={48} />
          <div className="min-w-0">
            <p className="font-semibold">{a.barber?.name}</p>
            <p className="truncate text-[13.5px] text-fg-muted">{a.business.name}</p>
          </div>
        </div>
        <div className="flex flex-col divide-y divide-border px-4 text-[15.5px]">
          <p className="flex items-center gap-3 py-3"><CalendarDays className="size-[18px] text-accent" /><span className="font-semibold" data-testid="detail-date">{f.date(localDateOf(a.startsAt, a.business.timezone))}</span></p>
          <p className="flex items-center gap-3 py-3"><Clock className="size-[18px] text-accent" /><span className="font-semibold tabular-nums" data-testid="detail-time">{f.timeRange(a.startsAt, a.endsAt)}</span></p>
          <p className="flex items-center gap-3 py-3"><Scissors className="size-[18px] text-accent" />{a.serviceName}</p>
          {(a.business.address || a.business.city) && <p className="flex items-start gap-3 py-3 text-fg-muted"><MapPin className="mt-0.5 size-[18px] text-accent" />{[a.business.city, a.business.address].filter(Boolean).join(', ')}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-border bg-selected/40 px-4 py-4">
          <span className="font-semibold">{t('booking.cost')}</span>
          <span className="text-[19px] font-extrabold tabular-nums" data-testid="detail-price">{f.money(a.priceUzs)}</span>
        </div>
      </Card>
      <p className="mt-3 flex items-center gap-2 text-[13.5px] text-fg-muted"><Wallet className="size-4 text-accent" />{t('booking.payOnSite')}</p>

      {active && tooLate && <Alert tone="info" className="mt-4">{t('me.tooLate', { hours: a.business.cancellationMinHours })}</Alert>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {active && !tooLate && (
          <>
            <Button variant="outline" onClick={() => setResched(true)} data-testid="reschedule"><CalendarClock />{t('booking.reschedule')}</Button>
            <Button variant="outline" className="text-danger" onClick={() => setCancel(true)} data-testid="cancel"><XCircle />{t('booking.cancelBooking')}</Button>
          </>
        )}
        {active && (
          <Button
            variant="outline"
            className="col-span-2"
            data-testid="add-to-calendar"
            onClick={() => downloadIcs(`barberflow-${a.id.slice(0, 8)}.ics`, buildIcs({
              uid: a.id, start: a.startsAt, end: a.endsAt, title: `${a.serviceName} · ${a.business!.name}`,
              location: [a.business!.city, a.business!.address].filter(Boolean).join(', '),
              description: [a.barber?.name, link].filter(Boolean).join('\n'),
            }))}
          >
            <CalendarPlus />{t('booking.addToCalendar')}
          </Button>
        )}
        <Button asChild variant="outline" className="col-span-2">
          <a href={mapUrl({ ...a.business })} target="_blank" rel="noreferrer"><MapPin />{t('booking.openMap')}</a>
        </Button>
        <Button asChild variant="secondary" className="col-span-2">
          <Link href={`/s/${a.business.slug}/book?barber=${a.barberId}&service=${a.serviceId}`}><RotateCcw />{t('booking.repeat')}</Link>
        </Button>
        <Button asChild className="col-span-2" size="lg">
          <Link href="/me"><ListChecks />{t('nav.myBookings')}</Link>
        </Button>
      </div>

      {active && link && (
        <Card className="mt-6 p-4">
          <p className="font-semibold">{t('me.manageLinkTitle')}</p>
          <p className="mb-3 mt-1 text-[13.5px] text-fg-muted">{t('me.manageLinkText')}</p>
          <CopyField value={link} />
        </Card>
      )}

      <RescheduleSheet
        open={resched}
        onOpenChange={setResched}
        timezone={a.business.timezone}
        currentStart={a.startsAt}
        mode="client"
        endpoints={{ dates: `${base}/dates`, slots: (d) => `${base}/slots?date=${d}`, submit: `${base}/reschedule` }}
        onDone={() => refresh(t('me.rescheduled'))}
      />
      <CancelSheet open={cancel} onOpenChange={setCancel} endpoint={`${base}/cancel`} onDone={() => refresh(t('me.cancelled'))} />
    </div>
  );
}

export default function GuestAppointmentPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-16">
        <React.Suspense><Detail /></React.Suspense>
      </main>
    </>
  );
}
