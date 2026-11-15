'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Ban, CheckCircle2, CircleDollarSign, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select, Segmented, Sheet, Skeleton, Stat, Textarea } from '@barberflow/ui';
import { SiteHeader } from '@/components/site-header';
import { ErrorState, ListSkeleton } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMe } from '@/lib/auth';
import { errorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';

interface BizRow {
  id: string; name: string; slug: string; city: string | null; status: 'ACTIVE' | 'BLOCKED'; blockedReason: string | null; isDemo: boolean; createdAt: string;
  barbers: number; appointments: number; owner: { phone: string | null; name: string | null } | null;
  subscription: { status: string; plan: { code: string; name: string }; seats: number; trialEndsAt: string | null; currentPeriodEnd: string | null } | null;
}
interface Plan { id: string; code: string; name: string; description: string | null; pricing: 'FLAT' | 'PER_SEAT'; priceUzs: number; minSeats: number; maxSeats: number | null; trialDays: number; isActive: boolean; _count: { subscriptions: number } }
interface Payment { id: string; amountUzs: number; periodMonths: number; method: string; status: 'PENDING' | 'CONFIRMED' | 'REJECTED'; reference: string | null; note: string | null; createdAt: string; business: { id: string; name: string; slug: string } }
interface Overview { businesses: number; blocked: number; subscriptions: Record<string, number>; appointments: number; users: number; errors24h: number; failedJobs: number }

type Tab = 'businesses' | 'plans' | 'payments' | 'errors' | 'audit';

export default function PlatformAdminPage() {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>('businesses');
  React.useEffect(() => { if (me.data === null) router.replace('/login?next=/platform-admin'); }, [me.data, router]);

  if (me.isLoading || me.data === null) return <><SiteHeader /><main className="mx-auto max-w-6xl px-4 py-8"><ListSkeleton /></main></>;
  if (!me.data?.isPlatformAdmin) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-xl px-4 py-16"><EmptyState icon={ShieldAlert} title="403" text={t('admin.forbidden')} action={<Button asChild variant="outline"><Link href="/">{t('common.toHome')}</Link></Button>} /></main>
      </>
    );
  }
  return (
    <>
      <SiteHeader />
      <main className="bf-enter mx-auto max-w-6xl px-4 pb-16 pt-6">
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]" data-testid="admin-title">{t('admin.title')}</h1>
        <OverviewCards />
        <div className="no-scrollbar -mx-4 mt-6 overflow-x-auto px-4">
          <Segmented value={tab} onChange={setTab} options={(['businesses', 'plans', 'payments', 'errors', 'audit'] as const).map((v) => ({ value: v, label: t(`admin.${v}`) }))} />
        </div>
        <div className="mt-4">
          {tab === 'businesses' && <Businesses />}
          {tab === 'plans' && <Plans />}
          {tab === 'payments' && <Payments />}
          {tab === 'errors' && <Errors />}
          {tab === 'audit' && <Audit />}
        </div>
      </main>
    </>
  );
}

function OverviewCards() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: () => api<Overview>('/platform-admin/overview') });
  if (!q.data) return <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  const s = q.data.subscriptions;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Stat label={t('admin.totalBusinesses')} value={q.data.businesses} hint={q.data.blocked ? `${t('admin.blocked')}: ${q.data.blocked}` : undefined} />
      <Stat label={t('admin.activeSubs')} value={s.ACTIVE ?? 0} />
      <Stat label={t('admin.trialSubs')} value={s.TRIALING ?? 0} />
      <Stat label={t('admin.inactiveSubs')} value={(s.EXPIRED ?? 0) + (s.PAST_DUE ?? 0) + (s.CANCELLED ?? 0)} hint={`${t('admin.errors')} 24h: ${q.data.errors24h}`} />
    </div>
  );
}

