'use client';
import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock, Info, Scissors } from 'lucide-react';
import { Alert, Avatar, Button, Card, Checkbox, Field, Input, Skeleton, Textarea, cn } from '@barberflow/ui';
import type { AppointmentDto, PublicBarber, PublicBusiness, SlotDto } from '@barberflow/shared';
import { SiteHeader } from '@/components/site-header';
import { ErrorState } from '@/components/states';
import { OtpLogin } from '@/components/otp-login';
import { DateCalendar } from '@/components/booking/date-calendar';
import { SlotGrid } from '@/components/booking/slot-grid';
import { api, ApiError, newIdempotencyKey } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMe } from '@/lib/auth';
import { localDateOf, useFormat } from '@/lib/format';
import { errorKey } from '@/lib/errors';
import { serviceName, usePublicBusiness } from '@/lib/public';

type Step = 'barber' | 'service' | 'time' | 'confirm';
const STEPS: Step[] = ['barber', 'service', 'time', 'confirm'];

function useBookingState() {
  const sp = useSearchParams();
  const router = useRouter();
  const state = { barber: sp.get('barber'), service: sp.get('service'), date: sp.get('date'), time: sp.get('time') };
  const set = React.useCallback(
    (patch: Partial<typeof state>, mode: 'push' | 'replace' = 'push') => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const url = `?${next.toString()}`;
      if (mode === 'push') router.push(url, { scroll: true });
      else router.replace(url, { scroll: false });
    },
    [sp, router],
  );
  return [state, set] as const;
}

function BookingFlow() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useI18n();
  const router = useRouter();
  const business = usePublicBusiness(slug);
  const [s, set] = useBookingState();
  const b = business.data;

  const barber = b?.barbers.find((x) => x.id === s.barber) ?? null;
  const service = barber && s.service && barber.serviceIds.includes(s.service) ? b!.services.find((x) => x.id === s.service) ?? null : null;
  // A single-barber shop skips the barber step.
  React.useEffect(() => {
    if (b && !s.barber && b.barbers.length === 1) set({ barber: b.barbers[0].id }, 'replace');
  }, [b, s.barber, set]);

  const step: Step = !barber ? 'barber' : !service ? 'service' : !s.time ? 'time' : 'confirm';
  const stepIndex = STEPS.indexOf(step);
  const stepTitle = { barber: t('booking.chooseBarber'), service: t('booking.chooseService'), time: t('booking.chooseDateTime'), confirm: t('booking.summary') }[step];

  const goBack = () => {
    if (step === 'confirm') set({ time: null });
    else if (step === 'time') set({ service: null, date: null });
    else if (step === 'service' && b && b.barbers.length > 1) set({ barber: null });
    else router.push(`/s/${slug}`);
  };

  return (
    <main className="mx-auto max-w-xl px-4 pb-16">
      <div className="sticky top-14 z-10 -mx-4 bg-bg/90 px-4 pb-3 pt-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label={t('common.back')} className="-ml-2.5"><ArrowLeft className="!size-5" /></Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{b?.name ?? '…'} · {t('booking.stepOf', { n: stepIndex + 1, total: STEPS.length })}</p>
            <h1 className="truncate text-[22px] font-extrabold tracking-[-0.03em]" data-testid="step-title">{stepTitle}</h1>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {STEPS.map((x, i) => (
            <div key={x} className={cn('h-1 flex-1 rounded-full transition-colors duration-300', i <= stepIndex ? 'bg-primary' : 'bg-surface-3/70')} />
          ))}
        </div>
      </div>

      {business.isLoading && <div className="mt-2 flex flex-col gap-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {business.isError && <ErrorState error={business.error} onRetry={() => business.refetch()} />}
      {b && !b.acceptingBookings && <Alert tone="warning" className="mt-2">{t('booking.bookingClosed')}</Alert>}

      {b && b.acceptingBookings && (
        <div key={step} className="bf-enter mt-2">
          {step === 'barber' && <BarberStep b={b} onPick={(id) => set({ barber: id, service: null, date: null, time: null })} />}
          {step === 'service' && barber && <ServiceStep b={b} barber={barber} onPick={(id) => set({ service: id, date: null, time: null })} />}
          {step === 'time' && barber && service && (
            <TimeStep b={b} barberId={barber.id} serviceId={service.id} date={s.date} onDate={(d) => set({ date: d }, 'replace')} onTime={(time) => set({ time })} />
          )}
          {step === 'confirm' && barber && service && s.time && (
            <ConfirmStep b={b} barber={barber} serviceId={service.id} start={s.time} onSlotTaken={() => set({ time: null })} />
          )}
        </div>
      )}
    </main>
  );
}

