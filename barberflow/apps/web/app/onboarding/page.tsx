'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Card, Checkbox, Field, Input, Skeleton, Spinner, cn } from '@barberflow/ui';
import type { MeDto } from '@barberflow/shared';
import { SiteHeader } from '@/components/site-header';
import { OtpLogin } from '@/components/otp-login';
import { CopyField } from '@/components/copy-field';
import { QrCard } from '@/components/qr';
import { WeekEdit, WeeklyHoursEditor, defaultWeek, intervalsFromWeek } from '@/components/cabinet/weekly-hours-editor';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMe } from '@/lib/auth';
import { errorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import type { BarberRow, BusinessDetail, ServiceRow } from '@/lib/workspace';

const TOTAL = 7;

function Progress({ step }: { step: number }) {
  const { t } = useI18n();
  const labels = [t('onboarding.s1'), t('onboarding.s2'), t('onboarding.s3'), t('onboarding.s4'), t('onboarding.s5'), t('onboarding.s6'), t('onboarding.s7')];
  return (
    <div className="mb-6">
      <p className="mb-2 text-[13px] text-fg-muted" data-testid="onboarding-progress">{t('onboarding.progress', { n: step, total: TOTAL })} · {labels[step - 1]}</p>
      <div className="flex gap-1.5" aria-hidden>
        {labels.map((l, i) => <div key={l} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', i < step ? 'bg-primary' : 'bg-surface-3')} />)}
      </div>
    </div>
  );
}

function StepCard({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <Card className="bf-enter p-5 sm:p-7">
      <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
      {text && <p className="mb-5 mt-1 text-[14.5px] text-fg-muted">{text}</p>}
      {children}
    </Card>
  );
}

export default function OnboardingPage() {
  const { t } = useI18n();
  const me = useMe();
  const qc = useQueryClient();
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const pending = me.data?.memberships.find((m) => m.role === 'OWNER' && m.onboardingStep < 7);
  // Pin the business being onboarded so finishing it (step 7) doesn't drop back to step 2.
  React.useEffect(() => { if (!businessId && pending) setBusinessId(pending.businessId); }, [businessId, pending]);
  const bid = businessId ?? pending?.businessId ?? null;
  const business = useQuery({ queryKey: ['business', bid], queryFn: () => api<BusinessDetail>(`/businesses/${bid}`), enabled: Boolean(bid) });
  const [done, setDone] = React.useState(false);

  const step = !me.data ? 1 : !bid ? 2 : done ? 7 : business.data?.onboardingStep ?? 3;
  const advance = async (to: number) => {
    await api(`/businesses/${bid}`, { method: 'PATCH', body: { onboardingStep: to } });
    await business.refetch();
    if (to === 7) { setDone(true); qc.invalidateQueries({ queryKey: ['me'] }); }
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
        <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{t('onboarding.title')}</p>
        {me.isLoading || (bid && business.isLoading) ? <Skeleton className="h-80" /> : (
          <>
            <Progress step={step} />
            {step === 1 && (
              <StepCard title={t('auth.title')} text={t('onboarding.s1Text')}>
                <OtpLogin onSuccess={() => undefined} submitLabel={t('common.continue')} />
              </StepCard>
            )}
            {step === 2 && <NameStep onCreated={(id) => { setBusinessId(id); qc.invalidateQueries({ queryKey: ['me'] }); }} />}
            {step === 3 && business.data && <AddressStep b={business.data} onNext={() => advance(4)} />}
            {step === 4 && business.data && <BarberStep b={business.data} me={me.data!} onNext={() => advance(5)} />}
            {step === 5 && business.data && <ServicesStep b={business.data} onNext={() => advance(6)} />}
            {step === 6 && business.data && <HoursStep b={business.data} onNext={() => advance(7)} />}
            {step === 7 && business.data && <LinkStep b={business.data} />}
          </>
        )}
      </main>
    </>
  );
}

function NameStep({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const b = await api<{ id: string }>('/businesses', { body: { name: name.trim() } });
      onCreated(b.id);
    } catch (err) { setError(t(errorKey(err))); setBusy(false); }
  }
  return (
    <StepCard title={t('onboarding.s2Title')} text={t('onboarding.s2Text')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('onboarding.s2Placeholder')} maxLength={80} data-testid="ob-name" />
        <Button type="submit" size="lg" block loading={busy} disabled={!name.trim()} data-testid="ob-next">{t('common.continue')}</Button>
      </form>
    </StepCard>
  );
}

function AddressStep({ b, onNext }: { b: BusinessDetail; onNext: () => Promise<void> }) {
  const { t } = useI18n();
  const [city, setCity] = React.useState(b.city ?? t('onboarding.defaultCity'));
  const [address, setAddress] = React.useState(b.address ?? '');
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await api(`/businesses/${b.id}`, { method: 'PATCH', body: { city, address } });
    await onNext();
    setBusy(false);
  }
  return (
    <StepCard title={t('onboarding.s3Title')} text={t('onboarding.s3Text')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('settings.city')}><Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} data-testid="ob-city" /></Field>
        <Field label={t('settings.address')} optionalText={t('common.optional')}><Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} data-testid="ob-address" /></Field>
        <Button type="submit" size="lg" block loading={busy} data-testid="ob-next">{t('common.continue')}</Button>
      </form>
    </StepCard>
  );
}

