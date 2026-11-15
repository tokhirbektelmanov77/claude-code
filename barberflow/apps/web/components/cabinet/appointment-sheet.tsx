'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Phone, UserX, XCircle } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Sheet, Skeleton } from '@barberflow/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { localDateOf, useFormat } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { StatusBadge } from '@/components/status-badge';
import { RescheduleSheet } from '@/components/booking/reschedule-sheet';
import { CancelSheet } from '@/components/booking/cancel-sheet';
import type { AppointmentDetail } from './types';

export function AppointmentSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const { businessId, timezone } = useWorkspace();
  const f = useFormat(timezone);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['appointment', id], queryFn: () => api<AppointmentDetail>(`/businesses/${businessId}/appointments/${id}`), enabled: Boolean(id) });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [resched, setResched] = React.useState(false);
  const [cancel, setCancel] = React.useState(false);
  React.useEffect(() => { setError(null); }, [id]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['calendar'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    q.refetch();
  };
  async function outcome(status: 'COMPLETED' | 'NO_SHOW') {
    setBusy(status);
    setError(null);
    try {
      await api(`/businesses/${businessId}/appointments/${id}/status`, { body: { status } });
      refresh();
    } catch (e) { setError(t(errorKey(e))); } finally { setBusy(null); }
  }

  const a = q.data;
  const started = a ? new Date(a.startsAt).getTime() <= Date.now() : false;
  return (
    <>
      <Sheet open={Boolean(id) && !resched && !cancel} onOpenChange={(o) => !o && onClose()} title={t('appointment.title')} closeLabel={t('common.close')}>
        {q.isLoading || !a ? <Skeleton className="h-64" /> : (
          <div className="flex flex-col gap-4" data-testid="appointment-sheet">
            <div className="flex items-center gap-3">
              <Avatar name={a.customer?.name ?? '?'} size={48} />
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold">{a.customer?.name}</p>
                <p className="text-[13px] text-fg-muted">{t('appointment.visits', { n: a.customerVisits })}</p>
              </div>
              <StatusBadge status={a.status} />
            </div>
            {a.customer?.phone && (
              <Button asChild variant="outline" size="sm" className="self-start"><a href={`tel:${a.customer.phone}`}><Phone />{f.phone(a.customer.phone)}</a></Button>
            )}
            <dl className="divide-y divide-border rounded-2xl border border-border text-[14.5px]">
              {[
                [t('booking.when'), `${f.dateWeekday(localDateOf(a.startsAt, timezone))}, ${f.timeRange(a.startsAt, a.endsAt)}`],
                [t('booking.service'), a.serviceName],
                [t('booking.barber'), a.barber?.name],
                [t('booking.cost'), f.money(a.priceUzs)],
                [t('appointment.source'), t(`source.${a.source}`)],
                ...(a.customerNote ? [[t('common.note'), a.customerNote]] : []),
                ...(a.cancelReason ? [[t('me.cancelReason'), a.cancelReason]] : []),
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4 px-3.5 py-2.5"><dt className="text-fg-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
              ))}
            </dl>
            {error && <Alert tone="danger">{error}</Alert>}
            {a.status === 'CONFIRMED' && (
              <div className="grid grid-cols-2 gap-2">
                {started ? (
                  <>
                    <Button onClick={() => outcome('COMPLETED')} loading={busy === 'COMPLETED'} data-testid="mark-completed"><Check />{t('appointment.complete')}</Button>
                    <Button variant="outline" onClick={() => outcome('NO_SHOW')} loading={busy === 'NO_SHOW'}><UserX />{t('appointment.noShow')}</Button>
                  </>
                ) : null}
                <Button variant="outline" onClick={() => setResched(true)} data-testid="staff-reschedule"><CalendarClock />{t('appointment.reschedule')}</Button>
                <Button variant="outline" className="text-danger" onClick={() => setCancel(true)} data-testid="staff-cancel"><XCircle />{t('appointment.cancel')}</Button>
              </div>
            )}
            <div>
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{t('appointment.history')}</p>
              <ol className="flex flex-col gap-2 border-l border-border pl-4">
                {a.events.map((e) => (
                  <li key={e.id} className="relative text-[13.5px]">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-border-strong" />
                    <span className="font-medium">{t(`appointment.ev_${e.type}` as never) || e.type}</span>
                    <span className="text-fg-subtle"> · {f.dayMonth(e.createdAt)} {f.time(e.createdAt)}</span>
                    {e.type === 'RESCHEDULED' && e.data?.from ? <Badge className="ml-1.5">{f.time(String(e.data.from))} → {f.time(String(e.data.to))}</Badge> : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Sheet>
      {a && (
        <>
          <RescheduleSheet
            open={resched}
            onOpenChange={setResched}
            timezone={timezone}
            currentStart={a.startsAt}
            mode="staff"
            endpoints={{ slots: (d) => `/businesses/${businessId}/barbers/${a.barberId}/slots?serviceId=${a.serviceId}&date=${d}&excludeAppointmentId=${a.id}`, submit: `/businesses/${businessId}/appointments/${a.id}/reschedule` }}
            onDone={refresh}
          />
          <CancelSheet open={cancel} onOpenChange={setCancel} endpoint={`/businesses/${businessId}/appointments/${a.id}/cancel`} onDone={refresh} />
        </>
      )}
    </>
  );
}
