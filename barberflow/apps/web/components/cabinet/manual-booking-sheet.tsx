'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Alert, Button, Field, Input, Segmented, Select, Sheet, cn } from '@barberflow/ui';
import { localTimeToUtc, normalizeUzPhone, parseHm, SlotDto } from '@barberflow/shared';
import { api, newIdempotencyKey } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { todayIso, useFormat } from '@/lib/format';
import { useBarbers, useServices, useWorkspace } from '@/lib/workspace';
import { SlotGrid } from '@/components/booking/slot-grid';
import { TimeSelect } from '@/components/time-select';

interface CustomerHit { id: string; name: string; phone: string | null; visits: number }

/** "+ Новая запись": staff booking through the same engine as online booking. */
export function ManualBookingSheet({ open, onOpenChange, defaultDate, defaultBarberId }: { open: boolean; onOpenChange: (o: boolean) => void; defaultDate?: string; defaultBarberId?: string | null }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const f = useFormat(ws.timezone);
  const qc = useQueryClient();
  const barbers = useBarbers();
  const services = useServices();
  const [barberId, setBarberId] = React.useState<string>('');
  const [serviceId, setServiceId] = React.useState<string>('');
  const [date, setDate] = React.useState(defaultDate ?? todayIso(ws.timezone));
  const [time, setTime] = React.useState<string | null>(null);
  const [custom, setCustom] = React.useState('');
  const [mode, setMode] = React.useState<'existing' | 'new'>('existing');
  const [search, setSearch] = React.useState('');
  const [customer, setCustomer] = React.useState<CustomerHit | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const idem = React.useMemo(() => (open ? newIdempotencyKey() : ''), [open]);

  const activeBarbers = (barbers.data ?? []).filter((b) => b.isActive && (ws.isManager || b.id === ws.barberId));
  React.useEffect(() => {
    if (!open) return;
    setBarberId(defaultBarberId ?? ws.barberId ?? activeBarbers[0]?.id ?? '');
    setDate(defaultDate ?? todayIso(ws.timezone));
    setTime(null); setCustom(''); setCustomer(null); setName(''); setPhone(''); setSearch(''); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const barberServices = (services.data ?? []).filter((s) => s.isActive && s.barberIds.includes(barberId));
  React.useEffect(() => {
    if (barberServices.length && !barberServices.some((s) => s.id === serviceId)) setServiceId(barberServices[0].id);
  }, [barberServices, serviceId]);

  const slots = useQuery({
    queryKey: ['staff-slots', barberId, serviceId, date],
    queryFn: () => api<{ slots: SlotDto[] }>(`/businesses/${ws.businessId}/barbers/${barberId}/slots?serviceId=${serviceId}&date=${date}`),
    enabled: open && Boolean(barberId && serviceId && date),
  });
  const hits = useQuery({
    queryKey: ['customer-search', ws.businessId, search],
    queryFn: () => api<CustomerHit[]>(`/businesses/${ws.businessId}/customers?q=${encodeURIComponent(search)}`),
    enabled: open && mode === 'existing',
  });

  const customMin = parseHm(custom);
  const startsAt = time ?? (customMin !== null ? localTimeToUtc(date, customMin, ws.timezone).toISOString() : null);
  const phoneOk = !phone.trim() || normalizeUzPhone(phone) !== null;
  const canSave = Boolean(barberId && serviceId && startsAt && (mode === 'existing' ? customer : name.trim() && phoneOk));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/businesses/${ws.businessId}/appointments`, {
        idempotencyKey: idem,
        body: {
          barberId, serviceId, startsAt,
          ...(mode === 'existing' && customer ? { customerId: customer.id } : { customer: { name: name.trim(), phone: phone.trim() ? normalizeUzPhone(phone) : '' } }),
        },
      });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    } catch (e) {
      setError(t(errorKey(e)));
      slots.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('manual.title')} size="lg" closeLabel={t('common.close')}
      footer={<Button block size="lg" disabled={!canSave} loading={busy} onClick={save} data-testid="manual-save">{t('common.save')}</Button>}>
      <div className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          {ws.isManager && (
            <Field label={t('booking.barber')}>
              <Select value={barberId} onChange={(e) => { setBarberId(e.target.value); setTime(null); }}>
                {activeBarbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label={t('booking.service')}>
            <Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setTime(null); }} data-testid="manual-service">
              {barberServices.map((s) => <option key={s.id} value={s.id}>{s.name} · {f.duration(s.durationMin)} · {f.money(s.priceUzs)}</option>)}
            </Select>
          </Field>
          <Field label={t('common.date')}>
            <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(null); }} data-testid="manual-date" />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-fg-muted">{t('manual.pickSlot')}</p>
          <SlotGrid slots={slots.data?.slots} loading={slots.isLoading} value={time} onChange={(s) => { setTime(s); setCustom(''); }} timezone={ws.timezone} />
          <Field label={t('manual.customTime')} className="mt-3 max-w-40">
            <TimeSelect allowEmpty step={5} from={6 * 60} to={23 * 60 + 55} value={custom} onChange={(v) => { setCustom(v); setTime(null); }} className="w-full" />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-fg-muted">{t('manual.customer')}</p>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'existing', label: t('manual.existing') }, { value: 'new', label: t('manual.newCustomer') }]} className="mb-3" />
          {mode === 'existing' ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('manual.searchPlaceholder')} className="pl-10" />
              </div>
              <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                {(hits.data ?? []).slice(0, 20).map((c) => (
                  <button key={c.id} type="button" onClick={() => setCustomer(c)} className={cn('flex items-center justify-between rounded-xl px-3 py-2 text-left text-[14.5px] transition-colors', customer?.id === c.id ? 'bg-primary text-primary-fg' : 'hover:bg-surface-2')}>
                    <span className="font-medium">{c.name}</span><span className="text-[13px] opacity-70">{f.phone(c.phone)}</span>
                  </button>
                ))}
                {hits.data?.length === 0 && <p className="px-3 py-2 text-[14px] text-fg-muted">{t('manual.noCustomers')}</p>}
              </div>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('common.name')}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-testid="manual-name" /></Field>
              <Field label={t('common.phone')} optionalText={t('common.optional')} error={!phoneOk ? t('errors.INVALID_PHONE') : undefined}>
                <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998" />
              </Field>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
