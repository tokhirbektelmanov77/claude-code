'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ChevronRight, Download, LogOut, Send, Trash2, UserPlus } from 'lucide-react';
import { Alert, Avatar, Button, Card, EmptyState, Segmented, Sheet } from '@barberflow/ui';
import type { AppointmentDto, MeDto } from '@barberflow/shared';
import { SiteHeader } from '@/components/site-header';
import { ErrorState, ListSkeleton } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useLogout, useMe } from '@/lib/auth';
import { localDateOf, useFormat } from '@/lib/format';
import { errorKey } from '@/lib/errors';

function AppointmentRow({ a }: { a: AppointmentDto }) {
  const f = useFormat(a.business?.timezone);
  return (
    <Link href={`/me/appointments/${a.id}`} className="group block" data-testid="my-appointment">
      <Card interactive className="flex items-center gap-3 p-3.5">
        <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-surface-2 py-2 text-center">
          <span className="text-[19px] font-semibold leading-none tabular-nums">{f.time(a.startsAt)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{a.serviceName}</p>
          <p className="truncate text-[13px] text-fg-muted">{f.dayMonth(localDateOf(a.startsAt, a.business?.timezone))} · {a.barber?.name} · {a.business?.name}</p>
        </div>
        <StatusBadge status={a.status} />
        <ChevronRight className="size-4 text-fg-subtle" />
      </Card>
    </Link>
  );
}

function TelegramCard({ me }: { me: MeDto }) {
  const { t } = useI18n();
  const [state, setState] = React.useState<'idle' | 'busy' | 'notConfigured'>('idle');
  async function connect() {
    setState('busy');
    const r = await api<{ configured: boolean; url: string | null }>('/me/telegram/link', { body: {} }).catch(() => null);
    if (r?.url) {
      window.open(r.url, '_blank', 'noopener');
      setState('idle');
    } else setState('notConfigured');
  }
  return (
    <Card className="p-4">
      <p className="font-medium">{t('me.telegramTitle')}</p>
      {me.telegramLinked ? (
        <p className="mt-1 text-[14px] text-success">{t('me.telegramConnected')}</p>
      ) : (
        <>
          <p className="mt-1 text-[14px] text-fg-muted">{t('me.telegramHint')}</p>
          {state === 'notConfigured' && <Alert tone="info" className="mt-3">{t('me.telegramNotConfigured')}</Alert>}
          <Button variant="outline" size="sm" className="mt-3" loading={state === 'busy'} onClick={connect}><Send />{t('me.telegramConnect')}</Button>
        </>
      )}
    </Card>
  );
}

function MeInner() {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const logout = useLogout();
  const [tab, setTab] = React.useState<'upcoming' | 'past'>('upcoming');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const list = useQuery({ queryKey: ['my-appointments'], queryFn: () => api<AppointmentDto[]>('/me/appointments'), enabled: Boolean(me.data) });
  const fmt = useFormat();

  React.useEffect(() => {
    if (me.data === null) router.replace('/login?next=/me');
  }, [me.data, router]);
  if (me.isLoading || !me.data) return <div className="pt-6"><ListSkeleton /></div>;

  const now = Date.now();
  const upcoming = (list.data ?? []).filter((a) => a.status === 'CONFIRMED' && new Date(a.endsAt).getTime() > now).reverse();
  const past = (list.data ?? []).filter((a) => !(a.status === 'CONFIRMED' && new Date(a.endsAt).getTime() > now));
  const shown = tab === 'upcoming' ? upcoming : past;

  async function exportData() {
    const data = await api<unknown>('/me/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'barberflow-my-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  async function deleteAccount() {
    try {
      await api('/me', { method: 'DELETE' });
      qc.clear();
      // Full reload on purpose: drops every cached query of the signed-out user.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/';
    } catch (e) {
      setError(t(errorKey(e)));
      setConfirmDelete(false);
    }
  }
  async function accept(id: string) {
    await api(`/me/invitations/${id}/accept`, { body: {} });
    await qc.invalidateQueries({ queryKey: ['me'] });
    router.push('/app');
  }

  return (
    <div className="bf-enter flex flex-col gap-6 pt-6">
      <div className="flex items-center gap-3">
        <Avatar name={me.data.name ?? me.data.phone ?? '?'} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold tracking-tight">{t('me.title')}</h1>
          <p className="text-[13.5px] text-fg-muted">{me.data.name ?? ''} {me.data.phone ? `· ${fmt.phone(me.data.phone)}` : ''}</p>
        </div>
      </div>

      {me.data.pendingInvitations.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 font-medium">{t('me.invitations')}</p>
          {me.data.pendingInvitations.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 py-1.5">
              <p className="text-[14.5px]">{i.businessName} · <span className="text-fg-muted">{t(`role.${i.role}`)}</span></p>
              <Button size="sm" onClick={() => accept(i.id)}><UserPlus />{t('me.accept')}</Button>
            </div>
          ))}
        </Card>
      )}

      <section>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: `${t('me.upcoming')}${upcoming.length ? ` · ${upcoming.length}` : ''}` }, { value: 'past', label: t('me.past') }]} className="mb-3 w-full" />
        {list.isLoading ? <ListSkeleton rows={3} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : shown.length === 0 ? (
          <EmptyState icon={CalendarPlus} title={t('me.empty')} text={t('me.emptyHint')} />
        ) : (
          <div className="flex flex-col gap-2">{shown.map((a) => <AppointmentRow key={a.id} a={a} />)}</div>
        )}
      </section>

      <TelegramCard me={me.data} />

      <Card className="p-4">
        <p className="font-medium">{t('me.privacyTitle')}</p>
        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportData}><Download />{t('me.exportData')}</Button>
          <Button variant="danger-ghost" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 />{t('me.deleteAccount')}</Button>
        </div>
      </Card>

      <Button variant="ghost" onClick={logout} className="self-start"><LogOut />{t('common.logout')}</Button>

      <Sheet open={confirmDelete} onOpenChange={setConfirmDelete} size="sm" title={t('me.deleteAccount')} description={t('me.deleteConfirm')} closeLabel={t('common.close')}
        footer={<><Button variant="secondary" block onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button><Button variant="danger" block onClick={deleteAccount}>{t('common.delete')}</Button></>}>
        <span />
      </Sheet>
    </div>
  );
}

export default function MePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-16"><MeInner /></main>
    </>
  );
}
