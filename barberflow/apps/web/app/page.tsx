'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, ShieldCheck, Smartphone } from 'lucide-react';
import { Button, Card, Skeleton } from '@barberflow/ui';
import { monthlyPrice } from '@barberflow/shared';
import { SiteHeader } from '@/components/site-header';
import { useI18n } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { api } from '@/lib/api';

interface Plan { id: string; code: string; name: string; pricing: 'FLAT' | 'PER_SEAT'; priceUzs: number; minSeats: number; maxSeats: number | null }

export default function Landing() {
  const { t } = useI18n();
  const f = useFormat();
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<Plan[]>('/public/plans') });
  const features = [
    { icon: Smartphone, title: t('landing.f1Title'), text: t('landing.f1Text') },
    { icon: ShieldCheck, title: t('landing.f2Title'), text: t('landing.f2Text') },
    { icon: CalendarClock, title: t('landing.f3Title'), text: t('landing.f3Text') },
  ];
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4">
        <section className="bf-enter pb-14 pt-14 sm:pt-24">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[13px] text-fg-muted">
            <span className="size-1.5 rounded-full bg-accent" /> Toshkent · Samarqand · Buxoro
          </p>
          <h1 className="max-w-3xl text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[56px]">{t('landing.title')}</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-fg-muted">{t('landing.subtitle')}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/b/aziz" data-testid="cta-demo">{t('landing.ctaDemo')}<ArrowRight /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/onboarding">{t('landing.ctaStart')}</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="p-5">
              <div className="mb-4 grid size-10 place-items-center rounded-xl bg-surface-2"><Icon className="size-5" /></div>
              <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-fg-muted">{text}</p>
            </Card>
          ))}
        </section>

        <section className="py-16">
          <h2 className="text-[22px] font-semibold tracking-tight">{t('landing.pricingTitle')}</h2>
          <p className="mt-1 text-[14.5px] text-fg-muted">{t('landing.pricingNote')}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {plans.isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-36" />)}
            {plans.data?.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[15px] font-semibold tracking-wide">{p.name}</h3>
                  <span className="text-[13px] text-fg-muted">
                    {p.pricing === 'FLAT' ? t('landing.oneBarber') : t('landing.minBarbers', { n: p.minSeats })}
                  </span>
                </div>
                <p className="mt-4 text-[28px] font-semibold tracking-tight tabular-nums">{f.money(p.priceUzs)}</p>
                <p className="text-[13.5px] text-fg-muted">
                  {t('common.perMonth')}{p.pricing === 'PER_SEAT' && ` · ${t('landing.perBarber')} · ${t('landing.minBarbers', { n: p.minSeats })}: ${f.money(monthlyPrice(p, 0))}`}
                </p>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-8 text-center text-[13px] text-fg-subtle">© BARBERFLOW · MVP</footer>
    </>
  );
}