function Businesses() {
  const { t } = useI18n();
  const f = useFormat();
  const [search, setSearch] = React.useState('');
  const q = useQuery({ queryKey: ['admin-businesses', search], queryFn: () => api<BizRow[]>(`/platform-admin/businesses?q=${encodeURIComponent(search)}`) });
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<Plan[]>('/platform-admin/plans') });
  const [block, setBlock] = React.useState<BizRow | null>(null);
  const [pay, setPay] = React.useState<BizRow | null>(null);
  const [reason, setReason] = React.useState('');
  const [payForm, setPayForm] = React.useState({ amountUzs: '', periodMonths: '1', method: 'BANK_TRANSFER', reference: '', planId: '' });
  const [error, setError] = React.useState<string | null>(null);

  async function doBlock() {
    try { await api(`/platform-admin/businesses/${block!.id}/block`, { body: { reason } }); setBlock(null); setReason(''); q.refetch(); } catch (e) { setError(t(errorKey(e))); }
  }
  async function unblock(b: BizRow) { await api(`/platform-admin/businesses/${b.id}/unblock`, { body: {} }); q.refetch(); }
  async function record() {
    try {
      await api(`/platform-admin/businesses/${pay!.id}/payments`, { body: { amountUzs: Number(payForm.amountUzs), periodMonths: Number(payForm.periodMonths), method: payForm.method, reference: payForm.reference || null, planId: payForm.planId || undefined } });
      setPay(null); q.refetch();
    } catch (e) { setError(t(errorKey(e))); }
  }
  const subTone = (s?: string) => (s === 'ACTIVE' ? 'success' : s === 'TRIALING' ? 'info' : 'warning') as 'success' | 'info' | 'warning';

  return (
    <>
      <div className="relative mb-3 max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="pl-10" />
      </div>
      {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[14px]">
            <thead className="border-b border-border text-[12.5px] text-fg-muted">
              <tr>{[t('common.name'), t('admin.owner'), t('admin.barbers'), t('admin.appointments'), t('subscription.plan'), t('subscription.status'), ''].map((h, i) => <th key={i} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.data!.map((b) => (
                <tr key={b.id} data-testid="admin-business-row">
                  <td className="px-4 py-3">
                    <Link href={`/s/${b.slug}`} className="font-medium hover:underline">{b.name}</Link>
                    {b.isDemo && <Badge className="ml-1.5">{t('common.demoBadge')}</Badge>}
                    {b.status === 'BLOCKED' && <Badge tone="danger" className="ml-1.5">{t('admin.blocked')}</Badge>}
                    <p className="text-[12.5px] text-fg-subtle">{b.city ?? '—'} · {f.dayMonth(b.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{b.owner?.name ?? '—'}<br /><span className="text-[12.5px] tabular-nums">{f.phone(b.owner?.phone)}</span></td>
                  <td className="px-4 py-3 tabular-nums">{b.barbers}</td>
                  <td className="px-4 py-3 tabular-nums">{b.appointments}</td>
                  <td className="px-4 py-3">{b.subscription?.plan.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {b.subscription && <Badge tone={subTone(b.subscription.status)}>{t(`subscription.st_${b.subscription.status}` as never)}</Badge>}
                    <p className="mt-0.5 text-[12px] text-fg-subtle">
                      {b.subscription?.status === 'TRIALING' && b.subscription.trialEndsAt ? `→ ${f.dayMonth(b.subscription.trialEndsAt)}` : b.subscription?.currentPeriodEnd ? `→ ${f.dayMonth(b.subscription.currentPeriodEnd)}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setPay(b); setError(null); }}><CircleDollarSign />{t('admin.recordPayment')}</Button>
                      {b.status === 'BLOCKED'
                        ? <Button size="sm" variant="ghost" onClick={() => unblock(b)}><RotateCcw />{t('admin.unblock')}</Button>
                        : <Button size="sm" variant="danger-ghost" onClick={() => { setBlock(b); setError(null); }} data-testid="admin-block"><Ban />{t('admin.block')}</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Sheet open={Boolean(block)} onOpenChange={(o) => !o && setBlock(null)} title={`${t('admin.block')}: ${block?.name ?? ''}`} closeLabel={t('common.close')} size="sm"
        footer={<Button variant="danger" block disabled={reason.trim().length < 3} onClick={doBlock}>{t('admin.block')}</Button>}>
        {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
        <Field label={t('admin.blockReason')}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} /></Field>
      </Sheet>
      <Sheet open={Boolean(pay)} onOpenChange={(o) => !o && setPay(null)} title={`${t('admin.recordPayment')}: ${pay?.name ?? ''}`} description={t('admin.paymentNote')} closeLabel={t('common.close')}
        footer={<Button block disabled={!Number(payForm.amountUzs)} onClick={record}>{t('admin.recordPayment')}</Button>}>
        <div className="flex flex-col gap-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('admin.amount')}><Input inputMode="numeric" value={payForm.amountUzs} onChange={(e) => setPayForm({ ...payForm, amountUzs: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label={t('admin.months')}><Input type="number" min={1} max={24} value={payForm.periodMonths} onChange={(e) => setPayForm({ ...payForm, periodMonths: e.target.value })} /></Field>
            <Field label={t('admin.method')}>
              <Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                {['BANK_TRANSFER', 'CASH', 'MANUAL'].map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label={t('admin.changePlan')}>
              <Select value={payForm.planId} onChange={(e) => setPayForm({ ...payForm, planId: e.target.value })}>
                <option value="">{pay?.subscription?.plan.name ?? '—'}</option>
                {(plans.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label={t('admin.reference')}><Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} maxLength={120} /></Field>
        </div>
      </Sheet>
    </>
  );
}

function Plans() {
  const { t } = useI18n();
  const f = useFormat();
  const q = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<Plan[]>('/platform-admin/plans') });
  const [edit, setEdit] = React.useState<Plan | null>(null);
  const [form, setForm] = React.useState({ priceUzs: '', minSeats: '', maxSeats: '', trialDays: '' });
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (edit) setForm({ priceUzs: String(edit.priceUzs), minSeats: String(edit.minSeats), maxSeats: edit.maxSeats?.toString() ?? '', trialDays: String(edit.trialDays) }); }, [edit]);
  async function save() {
    try {
      await api(`/platform-admin/plans/${edit!.id}`, { method: 'PATCH', body: { priceUzs: Number(form.priceUzs), minSeats: Number(form.minSeats), maxSeats: form.maxSeats ? Number(form.maxSeats) : null, trialDays: Number(form.trialDays) } });
      setEdit(null); q.refetch();
    } catch (e) { setError(t(errorKey(e))); }
  }
  if (q.isLoading) return <ListSkeleton rows={2} />;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {q.data?.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-center justify-between"><p className="text-[17px] font-semibold">{p.name}</p><Badge>{t(`admin.pricing_${p.pricing}` as never)}</Badge></div>
            <p className="mt-3 text-[24px] font-semibold tabular-nums">{f.money(p.priceUzs)}</p>
            <p className="text-[13px] text-fg-muted">{t('admin.minSeats')}: {p.minSeats} · {t('admin.maxSeats')}: {p.maxSeats ?? '∞'} · {t('admin.trialDays')}: {p.trialDays}</p>
            <p className="mt-1 text-[13px] text-fg-subtle">{t('admin.businesses')}: {p._count.subscriptions}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => { setEdit(p); setError(null); }} data-testid={`edit-plan-${p.code}`}>{t('common.edit')}</Button>
          </Card>
        ))}
      </div>
      <Sheet open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title={edit?.name ?? ''} closeLabel={t('common.close')} footer={<Button block onClick={save} data-testid="save-plan">{t('common.save')}</Button>}>
        <div className="grid grid-cols-2 gap-3">
          {error && <Alert tone="danger" className="col-span-2">{error}</Alert>}
          <Field label={t('admin.amount')}><Input inputMode="numeric" value={form.priceUzs} onChange={(e) => setForm({ ...form, priceUzs: e.target.value.replace(/\D/g, '') })} data-testid="plan-price" /></Field>
          <Field label={t('admin.trialDays')}><Input type="number" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value })} /></Field>
          <Field label={t('admin.minSeats')}><Input type="number" value={form.minSeats} onChange={(e) => setForm({ ...form, minSeats: e.target.value })} /></Field>
          <Field label={t('admin.maxSeats')}><Input type="number" value={form.maxSeats} onChange={(e) => setForm({ ...form, maxSeats: e.target.value })} placeholder="∞" /></Field>
        </div>
      </Sheet>
    </>
  );
}

function Payments() {
  const { t } = useI18n();
  const f = useFormat();
  const q = useQuery({ queryKey: ['admin-payments'], queryFn: () => api<Payment[]>('/platform-admin/payments') });
  const [error, setError] = React.useState<string | null>(null);
  async function act(id: string, action: 'confirm' | 'reject') {
    setError(null);
    try { await api(`/platform-admin/payments/${id}/${action}`, { body: {} }); q.refetch(); } catch (e) { setError(t(errorKey(e))); }
  }
  if (q.isLoading) return <ListSkeleton />;
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="info">{t('admin.paymentNote')}</Alert>
      {error && <Alert tone="danger">{error}</Alert>}
      {!q.data?.length ? <Card><EmptyState title={t('subscription.noPayments')} /></Card> : (
        <Card className="divide-y divide-border">
          {q.data.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[14px]">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.business.name} · <span className="tabular-nums">{f.money(p.amountUzs)}</span> · {p.periodMonths} {t('subscription.months')}</p>
                <p className="text-[12.5px] text-fg-subtle">{f.dayMonth(p.createdAt)} · {p.method}{p.reference ? ` · ${p.reference}` : ''}{p.note ? ` · ${p.note}` : ''}</p>
              </div>
              <Badge tone={p.status === 'CONFIRMED' ? 'success' : p.status === 'PENDING' ? 'warning' : 'danger'}>{t(`subscription.pay_${p.status}` as never)}</Badge>
              {p.status === 'PENDING' && (
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => act(p.id, 'confirm')} data-testid="confirm-payment"><CheckCircle2 />{t('admin.confirmPayment')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(p.id, 'reject')}>{t('admin.rejectPayment')}</Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Errors() {
  const { t } = useI18n();
  const f = useFormat();
  const errors = useQuery({ queryKey: ['admin-errors'], queryFn: () => api<{ id: string; source: string; message: string; createdAt: string }[]>('/platform-admin/errors') });
  const jobs = useQuery({ queryKey: ['admin-jobs'], queryFn: () => api<{ byStatus: Record<string, number>; recent: { id: string; type: string; status: string; lastError: string | null; updatedAt: string }[] }>('/platform-admin/notifications') });
  return (
    <div className="flex flex-col gap-4">
      {jobs.data && (
        <Card className="p-4">
          <p className="mb-2 font-medium">{t('admin.notifications')}</p>
          <div className="flex flex-wrap gap-2">{Object.entries(jobs.data.byStatus).map(([k, v]) => <Badge key={k} tone={k === 'FAILED' ? 'danger' : k === 'SENT' ? 'success' : 'neutral'}>{k}: {v}</Badge>)}</div>
          {jobs.data.recent.length > 0 && (
            <div className="mt-3 max-h-52 overflow-y-auto text-[12.5px] text-fg-muted">
              {jobs.data.recent.map((j) => <p key={j.id} className="font-mono">{f.dayMonth(j.updatedAt)} {f.time(j.updatedAt)} {j.type} {j.status} {j.lastError ?? ''}</p>)}
            </div>
          )}
        </Card>
      )}
      {errors.isLoading ? <ListSkeleton /> : !errors.data?.length ? <Card><EmptyState icon={CheckCircle2} title={t('admin.noErrors')} /></Card> : (
        <Card className="divide-y divide-border">
          {errors.data.map((e) => (
            <div key={e.id} className="px-4 py-3 text-[13.5px]">
              <p className="text-fg-subtle">{f.dayMonth(e.createdAt)} {f.time(e.createdAt)} · {e.source}</p>
              <p className="mt-0.5 break-words font-mono">{e.message}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Audit() {
  const f = useFormat();
  const q = useQuery({ queryKey: ['admin-audit'], queryFn: () => api<{ id: string; action: string; entityType: string | null; createdAt: string; actor: { name: string | null; phone: string | null } | null; business: { name: string } | null }[]>('/platform-admin/audit') });
  if (q.isLoading) return <ListSkeleton />;
  return (
    <Card className="divide-y divide-border">
      {q.data?.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-[13.5px]" data-testid="audit-row">
          <span className="w-28 shrink-0 tabular-nums text-fg-subtle">{f.dayMonth(a.createdAt)} {f.time(a.createdAt)}</span>
          <span className="font-mono font-medium">{a.action}</span>
          <span className="text-fg-muted">{a.actor?.name ?? f.phone(a.actor?.phone) ?? '—'}{a.business ? ` · ${a.business.name}` : ''}</span>
        </div>
      ))}
    </Card>
  );
}