function BarberStep({ b, me, onNext }: { b: BusinessDetail; me: MeDto; onNext: () => Promise<void> }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['barbers', b.id], queryFn: () => api<BarberRow[]>(`/businesses/${b.id}/barbers`) });
  const [name, setName] = React.useState(me.name ?? '');
  const [self, setSelf] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!existing.data?.length) {
        const barber = await api<{ id: string }>(`/businesses/${b.id}/barbers`, { body: { name: name.trim() } });
        if (self) await api(`/businesses/${b.id}/barbers/${barber.id}/link-me`, { body: {} });
        await qc.invalidateQueries({ queryKey: ['barbers', b.id] });
        await qc.invalidateQueries({ queryKey: ['me'] });
      }
      await onNext();
    } catch (err) { setError(t(errorKey(err))); } finally { setBusy(false); }
  }
  if (existing.isLoading) return <Skeleton className="h-60" />;
  return (
    <StepCard title={t('onboarding.s4Title')} text={t('onboarding.s4Text')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {existing.data?.length ? <p className="font-medium">{existing.data[0].name}</p> : (
          <>
            <Field label={t('common.name')}><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-testid="ob-barber" /></Field>
            <Checkbox checked={self} onChange={(e) => setSelf(e.target.checked)} label={t('onboarding.s4Self')} />
          </>
        )}
        <Button type="submit" size="lg" block loading={busy} disabled={!existing.data?.length && !name.trim()} data-testid="ob-next">{t('common.continue')}</Button>
      </form>
    </StepCard>
  );
}

