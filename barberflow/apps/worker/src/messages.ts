import { formatDateWithWeekday, formatTimeRange, formatUzs, Locale } from '@barberflow/shared';

export interface MessageContext {
  locale: Locale;
  audience: 'customer' | 'barber';
  type: string;
  businessName: string;
  address: string | null;
  barberName: string;
  customerName: string;
  serviceName: string;
  priceUzs: number;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  appUrl: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const titles: Record<Locale, Record<string, string>> = {
  ru: {
    APPOINTMENT_CREATED: '✅ Вы записаны',
    APPOINTMENT_CANCELLED: '❌ Запись отменена',
    APPOINTMENT_RESCHEDULED: '🔁 Запись перенесена',
    REMINDER_24H: '⏰ Напоминание: визит завтра',
    REMINDER_2H: '⏰ Напоминание: визит через 2 часа',
    B_APPOINTMENT_CREATED: '🆕 Новая запись',
    B_APPOINTMENT_CANCELLED: '❌ Клиент отменил запись',
    B_APPOINTMENT_RESCHEDULED: '🔁 Запись перенесена',
  },
  uz: {
    APPOINTMENT_CREATED: '✅ Siz yozildingiz',
    APPOINTMENT_CANCELLED: '❌ Yozuv bekor qilindi',
    APPOINTMENT_RESCHEDULED: '🔁 Yozuv ko‘chirildi',
    REMINDER_24H: '⏰ Eslatma: tashrif ertaga',
    REMINDER_2H: '⏰ Eslatma: tashrifga 2 soat qoldi',
    B_APPOINTMENT_CREATED: '🆕 Yangi yozuv',
    B_APPOINTMENT_CANCELLED: '❌ Mijoz yozuvni bekor qildi',
    B_APPOINTMENT_RESCHEDULED: '🔁 Yozuv ko‘chirildi',
  },
};

export function renderMessage(c: MessageContext): string {
  const key = c.audience === 'barber' ? `B_${c.type}` : c.type;
  const title = titles[c.locale][key] ?? titles.ru[key] ?? c.type;
  const when = `${formatDateWithWeekday(c.startsAt, c.locale, c.timezone)}, ${formatTimeRange(c.startsAt, c.endsAt, c.timezone)}`;
  const lines = [
    `<b>${esc(title)}</b>`,
    '',
    `🗓 ${esc(when)}`,
    `✂️ ${esc(c.serviceName)} — ${esc(formatUzs(c.priceUzs, c.locale))}`,
    c.audience === 'customer' ? `💈 ${esc(c.barberName)}, ${esc(c.businessName)}` : `👤 ${esc(c.customerName)}`,
  ];
  if (c.audience === 'customer' && c.address) lines.push(`📍 ${esc(c.address)}`);
  if (c.audience === 'customer') lines.push('', `${c.appUrl}/me`);
  return lines.join('\n');
}
