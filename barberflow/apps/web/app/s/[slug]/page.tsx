'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, Clock, MapPin, Phone } from 'lucide-react';
import { Alert, Avatar, Button, Card, Skeleton } from '@barberflow/ui';
import { SiteHeader } from '@/components/site-header';
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

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 pb-32">
        {q.isLoading && (
          <div className="flex flex-col gap-3 pt-4">
            <Skeleton className="h-40" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-24" />
          </div>
        )}
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {b && (
          <div className="bf-enter">
            <div className="relative mt-4 overflow-hidden rounded-3xl border border-border bg-surface-2">
              {b.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.coverUrl} alt="" className="h-44 w-full object-cover sm:h-56" />
              ) : (
                <div className="flex h-36 items-end bg-[radial-gradient(120%_120%_at_0%_0%,var(--surface-3),var(--surface-2))] p-5 sm:h-44">
                  <span className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-fg/10 sm:text-[64px]">{b.name}</span>
                </div>
              )}
            </div>

            <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.03em]" data-testid="shop-name">{b.name}</h1>
            {b.description && <p className="mt-1.5 text-[15px] text-fg-muted">{b.description}</p>}
            <div className="mt-4 flex flex-col gap-2 text-[14.5px]">
              {(b.address || b.city) && (
                <a href={mapUrl(b)} target="_blank" rel="noreferrer" className="inline-flex items-start gap-2.5 text-fg-muted hover:text-fg">
                  <MapPin className="mt-0.5 size-4 shrink-0" />
                  <span>{[b.city, b.address].filter(Boolean).join(', ')}</span>
                </a>
              )}
              {b.phone && (
                <a href={`tel:${b.phone}`} className="inline-flex items-center gap-2.5 text-fg-muted hover:text-fg">
                  <Phone className="size-4" />{f.phone(b.phone)}
                </a>
              )}
            </div>

            {!b.acceptingBookings && <Alert tone="warning" className="mt-5">{t('booking.bookingClosed')}</Alert>}

            <section className="mt-8">
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{t('booking.barbers')}</h2>
              {b.barbers.length === 0 ? (
                <p className="text-[14.5px] text-fg-muted">{t('booking.noBarbers')}</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {b.barbers.map((barber) => (
                    <Card key={barber.id} interactive className="flex items-center gap-3.5 p-3.5">
                      <Avatar name={barber.name} src={barber.photoUrl} size={52} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{barber.name}</p>
                        {barber.specialization && <p className="truncate text-[13.5px] text-fg-muted">{barber.specialization}</p>}
                        <p className="mt-0.5 text-[12.5px] text-fg-subtle">{t('booking.servicesCount', { n: barber.serviceIds.length })}</p>
                      </div>
                      <Button asChild size="sm" variant="secondary" disabled={!b.acceptingBookings}>
                        <Link href={`/s/${b.slug}/book?barber=${barber.id}`} data-testid={`pick-barber-${barber.slug}`}>{t('booking.select')}</Link>
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-8">
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{t('booking.services')}</h2>
              <Card className="divide-y divide-border">
                {b.services.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{serviceName(s, locale)}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-fg-muted"><Clock className="size-3.5" />{f.duration(s.durationMin)}</p>
                    </div>
                    <p className="font-semibold tabular-nums">{f.money(s.priceUzs)}</p>
                  </div>
                ))}
              </Card>
            </section>
          </div>
        )}
      </main>
      {b && b.acceptingBookings && b.barbers.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/90 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <div className="mx-auto max-w-2xl">
            <Button asChild size="lg" block>
              <Link href={`/s/${b.slug}/book`} data-testid="book-cta">{t('booking.bookCta')}<ChevronRight /></Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
