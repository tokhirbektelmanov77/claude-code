'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@barberflow/ui';
import { PhotoHero } from '@/components/photo-hero';
import { SiteHeader } from '@/components/site-header';
import { OtpLogin } from '@/components/otp-login';
import { useI18n } from '@/lib/i18n';

function safeNext(v: string | null): string {
  // Only same-site relative paths: no open redirects.
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/me';
}

function LoginInner() {
  const { t } = useI18n();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  return (
    <main className="mx-auto flex max-w-md flex-col px-4 pb-16">
      <Card className="bf-enter -mt-10 p-5 sm:p-7">
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{t('auth.title')}</h1>
        <p className="mb-6 mt-1 text-[14.5px] text-fg-muted">{t('auth.subtitle')}</p>
        <OtpLogin onSuccess={(me) => router.replace(next === '/me' && me.memberships.length ? '/app' : next)} />
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <>
      <SiteHeader minimal overlay />
      <PhotoHero src="/images/hero-portrait.jpg" className="h-[34svh] min-h-56"><span /></PhotoHero>
      <React.Suspense><LoginInner /></React.Suspense>
    </>
  );
}