function ServicesStep({ b, onNext }: { b: BusinessDetail; onNext: () => Promise<void> }) {
  const { t } = useI18n();
  const f = useFormat();
  const list = useQuery({ queryKey: ['services', b.id], queryFn: () => api<ServiceRow[]>(`/businesses/${b.id}/services`) });
  const [name, setName] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [duration, setDuration] = React.useState('45');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const suggestions: [string, number, number][] = [[t('onboarding.suggestion1'), 100000, 45], [t('onboarding.suggestion2'), 150000, 75], [t('onboarding.suggestion3'), 60000, 30]];
  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api(`/businesses/${b.id}/services`, { body: { name: name.trim(), priceUzs: Number(price), durationMin: Number(duration) } });
      setName(''); setPrice(''); setDuration('45');
      list.refetch();
    } catch (e) { setError(t(errorKey(e))); } finally { setBusy(false); }
  }
  const services = (list.data ?? []).filter((s) => s.isActive);
  return (
    <StepCard title={t('onboarding.s5Title')} text={t('onboarding.s5Text')}>
      <div className="flex flex-col gap-4">
        {services.length > 0 && (
          <div className="divide-y divide-border rounded-2xl border border-border">
            {services.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[14.5px]">
                <Check className="size-4 text-success" />
                <span className="flex-1 font-medium">{s.name}</span>
                <span className="text-fg-muted">{f.duration(s.durationMin)}</span>
                <span className="font-semibold tabular-nums">{f.money(s.priceUzs)}</span>
                <Button variant="ghost" size="icon-sm" aria-label={t('common.delete')} onClick={async () => { await api(`/businesses/${b.id}/services/${s.id}`, { method: 'DELETE' }); list.refetch(); }}><Trash2 /></Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {suggestions.filter(([n]) => !services.some((s) => s.name === n)).map(([n, p, d]) => (
            <button key={n} type="button" onClick={() => { setName(n); setPrice(String(p)); setDuration(String(d)); }} className="rounded-full border border-dashed border-border-strong px-3 py-1.5 text-[13px] text-fg-muted transition hover:border-fg-muted hover:text-fg">
              + {n}
            </button>
          ))}
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('services.name')} maxLength={80} data-testid="ob-service-name" />
          <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={t('common.price')} className="w-28" data-testid="ob-service-price" />
          <Input value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="w-16" aria-label={t('services.durationMin')} />
        </div>
        <Button variant="outline" onClick={add} loading={busy} disabled={!name.trim() || !price || Number(duration) < 5} data-testid="ob-add-service"><Plus />{t('onboarding.addService')}</Button>
        <Button size="lg" block disabled={services.length === 0} onClick={onNext} data-testid="ob-next">{t('common.continue')}</Button>
      </div>
    </StepCard>
  );
}

function HoursStep({ b, onNext }: { b: BusinessDetail; onNext: () => Promise<void> }) {
  const { t } = useI18n();
  const barbers = useQuery({ queryKey: ['barbers', b.id], queryFn: () => api<BarberRow[]>(`/businesses/${b.id}/barbers`), refetchOnMount: 'always' });
  const [week, setWeek] = React.useState<WeekEdit>(defaultWeek());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const intervals = intervalsFromWeek(week);
  async function submit() {
    if (!intervals) return;
    setBusy(true);
    setError(null);
    try {
      const list = (await barbers.refetch()).data ?? [];
      for (const barber of list) {
        await api(`/businesses/${b.id}/barbers/${barber.id}/working-hours`, { method: 'PUT', body: { intervals } });
      }
      await onNext();
    } catch (e) { setError(t(errorKey(e))); setBusy(false); }
  }
  return (
    <StepCard title={t('onboarding.s6Title')} text={t('onboarding.s6Text')}>
      <div className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <WeeklyHoursEditor value={week} onChange={setWeek} />
        <Button size="lg" block disabled={!intervals || barbers.isLoading} loading={busy} onClick={submit} data-testid="ob-next">{t('common.continue')}</Button>
      </div>
    </StepCard>
  );
}

function LinkStep({ b }: { b: BusinessDetail }) {
  const { t } = useI18n();
  const barbers = useQuery({ queryKey: ['barbers', b.id], queryFn: () => api<BarberRow[]>(`/businesses/${b.id}/barbers`) });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const barber = barbers.data?.[0];
  const url = barber ? `${origin}/b/${barber.slug}` : `${origin}/s/${b.slug}`;
  return (
    <StepCard title={t('onboarding.s7Title')} text={t('onboarding.s7Text')}>
      {barbers.isLoading ? <Spinner /> : (
        <div className="flex flex-col gap-5">
          <CopyField value={url} />
          <QrCard url={url} fileName={`barberflow-${barber?.slug ?? b.slug}`} />
          <Button asChild size="lg" block><Link href="/app" data-testid="ob-cabinet">{t('onboarding.openCabinet')}</Link></Button>
        </div>
      )}
    </StepCard>
  );
}
