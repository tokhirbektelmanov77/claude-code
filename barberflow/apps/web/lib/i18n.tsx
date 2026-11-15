'use client';
import * as React from 'react';
import { DEFAULT_LOCALE, isLocale, Locale, TranslationKey, translate } from '@barberflow/shared';

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;
interface I18nValue { locale: Locale; setLocale: (l: Locale) => void; t: TFn }

const I18nContext = React.createContext<I18nValue | null>(null);
export { LOCALE_COOKIE } from './i18n-constants';
import { LOCALE_COOKIE } from './i18n-constants';

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale);
  const setLocale = React.useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l === 'uz' ? 'uz-Latn' : 'ru';
    // Best effort: remember on the account too (ignored when signed out).
    fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: l }) }).catch(() => undefined);
  }, []);
  const t = React.useCallback<TFn>((key, vars) => translate(locale, key, vars), [locale]);
  const value = React.useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}

export function parseLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
