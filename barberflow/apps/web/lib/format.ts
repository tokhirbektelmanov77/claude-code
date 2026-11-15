'use client';
import { DateTime } from 'luxon';
import * as F from '@barberflow/shared';
import { useI18n } from './i18n';

/** Locale-bound formatters. All times are shown in the business timezone (Asia/Tashkent by default). */
export function useFormat(timezone: string = F.DEFAULT_TIMEZONE) {
  const { locale } = useI18n();
  return {
    money: (v: number) => F.formatUzs(v, locale),
    duration: (m: number) => F.formatDuration(m, locale),
    date: (d: Date | string) => F.formatDateLong(d, locale, timezone),
    dateWeekday: (d: Date | string) => F.formatDateWithWeekday(d, locale, timezone),
    dayMonth: (d: Date | string) => F.formatDayMonth(d, locale, timezone),
    monthYear: (d: Date | string) => F.formatMonthYear(d, locale, timezone),
    time: (d: Date | string) => F.formatTime(d, timezone),
    timeRange: (a: Date | string, b: Date | string) => F.formatTimeRange(a, b, timezone),
    phone: (p: string | null | undefined) => F.formatUzPhone(p),
    weekdayShort: (n: number) => F.weekdayShort(n, locale),
    weekdayLong: (n: number) => F.weekdayLong(n, locale),
  };
}

export function todayIso(timezone: string = F.DEFAULT_TIMEZONE): string {
  return DateTime.now().setZone(timezone).toISODate()!;
}

export function localDateOf(iso: string, timezone: string = F.DEFAULT_TIMEZONE): string {
  return DateTime.fromISO(iso, { zone: timezone }).toISODate()!;
}

export function minutesInDay(iso: string, timezone: string = F.DEFAULT_TIMEZONE): number {
  const d = DateTime.fromISO(iso, { zone: timezone });
  return d.hour * 60 + d.minute;
}

export function mapUrl(b: { latitude: number | null; longitude: number | null; address: string | null; city?: string | null; name?: string }) {
  if (b.latitude != null && b.longitude != null) return `https://yandex.uz/maps/?pt=${b.longitude},${b.latitude}&z=17&l=map`;
  const q = [b.name, b.address, b.city].filter(Boolean).join(', ');
  return `https://yandex.uz/maps/?text=${encodeURIComponent(q)}`;
}
