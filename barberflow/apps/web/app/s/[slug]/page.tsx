'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, Clock, MapPin, Phone, Scissors } from 'lucide-react';
import { Alert, Avatar, Button, Card, Skeleton } from '@barberflow/ui';
import { SiteHeader } from '@/components/site-header';
import { PhotoHero } from '@/components/photo-hero';
import { ErrorState } from '@/components/states';
import { useI18n } from '@/lib/i18n';
import { mapUrl, useFormat } from '@/lib/format';
import { serviceName, usePublicBusiness } from '@/lib/public';

export default function ShopPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, locale } = useI18n();
  const q = usePublicBusiness(slug);
  const f = useFormat(q.data?.timezone);
  const b = q.data;

  if (!b) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 pt-4">
          {q.isLoading && <div className="flex flex-col gap-3"><Skeleton className="h-64" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        </main>
      </>
    );
  }

  const place = [b.city, b.address].filter(Boolean).join(', ');
  return (
    <>
      <SiteHeader overlay />
      <PhotoHero src={b.coverUrl || '/images/hero-interior.jpg'} className="min-h-[52svh] sm:min-h-[56svh]">
        <div className="bf-enter mx-auto w-full max-w-2xl px-4 pb-6">
          <h1 className="bf-display text-[38px] sm:text-[56px]" data-testid="shop-name">{b.name}</h1>
          {b.description && <p className="mt-2 max-w-lg text-[15px] text-fg-muted">{b.description}</p>}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[14.5px]">
            {place && (
              <a href={mapUrl(b)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-fg-muted hover:text-fg">
                <MapPin className="size-4 text-accent" />{place}
              </a>
            )}
            {b.phone && (
              <a href={`tel:${b.phone}`} className="inline-flex items-center gap-2 text-fg-muted hover:text-fg">
                <Phone className="size-4 text-accent" />{f.phone(b.phone)}
              </a>
            )}
          </div>
        </div>
      </PhotoHero>

      <main className="mx-auto max-w-2xl px-4 pb-32">
        {!b.acceptingBookings && <Alert tone="warning" className="mt-2">{t('booking.bookingClosed')}</Alert>}

        <section className="mt-6">
          <h2 className="bf-eyebrow mb-3">{t('booking.barbers')}</h2>
          {b.barbers.length === 0 ? (
            <p className="text-[14.5px] text-fg-muted">{t('booking.noBarbers')}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {b.barbers.map((barber) => (
                <Card key={barber.id} interactive className="flex items-center gap-3.5 p-3.5">
                  <Avatar name={barber.name} src={barber.photoUrl} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-bold">{barber.name}</p>
                    {barber.specialization && <p className="truncate text-[13.5px] text-fg-muted">{barber.specialization}</p>}
                    <p className="mt-0.5 text-[12.5px] text-fg-subtle">{t('booking.servicesCount', { n: barber.serviceIds.length })}</p>
                  </div>
                  <Button asChild size="sm" disabled={!b.acceptingBookings}>
                    <Link href={`/s/${b.slug}/book?barber=${barber.id}`} data-testid={`pick-barber-${barber.slug}`}>{t('booking.select')}</Link>
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="bf-eyebrow mb-3">{t('booking.services')}</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {b.services.map((s) => (
              <div key={s.id} className="flex items-center gap-3.5 px-4 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-primary"><Scissors className="size-[18px]" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{serviceName(s, locale)}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-fg-muted"><Clock className="size-3.5" />{f.duration(s.durationMin)}</p>
                </div>
                <p className="font-bold tabular-nums">{f.money(s.priceUzs)}</p>
              </div>
            ))}
          </Card>
        </section>
      </main>

      {b.acceptingBookings && b.barbers.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/92 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <div className="mx-auto max-w-2xl">
            <Button asChild size="lg" block>
              <Link href={`/s/${b.slug}/book`} data-testid="book-cta">{t('booking.bookCta')}<ArrowRight /></Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
