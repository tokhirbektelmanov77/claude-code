import { DateTime } from 'luxon';
import type { CalendarBarber, CalendarFeed } from '@/components/cabinet/types';

export interface Gap { start: Date; end: Date; minutes: number }

/** Free windows of one barber on a local date: working intervals minus bookings and exceptions. */
export function freeGaps(feed: CalendarFeed, barber: CalendarBarber, date: string, tz: string, from: Date = new Date(0)): Gap[] {
  const day = DateTime.fromISO(date, { zone: tz });
  const busy = [
    ...feed.appointments.filter((a) => a.barberId === barber.id && (a.status === 'CONFIRMED' || a.status === 'COMPLETED')).map((a) => [new Date(a.startsAt), new Date(a.blockedUntil)] as const),
    ...feed.exceptions.filter((e) => e.barberId === barber.id).map((e) => [new Date(e.startsAt), new Date(e.endsAt)] as const),
  ].sort((a, b) => a[0].getTime() - b[0].getTime());
  const gaps: Gap[] = [];
  for (const w of barber.workingHours.filter((h) => h.weekday === day.weekday).sort((a, b) => a.startMin - b.startMin)) {
    let cursor = day.set({ hour: Math.floor(w.startMin / 60), minute: w.startMin % 60 }).toJSDate();
    const end = day.set({ hour: Math.floor(w.endMin / 60), minute: w.endMin % 60 }).toJSDate();
    if (cursor < from) cursor = new Date(Math.min(Math.max(from.getTime(), cursor.getTime()), end.getTime()));
    for (const [s, e] of busy) {
      if (e <= cursor || s >= end) continue;
      if (s > cursor) gaps.push({ start: cursor, end: s, minutes: (s.getTime() - cursor.getTime()) / 60000 });
      if (e > cursor) cursor = e;
    }
    if (end > cursor) gaps.push({ start: cursor, end, minutes: (end.getTime() - cursor.getTime()) / 60000 });
  }
  return gaps.filter((g) => g.minutes >= 15);
}

export function dayRange(date: string, tz: string, days = 1) {
  const d = DateTime.fromISO(date, { zone: tz }).startOf('day');
  return { from: d.toUTC().toISO()!, to: d.plus({ days }).toUTC().toISO()! };
}
