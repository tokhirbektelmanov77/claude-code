'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select, Sheet, Skeleton, Switch, Textarea } from '@barberflow/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { todayIso, useFormat } from '@/lib/format';
import { useBarbers, useWorkspace } from '@/lib/workspace';
import { Interval, WeekEdit, WeeklyHoursEditor, intervalsFromWeek, weekFromIntervals } from '@/components/cabinet/weekly-hours-editor';
import type { CalendarException } from '@/components/cabinet/types';
import { TimeSelect } from '@/components/time-select';

export default function SchedulePage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  const barbers = useBarbers();
  const options = (barbers.data ?? []).filter((b) => ws.isManager || b.id === ws.barberId);
  const [barberId, setBarberId] = React.useState<string | null>(ws.barberId);
  React.useEffect(() => { if (!barberId && options[0]) setBarberId(options[0].id); }, [barberId, options]);

  if (barbers.isLoading) return <Skeleton className="h-96" />;
  if (!barberId) return <EmptyState title={t('staff.empty')} />;
  return (
    <div className="bf-enter flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-semibold tracking-tight">{t('schedule.title')}</h1>
        {options.length > 1 && (
          <Select value={barberId} onChange={(e) => setBarberId(e.target.value)} className="h-10 w-auto" aria-label={t('schedule.barber')}>
            {options.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
      </div>
      <HoursSection key={`h-${barberId}`} barberId={barberId} />
      <ExceptionsSection key={`e-${barberId}`} barberId={barberId} />
    </div>
  );
}

function HoursSection({ barberId }: { barberId: string }) {
  const { t } = useI18n();
  const { businessId } = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hours', barberId], queryFn: () => api<Interval[]>(`/businesses/${businessId}/barbers/${barberId}/working-hours`) });
  const [week, setWeek] = React.useState<WeekEdit | null>(null);
  const [state, setState] = React.useState<'idle' | 'saving' | 'saved' | string>('idle');
  React.useEffect(() => { if (q.data) setWeek(weekFromIntervals(q.data)); }, [q.data]);
  if (!week) return <Skeleton className="h-96" />;
  const intervals = intervalsFromWeek(week);
  async function save() {
    if (!intervals) return;
    setState('saving');
    try {
      await api(`/businesses/${businessId}/barbers/${barberId}/working-hours`, { method: 'PUT', body: { intervals } });
      setState('saved');
      qc.invalidateQueries({ queryKey: ['calendar'] });
      setTimeout(() => setState('idle'), 2000);
    } catch (e) { setState(t(errorKey(e))); }
  }
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold tracking-tight">{t('schedule.weekly')}</h2>
        <Button onClick={save} disabled={!intervals} loading={state === 'saving'} data-testid="save-hours">{state === 'saved' ? t('common.saved') : t('common.save')}</Button>
      </div>
      {state !== 'idle' && state !== 'saving' && state !== 'saved' && <Alert tone="danger" className="mb-3">{state}</Alert>}
      <WeeklyHoursEditor value={week} onChange={setWeek} />
    </section>
  );
}

function ExceptionsSection({ barberId }: { barberId: string }) {
  const { t } = useI18n();
  const { businessId, timezone } = useWorkspace();
  const f = useFormat(timezone);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['exceptions', barberId], queryFn: () => api<CalendarException[]>(`/businesses/${businessId}/barbers/${barberId}/exceptions`) });
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<'DAY_OFF' | 'VACATION' | 'BLOCK'>('DAY_OFF');
  const [startDate, setStartDate] = React.useState(todayIso(timezone));
  const [endDate, setEndDate] = React.useState(todayIso(timezone));
  const [wholeDay, setWholeDay] = React.useState(true);
  const [from, setFrom] = React.useState('13:00');
  const [to, setTo] = React.useState('14:00');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<number>(0);
  const [busy, setBusy] = React.useState(false);

  async function add() {
    const day = (d: string) => DateTime.fromISO(d, { zone: timezone });
    const s = wholeDay ? day(startDate).startOf('day') : day(startDate).set({ hour: +from.slice(0, 2), minute: +from.slice(3, 5) });
    const e = wholeDay ? day(type === 'BLOCK' ? startDate : endDate).plus({ days: 1 }).startOf('day') : day(startDate).set({ hour: +to.slice(0, 2), minute: +to.slice(3, 5) });
    if (e <= s) return setError(t('schedule.invalidRange'));
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ affectedAppointments: number }>(`/businesses/${businessId}/barbers/${barberId}/exceptions`, {
        body: { type, startsAt: s.toUTC().toISO(), endsAt: e.toUTC().toISO(), note: note.trim() || null },
      });
      setWarning(r.affectedAppointments);
      setOpen(false);
      setNote('');
      qc.invalidateQueries({ queryKey: ['exceptions', barberId] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    } catch (err) { setError(t(errorKey(err))); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    await api(`/businesses/${businessId}/barbers/${barberId}/exceptions/${id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['exceptions', barberId] });
    qc.invalidateQueries({ queryKey: ['calendar'] });
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold tracking-tight">{t('schedule.exceptions')}</h2>
        <Button variant="outline" onClick={() => setOpen(true)} data-testid="add-exception"><Plus />{t('schedule.addException')}</Button>
      </div>
      {warning > 0 && <Alert tone="warning" className="mb-3">{t('schedule.affected', { n: warning })}</Alert>}
      {q.isLoading ? <Skeleton className="h-24" /> : !q.data?.length ? (
        <Card><EmptyState icon={CalendarOff} title={t('schedule.noExceptions')} className="py-8" /></Card>
      ) : (
        <Card className="divide-y divide-border">
          {q.data.map((e) => {
            const endIncl = new Date(new Date(e.endsAt).getTime() - 1);
            const sameDay = f.date(e.startsAt) === f.date(endIncl);
            const whole = f.time(e.startsAt) === '00:00' && f.time(e.endsAt) === '00:00';
            return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <Badge tone={e.type === 'VACATION' ? 'accent' : e.type === 'DAY_OFF' ? 'neutral' : 'warning'}>{t(`schedule.type_${e.type}`)}</Badge>
                <div className="min-w-0 flex-1 text-[14.5px]">
                  <p className="font-medium">
                    {sameDay ? f.dayMonth(e.startsAt) : `${f.dayMonth(e.startsAt)} – ${f.dayMonth(endIncl)}`}
                    {!whole && <span className="text-fg-muted"> · {f.timeRange(e.startsAt, e.endsAt)}</span>}
                  </p>
                  {e.note && <p className="truncate text-[13px] text-fg-muted">{e.note}</p>}
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(e.id)} aria-label={t('common.delete')}><Trash2 /></Button>
              </div>
            );
          })}
        </Card>
      )}
      <Sheet open={open} onOpenChange={setOpen} title={t('schedule.addException')} closeLabel={t('common.close')}
        footer={<Button block size="lg" loading={busy} onClick={add} data-testid="save-exception">{t('common.save')}</Button>}>
        <div className="flex flex-col gap-3.5">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label={t('common.status')}>
            <Select value={type} onChange={(e) => { const v = e.target.value as typeof type; setType(v); setWholeDay(v !== 'BLOCK'); }}>
              {(['DAY_OFF', 'VACATION', 'BLOCK'] as const).map((x) => <option key={x} value={x}>{t(`schedule.type_${x}`)}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('schedule.startDate')}><Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} /></Field>
            {type === 'VACATION' && <Field label={t('schedule.endDate')}><Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></Field>}
          </div>
          {type === 'BLOCK' && (
            <>
              <label className="flex items-center gap-3 text-[14.5px]"><Switch checked={wholeDay} onCheckedChange={setWholeDay} />{t('schedule.wholeDay')}</label>
              {!wholeDay && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('common.from')}><TimeSelect value={from} onChange={setFrom} className="w-full" /></Field>
                  <Field label={t('common.to')}><TimeSelect value={to} onChange={setTo} className="w-full" /></Field>
                </div>
              )}
            </>
          )}
          <Field label={t('common.note')} optionalText={t('common.optional')}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
        </div>
      </Sheet>
    </section>
  );
}
