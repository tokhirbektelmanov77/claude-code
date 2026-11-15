'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, MapPin, RotateCcw, XCircle } from 'lucide-react';
import { Alert, Avatar, Button, Card, Skeleton } from '@barberflow/ui';
import type { AppointmentDto } from '@barberflow/shared';
import { SiteHeader } from '@/components/site-header';
import { ErrorState } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { RescheduleSheet } from '@/components/booking/reschedule-sheet';
import { CancelSheet } from '@/components/booking/cancel-sheet';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMe } from '@/lib/auth';
import { localDateOf, mapUrl, useFormat } from '@/lib/format';

function Detail() {
  const { id } = useParams<{ id: string }>();
  const isNew = useSearchParams().get('new') === '1';
  const router = useRouter();
  const { t } = useI18n();
  const qc = useQueryClient();
  const me = useMe();
  const q = useQuery({ queryKey: ['my-appointment', id], queryFn: () => api<AppointmentDto>(`/me/appointments/${id}`) });
  const a = q.data;
  const f = useFormat(a?.business?.timezone);
  const [resched, setResched] = React.useState(false);
  const [cancel, setCancel] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (me.data === null) router.replace(`/login?next=/me/appointments/${id}`);
  }, [me.data, router, id]);

  const refresh = (msg: string) => {
    setFlash(msg);
    qc.invalidateQueries({ queryKey: ['my-appointments'] });
    q.refetch();
  };

  if (q.isLoading || me.isLoading) return <div className="flex flex-col gap-3 pt-6"><Skeleton className="h-28" /><Skeleton className="h-56" /></div>;
  if (q.isError || !a || !a.business) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const tooLate = new Date(a.startsAt).getTime() - Date.now() < a.business.cancellationMinHours * 3600_000;
  const active = a.status === 'CONFIRMED' && new Date(a.startsAt).getTime() > Date.now();
  const showSuccess = isNew && a.status === 'CONFIRMED' && !flash;

  return (
    <div className="bf-enter pt-6">
      {showSuccess ? (
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="bf-scale-in grid size-16 place-items-center rounded-full bg-success text-white shadow-[0_8px_24px_-8px_var(--success)]">
            <svg viewBox="0 0 24 24" className="bf-check size-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <h1 className="mt-4 text-[24px] font-semibold tracking-tight" data-testid="success-title">{t('booking.successTitle')}</h1>
          <p className="mt-1 text-[14.5px] text-fg-muted">{me.data?.telegramLinked ? t('booking.successText') : t('booking.notifyNoChannel')}</p>
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">{t('appointment.title')}</h1>
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
        <div className="flex flex-col gap-3 p-4 text-[15px]">
          <p className="flex items-center gap-2.5"><CalendarDays className="size-4 text-fg-subtle" /><span data-testid="detail-date">{f.date(localDateOf(a.startsAt, a.business.timezone))}</span></p>
          <p className="flex items-center gap-2.5"><CalendarClock className="size-4 text-fg-subtle" /><span className="tabular-nums" data-testid="detail-time">{f.timeRange(a.startsAt, a.endsAt)}</span></p>
          <p className="flex items-center gap-2.5"><span className="grid size-4 place-items-center text-fg-subtle">✂︎</span>{a.serviceName}</p>
          {(a.business.address || a.business.city) && <p className="flex items-start gap-2.5 text-fg-muted"><MapPin className="mt-0.5 size-4 text-fg-subtle" />{[a.business.city, a.business.address].filter(Boolean).join(', ')}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-border bg-surface-2/60 px-4 py-3.5">
          <span className="font-medium">{t('booking.cost')}</span>
          <span className="text-[17px] font-semibold tabular-nums" data-testid="detail-price">{f.money(a.priceUzs)}</span>
        </div>
      </Card>

      {active && tooLate && <Alert tone="info" className="mt-4">{t('me.tooLate', { hours: a.business.cancellationMinHours })}</Alert>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {active && !tooLate && (
          <>
            <Button variant="outline" onClick={() => setResched(true)} data-testid="reschedule"><CalendarClock />{t('booking.reschedule')}</Button>
            <Button variant="outline" className="text-danger" onClick={() => setCancel(true)} data-testid="cancel"><XCircle />{t('booking.cancelBooking')}</Button>
          </>
        )}
        <Button asChild variant="outline" className="col-span-2">
          <a href={mapUrl({ ...a.business })} target="_blank" rel="noreferrer"><MapPin />{t('booking.openMap')}</a>
        </Button>
        <Button asChild variant="secondary" className="col-span-2">
          <Link href={`/s/${a.business.slug}/book?barber=${a.barberId}&service=${a.serviceId}`}><RotateCcw />{t('booking.repeat')}</Link>
        </Button>
        <Button asChild className="col-span-2" size="lg">
          <Link href="/me">{t('nav.myBookings')}</Link>
        </Button>
      </div>

      <RescheduleSheet
        open={resched}
        onOpenChange={setResched}
        timezone={a.business.timezone}
        currentStart={a.startsAt}
        mode="client"
        endpoints={{ dates: `/me/appointments/${a.id}/dates`, slots: (d) => `/me/appointments/${a.id}/slots?date=${d}`, submit: `/me/appointments/${a.id}/reschedule` }}
        onDone={() => refresh(t('me.rescheduled'))}
      />
      <CancelSheet open={cancel} onOpenChange={setCancel} endpoint={`/me/appointments/${a.id}/cancel`} onDone={() => refresh(t('me.cancelled'))} />
    </div>
  );
}

export default function AppointmentPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-16">
        <React.Suspense><Detail /></React.Suspense>
      </main>
    </>
  );
}
