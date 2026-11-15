'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Download, KeyRound, LayoutGrid, LogOut, Trash2 } from 'lucide-react';
import { Alert, Avatar, Button, Card, Field, Input, Sheet, Spinner } from '@barberflow/ui';
import { SiteHeader } from '@/components/site-header';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useLogout, useMe } from '@/lib/auth';
import { errorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';

/** Staff account: password, data export, deletion. Clients have no accounts. */
function AccountInner() {
  const { t } = useI18n();
  const router = useRouter();
  const forced = useSearchParams().get('change') === '1';
  const qc = useQueryClient();
  const me = useMe();
  const logout = useLogout();
  const f = useFormat();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (me.data === null) router.replace('/login?next=/account');
  }, [me.data, router]);
  if (!me.data) return <div className="grid place-items-center py-20"><Spinner /></div>;
  const mustChange = me.data.mustChangePassword || forced;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/auth/password', { body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      await qc.invalidateQueries({ queryKey: ['me'] });
      setMsg({ ok: true, text: t('auth.changed') });
      if (mustChange) router.replace('/app');
    } catch (err) {
      setMsg({ ok: false, text: t(errorKey(err)) });
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    const data = await api<unknown>('/me/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'barberflow-account.json';
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
      setMsg({ ok: false, text: t(errorKey(e)) });
      setConfirmDelete(false);
    }
  }

  return (
    <div className="bf-enter flex flex-col gap-5 pt-6">
      <div className="flex items-center gap-3">
        <Avatar name={me.data.name ?? me.data.phone ?? '?'} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{t('me.account')}</h1>
          <p className="text-[13.5px] text-fg-muted">{me.data.name} · {f.phone(me.data.phone)}</p>
        </div>
        {me.data.memberships.length > 0 && !mustChange && (
          <Button asChild variant="outline" size="sm"><Link href="/app"><LayoutGrid />{t('nav.cabinet')}</Link></Button>
        )}
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[16px] font-bold"><KeyRound className="size-4 text-accent" />{mustChange ? t('auth.changeTitle') : t('auth.newPassword')}</h2>
        {mustChange && <p className="mt-1 text-[14px] text-fg-muted">{t('auth.changeText')}</p>}
        <form onSubmit={changePassword} className="mt-4 flex flex-col gap-3.5" data-testid="change-password">
          {msg && <Alert tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Alert>}
          <Field label={t('auth.currentPassword')}><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="current-password" /></Field>
          <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="new-password" /></Field>
          <Button type="submit" loading={busy} disabled={!current || next.length < 8} data-testid="save-password">{t('common.save')}</Button>
        </form>
      </Card>

      {!mustChange && (
        <Card className="p-5">
          <p className="font-bold">{t('me.privacyTitle')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportData}><Download />{t('me.exportData')}</Button>
            <Button variant="danger-ghost" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 />{t('me.deleteAccount')}</Button>
          </div>
        </Card>
      )}
      <Button variant="ghost" onClick={logout} className="self-start"><LogOut />{t('common.logout')}</Button>

      <Sheet open={confirmDelete} onOpenChange={setConfirmDelete} size="sm" title={t('me.deleteAccount')} description={t('me.deleteConfirm')} closeLabel={t('common.close')}
        footer={<><Button variant="secondary" block onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button><Button variant="danger" block onClick={deleteAccount}>{t('common.delete')}</Button></>}>
        <span />
      </Sheet>
    </div>
  );
}

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-16"><React.Suspense><AccountInner /></React.Suspense></main>
    </>
  );
}
