import { DateTime } from 'luxon';

/**
 * Slot availability engine.
 *
 * Pure and deterministic: the API loads working hours, exceptions and appointments from Postgres
 * and passes them in; this module decides which start times are bookable. The same function is
 * used for listing slots and for re-validating a requested slot right before insert. The final
 * guarantee against double booking is the Postgres exclusion constraint, not this code.
 *
 * All instants are UTC `Date`s. Working hours are minutes from local midnight in `timezone`.
 */

export interface WorkingInterval {
  /** ISO weekday 1 = Monday … 7 = Sunday */
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface BusyInterval {
  start: Date;
  /** Exclusive end. For appointments this is `blockedUntil` (service end + technical break). */
  end: Date;
}

export interface BookingRules {
  timezone: string;
  /** Candidate start times are generated on this grid from the start of each working interval. */
  slotStepMinutes: number;
  /** Earliest bookable start = now + minLeadMinutes. */
  minLeadMinutes: number;
  /** Last bookable local date = today + horizonDays. */
  bookingHorizonDays: number;
}

export interface SlotRequest {
  durationMin: number;
  bufferAfterMin: number;
}

export interface AvailabilityContext extends BookingRules {
  workingHours: WorkingInterval[];
  busy: BusyInterval[];
  now: Date;
}

export type SlotRejection =
  | 'IN_PAST'
  | 'TOO_SOON'
  | 'BEYOND_HORIZON'
  | 'OUTSIDE_WORKING_HOURS'
  | 'CONFLICT';

export interface CheckOptions {
  /** Staff-created bookings may ignore lead time and horizon (but never conflicts or hours). */
  ignoreLeadTime?: boolean;
  ignoreHorizon?: boolean;
}

export interface Slot {
  start: Date;
  end: Date;
  blockedUntil: Date;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function localDay(date: string, timezone: string): DateTime {
  if (!ISO_DATE.test(date)) throw new Error(`Invalid date: ${date}`);
  const d = DateTime.fromISO(date, { zone: timezone });
  if (!d.isValid) throw new Error(`Invalid date: ${date}`);
  return d.startOf('day');
}

export function todayIn(timezone: string, now: Date): DateTime {
  return DateTime.fromJSDate(now, { zone: timezone }).startOf('day');
}

/** Local date (YYYY-MM-DD) of an instant in the given zone. */
export function toLocalDate(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant, { zone: timezone }).toISODate()!;
}

/** Converts a local wall time on a date to a UTC Date. */
export function localTimeToUtc(date: string, minutesFromMidnight: number, timezone: string): Date {
  return localDay(date, timezone)
    .set({ hour: Math.floor(minutesFromMidnight / 60), minute: minutesFromMidnight % 60 })
    .toUTC()
    .toJSDate();
}

/** Minutes from local midnight of an instant. */
export function minutesOfDay(instant: Date, timezone: string): number {
  const d = DateTime.fromJSDate(instant, { zone: timezone });
  return d.hour * 60 + d.minute;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function isWithinHorizon(date: string, rules: BookingRules, now: Date): boolean {
  const day = localDay(date, rules.timezone);
  const today = todayIn(rules.timezone, now);
  return day >= today && day <= today.plus({ days: rules.bookingHorizonDays });
}

/**
 * Checks a concrete start instant. Returns null when bookable, otherwise the first reason it is not.
 */
export function checkSlot(
  start: Date,
  request: SlotRequest,
  ctx: AvailabilityContext,
  options: CheckOptions = {},
): SlotRejection | null {
  const end = new Date(start.getTime() + request.durationMin * 60_000);
  const blockedUntil = new Date(end.getTime() + request.bufferAfterMin * 60_000);

  if (start.getTime() < ctx.now.getTime()) return 'IN_PAST';
  if (!options.ignoreLeadTime && start.getTime() < ctx.now.getTime() + ctx.minLeadMinutes * 60_000) {
    return 'TOO_SOON';
  }
  const localStart = DateTime.fromJSDate(start, { zone: ctx.timezone });
  const date = localStart.toISODate()!;
  if (!options.ignoreHorizon && !isWithinHorizon(date, ctx, ctx.now)) return 'BEYOND_HORIZON';

  // The service itself must fit entirely inside one working interval of that local day.
  const startMin = localStart.hour * 60 + localStart.minute;
  // Working intervals never cross midnight (endMin <= 1440), so a service running past midnight
  // can never fit.
  const endMin = startMin + request.durationMin;
  const fits = ctx.workingHours.some(
    (w) => w.weekday === localStart.weekday && w.startMin <= startMin && endMin <= w.endMin,
  );
  if (!fits) return 'OUTSIDE_WORKING_HOURS';

  // Service + technical break must not touch any busy interval (other bookings incl. their breaks,
  // days off, vacations, manual blocks).
  if (ctx.busy.some((b) => overlaps(start, blockedUntil, b.start, b.end))) return 'CONFLICT';
  return null;
}

/** Lists bookable slots for one local date. */
export function computeDaySlots(
  date: string,
  request: SlotRequest,
  ctx: AvailabilityContext,
  options: CheckOptions = {},
): Slot[] {
  if (request.durationMin <= 0) return [];
  const day = localDay(date, ctx.timezone);
  if (!options.ignoreHorizon && !isWithinHorizon(date, ctx, ctx.now)) return [];
  const step = Math.max(5, ctx.slotStepMinutes);
  const intervals = ctx.workingHours
    .filter((w) => w.weekday === day.weekday && w.endMin > w.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const seen = new Set<number>();
  const slots: Slot[] = [];
  for (const w of intervals) {
    for (let t = w.startMin; t + request.durationMin <= w.endMin; t += step) {
      const start = localTimeToUtc(date, t, ctx.timezone);
      if (seen.has(start.getTime())) continue;
      if (checkSlot(start, request, ctx, options) === null) {
        seen.add(start.getTime());
        const end = new Date(start.getTime() + request.durationMin * 60_000);
        slots.push({ start, end, blockedUntil: new Date(end.getTime() + request.bufferAfterMin * 60_000) });
      }
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Local dates within the horizon that have at least one working interval (cheap pre-filter). */
export function workingDatesInHorizon(ctx: AvailabilityContext): string[] {
  const today = todayIn(ctx.timezone, ctx.now);
  const weekdays = new Set(ctx.workingHours.filter((w) => w.endMin > w.startMin).map((w) => w.weekday));
  const out: string[] = [];
  for (let i = 0; i <= ctx.bookingHorizonDays; i++) {
    const d = today.plus({ days: i });
    if (weekdays.has(d.weekday)) out.push(d.toISODate()!);
  }
  return out;
}

/** UTC range covering a list of local dates (used to load busy intervals in one query). */
export function utcRangeForDates(dates: string[], timezone: string): { from: Date; to: Date } | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return {
    from: localDay(sorted[0], timezone).toUTC().toJSDate(),
    to: localDay(sorted[sorted.length - 1], timezone).plus({ days: 1 }).toUTC().toJSDate(),
  };
}
