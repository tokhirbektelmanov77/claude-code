'use client';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, Pencil, Plus, Scissors } from 'lucide-react';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Sheet, Skeleton, Switch } from '@barberflow/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { ServiceRow, useBarbers, useServices, useWorkspace } from '@/lib/workspace';

export default function ServicesPage() {
  const { t } = useI18n();
  const f = useFormat();
  const services = useServices();
  const qc = useQueryClient();
  const [edit, setEdit] = React.useState<ServiceRow | 'new' | null>(null);
  return (
    <div className="bf-enter flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-semibold tracking-tight">{t('services.title')}</h1>
        <Button onClick={() => setEdit('new')} data-testid="add-service"><Plus />{t('services.add')}</Button>
      </div>
      {services.isLoading ? <Skeleton className="h-60" /> : !services.data?.length ? <Card><EmptyState icon={Scissors} title={t('services.empty')} /></Card> : (
        <Card className="divide-y divide-border">
          {services.data.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3.5" data-testid="service-row">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.name} {!s.isActive && <Badge className="ml-1">{t('services.hidden')}</Badge>}</p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-fg-muted"><Clock className="size-3.5" />{f.duration(s.durationMin)}{s.bufferAfterMin ? ` + ${s.bufferAfterMin} ${t('common.minutesShort')}` : ''}</p>
              </div>
              <p className="font-semibold tabular-nums">{f.money(s.priceUzs)}</p>
              <Button variant="ghost" size="icon-sm" onClick={() => setEdit(s)} aria-label={t('common.edit')}><Pencil /></Button>
            </div>
          ))}
        </Card>
      )}
      <ServiceSheet value={edit} onClose={() => { setEdit(null); qc.invalidateQueries({ queryKey: ['services'] }); }} />
    </div>
  );
}

function ServiceSheet({ value, onClose }: { value: ServiceRow | 'new' | null; onClose: () => void }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const barbers = useBarbers();
  const s = value && value !== 'new' ? value : null;
  const [form, setForm] = React.useState({ name: '', nameUz: '', priceUzs: '', durationMin: '45', bufferAfterMin: '0', isActive: true, barberIds: [] as string[] });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!value) return;
    setError(null);
    setForm(s
      ? { name: s.name, nameUz: s.nameUz ?? '', priceUzs: String(s.priceUzs), durationMin: String(s.durationMin), bufferAfterMin: String(s.bufferAfterMin), isActive: s.isActive, barberIds: s.barberIds }
      : { name: '', nameUz: '', priceUzs: '', durationMin: '45', bufferAfterMin: '0', isActive: true, barberIds: (barbers.data ?? []).map((b) => b.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const set = (p: Partial<typeof form>) => setForm((x) => ({ ...x, ...p }));
  const price = Number(form.priceUzs.replace(/\s/g, ''));
  const valid = form.name.trim() && Number.isInteger(price) && price >= 0 && +form.durationMin >= 5;
  async function save() {
    setBusy(true);
    setError(null);
    const body = { name: form.name, nameUz: form.nameUz || null, priceUzs: price, durationMin: +form.durationMin, bufferAfterMin: +form.bufferAfterMin || 0, isActive: form.isActive, barberIds: form.barberIds };
    try {
      if (s) await api(`/businesses/${ws.businessId}/services/${s.id}`, { method: 'PATCH', body });
      else await api(`/businesses/${ws.businessId}/services`, { body });
      onClose();
    } catch (e) { setError(t(errorKey(e))); } finally { setBusy(false); }
  }
  return (
    <Sheet open={Boolean(value)} onOpenChange={(o) => !o && onClose()} title={s ? t('services.edit') : t('services.add')} size="lg" closeLabel={t('common.close')}
      footer={<Button block size="lg" loading={busy} disabled={!valid} onClick={save} data-testid="save-service">{t('common.save')}</Button>}>
      <div className="flex flex-col gap-3.5">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('services.name')}><Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} data-testid="service-name" /></Field>
          <Field label={t('services.nameUz')} optionalText={t('common.optional')}><Input value={form.nameUz} onChange={(e) => set({ nameUz: e.target.value })} maxLength={80} /></Field>
          <Field label={t('services.priceUzs')}><Input inputMode="numeric" value={form.priceUzs} onChange={(e) => set({ priceUzs: e.target.value.replace(/[^\d]/g, '') })} data-testid="service-price" /></Field>
          <Field label={t('services.durationMin')}><Input type="number" min={5} max={480} step={5} value={form.durationMin} onChange={(e) => set({ durationMin: e.target.value })} data-testid="service-duration" /></Field>
          <Field label={t('services.bufferAfterMin')} hint={t('services.bufferHint')} className="sm:col-span-2"><Input type="number" min={0} max={120} step={5} value={form.bufferAfterMin} onChange={(e) => set({ bufferAfterMin: e.target.value })} className="max-w-32" /></Field>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-fg-muted">{t('services.barbers')}</p>
          <div className="flex flex-col gap-2">
            {(barbers.data ?? []).map((b) => (
              <Checkbox key={b.id} label={b.name} checked={form.barberIds.includes(b.id)} onChange={(e) => set({ barberIds: e.target.checked ? [...form.barberIds, b.id] : form.barberIds.filter((x) => x !== b.id) })} />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-3 text-[14.5px]"><Switch checked={form.isActive} onCheckedChange={(c) => set({ isActive: c })} />{form.isActive ? t('common.active') : t('services.hidden')}</label>
      </div>
    </Sheet>
  );
}
