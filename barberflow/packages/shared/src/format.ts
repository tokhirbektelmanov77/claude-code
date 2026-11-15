import { DateTime } from 'luxon';

export type Locale = 'ru' | 'uz';
export const LOCALES: Locale[] = ['ru', 'uz'];
export const DEFAULT_LOCALE: Locale = 'ru';
export const DEFAULT_TIMEZONE = 'Asia/Tashkent';

/** BCP-47 tag used for Intl / luxon. Uzbek is always Latin script in this product. */
export function intlLocale(locale: Locale): string {
  return locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU';
}

export function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'uz';
}

/** Groups digits by thousands with a no-break space (U+00A0): 100000 -> "100 000". */
export function groupDigits(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = Math.round(Math.abs(value)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 100000 -> "100 000 сум" (ru) / "100 000 so‘m" (uz). Amounts are whole UZS. */
export function formatUzs(amount: number, locale: Locale): string {
  return `${groupDigits(amount)}\u00a0${locale === 'uz' ? 'so‘m' : 'сум'}`;
}

/**
 * Normalises an Uzbekistan phone number to E.164 (+998XXXXXXXXX).
 * Accepts "+998 90 123-45-67", "998901234567", "90 123 45 67", "8 90 1234567" style inputs.
 * Returns null when the input cannot be a valid Uzbek mobile/landline number.
 */
export function normalizeUzPhone(input: string): string | null {
  let digits = (input ?? '').replace(/\D/g, '');
  if (digits.length === 9) digits = '998' + digits;
  if (digits.length === 10 && digits.startsWith('8')) digits = '998' + digits.slice(1);
  if (digits.length !== 12 || !digits.startsWith('998')) return null;
  // Operator / area code must not start with 0.
  if (digits[3] === '0') return null;
  return '+' + digits;
}

/** "+998901234567" -> "+998 90 123 45 67" */
export function formatUzPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const n = normalizeUzPhone(phone);
  if (!n) return phone;
  const d = n.slice(1);
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
}

/** Masks a phone for low-privilege views: "+998 90 *** ** 67". */
export function maskUzPhone(phone: string | null | undefined): string {
  const f = formatUzPhone(phone);
  if (!f.startsWith('+998')) return f;
  return f.slice(0, 7) + ' *** **' + f.slice(-3);
}

const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_WEEKDAYS = ['dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba', 'yakshanba'];
const UZ_WEEKDAYS_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

function dt(value: Date | string, timezone: string): DateTime {
  return typeof value === 'string'
    ? DateTime.fromISO(value, { zone: timezone })
    : DateTime.fromJSDate(value, { zone: timezone });
}

/**
 * Uzbek (Latin) month/weekday names are spelled out explicitly because ICU data for uz-Latn
 * differs between browsers and Node builds; Russian goes through Intl.
 */
export function formatDateLong(value: Date | string, locale: Locale, timezone = DEFAULT_TIMEZONE): string {
  const d = dt(value, timezone);
  if (locale === 'uz') return `${d.day}-${UZ_MONTHS[d.month - 1]}, ${d.year}`;
  return d.setLocale('ru').toFormat('d MMMM yyyy');
}

export function formatDateWithWeekday(value: Date | string, locale: Locale, timezone = DEFAULT_TIMEZONE): string {
  const d = dt(value, timezone);
  if (locale === 'uz') return `${UZ_WEEKDAYS[d.weekday - 1]}, ${d.day}-${UZ_MONTHS[d.month - 1]}`;
  const s = d.setLocale('ru').toFormat('cccc, d MMMM');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDayMonth(value: Date | string, locale: Locale, timezone = DEFAULT_TIMEZONE): string {
  const d = dt(value, timezone);
  if (locale === 'uz') return `${d.day}-${UZ_MONTHS[d.month - 1]}`;
  return d.setLocale('ru').toFormat('d MMMM');
}

export function formatMonthYear(value: Date | string, locale: Locale, timezone = DEFAULT_TIMEZONE): string {
  const d = dt(value, timezone);
  if (locale === 'uz') return `${UZ_MONTHS[d.month - 1].replace(/^./, (c) => c.toUpperCase())} ${d.year}`;
  const s = d.setLocale('ru').toFormat('LLLL yyyy');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function weekdayShort(isoWeekday: number, locale: Locale): string {
  if (locale === 'uz') return UZ_WEEKDAYS_SHORT[isoWeekday - 1];
  return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][isoWeekday - 1];
}

export function weekdayLong(isoWeekday: number, locale: Locale): string {
  if (locale === 'uz') return UZ_WEEKDAYS[isoWeekday - 1].replace(/^./, (c) => c.toUpperCase());
  return ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'][isoWeekday - 1];
}

/** 24-hour "16:00" in the business timezone. */
export function formatTime(value: Date | string, timezone = DEFAULT_TIMEZONE): string {
  return dt(value, timezone).toFormat('HH:mm');
}

export function formatTimeRange(start: Date | string, end: Date | string, timezone = DEFAULT_TIMEZONE): string {
  return `${formatTime(start, timezone)}–${formatTime(end, timezone)}`;
}

/** 45 -> "45 мин", 75 -> "1 ч 15 мин" / "1 soat 15 daq". */
export function formatDuration(minutes: number, locale: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hu = locale === 'uz' ? 'soat' : 'ч';
  const mu = locale === 'uz' ? 'daq' : 'мин';
  if (h === 0) return `${m} ${mu}`;
  if (m === 0) return `${h} ${hu}`;
  return `${h} ${hu} ${m} ${mu}`;
}

/** "16:30" -> 990 */
export function parseHm(value: string): number | null {
  const m = /^([01]?\d|2[0-4]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]);
  return total <= 1440 ? total : null;
}

/** 990 -> "16:30" */
export function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
