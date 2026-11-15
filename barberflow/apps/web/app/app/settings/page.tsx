'use client';
import * as React from 'react';
import { Alert, Button, Card, Field, Input, Select, Skeleton, Textarea } from '@barberflow/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { useWorkspace } from '@/lib/workspace';

export default function SettingsPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  const b = ws.business;
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [slug, setSlug] = React.useState('');
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!b) return;
    setForm({
      name: b.name, city: b.city ?? '', address: b.address ?? '', phone: b.phone ?? '', description: b.description ?? '', coverUrl: b.coverUrl ?? '',
      latitude: b.latitude?.toString() ?? '', longitude: b.longitude?.toString() ?? '', bookingHorizonDays: String(b.bookingHorizonDays), minLeadMinutes: String(b.minLeadMinutes),
      slotStepMinutes: String(b.slotStepMinutes), cancellationMinHours: String(b.cancellationMinHours), cancellationPolicy: b.cancellationPolicy ?? '',
    });
    setSlug(b.slug);
  }, [b]);
  if (!b || !form.name && form.name !== '') return <Skeleton className="h-96" />;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/businesses/${ws.businessId}`, {
        method: 'PATCH',
        body: {
          name: form.name, city: form.city, address: form.address, phone: form.phone, description: form.description, coverUrl: form.coverUrl,
          latitude: num(form.latitude), longitude: num(form.longitude), bookingHorizonDays: +form.bookingHorizonDays, minLeadMinutes: +form.minLeadMinutes,
          slotStepMinutes: +form.slotStepMinutes, cancellationMinHours: +form.cancellationMinHours, cancellationPolicy: form.cancellationPolicy,
        },
      });
      if (ws.role === 'OWNER' && slug !== b!.slug) await api(`/businesses/${ws.businessId}/slug`, { method: 'PATCH', body: { slug } });
      ws.refetchBusiness();
      setMsg({ ok: true, text: t('common.saved') });
    } catch (e) { setMsg({ ok: false, text: t(errorKey(e)) }); } finally { setBusy(false); }
  }

  return (
    <div className="bf-enter flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-semibold tracking-tight">{t('settings.title')}</h1>
        <Button onClick={save} loading={busy}>{t('common.save')}</Button>
      </div>
      {msg && <Alert tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Alert>}
      <Card className="grid gap-3.5 p-5 sm:grid-cols-2">
        <h2 className="text-[15px] font-semibold sm:col-span-2">{t('settings.general')}</h2>
        <Field label={t('settings.businessName')}><Input value={form.name} onChange={set('name')} maxLength={80} /></Field>
        <Field label={t('settings.slug')} hint={`/s/${slug}`}><Input value={slug} disabled={ws.role !== 'OWNER'} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} maxLength={40} /></Field>
        <Field label={t('settings.city')}><Input value={form.city} onChange={set('city')} maxLength={80} /></Field>
        <Field label={t('settings.address')}><Input value={form.address} onChange={set('address')} maxLength={200} /></Field>
        <Field label={t('settings.phone')}><Input type="tel" value={form.phone} onChange={set('phone')} placeholder="+998" /></Field>
        <Field label={t('settings.coverUrl')} optionalText={t('common.optional')}><Input type="url" value={form.coverUrl} onChange={set('coverUrl')} placeholder="https://" /></Field>
        <Field label={t('settings.description')} className="sm:col-span-2"><Textarea value={form.description} onChange={set('description')} rows={2} maxLength={500} /></Field>
        <Field label={t('settings.latitude')}><Input inputMode="decimal" value={form.latitude} onChange={set('latitude')} placeholder="41.3111" /></Field>
        <Field label={t('settings.longitude')}><Input inputMode="decimal" value={form.longitude} onChange={set('longitude')} placeholder="69.2797" /></Field>
      </Card>
      <Card className="grid gap-3.5 p-5 sm:grid-cols-2">
        <h2 className="text-[15px] font-semibold sm:col-span-2">{t('settings.rules')}</h2>
        <Field label={t('settings.horizon')}><Input type="number" min={1} max={180} value={form.bookingHorizonDays} onChange={set('bookingHorizonDays')} /></Field>
        <Field label={t('settings.lead')}><Input type="number" min={0} max={10080} step={15} value={form.minLeadMinutes} onChange={set('minLeadMinutes')} /></Field>
        <Field label={t('settings.step')}>
          <Select value={form.slotStepMinutes} onChange={set('slotStepMinutes')}>{[5, 10, 15, 20, 30, 60].map((v) => <option key={v} value={v}>{v}</option>)}</Select>
        </Field>
        <Field label={t('settings.cancelHours')}><Input type="number" min={0} max={72} value={form.cancellationMinHours} onChange={set('cancellationMinHours')} /></Field>
        <Field label={t('settings.policy')} optionalText={t('common.optional')} className="sm:col-span-2"><Textarea value={form.cancellationPolicy} onChange={set('cancellationPolicy')} rows={2} maxLength={500} /></Field>
      </Card>
    </div>
  );
}