function BarberStep({ b, onPick }: { b: PublicBusiness; onPick: (id: string) => void }) {
  const { t, locale } = useI18n();
  if (!b.barbers.length) return <p className="py-10 text-center text-fg-muted">{t('booking.noBarbers')}</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {b.barbers.map((barber) => (
        <Card key={barber.id} interactive className="p-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={barber.name} src={barber.photoUrl} size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold">{barber.name}</p>
              {barber.specialization && <p className="text-[13.5px] text-fg-muted">{barber.specialization}</p>}
            </div>
            <Button size="sm" onClick={() => onPick(barber.id)} data-testid={`choose-barber-${barber.slug}`}>{t('booking.select')}</Button>
          </div>
          {barber.serviceIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {b.services.filter((s) => barber.serviceIds.includes(s.id)).map((s) => (
                <span key={s.id} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[12.5px] text-fg-muted">{serviceName(s, locale)}</span>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function ServiceStep({ b, barber, onPick }: { b: PublicBusiness; barber: PublicBarber; onPick: (id: string) => void }) {
  const { t, locale } = useI18n();
  const f = useFormat(b.timezone);
  const list = b.services.filter((s) => barber.serviceIds.includes(s.id));
  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3">
        <Avatar name={barber.name} src={barber.photoUrl} size={36} />
        <p className="text-[14.5px]"><span className="text-fg-muted">{t('booking.barber')}:</span> <span className="font-medium">{barber.name}</span></p>
      </div>
      {list.length === 0 ? (
        <p className="py-10 text-center text-fg-muted">{t('booking.noServices')}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {list.map((s) => {
            const p = barber.prices[s.id] ?? { priceUzs: s.priceUzs, durationMin: s.durationMin };
            return (
              <button key={s.id} type="button" onClick={() => onPick(s.id)} data-testid={`service-${s.id}`} className="group text-left">
                <Card interactive className="flex items-center gap-3.5 p-4 group-focus-visible:border-accent">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-primary"><Scissors className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15.5px] font-bold">{serviceName(s, locale)}</p>
                    {s.description && <p className="mt-0.5 text-[13px] text-fg-muted">{s.description}</p>}
                    <p className="mt-1 inline-flex items-center gap-1 text-[13px] text-fg-muted"><Clock className="size-3.5" />{f.duration(p.durationMin)}</p>
                  </div>
                  <p className="text-[15.5px] font-bold tabular-nums">{f.money(p.priceUzs)}</p>
                  <ChevronRight className="size-5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function TimeStep({
  b, barberId, serviceId, date, onDate, onTime,
}: { b: PublicBusiness; barberId: string; serviceId: string; date: string | null; onDate: (d: string) => void; onTime: (iso: string) => void }) {
  const { t } = useI18n();
  const f = useFormat(b.timezone);
  const dates = useQuery({
    queryKey: ['dates', barberId, serviceId],
    queryFn: () => api<{ dates: string[] }>(`/public/barbers/${barberId}/dates?serviceId=${serviceId}`),
  });
  const firstDate = dates.data?.dates[0] ?? null;
  const selected = date && dates.data?.dates.includes(date) ? date : firstDate;
  React.useEffect(() => {
    if (selected && selected !== date) onDate(selected);
  }, [selected, date, onDate]);
  const [picked, setPicked] = React.useState<string | null>(null);
  React.useEffect(() => setPicked(null), [selected]);
  const slots = useQuery({
    queryKey: ['slots', barberId, serviceId, selected],
    queryFn: () => api<{ slots: SlotDto[] }>(`/public/barbers/${barberId}/slots?serviceId=${serviceId}&date=${selected}`),
    enabled: Boolean(selected),
    refetchInterval: 60_000,
  });

  if (dates.isLoading) return <Skeleton className="h-80" />;
  if (dates.isError) return <ErrorState error={dates.error} onRetry={() => dates.refetch()} />;
  if (!dates.data?.dates.length) {
    return <Alert tone="info" title={t('booking.noDates')} />;
  }
  return (
    <div className="flex flex-col gap-5">
      <DateCalendar available={dates.data.dates} value={selected} onChange={onDate} timezone={b.timezone} horizonDays={b.bookingHorizonDays} />
      <section>
        <h2 className="mb-3 text-[16px] font-bold tracking-tight">
          {t('booking.availableTime')}{selected && <span className="font-medium text-fg-muted"> · {f.dateWeekday(selected)}</span>}
        </h2>
        {slots.isError ? (
          <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
        ) : (
          <SlotGrid slots={slots.data?.slots} loading={slots.isLoading} value={picked} onChange={setPicked} timezone={b.timezone} />
        )}
      </section>
      <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border bg-bg/92 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <Button size="lg" block disabled={!picked} onClick={() => picked && onTime(picked)} data-testid="time-continue">
          {picked ? `${t('common.continue')} · ${f.time(picked)}` : t('common.continue')}<ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function ConfirmStep({
  b, barber, serviceId, start, onSlotTaken,
}: { b: PublicBusiness; barber: PublicBarber; serviceId: string; start: string; onSlotTaken: () => void }) {
  const { t, locale } = useI18n();
  const f = useFormat(b.timezone);
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const service = b.services.find((s) => s.id === serviceId)!;
  const p = barber.prices[serviceId] ?? { priceUzs: service.priceUzs, durationMin: service.durationMin };
  const end = new Date(new Date(start).getTime() + p.durationMin * 60_000).toISOString();
  const [name, setName] = React.useState('');
  const [note, setNote] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [error, setError] = React.useState<{ code: string; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  // One key per confirmation screen: double taps and network retries can't create two bookings.
  const idemKey = React.useMemo(() => newIdempotencyKey(), []);

  React.useEffect(() => {
    if (me.data?.name && !name) setName(me.data.name);
  }, [me.data, name]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const appt = await api<AppointmentDto>('/bookings', {
        body: { barberId: barber.id, serviceId, startsAt: start, customerName: name.trim(), note: note.trim() || null, consent: true },
        idempotencyKey: idemKey,
      });
      qc.invalidateQueries({ queryKey: ['my-appointments'] });
      router.push(`/me/appointments/${appt.id}?new=1`);
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && (e.code === 'SLOT_TAKEN' || e.code === 'SLOT_UNAVAILABLE')) {
        qc.invalidateQueries({ queryKey: ['slots'] });
        qc.invalidateQueries({ queryKey: ['dates'] });
        setError({ code: 'SLOT_TAKEN', text: t('booking.slotTakenText') });
      } else {
        setError({ code: 'OTHER', text: t(errorKey(e)) });
      }
    }
  }

  const rows: [string, React.ReactNode][] = [
    [t('booking.barber'), barber.name],
    [t('booking.service'), `${serviceName(service, locale)} · ${f.duration(p.durationMin)}`],
    [t('booking.when'), <span key="w" data-testid="summary-when">{f.date(localDateOf(start, b.timezone))}, {f.timeRange(start, end)}</span>],
    [t('booking.address'), [b.city, b.address].filter(Boolean).join(', ') || '—'],
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Avatar name={barber.name} src={barber.photoUrl} size={44} />
          <div>
            <p className="font-bold">{b.name}</p>
            <p className="text-[13px] text-fg-muted">{f.dateWeekday(start)}</p>
          </div>
        </div>
        <dl className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-3 text-[14.5px]">
              <dt className="text-fg-muted">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 bg-selected/40 px-4 py-4">
            <dt className="font-semibold">{t('booking.cost')}</dt>
            <dd className="text-[19px] font-extrabold tabular-nums" data-testid="summary-price">{f.money(p.priceUzs)}</dd>
          </div>
        </dl>
      </Card>

      <div className="flex gap-2.5 rounded-2xl border border-border bg-surface-2 p-3.5 text-[13.5px] text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium text-fg">{t('booking.cancellationTitle')}</p>
          <p className="mt-0.5">{b.cancellationPolicy || t('booking.cancellationDefault', { hours: b.cancellationMinHours })}</p>
        </div>
      </div>

      {error && (
        <Alert
          tone={error.code === 'SLOT_TAKEN' ? 'warning' : 'danger'}
          title={error.code === 'SLOT_TAKEN' ? t('booking.slotTakenTitle') : undefined}
          action={error.code === 'SLOT_TAKEN' ? <Button size="sm" variant="outline" onClick={onSlotTaken} data-testid="choose-another">{t('booking.chooseAnother')}</Button> : undefined}
        >
          {error.text}
        </Alert>
      )}

      {me.isLoading ? (
        <Skeleton className="h-40" />
      ) : !me.data ? (
        <Card className="p-4 sm:p-5">
          <p className="mb-4 text-[15px] font-medium">{t('booking.loginToBook')}</p>
          <OtpLogin onSuccess={() => undefined} submitLabel={t('common.continue')} />
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <Field label={t('booking.yourName')} htmlFor="cname">
            <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={80} data-testid="customer-name" />
          </Field>
          {me.data.phone && (
            <Field label={t('booking.yourPhone')}>
              <div className="flex h-11 items-center gap-2 rounded-xl bg-surface-2 px-3.5 text-[15px] tabular-nums text-fg-muted">
                <Check className="size-4 text-success" />{f.phone(me.data.phone)}
              </div>
            </Field>
          )}
          <Field label={t('common.note')} optionalText={t('common.optional')} htmlFor="cnote">
            <Textarea id="cnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('booking.notePlaceholder')} maxLength={300} rows={2} />
          </Field>
          <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} label={t('booking.consent')} data-testid="consent" />
          <Button size="lg" block onClick={confirm} loading={busy} disabled={!consent || !name.trim()} data-testid="confirm-booking">
            {busy ? t('booking.confirming') : t('booking.confirmBooking')}
          </Button>
        </Card>
      )}
    </div>
  );
}

export default function BookPage() {
  return (
    <>
      <SiteHeader />
      <React.Suspense>
        <BookingFlow />
      </React.Suspense>
    </>
  );
}
