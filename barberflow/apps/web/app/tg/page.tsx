'use client';
import * as React from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Logo, Spinner } from '@barberflow/ui';
import type { MeDto } from '@barberflow/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorKey } from '@/lib/errors';

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
}
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

/**
 * Telegram Mini App entry. The signed initData is verified on the server (HMAC with the bot token);
 * the client never sends a bare user id. start_param carries the shop slug: t.me/<bot>?startapp=<slug>.
 */
export default function TelegramEntry() {
  const { t, setLocale } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const [state, setState] = React.useState<'loading' | 'outside' | 'error'>('loading');
  const [message, setMessage] = React.useState('');
  const started = React.useRef(false);

  const start = React.useCallback(async () => {
    if (started.current) return;
    started.current = true;
    const app = window.Telegram?.WebApp;
    if (!app || !app.initData) { setState('outside'); return; }
    app.ready();
    app.expand();
    // Keep the brand's Espresso theme inside Telegram and match its chrome to it.
    try { app.setHeaderColor?.('#1A120E'); app.setBackgroundColor?.('#1A120E'); } catch { /* older clients */ }
    try {
      const r = await api<{ me: MeDto; startParam: string | null }>('/auth/telegram', { body: { initData: app.initData } });
      qc.setQueryData(['me'], r.me);
      setLocale(r.me.locale);
      const slug = r.startParam && /^[a-z0-9-]{3,40}$/.test(r.startParam) ? r.startParam : null;
      router.replace(slug ? `/s/${slug}/book` : r.me.memberships.length ? '/app' : '/me');
    } catch (e) {
      setMessage(t(errorKey(e)));
      setState('error');
    }
  }, [qc, router, setLocale, t]);

  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={start} onError={() => setState('outside')} />
      <div className="flex max-w-sm flex-col items-center gap-4">
        <Logo />
        {state === 'loading' && <><Spinner /><p className="text-fg-muted">{t('telegram.opening')}</p></>}
        {state === 'outside' && <p className="text-fg-muted">{t('telegram.notInTelegram')}</p>}
        {state === 'error' && <p className="text-danger">{t('telegram.authFailed')} {message}</p>}
      </div>
    </main>
  );
}
