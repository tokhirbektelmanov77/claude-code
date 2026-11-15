'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Phone, Search, Trash2, UsersRound } from 'lucide-react';
import { Alert, Avatar, Button, Card, EmptyState, Field, Input, Sheet, Skeleton, Textarea } from '@barberflow/ui';
import type { AppointmentStatus } from '@barberflow/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { ErrorState, ListSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';

interface CustomerRow { id: string; name: string; phone: string | null; notes: string | null; visits: number; lastVisitAt: string | null; nextVisitAt: string | null; hasAccount: boolean }
interface CustomerDetail { id: string; name: string; phone: string | null; notes: string | null; appointments: { id: string; startsAt: string; endsAt: string; status: AppointmentStatus; serviceName: string; priceUzs: number; barber: { name: string } }[] }

export default function ClientsPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  const f = useFormat(ws.timezone);
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [openId, setOpenId] = React.useState<string | null>(null);
  React.useEffect(() => { const id = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(id); }, [q]);
  const list = useQuery({ queryKey: ['customers', ws.businessId, debounced], queryFn: () => api<CustomerRow[]>(`/businesses/${ws.businessId}/customers?q=${encodeURIComponent(debounced)}`) });

  return (
    <div className="bf-enter flex flex-col gap-4">
      <h1 className="text-[26px] font-semibold tracking-tight">{t('customers.title')}</h1>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('customers.search')} className="pl-10" />
      </div>
      {list.isLoading ? <ListSkeleton /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.length ? (
        <Card><EmptyState icon={UsersRound} title={t('customers.empty')} /></Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {list.data.map((c) => (
            <button key={c.id} type="button" onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60">
              <Avatar name={c.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-[13px] text-fg-muted">{c.phone ? f.phone(c.phone) : '—'}</p>
              </div>
              <div className="text-right text-[13px]">
                <p className="font-medium tabular-nums">{c.visits}</p>
                <p className="text-fg-subtle">{c.lastVisitAt ? f.dayMonth(c.lastVisitAt) : t('customers.noVisits')}</p>
              </div>
            </button>
          ))}
        </Card>
      )}
      <CustomerSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function CustomerSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const f = useFormat(ws.timezone);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api<CustomerDetail>(`/businesses/${ws.businessId}/customers/${id}`), enabled: Boolean(id) });
  const [notes, setNotes] = React.useState('');
  const [confirm, setConfirm] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  React.useEffect(() => { setNotes(q.data?.notes ?? ''); setMsg(null); setConfirm(false); }, [q.data]);
  const c = q.data;

  async function saveNotes() {
    try {
      await api(`/businesses/${ws.businessId}/customers/${id}`, { method: 'PATCH', body: { notes } });
      setMsg(t('common.saved'));
    } catch (e) { setMsg(t(errorKey(e))); }
  }
  async function exportData() {
    const data = await api<unknown>(`/businesses/${ws.businessId}/customers/${id}/export`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `customer-${id}.json`; a.click(); URL.revokeObjectURL(url);
  }
  async function anonymize() {
    await api(`/businesses/${ws.businessId}/customers/${id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['customers'] });
    onClose();
  }

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()} title={c?.name ?? t('customers.title')} size="lg" closeLabel={t('common.close')}>
      {!c ? <Skeleton className="h-60" /> : (
        <div className="flex flex-col gap-4">
          {c.phone && <Button asChild variant="outline" size="sm" className="self-start"><a href={`tel:${c.phone}`}><Phone />{f.phone(c.phone)}</a></Button>}
          <Field label={t('customers.notes')}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} onBlur={saveNotes} />
          </Field>
          {msg && <p className="text-[13px] text-fg-muted">{msg}</p>}
          <div>
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{t('appointment.clientHistory')}</p>
            {c.appointments.length === 0 ? <p className="text-[14px] text-fg-muted">{t('customers.noVisits')}</p> : (
              <div className="divide-y divide-border rounded-2xl border border-border">
                {c.appointments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[14px]">
                    <span className="w-28 shrink-0 tabular-nums text-fg-muted">{f.dayMonth(a.startsAt)} {f.time(a.startsAt)}</span>
                    <span className="min-w-0 flex-1 truncate">{a.serviceName} · {a.barber.name}</span>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
          {ws.isManager && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="outline" size="sm" onClick={exportData}><Download />{t('customers.exportData')}</Button>
              <Button variant="danger-ghost" size="sm" onClick={() => setConfirm(true)}><Trash2 />{t('customers.anonymize')}</Button>
            </div>
          )}
          {confirm && (
            <Alert tone="danger" title={t('customers.anonymize')} action={<div className="flex gap-2"><Button size="sm" variant="danger" onClick={anonymize}>{t('common.delete')}</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button></div>}>
              {t('customers.anonymizeConfirm')}
            </Alert>
          )}
        </div>
      )}
    </Sheet>
  );
}
