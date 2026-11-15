import { ru } from './ru';
import { uz } from './uz';
import type { Locale } from '../format';

type Stringify<T> = { [K in keyof T]: T[K] extends string ? string : Stringify<T[K]> };
export type Dictionary = Stringify<typeof ru>;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TranslationKey = Leaves<Dictionary>;

export const dictionaries: Record<Locale, Dictionary> = { ru, uz };

/** Looks up a dotted key and interpolates {placeholders}. Falls back to Russian, then the key. */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const lookup = (dict: unknown): string | undefined => {
    let cur: unknown = dict;
    for (const part of key.split('.')) {
      if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part];
      } else return undefined;
    }
    return typeof cur === 'string' ? cur : undefined;
  };
  const raw = lookup(dictionaries[locale]) ?? lookup(dictionaries.ru) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export { ru, uz };
