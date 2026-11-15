'use client';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Card, Skeleton } from '@barberflow/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useBarbers, useWorkspace } from '@/lib/workspace';
import type { AuthMethods } from '@/lib/auth';
import { CopyField } from '@/components/copy-field';
import { QrCard } from '@/components/qr';

export default function LinkPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  const barbers = useBarbers();
  const methods = useQuery({ queryKey: ['auth-methods'], queryFn: () => api<AuthMethods>('/auth/methods') });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (!ws.business || barbers.isLoading) return <Skeleton className="h-96" />;
  const shopUrl = `${origin}/s/${ws.business.slug}`;
  const mine = (barbers.data ?? []).filter((b) => b.isActive && (ws.isManager || b.id === ws.barberId));
  const bot = methods.data?.telegramBotUsername;
  return (
    <div className="bf-enter flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">{t('linkPage.title')}</h1>
        <p className="mt-1 text-[14.5px] text-fg-muted">{t('linkPage.text')}</p>
      </div>
      {ws.isManager && (
        <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><CopyField label={t('linkPage.shopLink')} value={shopUrl} /></div>
          <QrCard url={shopUrl} fileName={`barberflow-${ws.business.slug}`} />
        </Card>
      )}
      {mine.map((b) => {
        const url = `${origin}/b/${b.slug}`;
        return (
          <Card key={b.id} className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex items-center gap-3"><Avatar name={b.name} src={b.photoUrl} size={40} /><p className="font-semibold">{b.name}</p></div>
              <CopyField label={t('linkPage.barberLink')} value={url} />
              {bot && <CopyField label={t('linkPage.telegramLink')} value={`https://t.me/${bot}?startapp=${ws.business!.slug}`} />}
            </div>
            <QrCard url={url} fileName={`barberflow-${b.slug}`} />
          </Card>
        );
      })}
    </div>
  );
}
