import { Injectable } from '@nestjs/common';
import { Prisma } from '@barberflow/db';
import {
  AvailabilityContext,
  CheckOptions,
  computeDaySlots,
  localDay,
  utcRangeForDates,
  workingDatesInHorizon,
} from '@barberflow/shared';
import { notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

type Db = Prisma.TransactionClient;

export interface EffectiveService {
  id: string;
  name: string;
  priceUzs: number;
  durationMin: number;
  bufferAfterMin: number;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getBarberWithBusiness(barberId: string, db: Db = this.prisma) {
    const barber = await db.barber.findUnique({ where: { id: barberId }, include: { business: true } });
    if (!barber) throw notFound('Barber');
    return barber;
  }

  /** Service as performed by this barber (per-barber overrides applied). 404 if not offered. */
  async effectiveService(barberId: string, serviceId: string, db: Db = this.prisma): Promise<EffectiveService> {
    const link = await db.barberService.findUnique({
      where: { barberId_serviceId: { barberId, serviceId } },
      include: { service: true, barber: { select: { businessId: true } } },
    });
    if (!link || !link.service.isActive || link.service.businessId !== link.barber.businessId) throw notFound('Service');
    return {
      id: link.service.id,
      name: link.service.name,
      priceUzs: link.priceOverrideUzs ?? link.service.priceUzs,
      durationMin: link.durationOverride ?? link.service.durationMin,
      bufferAfterMin: link.service.bufferAfterMin,
    };
  }

  /**
   * Loads everything that makes a barber unavailable in [from, to): live appointments (with their
   * technical break) and schedule exceptions. `excludeAppointmentId` is used when rescheduling.
   */
  async buildContext(
    barberId: string,
    range: { from: Date; to: Date },
    opts: { excludeAppointmentId?: string; now?: Date } = {},
    db: Db = this.prisma,
  ): Promise<AvailabilityContext> {
    const barber = await this.getBarberWithBusiness(barberId, db);
    const [hours, exceptions, appointments] = await Promise.all([
      db.workingHours.findMany({ where: { barberId } }),
      db.scheduleException.findMany({
        where: { barberId, startsAt: { lt: range.to }, endsAt: { gt: range.from } },
      }),
      db.appointment.findMany({
        where: {
          barberId,
          status: { in: ['CONFIRMED', 'COMPLETED'] },
          startsAt: { lt: range.to },
          blockedUntil: { gt: range.from },
          ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
        },
        select: { startsAt: true, blockedUntil: true },
      }),
    ]);
    return {
      timezone: barber.business.timezone,
      slotStepMinutes: barber.business.slotStepMinutes,
      minLeadMinutes: barber.business.minLeadMinutes,
      bookingHorizonDays: barber.business.bookingHorizonDays,
      now: opts.now ?? new Date(),
      workingHours: hours.map((h) => ({ weekday: h.weekday, startMin: h.startMin, endMin: h.endMin })),
      busy: [
        ...appointments.map((a) => ({ start: a.startsAt, end: a.blockedUntil })),
        ...exceptions.map((e) => ({ start: e.startsAt, end: e.endsAt })),
      ],
    };
  }

  async slotsForDate(barberId: string, serviceId: string, date: string, options: CheckOptions & { excludeAppointmentId?: string } = {}) {
    const barber = await this.getBarberWithBusiness(barberId);
    const service = await this.effectiveService(barberId, serviceId);
    const day = localDay(date, barber.business.timezone);
    const range = { from: day.toUTC().toJSDate(), to: day.plus({ days: 1 }).toUTC().toJSDate() };
    const ctx = await this.buildContext(barberId, range, { excludeAppointmentId: options.excludeAppointmentId });
    return computeDaySlots(date, service, ctx, options).map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
  }

  /** Local dates inside the booking horizon that have at least one bookable slot. */
  async availableDates(barberId: string, serviceId: string, opts: { excludeAppointmentId?: string } = {}) {
    const barber = await this.getBarberWithBusiness(barberId);
    const service = await this.effectiveService(barberId, serviceId);
    const tz = barber.business.timezone;
    const probe = await this.buildContext(barberId, { from: new Date(0), to: new Date(0) });
    const candidates = workingDatesInHorizon(probe);
    const range = utcRangeForDates(candidates, tz);
    if (!range) return [];
    const ctx = await this.buildContext(barberId, range, opts);
    return candidates.filter((d) => computeDaySlots(d, service, ctx).length > 0);
  }
}
