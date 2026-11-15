'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@barberflow/ui';
import { SiteHeader } from '@/components/site-header';
import { ErrorState } from '@/components/states';
import { api } from '@/lib/api';

/** Personal barber link: /b/aziz → booking flow with the barber preselected. */
export default function BarberLink() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const q = useQuery({ queryKey: ['barber-slug', slug], queryFn: () => api<{ barberId: string; businessSlug: string }>(`/public/barbers/${encodeURIComponent(slug)}`) });
  React.useEffect(() => {
    if (q.data) router.replace(`/s/${q.data.businessSlug}/book?barber=${q.data.barberId}`);
  }, [q.data, router]);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-16">
        {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <div className="grid place-items-center py-10"><Spinner /></div>}
      </main>
    </>
  );
}
