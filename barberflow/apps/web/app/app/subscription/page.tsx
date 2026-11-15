'use client';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { Badge, Card, Skeleton } from '@barberflow/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { ErrorState } from '@/components/states';

interface SubView {
  subscription: null | {
    status: string; seats: number; trialEndsAt: string | null; currentPeriodEnd: string | null; usable: boolean; monthlyPriceUzs: number;
    plan: { id: string; code: string; name: string; pricing: 'FLAT' | 'PER_SEAT'; priceUzs: number; minSeats: number; maxSeats: number | null };
    payments: { id: string; amountUzs: number; periodMonths: number; status: 'PENDING' | 'CONFIRMED' | 'REJECTED'; createdAt: string; confirmedAt: string | null }[];
  };
  activeBarbers: number;
  plans: { id: string; code: string; name: string; pricing: 'FLAT' | 'PER_SEAT'; priceUzs: number; minSeats: number; maxSeats: number | null; monthlyPriceUzs: number }[];
}

export default function SubscriptionPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  const f = useFormat(ws.timezone);
  const q = useQuery({ queryKey: ['subscription', ws.businessId], queryFn: () => api<SubView>(`/businesses/${ws.businessId}/subscription`) });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data.subscription;
  const tone = s?.status === 'ACTIVE' ? 'success' : s?.status === 'TRIALING' ? 'info' : 'warning';
  return (
    <div className="bf-enter flex flex-col gap-5">
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{t('subscription.title')}</h1>
      {s && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-fg-muted">{t('subscription.currentPlan')}</p>
              <p className="text-[22px] font-semibold tracking-tight">{s.plan.name}</p>
            </div>
            <Badge tone={tone}>{t(`subscription.st_${s.status}` as never)}</Badge>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
            {s.trialEndsAt && s.status === 'TRIALING' && <div><dt className="text-fg-muted">{t('subscription.trialEnds')}</dt><dd className="font-medium">{f.date(s.trialEndsAt)}</dd></div>}
            {s.currentPeriodEnd && <div><dt className="text-fg-muted">{t('subscription.periodEnds')}</dt><dd className="font-medium">{f.date(s.currentPeriodEnd)}</dd></div>}
            <div><dt className="text-fg-muted">{t('subscription.activeBarbers')}</dt><dd className="font-medium tabular-nums">{q.data.activeBarbers}</dd></div>
            <div><dt className="text-fg-muted">{t('subscription.monthly')}</dt><dd className="font-medium tabular-nums">{f.money(s.monthlyPriceUzs)}</dd></div>
          </dl>
        </Card>
      )}
      <div className="flex gap-2.5 rounded-2xl border border-border p-4 text-[14px] text-fg-muted"><Info className="mt-0.5 size-4 shrink-0" />{t('subscription.howToPay')}</div>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t('subscription.choosePlan')}</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {q.data.plans.map((p) => (
            <Card key={p.id} className={p.id === s?.plan.id ? 'border-primary p-4' : 'p-4'}>
              <p className="font-semibold">{p.name}</p>
              <p className="mt-2 text-[20px] font-semibold tabular-nums">{f.money(p.monthlyPriceUzs)} <span className="text-[13px] font-normal text-fg-muted">{t('common.perMonth')}</span></p>
              <p className="text-[13px] text-fg-muted">{p.pricing === 'FLAT' ? t('landing.oneBarber') : `${f.money(p.priceUzs)} ${t('landing.perBarber')} · ${t('landing.minBarbers', { n: p.minSeats })}`}</p>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{t('subscription.payments')}</h2>
        {!s?.payments.length ? <p className="text-[14px] text-fg-muted">{t('subscription.noPayments')}</p> : (
          <Card className="divide-y divide-border">
            {s.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 text-[14.5px]">
                <span className="w-24 text-fg-muted">{f.dayMonth(p.createdAt)}</span>
                <span className="flex-1 font-medium tabular-nums">{f.money(p.amountUzs)} · {p.periodMonths} {t('subscription.months')}</span>
                <Badge tone={p.status === 'CONFIRMED' ? 'success' : p.status === 'PENDING' ? 'warning' : 'danger'}>{t(`subscription.pay_${p.status}` as never)}</Badge>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
