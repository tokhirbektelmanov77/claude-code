'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, MapPin, Pencil, Plus } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Sheet, Skeleton, Switch } from '@barberflow/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { useWorkspace } from '@/lib/workspace';

interface Branch { id: string; name: string; city: string | null; address: string | null; phone: string | null; isActive: boolean }

export default function BranchesPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  const q = useQuery({ queryKey: ['branches', ws.businessId], queryFn: () => api<Branch[]>(`/businesses/${ws.businessId}/branches`) });
  const [edit, setEdit] = React.useState<Branch | 'new' | null>(null);
  const [form, setForm] = React.useState({ name: '', city: '', address: '', isActive: true });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!edit) return;
    setError(null);
    setForm(edit === 'new' ? { name: '', city: ws.business?.city ?? '', address: '', isActive: true } : { name: edit.name, city: edit.city ?? '', address: edit.address ?? '', isActive: edit.isActive });
  }, [edit, ws.business]);
  async function save() {
    setBusy(true);
    try {
      if (edit === 'new') await api(`/businesses/${ws.businessId}/branches`, { body: form });
      else if (edit) await api(`/businesses/${ws.businessId}/branches/${edit.id}`, { method: 'PATCH', body: form });
      setEdit(null);
      q.refetch();
    } catch (e) { setError(t(errorKey(e))); } finally { setBusy(false); }
  }
  return (
    <div className="bf-enter flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{t('branches.title')}</h1>
        <Button onClick={() => setEdit('new')}><Plus />{t('branches.add')}</Button>
      </div>
      {q.isLoading ? <Skeleton className="h-40" /> : !q.data?.length ? <Card><EmptyState icon={Building2} title={t('branches.empty')} /></Card> : (
        <Card className="divide-y divide-border">
          {q.data.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{b.name} {!b.isActive && <Badge className="ml-1">{t('common.inactive')}</Badge>}</p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-fg-muted"><MapPin className="size-3.5" />{[b.city, b.address].filter(Boolean).join(', ') || '—'}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setEdit(b)} aria-label={t('common.edit')}><Pencil /></Button>
            </div>
          ))}
        </Card>
      )}
      <Sheet open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? t('branches.add') : t('branches.title')} closeLabel={t('common.close')}
        footer={<Button block size="lg" loading={busy} disabled={!form.name.trim()} onClick={save}>{t('common.save')}</Button>}>
        <div className="flex flex-col gap-3.5">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label={t('common.name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} /></Field>
          <Field label={t('branches.city')}><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={80} /></Field>
          <Field label={t('branches.address')}><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={200} /></Field>
          <label className="flex items-center gap-3 text-[14.5px]"><Switch checked={form.isActive} onCheckedChange={(c) => setForm({ ...form, isActive: c })} />{form.isActive ? t('common.active') : t('common.inactive')}</label>
        </div>
      </Sheet>
    </div>
  );
}
