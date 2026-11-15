import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { cookies } from 'next/headers';
import { Providers } from './providers';
import { LOCALE_COOKIE } from '@/lib/i18n-constants';
import { themeInitScript } from '@/lib/theme-script';
import { isLocale } from '@barberflow/shared';
import './globals.css';

// Self-hosted at build time by next/font; Cyrillic for Russian, latin-ext for Uzbek (o‘, g‘).
const manrope = Manrope({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['400', '500', '600', '700', '800'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'BARBERFLOW — онлайн-запись к барберу', template: '%s · BARBERFLOW' },
  description: 'Онлайн-запись к барберам и в барбершопы Узбекистана. Barberga onlayn yozilish.',
  applicationName: 'BARBERFLOW',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1A120E',
  colorScheme: 'dark light',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : 'ru';
  return (
    <html lang={locale === 'uz' ? 'uz-Latn' : 'ru'} data-theme="dark" className={manrope.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
