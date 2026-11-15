import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Providers } from './providers';
import { LOCALE_COOKIE } from '@/lib/i18n-constants';
import { themeInitScript } from '@/lib/theme-script';
import { isLocale } from '@barberflow/shared';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'BARBERFLOW — онлайн-запись к барберу', template: '%s · BARBERFLOW' },
  description: 'Онлайн-запись к барберам и в барбершопы Узбекистана. Barberga onlayn yozilish.',
  applicationName: 'BARBERFLOW',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#121110' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : 'ru';
  return (
    <html lang={locale === 'uz' ? 'uz-Latn' : 'ru'} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
