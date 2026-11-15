import { describe, expect, it } from 'vitest';
import {
  formatDateLong, formatDuration, formatTimeRange, formatUzPhone, formatUzs, maskUzPhone, normalizeUzPhone, parseHm,
} from './format';
import { slugify } from './slug';
import { monthlyPrice } from './pricing';
import { translate } from './i18n';

describe('money', () => {
  it('formats UZS in both locales', () => {
    expect(formatUzs(100000, 'ru')).toBe('100 000 сум');
    expect(formatUzs(150000, 'uz')).toBe('150 000 so‘m');
    expect(formatUzs(59000, 'ru')).toBe('59 000 сум');
  });
});

describe('phones', () => {
  it('normalises common Uzbek formats', () => {
    expect(normalizeUzPhone('+998 90 123-45-67')).toBe('+998901234567');
    expect(normalizeUzPhone('901234567')).toBe('+998901234567');
    expect(normalizeUzPhone('998901234567')).toBe('+998901234567');
    expect(normalizeUzPhone('12345')).toBeNull();
    expect(normalizeUzPhone('+7 900 123 45 67')).toBeNull();
  });
  it('formats and masks', () => {
    expect(formatUzPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(maskUzPhone('+998901234567')).toBe('+998 90 *** ** 67');
  });
});

describe('dates', () => {
  const start = new Date('2026-11-17T11:00:00Z');
  const end = new Date('2026-11-17T11:45:00Z');
  it('shows the demo booking in Tashkent time', () => {
    expect(formatDateLong(start, 'ru')).toBe('17 ноября 2026');
    expect(formatDateLong(start, 'uz')).toBe('17-noyabr, 2026');
    expect(formatTimeRange(start, end)).toBe('16:00–16:45');
  });
  it('formats durations', () => {
    expect(formatDuration(45, 'ru')).toBe('45 мин');
    expect(formatDuration(75, 'ru')).toBe('1 ч 15 мин');
    expect(formatDuration(60, 'uz')).toBe('1 soat');
  });
  it('parses HH:mm', () => {
    expect(parseHm('16:30')).toBe(990);
    expect(parseHm('25:00')).toBeNull();
  });
});

describe('misc', () => {
  it('slugifies cyrillic names', () => {
    expect(slugify('Азиз')).toBe('aziz');
    expect(slugify('Barber Shop #1')).toBe('barber-shop-1');
  });
  it('prices plans', () => {
    expect(monthlyPrice({ pricing: 'FLAT', priceUzs: 59000, minSeats: 1, maxSeats: 1 }, 1)).toBe(59000);
    expect(monthlyPrice({ pricing: 'PER_SEAT', priceUzs: 49000, minSeats: 3, maxSeats: null }, 2)).toBe(147000);
    expect(monthlyPrice({ pricing: 'PER_SEAT', priceUzs: 49000, minSeats: 3, maxSeats: null }, 5)).toBe(245000);
  });
  it('translates with interpolation and fallback', () => {
    expect(translate('ru', 'booking.stepOf', { n: 2, total: 5 })).toBe('Шаг 2 из 5');
    expect(translate('uz', 'booking.successTitle')).toBe('Siz muvaffaqiyatli yozildingiz!');
    expect(translate('uz', 'missing.key')).toBe('missing.key');
  });
});
