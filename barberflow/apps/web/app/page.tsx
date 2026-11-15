'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, ShieldCheck, Smartphone } from 'lucide-react';
import { Button, Card, Skeleton } from '@barberflow/ui';
import { monthlyPrice } from '@barberflow/shared';
import { SiteHeader } from '@/components/site-header';
import { PhotoHero } from '@/components/photo-hero';
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
      <SiteHeader overlay />
      <PhotoHero src="/images/hero-interior.jpg" className="min-h-[86svh] sm:min-h-[78svh]">
        <div className="bf-enter mx-auto w-full max-w-5xl px-4 pb-10 sm:pb-16">
          <h1 className="bf-display text-[44px] sm:text-[76px]">
            {t('landing.heroTitle1')}<br />{t('landing.heroTitle2')}
          </h1>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-fg-muted sm:text-[18px]">{t('landing.heroText')}</p>
          <div className="mt-8 flex flex-col gap-3 sm:max-w-md">
            <Button asChild size="lg" block>
              <Link href="/b/aziz" data-testid="cta-demo">{t('booking.bookCta')}<ArrowRight /></Link>
            </Button>
            <p className="text-center text-[13px] text-fg-subtle sm:text-left">{t('landing.ctaDemo')}</p>
          </div>
        </div>
      </PhotoHero>

      <main className="mx-auto max-w-5xl px-4">
        <section className="pt-12">
          <p className="bf-eyebrow">{t('landing.forBusiness')}</p>
          <h2 className="mt-3 max-w-2xl text-[26px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[34px]">{t('landing.title')}</h2>
          <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-fg-muted">{t('landing.subtitle')}</p>
          <Button asChild variant="outline" size="lg" className="mt-6">
            <Link href="/onboarding">{t('landing.ctaStart')}<ArrowRight /></Link>
          </Button>
        </section>

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="p-5">
              <div className="mb-4 grid size-10 place-items-center rounded-xl bg-selected text-primary"><Icon className="size-5" /></div>
              <h3 className="text-[16px] font-bold tracking-tight">{title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-fg-muted">{text}</p>
            </Card>
          ))}
        </section>

        <section className="py-16">
          <h2 className="text-[24px] font-extrabold tracking-[-0.03em]">{t('landing.pricingTitle')}</h2>
          <p className="mt-1 text-[14.5px] text-fg-muted">{t('landing.pricingNote')}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {plans.isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-36" />)}
            {plans.data?.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[14px] font-bold tracking-[0.12em]">{p.name}</h3>
                  <span className="text-[13px] text-fg-muted">
                    {p.pricing === 'FLAT' ? t('landing.oneBarber') : t('landing.minBarbers', { n: p.minSeats })}
                  </span>
                </div>
                <p className="mt-4 text-[30px] font-extrabold tracking-[-0.03em] tabular-nums">{f.money(p.priceUzs)}</p>
                <p className="text-[13.5px] text-fg-muted">
                  {t('common.perMonth')}{p.pricing === 'PER_SEAT' && ` · ${t('landing.perBarber')} · ${t('landing.minBarbers', { n: p.minSeats })}: ${f.money(monthlyPrice(p, 0))}`}
                </p>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-8 text-center text-[13px] text-fg-subtle">BARBERFLOW<span className="text-accent">.</span> · MVP</footer>
    </>
  );
}
