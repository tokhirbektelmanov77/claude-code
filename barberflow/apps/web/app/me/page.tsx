'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { CalendarPlus, ChevronRight, Smartphone, X } from 'lucide-react';
import { Card, EmptyState, Segmented } from '@barberflow/ui';
import type { AppointmentDto } from '@barberflow/shared';
import { SiteHeader } from '@/components/site-header';
import { ListSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { localDateOf, useFormat } from '@/lib/format';
import { deviceTokens, forgetToken } from '@/lib/device-bookings';

type Row = AppointmentDto & { token: string };

function AppointmentRow({ a, onForget }: { a: Row; onForget: () => void }) {
  const { t } = useI18n();
  const f = useFormat(a.business?.timezone);
  return (
    <div className="group relative">
      <Link href={`/a/${a.token}`} className="block" data-testid="my-appointment">
        <Card interactive className="flex items-center gap-3 p-3.5 pr-10">
          <div className="grid w-16 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 py-2.5 text-center">
            <span className="text-[19px] font-extrabold leading-none tabular-nums">{f.time(a.startsAt)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{a.serviceName}</p>
            <p className="truncate text-[13px] text-fg-muted">{f.dayMonth(localDateOf(a.startsAt, a.business?.timezone))} · {a.barber?.name} · {a.business?.name}</p>
            <div className="mt-1.5"><StatusBadge status={a.status} /></div>
          </div>
          <ChevronRight className="size-4 text-fg-subtle" />
        </Card>
      </Link>
      <button type="button" onClick={onForget} title={t('me.forget')} aria-label={t('me.forget')} className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-fg-subtle hover:bg-surface-3 hover:text-fg">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Bookings made from this device (clients have no accounts; each booking is a secret link). */
export default function MyBookingsPage() {
  const { t } = useI18n();
  const [tokens, setTokens] = React.useState<string[] | null>(null);
  const [tab, setTab] = React.useState<'upcoming' | 'past'>('upcoming');
  React.useEffect(() => setTokens(deviceTokens()), []);

  const results = useQueries({
    queries: (tokens ?? []).map((token) => ({
      queryKey: ['guest-appointment', token],
      queryFn: () => api<AppointmentDto>(`/public/appointments/${token}`),
      retry: false,
    })),
  });
  // A link that no longer resolves (e.g. data erased by the barbershop) is dropped from the device.
  React.useEffect(() => {
    results.forEach((r, i) => {
      if (r.error instanceof ApiError && r.error.status === 404 && tokens) forgetToken(tokens[i]);
    });
  }, [results, tokens]);

  const rows: Row[] = results.flatMap((r, i) => (r.data ? [{ ...r.data, token: tokens![i] }] : []));
  const loading = tokens === null || results.some((r) => r.isLoading);
  const now = Date.now();
  const upcoming = rows.filter((a) => a.status === 'CONFIRMED' && new Date(a.endsAt).getTime() > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = rows.filter((a) => !(a.status === 'CONFIRMED' && new Date(a.endsAt).getTime() > now)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const shown = tab === 'upcoming' ? upcoming : past;
  const forget = (token: string) => { forgetToken(token); setTokens(deviceTokens()); };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-16">
        <div className="bf-enter flex flex-col gap-5 pt-6">
          <div>
            <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{t('me.title')}</h1>
            <p className="mt-1.5 flex items-start gap-2 text-[13.5px] text-fg-muted"><Smartphone className="mt-0.5 size-4 shrink-0 text-accent" />{t('me.deviceHint')}</p>
          </div>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: `${t('me.upcoming')}${upcoming.length ? ` · ${upcoming.length}` : ''}` }, { value: 'past', label: t('me.past') }]} className="w-full" />
          {loading ? <ListSkeleton rows={3} /> : shown.length === 0 ? (
            <EmptyState icon={CalendarPlus} title={t('me.empty')} text={t('me.emptyHint')} />
          ) : (
            <div className="flex flex-col gap-2">{shown.map((a) => <AppointmentRow key={a.token} a={a} onForget={() => forget(a.token)} />)}</div>
          )}
        </div>
      </main>
    </>
  );
}
