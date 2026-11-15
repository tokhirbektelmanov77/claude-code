'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { Alert, Button, Card, Skeleton } from '@barberflow/ui';
import type { MemberRole, MeDto } from '@barberflow/shared';
import { SiteHeader } from '@/components/site-header';
import { StaffAuth } from '@/components/staff-auth';
import { ErrorState } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMe } from '@/lib/auth';
import { errorKey } from '@/lib/errors';

/** Team invitation by secret link: preview → sign in or create an account → accept. */
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const inv = useQuery({ queryKey: ['invite', token], queryFn: () => api<{ businessName: string; role: MemberRole }>(`/invitations/${token}`), retry: false });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<MeDto>(`/invitations/${token}/accept`, { body: {} });
      qc.setQueryData(['me'], updated);
      router.replace('/app');
    } catch (e) {
      setError(t(errorKey(e)));
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader minimal />
      <main className="mx-auto max-w-md px-4 pb-16 pt-10">
        {inv.isLoading || me.isLoading ? <Skeleton className="h-72" /> : inv.isError ? (
          <ErrorState error={inv.error} />
        ) : inv.data && (
          <Card className="bf-enter p-5 sm:p-7">
            <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-selected text-primary"><UserPlus className="size-6" /></div>
            <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{t('me.inviteTitle')}</h1>
            <p className="mt-1.5 text-[15px] text-fg-muted" data-testid="invite-text">{t('me.inviteText', { business: inv.data.businessName, role: t(`role.${inv.data.role}`) })}</p>
            <div className="mt-6">
              {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
              {me.data ? (
                <Button size="lg" block loading={busy} onClick={accept} data-testid="accept-invite">{t('me.accept')}</Button>
              ) : (
                <>
                  <p className="mb-4 text-[14px] text-fg-muted">{t('me.signInToAccept')}</p>
                  <StaffAuth initialMode="register" onSuccess={() => undefined} />
                </>
              )}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
