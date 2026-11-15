import { describe, expect, it } from 'vitest';
import {
  AvailabilityContext,
  checkSlot,
  computeDaySlots,
  localTimeToUtc,
  workingDatesInHorizon,
} from './availability';

const TZ = 'Asia/Tashkent'; // UTC+5, no DST
const DAY = '2026-11-17'; // Tuesday
const hm = (h: number, m = 0) => localTimeToUtc(DAY, h * 60 + m, TZ);

function ctx(overrides: Partial<AvailabilityContext> = {}): AvailabilityContext {
  return {
    timezone: TZ,
    slotStepMinutes: 15,
    minLeadMinutes: 60,
    bookingHorizonDays: 30,
    // Tue 10:00–20:00
    workingHours: [{ weekday: 2, startMin: 600, endMin: 1200 }],
    busy: [],
    now: new Date('2026-11-15T06:00:00Z'),
    ...overrides,
  };
}
const haircut = { durationMin: 45, bufferAfterMin: 0 };
const startsAsLocal = (slots: { start: Date }[]) =>
  slots.map((s) => new Date(s.start.getTime() + 5 * 3600_000).toISOString().slice(11, 16));

describe('timezone handling', () => {
  it('stores 16:00 Tashkent as 11:00 UTC', () => {
    expect(hm(16).toISOString()).toBe('2026-11-17T11:00:00.000Z');
  });
});

describe('computeDaySlots', () => {
  it('offers the demo slot 16:00 on 17 Nov 2026 for a 45 min haircut', () => {
    const slots = computeDaySlots(DAY, haircut, ctx());
    const local = startsAsLocal(slots);
    expect(local).toContain('16:00');
    expect(local[0]).toBe('10:00');
    // Last start that still fits before 20:00 is 19:15.
    expect(local[local.length - 1]).toBe('19:15');
    const s = slots.find((x) => x.start.getTime() === hm(16).getTime())!;
    expect(s.end.toISOString()).toBe(hm(16, 45).toISOString());
  });

  it('excludes every start overlapping an existing 16:00–16:45 booking', () => {
    const local = startsAsLocal(computeDaySlots(DAY, haircut, ctx({ busy: [{ start: hm(16), end: hm(16, 45) }] })));
    for (const t of ['15:30', '15:45', '16:00', '16:15', '16:30']) expect(local).not.toContain(t);
    expect(local).toContain('15:15'); // 15:15–16:00 touches but does not overlap
    expect(local).toContain('16:45');
  });

  it('returns nothing on a non-working day', () => {
    expect(computeDaySlots('2026-11-15', haircut, ctx())).toEqual([]); // Sunday
  });

  it('respects the technical break after the service', () => {
    const withBuffer = { durationMin: 45, bufferAfterMin: 15 };
    const local = startsAsLocal(computeDaySlots(DAY, withBuffer, ctx({ busy: [{ start: hm(17), end: hm(17, 45) }] })));
    // 16:00 + 45 = 16:45, + 15 break = 17:00 -> touches 17:00 booking, allowed
    expect(local).toContain('16:00');
    // 16:15 + 45 + 15 = 17:15 -> overlaps
    expect(local).not.toContain('16:15');
  });

  it('a longer service duration removes late slots', () => {
    const long = startsAsLocal(computeDaySlots(DAY, { durationMin: 75, bufferAfterMin: 0 }, ctx()));
    expect(long[long.length - 1]).toBe('18:45');
    expect(long).not.toContain('19:00');
  });

  it('honours lunch breaks expressed as split intervals', () => {
    const local = startsAsLocal(
      computeDaySlots(DAY, haircut, ctx({
        workingHours: [
          { weekday: 2, startMin: 600, endMin: 780 },
          { weekday: 2, startMin: 840, endMin: 1200 },
        ],
      })),
    );
    expect(local).toContain('12:15');
    expect(local).not.toContain('12:30');
    expect(local).not.toContain('13:30');
    expect(local).toContain('14:00');
  });

  it('applies day-off / vacation / block busy ranges', () => {
    const vacation = { start: new Date('2026-11-16T19:00:00Z'), end: new Date('2026-11-18T19:00:00Z') };
    expect(computeDaySlots(DAY, haircut, ctx({ busy: [vacation] }))).toEqual([]);
  });

  it('applies minimum lead time', () => {
    const now = hm(15, 10);
    const local = startsAsLocal(computeDaySlots(DAY, haircut, ctx({ now })));
    expect(local[0]).toBe('16:15');
  });

  it('closes dates beyond the booking horizon', () => {
    expect(computeDaySlots(DAY, haircut, ctx({ bookingHorizonDays: 1 }))).toEqual([]);
    expect(computeDaySlots(DAY, haircut, ctx({ bookingHorizonDays: 2 })).length).toBeGreaterThan(0);
  });
});

describe('checkSlot', () => {
  it('rejects off-grid times outside hours and accepts manual off-grid inside hours', () => {
    expect(checkSlot(hm(9, 50), haircut, ctx())).toBe('OUTSIDE_WORKING_HOURS');
    expect(checkSlot(hm(19, 30), haircut, ctx())).toBe('OUTSIDE_WORKING_HOURS');
    expect(checkSlot(hm(16, 10), haircut, ctx())).toBeNull();
  });

  it('reports conflicts', () => {
    expect(checkSlot(hm(16, 30), haircut, ctx({ busy: [{ start: hm(16), end: hm(16, 45) }] }))).toBe('CONFLICT');
  });

  it('staff can ignore lead time but not the past', () => {
    const now = hm(15, 30);
    expect(checkSlot(hm(16), haircut, ctx({ now }))).toBe('TOO_SOON');
    expect(checkSlot(hm(16), haircut, ctx({ now }), { ignoreLeadTime: true })).toBeNull();
    expect(checkSlot(hm(15), haircut, ctx({ now }), { ignoreLeadTime: true })).toBe('IN_PAST');
  });
});

describe('workingDatesInHorizon', () => {
  it('lists only working weekdays', () => {
    const dates = workingDatesInHorizon(ctx({ bookingHorizonDays: 7 }));
    expect(dates).toEqual(['2026-11-17']);
  });
});
