'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, UserPlus, Users } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Select, Sheet, Skeleton, Switch } from '@barberflow/ui';
import { normalizeUzPhone, MemberRole } from '@barberflow/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { BarberRow, useBarbers, useServices, useWorkspace } from '@/lib/workspace';

interface Branch { id: string; name: string }
interface Members { members: { id: string; role: MemberRole; status: 'ACTIVE' | 'DISABLED'; user: { id: string; name: string | null; phone: string | null } }[]; invitations: { id: string; phone: string; role: MemberRole; expiresAt: string }[] }

export default function StaffPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  const f = useFormat();
  const qc = useQueryClient();
  const barbers = useBarbers();
  const members = useQuery({ queryKey: ['members', ws.businessId], queryFn: () => api<Members>(`/businesses/${ws.businessId}/members`) });
  const [edit, setEdit] = React.useState<BarberRow | 'new' | null>(null);
  const [invite, setInvite] = React.useState(false);

  return (
    <div className="bf-enter flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{t('staff.title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setInvite(true)}><UserPlus />{t('staff.invite')}</Button>
          <Button onClick={() => setEdit('new')} data-testid="add-barber"><Plus />{t('staff.addBarber')}</Button>
        </div>
      </div>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t('staff.barbers')}</h2>
        {barbers.isLoading ? <Skeleton className="h-40" /> : !barbers.data?.length ? <Card><EmptyState icon={Users} title={t('staff.empty')} /></Card> : (
          <Card className="divide-y divide-border">
            {barbers.data.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={b.name} src={b.photoUrl} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{b.name} {!b.isActive && <Badge className="ml-1">{t('common.inactive')}</Badge>}</p>
                  <p className="truncate text-[13px] text-fg-muted">/b/{b.slug}{b.user ? ` · ${f.phone(b.user.phone)}` : ''}</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setEdit(b)} aria-label={t('common.edit')}><Pencil /></Button>
              </div>
            ))}
          </Card>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t('staff.team')}</h2>
        {members.isLoading ? <Skeleton className="h-24" /> : members.data && (
          <Card className="divide-y divide-border">
            {members.data.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.user.name ?? '—'}</p>
                  <p className="text-[13px] text-fg-muted">{f.phone(m.user.phone)}</p>
                </div>
                {ws.role === 'OWNER' && m.user.id !== ws.me.id ? (
                  <Select value={m.role} className="h-9 w-auto text-[14px]" onChange={async (e) => { await api(`/businesses/${ws.businessId}/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } }); members.refetch(); }}>
                    {(['OWNER', 'MANAGER', 'BARBER'] as const).map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                  </Select>
                ) : <Badge>{t(`role.${m.role}`)}</Badge>}
                {m.status === 'DISABLED' && <Badge tone="danger">{t('common.inactive')}</Badge>}
              </div>
            ))}
            {members.data.invitations.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1"><p className="font-medium tabular-nums">{f.phone(i.phone)}</p><p className="text-[13px] text-fg-muted">{t('staff.pending')}</p></div>
                <Badge tone="warning">{t(`role.${i.role}`)}</Badge>
                <Button variant="ghost" size="sm" onClick={async () => { await api(`/businesses/${ws.businessId}/invitations/${i.id}`, { method: 'DELETE' }); members.refetch(); }}>{t('common.cancel')}</Button>
              </div>
            ))}
          </Card>
        )}
      </section>
      <BarberSheet value={edit} onClose={() => { setEdit(null); qc.invalidateQueries({ queryKey: ['barbers'] }); }} />
      <InviteSheet open={invite} onClose={() => { setInvite(false); members.refetch(); }} barbers={barbers.data ?? []} />
    </div>
  );
}

function BarberSheet({ value, onClose }: { value: BarberRow | 'new' | null; onClose: () => void }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const services = useServices();
  const branches = useQuery({ queryKey: ['branches', ws.businessId], queryFn: () => api<Branch[]>(`/businesses/${ws.businessId}/branches`) });
  const isNew = value === 'new';
  const b = value && value !== 'new' ? value : null;
  const [form, setForm] = React.useState({ name: '', slug: '', specialization: '', bio: '', photoUrl: '', branchId: '', isActive: true, serviceIds: [] as string[] });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!value) return;
    setError(null);
    setForm(b
      ? { name: b.name, slug: b.slug, specialization: b.specialization ?? '', bio: b.bio ?? '', photoUrl: b.photoUrl ?? '', branchId: b.branchId ?? '', isActive: b.isActive, serviceIds: b.serviceIds }
      : { name: '', slug: '', specialization: '', bio: '', photoUrl: '', branchId: '', isActive: true, serviceIds: (services.data ?? []).filter((s) => s.isActive).map((s) => s.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  async function save() {
    setBusy(true);
    setError(null);
    const body = { ...form, slug: form.slug || undefined, branchId: form.branchId || null };
    try {
      if (isNew) await api(`/businesses/${ws.businessId}/barbers`, { body });
      else await api(`/businesses/${ws.businessId}/barbers/${b!.id}`, { method: 'PATCH', body });
      onClose();
    } catch (e) { setError(t(errorKey(e))); } finally { setBusy(false); }
  }
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <Sheet open={Boolean(value)} onOpenChange={(o) => !o && onClose()} title={isNew ? t('staff.addBarber') : t('staff.editBarber')} size="lg" closeLabel={t('common.close')}
      footer={<Button block size="lg" loading={busy} disabled={!form.name.trim()} onClick={save} data-testid="save-barber">{t('common.save')}</Button>}>
      <div className="flex flex-col gap-3.5">
        {error && <Alert tone="danger">{error === t('errors.PLAN_LIMIT') ? t('staff.planLimit') : error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('common.name')}><Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} data-testid="barber-name" /></Field>
          <Field label={t('staff.slug')} hint={form.slug ? `/b/${form.slug}` : undefined} optionalText={isNew ? t('common.optional') : undefined}>
            <Input value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} maxLength={40} />
          </Field>
          <Field label={t('staff.specialization')} optionalText={t('common.optional')}><Input value={form.specialization} onChange={(e) => set({ specialization: e.target.value })} maxLength={80} /></Field>
          <Field label={t('staff.branch')}>
            <Select value={form.branchId} onChange={(e) => set({ branchId: e.target.value })}>
              <option value="">{t('staff.noBranch')}</option>
              {(branches.data ?? []).map((br) => <option key={br.id} value={br.id}>{br.name}</option>)}
            </Select>
          </Field>
          <Field label={t('staff.photoUrl')} optionalText={t('common.optional')} className="sm:col-span-2"><Input type="url" value={form.photoUrl} onChange={(e) => set({ photoUrl: e.target.value })} placeholder="https://" /></Field>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-fg-muted">{t('staff.servicesOffered')}</p>
          <div className="flex flex-col gap-2">
            {(services.data ?? []).filter((s) => s.isActive).map((s) => (
              <Checkbox key={s.id} label={s.name} checked={form.serviceIds.includes(s.id)} onChange={(e) => set({ serviceIds: e.target.checked ? [...form.serviceIds, s.id] : form.serviceIds.filter((x) => x !== s.id) })} />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-3 text-[14.5px]"><Switch checked={form.isActive} onCheckedChange={(c) => set({ isActive: c })} />{form.isActive ? t('common.active') : t('common.inactive')}</label>
      </div>
    </Sheet>
  );
}

function InviteSheet({ open, onClose, barbers }: { open: boolean; onClose: () => void; barbers: BarberRow[] }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const [phone, setPhone] = React.useState('+998 ');
  const [role, setRole] = React.useState<'BARBER' | 'MANAGER'>('BARBER');
  const [barberId, setBarberId] = React.useState('');
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setMsg(null); setPhone('+998 '); } }, [open]);
  const valid = normalizeUzPhone(phone) !== null;
  async function send() {
    setBusy(true);
    try {
      await api(`/businesses/${ws.businessId}/invitations`, { body: { phone: normalizeUzPhone(phone), role, barberId: barberId || undefined } });
      setMsg({ ok: true, text: t('staff.inviteSent') });
    } catch (e) { setMsg({ ok: false, text: t(errorKey(e)) }); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={t('staff.inviteTitle')} description={t('staff.inviteHint')} closeLabel={t('common.close')}
      footer={<Button block size="lg" loading={busy} disabled={!valid} onClick={send}>{t('staff.invite')}</Button>}>
      <div className="flex flex-col gap-3.5">
        {msg && <Alert tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Alert>}
        <Field label={t('common.phone')} error={!valid && phone.length > 6 ? t('errors.INVALID_PHONE') : undefined}><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label={t('common.status')}>
          <Select value={role} onChange={(e) => setRole(e.target.value as 'BARBER' | 'MANAGER')}>
            <option value="BARBER">{t('role.BARBER')}</option><option value="MANAGER">{t('role.MANAGER')}</option>
          </Select>
        </Field>
        {role === 'BARBER' && (
          <Field label={t('staff.linkToBarber')}>
            <Select value={barberId} onChange={(e) => setBarberId(e.target.value)}>
              <option value="">—</option>
              {barbers.filter((b) => !b.userId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
    </Sheet>
  );
}
